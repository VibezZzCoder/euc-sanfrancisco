// CPU-only committed-world site-fitting fixture. MIT, © 2026 VibezZzCoder.
// City data/algorithms: unable12/slop-sanfrancisco@bdd5d37; see ../../NOTICE.md.
// No renderer, fetch/network, geographic regeneration, runtime edits or global window.
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import * as THREE from '../../vendor/three/build/three.webgpu.js';
import * as TSL from '../../vendor/three/build/three.tsl.js';
import { SfTerrainSampler } from '../../js/sf-terrain-sampler.js';
import { EucController } from '../../js/euc/simulation/EucController.js';
import { NEUTRAL_ACTIONS } from '../../js/euc/input/actions.js';

const ROOT = new URL('../../', import.meta.url);
export const SITE_PINS = Object.freeze({ un: Object.freeze({ x: -1027.4, z: 972.4 }),
  zion: Object.freeze({ x: -4598.4, z: 2275.5 }) });
export const SITE_LIMITS = Object.freeze({ un: Object.freeze({ minX: -1160, maxX: -900, minZ: 820, maxZ: 1070 }),
  zion: Object.freeze({ minX: -4760, maxX: -4450, minZ: 2140, maxZ: 2390 }) });
// Gameplay adaptations, not surveyed real skatepark boundaries. Length follows local +v.
// Keep the spine/outer strips on existing support: whole-court planar lids are specifically NOT proposed.
export const SITE_FITS = Object.freeze({
  un: Object.freeze({x:-1065.663241132156,z:978.3295600312498,theta:-1.415546279600968,width:18,length:104,spine:4,apron:1,
    pads:Object.freeze([[-5.75,-40,8],[-5.75,-26,8],[-5.75,-12,8],[-5.75,8,26],[-5.75,34,8],
      [5.75,-40,8],[5.75,-26,8],[5.75,-12,8],[5.75,4,8],[5.75,18,8],[5.75,34,8]]
      .map(([u,v,length])=>Object.freeze({u,v,width:4.5,length})))}),
  zion: Object.freeze({x:-4583.350790759186,z:2237.20481360241,theta:-1.4924571485356748,width:38,length:76,spine:8,apron:2,
    pads:Object.freeze([[-11,-25,12],[-11,-8,12],[-11,9,12],[-11,26,12],[11,-25,12],[11,1,32],[11,28,12]]
      .map(([u,v,length])=>Object.freeze({u,v,width:9,length})))})
});
export const boundsOf = poly => ({ minX: Math.min(...poly.map(p => p.x)), maxX: Math.max(...poly.map(p => p.x)),
  minZ: Math.min(...poly.map(p => p.z)), maxZ: Math.max(...poly.map(p => p.z)) });
const overlaps = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
const inBounds = (b, x, z, pad = 0) => x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
const cross = (a, b, p) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Same frame as Three rotationY: local +v=(sin(theta),cos(theta)), +u=(cos(theta),-sin(theta)).
export function worldPoint(frame, u, v) {
  const c = Math.cos(frame.theta), s = Math.sin(frame.theta);
  return { x: frame.x + c * u + s * v, z: frame.z - s * u + c * v };
}
export function localPoint(frame, x, z) {
  const c = Math.cos(frame.theta), s = Math.sin(frame.theta), dx = x - frame.x, dz = z - frame.z;
  return { u: c * dx - s * dz, v: s * dx + c * dz };
}
export function rectangle(frame, width, length, u = 0, v = 0) {
  return [[-1,-1],[-1,1],[1,1],[1,-1]].map(([a,b]) => worldPoint(frame, u + a * width / 2, v + b * length / 2));
}
export function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
export function pointInPolygon(poly, p) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    if (segmentDistance(p, a, b) < 1e-8) return true;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < a.x + (p.z - a.z) * (b.x - a.x) / (b.z - a.z)) inside = !inside;
  }
  return inside;
}
export function pointPolygonDistance(poly, p) {
  return pointInPolygon(poly, p) ? 0 : Math.min(...poly.map((a, i) => segmentDistance(p, a, poly[(i + 1) % poly.length])));
}
// Exact XZ polygon overlap / Euclidean boundary clearance, including concave source footprints.
export function polygonDistance(a, b) {
  if (a.some(p => pointInPolygon(b, p)) || b.some(p => pointInPolygon(a, p))) return 0;
  let best = Infinity;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const p = a[i], q = a[(i + 1) % a.length], r = b[j], s = b[(j + 1) % b.length];
    if (cross(p,q,r) * cross(p,q,s) < 0 && cross(r,s,p) * cross(r,s,q) < 0) return 0;
    best = Math.min(best, segmentDistance(p,r,s), segmentDistance(q,r,s), segmentDistance(r,p,q), segmentDistance(s,p,q));
  }
  return best;
}
function hull(points) {
  const p = points.slice().sort((a,b) => a.x - b.x || a.z - b.z), lo = [], hi = [];
  for (const a of p) { while (lo.length > 1 && cross(lo.at(-2),lo.at(-1),a) <= 0) lo.pop(); lo.push(a); }
  for (const a of p.slice().reverse()) { while (hi.length > 1 && cross(hi.at(-2),hi.at(-1),a) <= 0) hi.pop(); hi.push(a); }
  return lo.slice(0,-1).concat(hi.slice(0,-1));
}
function strip(a, b, low, high, envelope = 0, endPad = 0) {
  const len = Math.hypot(b.x-a.x,b.z-a.z), dx = (b.x-a.x)/len, dz = (b.z-a.z)/len;
  const p = [[-endPad,low],[-endPad,high],[len+endPad,high],[len+endPad,low]]
    .map(([t,o]) => ({ x:a.x+dx*t-dz*o,z:a.z+dz*t+dx*o }));
  return envelope ? hull(p.flatMap(q => [-1,1].flatMap(x => [-1,1].map(z => ({x:q.x+x*envelope,z:q.z+z*envelope}))))) : p;
}

/** Fresh world per call. Only UN-overlapping curb blocks are draped. No full-city building meshes/bodies.
 * sampler: exact native terrain triangles + local final Float32 sidewalk/lawn facets.
 * buildings/trees: separate source metadata; NOT silently installed in sampler.
 * network: actual native graph with all curb polygons, NO building/furniture obstacles (potential bands only).
 * Regional roads have no names/widths/traffic graph; regionRoads reports linework, never invents live traffic.
 */
export async function createSkateparksWorld({ buildNetwork = true } = {}) {
  const hashes = {};
  const read = path => {
    const b = fs.readFileSync(new URL(path, ROOT));
    hashes[path] = createHash('sha256').update(b).digest('hex');
    return b;
  };
  const bin = async path => {
    const b = read(path), n = b.readUInt32LE(4);
    if (b.toString('ascii',0,4) !== 'SFB1') throw Error(`Not SFB1: ${path}`);
    return { header:JSON.parse(b.toString('utf8',8,8+n)), buf:b.buffer.slice(b.byteOffset,b.byteOffset+b.length),offset:8+n };
  };
  const N = { THREE, TSL, DEBUG_ROADS:false };
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(context, { window:{NYC:N},console:{info(){}},location:{search:''},URLSearchParams,
    fetch:async url => {
      if (url !== 'data/region/manifest.json') throw Error(`Unexpected fixture fetch: ${url}`);
      return {ok:true,json:async()=>JSON.parse(read(url).toString())};
    } });
  const load = name => vm.runInContext(read(`js/${name}.js`).toString(), context, {filename:`js/${name}.js`});
  for (const name of ['sf-geodata','city-config','terrain','sf-ride-geometry','drape','region','road-network']) load(name);
  const t = await bin(N.GEO.data.terrain.url), m = await bin(N.GEO.data.groundMask.url), b = await bin(N.GEO.data.buildings.url);
  const fullRegion = await N.loadSFRegion(bin);
  for(const path of ['js/sf-terrain-sampler.js','js/sf-support-store.js','js/euc/simulation/EucController.js',
    'js/sf-ground.js','js/sf-street-details.js','js/traffic.js'])read(path);
  N.DATA = { terrain:{header:t.header,q:new Uint16Array(t.buf,t.offset,t.header.w*t.header.h)},
    groundMask:{header:m.header,mask:new Uint8Array(m.buf,m.offset,m.header.w*m.header.h)},fullRegion,
    buildings:{header:b.header,table:new Float32Array(b.buf,b.offset,b.header.tableFloats),
      verts:new Float32Array(b.buf,b.offset+b.header.tableFloats*4,b.header.vertexFloats)} };
  N.Terrain.load(t.header,N.DATA.terrain.q);
  N.installRegionTerrain(fullRegion);
  const blocks = N.BLOCKS.filter(b => b.poly.length >= 3 && overlaps(b,SITE_LIMITS.un));
  const draped = [];
  // sf-ground.js::finishCurbSurfaces: 2m densification, 15cm curb, optional 1.2cm lawn; upload BEFORE registration.
  // No tunnel/grade cavity intersects these site blocks. Register all tops before lawns as production does per cell.
  for (const lawn of [false,true]) for (const block of blocks) {
    if (lawn && !(block.park > .5 && !block.median)) continue;
    const out = {pos:[],nrm:[],idx:[]};
    N.Drape.polygon(N.Drape.densify(block.poly,2),(x,z)=>N.Terrain.groundAt(x,z),
      (x,z,o)=>N.Terrain.normalAt(x,z,o),N.CURB_H+(lawn ? .012 : 0),out);
    const positions = Float32Array.from(out.pos), indices = Uint32Array.from(out.idx);
    N.RideGeometry.addTriangles(positions,indices,lawn?'grass':'pavement',{replacesTerrain:true});
    draped.push({blockId:block.id,lawn,positions,indices});
  }
  const buildings = [], trees = [], roads = [], regionRoads = [], pedestrianBands = [];
  const local = poly => Object.values(SITE_LIMITS).some(b => overlaps(boundsOf(poly),b));
  const {header:H,table,verts} = N.DATA.buildings, F = H.fields.length;
  for (let i=0;i<H.count;i++) {
    const start=table[i*F+3],count=table[i*F+4],poly=Array.from({length:count},(_,k)=>({x:verts[(start+k)*2],z:verts[(start+k)*2+1]}));
    if (poly.length >= 3 && local(poly)) buildings.push({id:`core:${i}`,poly});
  }
  for (const file of fullRegion.buildings) for (let k=0;k<file.records.length;k+=7) {
    const q=file.records,frame={x:file.header.originX+q[k]*.1,z:file.header.originZ+q[k+1]*.1,theta:q[k+6]*.0001};
    const poly=rectangle(frame,q[k+4]*.1,q[k+5]*.1);
    if (local(poly)) buildings.push({id:`region:${file.header.originX},${file.header.originZ}:${k/7}`,poly});
  }
  // Mirror sf-street-details.js's committed inventory snapping; radii below are conservative study reservations,
  // NOT procedural trunk/canopy geometry. Native exact trunk construction stays outside this minimal fixture.
  const TR=N.GEO.trees||[];
  for (let i=0;i<TR.length;i+=4) {
    let x=TR[i],z=TR[i+1];
    if (!Object.values(SITE_LIMITS).some(b=>inBounds(b,x,z,10))) continue;
    if (!N.blockAt(x,z)) {
      let best=null;
      for(let r=.5;r<=2&&!best;r+=.5) for(let k=0;k<8&&!best;k++) {
        const c=Math.cos(k*Math.PI/4),s=Math.sin(k*Math.PI/4),px=x+c*r,pz=z+s*r;
        if(N.blockAt(px,pz)&&N.blockAt(px+c*.4,pz+s*.4))best=[px+c*.4,pz+s*.4];
      }
      if(!best)continue;
      [x,z]=best;
    }
    trees.push({id:`core:${i/4}`,x,z,rawX:TR[i],rawZ:TR[i+1],class:TR[i+2],dbh:TR[i+3],radius:2,
      radiusKind:'conservative 2m centre reservation; not canopy/trunk measurement'});
  }
  const T=fullRegion.trees;
  for(let k=0;k<T.length;k+=4) if(Object.values(SITE_LIMITS).some(b=>inBounds(b,T[k],T[k+2],30)))
    trees.push({id:`region:${k/4}`,x:T[k],y:T[k+1],z:T[k+2],height:T[k+3],radius:Math.max(.08,T[k+3]*.022),radiusKind:'actual trunk circumradius'});
  for (const [id,r] of N.ROADS.entries()) for(let k=1;k<r.pts.length;k++) {
    if(r.flags&(8|16))continue;
    const poly=strip(r.pts[k-1],r.pts[k],-(r.w>3?r.w:9.1)/2,(r.w>3?r.w:9.1)/2,0,(r.w>3?r.w:9.1)/2);
    if(local(poly))roads.push({id:`core:${id}:${k-1}`,name:r.name,flags:r.flags,width:r.w,poly});
  }
  const R=fullRegion.roads;
  for(let k=0;k<R.length;k+=4){const a={x:R[k],z:R[k+1]},b={x:R[k+2],z:R[k+3]};
    if(Object.values(SITE_LIMITS).some(w=>overlaps(boundsOf([a,b]),w)))regionRoads.push({id:k/4,a,b,length:Math.hypot(b.x-a.x,b.z-a.z),theta:Math.atan2(b.x-a.x,b.z-a.z)});}
  let network=null;
  if(buildNetwork){
    N.Terrain.patchesEnabled=false;
    try{network=N.buildRoadNetwork(N.BLOCKS.filter(b=>b.poly.length>=3).map(block=>({...block,block})),[]);}
    finally{N.Terrain.patchesEnabled=true;}
    for(const e of network.edges){
      const a={x:e.sx,z:e.sz},b={x:e.sx+e.dx*e.len,z:e.sz+e.dz*e.len};
      const roadPoly=strip(a,b,-e.half,e.half,0,e.half);
      if(local(roadPoly))roads.push({id:`edge:${e.id}`,name:e.name,width:2*e.half,poly:roadPoly});
      if(e.noWalk||e.bore)continue;
      for(const sign of [-1,1]){
        const poly=strip(a,b,sign*(e.half+1.4),sign*(e.half+4),.4);
        if(local(poly))pedestrianBands.push({id:`edge:${e.id}:${sign}`,name:e.name,half:e.half,poly});
      }
    }
  }
  const sampler = new SfTerrainSampler({city:N});
  return {N,city:N,sampler,blocks,draped,buildings,trees,roads,regionRoads,pedestrianBands,network,hashes,
    limits:['No full buildings/furniture/landmarks/dynamic actors in sampler; inspect separate metadata.',
      'Potential sidewalkTrack bands include all offsets even if native obstacle/block gates would reject them; no stochastic population claim.',
      'Core tree 2m reservations are conservative study distances; regional radii are actual trunk circumradii, not crowns.',
      'Regional linework has no road widths/names/live vehicle lanes; distinguish former roadway from adjoining streets explicitly.']};
}

/** Regional roads have NO width/traffic semantics in committed runtime data. This is an explicitly assumed
 * conservative study reservation, not native sidewalkTrack evidence. Retain all non-former linework, including
 * park paths; formerSegments is a reviewed local chain only, never a parallel/nearby-road auto-exemption.
 */
export function regionalRoadReservations(world, {formerSegments=[],halfWidth=12,walkMargin=4.4}={}) {
  return world.regionRoads.filter(r=>!formerSegments.includes(r.id)).map(r=>({id:`regional-study:${r.id}`,
    sourceSegment:r.id,assumedHalfWidth:halfWidth,assumedWalkMargin:walkMargin,
    poly:strip(r.a,r.b,-halfWidth-walkMargin,halfWidth+walkMargin,.4,halfWidth+walkMargin)}));
}

/** Native fixed-step riding over the supplied static sampler (source-only by default;
 * integration callers can supply the actual new feature sampler). Deterministic bounded straight input,
 * no dynamic-world admission; source obstacle clearances must be checked separately over the full swept corridor.
 * No controller state writes after spawn. Throws neither false acceptance nor invisible synthetic floors.
 */
export function nativeFloorAccess(world, frame, {start=-24,end=24,u=0,maxSeconds=40,targetSpeed=4,throttle=.22}={}) {
  const direction=Math.sign(end-start),spawn=worldPoint(frame,u,start),ground={normal:{}};
  world.sampler.sampleGround(spawn.x,spawn.z,ground);
  const startHeight=ground.height;
  const controller=new EucController(world.sampler,{spawn:{position:{...spawn,y:startHeight},headingY:frame.theta+(direction<0?Math.PI:0)}});
  let minHeight=Infinity,maxHeight=-Infinity,maxCrossTrack=0,maxContactError=0,reached=false,steps=0,airSteps=0;
  let state=controller.snapshot();
  for(;steps<Math.ceil(maxSeconds*120)&&!controller.crashed;steps++){
    controller.step(1/120,{...NEUTRAL_ACTIONS,throttle:Math.abs(state.speed)<targetSpeed ? throttle : 0});
    state=controller.snapshot();
    const p=localPoint(frame,state.position.x,state.position.z);
    world.sampler.sampleGround(state.position.x,state.position.z,ground,state.position.y);
    minHeight=Math.min(minHeight,ground.height);maxHeight=Math.max(maxHeight,ground.height);
    maxCrossTrack=Math.max(maxCrossTrack,Math.abs(p.u-u));
    maxContactError=Math.max(maxContactError,Math.abs(state.position.y-ground.height));
    if(!state.grounded)airSteps++;
    if(direction*(p.v-end)>=0){reached=true;steps++;break;}
  }
  return {reached,crashed:controller.crashed,steps,seconds:steps/120,minHeight,maxHeight,maxCrossTrack,maxContactError,airSteps,
    start:{...spawn,y:startHeight},end:{x:state.position.x,y:state.position.y,z:state.position.z},
    finalSpeed:state.speed,scope:'supplied static sampler; no dynamic actors or independent scenery admission'};
}

/** Complete conflict lists over the bounded source inventory; nearest clearances are boundary-to-boundary.
 * treeMargin adds rider/scenery clearance beyond the above reservations, default 1m.
 */
export function inspectFootprint(world, poly, {treeMargin=1}={}) {
  const records=list=>list.map(o=>({id:o.id,name:o.name,distance:polygonDistance(poly,o.poly)})).sort((a,b)=>a.distance-b.distance);
  const buildings=records(world.buildings),roads=records(world.roads),pedestrians=records(world.pedestrianBands);
  const trees=world.trees.map(t=>({...t,distance:pointPolygonDistance(poly,t)-t.radius-treeMargin})).sort((a,b)=>a.distance-b.distance);
  const result={};
  for(const [key,list]of Object.entries({buildings,roads,pedestrians,trees}))result[key]={conflicts:list.filter(o=>o.distance<=1e-8),nearest:list.slice(0,3)};
  return result;
}

/** Least-squares local support plane. Raised to highest measured positive residual + clearance.
 * Dense sampling is an estimate, NOT a continuous maximum proof; exactPlane below supplements samples with native
 * field/facet vertices and footprint-edge intersections. Overlay switches and Float32 edges remain uncertified.
 */
export function fitSupportPlane(world, frame, width, length, {spacing=1,clearance=.025,exactPlane=true}={}) {
  const points=[],out={normal:{}},nu=Math.ceil(width/spacing),nv=Math.ceil(length/spacing);
  const sample=(u,v)=>{const p=worldPoint(frame,u,v);world.sampler.sampleGround(p.x,p.z,out);return {...p,u,v,y:out.height,surface:out.surface};};
  for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++)points.push(sample(width*(i/nu-.5),length*(j/nv-.5)));
  const sums={u:0,v:0,y:0,uu:0,vv:0,uv:0,uy:0,vy:0};
  for(const p of points){sums.u+=p.u;sums.v+=p.v;sums.y+=p.y;sums.uu+=p.u*p.u;sums.vv+=p.v*p.v;sums.uv+=p.u*p.v;sums.uy+=p.u*p.y;sums.vy+=p.v*p.y;}
  const n=points.length,du=(sums.uy-sums.u*sums.y/n)/(sums.uu-sums.u*sums.u/n),dv=(sums.vy-sums.v*sums.y/n)/(sums.vv-sums.v*sums.v/n);
  const y=(sums.y-du*sums.u-dv*sums.v)/n;
  if(exactPlane){
    const poly=rectangle(frame,width,length),box=boundsOf(poly);
    const add=(x,z)=>{const p=localPoint(frame,x,z);if(Math.abs(p.u)<=width/2+1e-7&&Math.abs(p.v)<=length/2+1e-7)points.push(sample(clamp(p.u,-width/2,width/2),clamp(p.v,-length/2,length/2)));};
    // For each clipped planar facet include vertices and all footprint-edge intersections.
    const facet=tri=>{
      if(!overlaps(boundsOf(tri),box))return;
      for(const p of tri)add(p.x,p.z);
      for(let i=0;i<tri.length;i++)for(let j=0;j<4;j++){
        const a=tri[i],b=tri[(i+1)%tri.length],p=poly[j],q=poly[(j+1)%4];
        const dx=b.x-a.x,dz=b.z-a.z,ex=q.x-p.x,ez=q.z-p.z,den=dx*ez-dz*ex;
        if(Math.abs(den)<1e-12)continue;
        const t=((p.x-a.x)*ez-(p.z-a.z)*ex)/den,u=((p.x-a.x)*dz-(p.z-a.z)*dx)/den;
        if(t>=0&&t<=1&&u>=0&&u<=1)add(a.x+t*dx,a.z+t*dz);
      }
    };
    // Native field triangles use the top-right--bottom-left diagonal, not Terrain.heightAt's bilinear blend.
    const terrain=world.N.Terrain;
    const fields=[{x:terrain.originX,z:terrain.originZ,w:terrain.w,h:terrain.h,step:terrain.cell},
      ...terrain.patches.map(p=>({x:p.x0,z:p.z0,w:p.nx,h:p.nz,step:p.step}))];
    for(const f of fields){
      for(let j=Math.max(0,Math.floor((box.minZ-f.z)/f.step));j<=Math.min(f.h-2,Math.floor((box.maxZ-f.z)/f.step));j++)
        for(let i=Math.max(0,Math.floor((box.minX-f.x)/f.step));i<=Math.min(f.w-2,Math.floor((box.maxX-f.x)/f.step));i++){
          const a={x:f.x+i*f.step,z:f.z+j*f.step},b={x:a.x+f.step,z:a.z},c={x:a.x,z:a.z+f.step},d={x:b.x,z:c.z};facet([a,c,b]);facet([b,c,d]);
        }
    }
    for(const top of world.N.ride.tops)if(overlaps(boundsOf(top.poly),box))facet(top.poly);
  }
  let residualMin=Infinity,residualMax=-Infinity,min=Infinity,max=-Infinity,ss=0;
  for(const p of points){const r=p.y-y-du*p.u-dv*p.v;residualMin=Math.min(residualMin,r);residualMax=Math.max(residualMax,r);min=Math.min(min,p.y);max=Math.max(max,p.y);ss+=r*r;}
  const c=Math.cos(frame.theta),s=Math.sin(frame.theta),raise=residualMax+clearance;
  return {x:frame.x,z:frame.z,y:y+raise,dx:du*c+dv*s,dz:-du*s+dv*c,du,dv,slope:Math.hypot(du,dv),
    supportMin:min,supportMax:max,supportRange:max-min,residualMin,residualMax,residualRms:Math.sqrt(ss/points.length),
    raise,clearance,minFill:clearance,maxFill:residualMax-residualMin+clearance,samples:points.length,
    surfaces:[...new Set(points.map(p=>p.surface))],continuousMaximumCertified:false};
}

// Optional standalone regression entry point, inert when imported by parent integration tests:
//   ../.tools/node/bin/node --test tests/helpers/sf-skateparks-world.mjs
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {default:test}=await import('node:test'),{default:assert}=await import('node:assert/strict');
  const fixture=createSkateparksWorld();
  const clear=(w,poly)=>{
    const c=inspectFootprint(w,poly);
    for(const [key,value]of Object.entries(c))assert.equal(value.conflicts.length,0,`${key}: ${value.conflicts.map(o=>o.id)}`);
    return c;
  };
  test('world frame and polygon clearance catch edge crossings and contained obstacles',()=>{
    const f={x:-4598.4,z:2275.5,theta:-1.4924571485356748},p=worldPoint(f,3,-7),q=localPoint(f,p.x,p.z);
    assert.ok(Math.abs(q.u-3)<1e-10&&Math.abs(q.v+7)<1e-10);
    const base={x:0,z:0,theta:0};
    assert.equal(polygonDistance(rectangle(base,2,10),rectangle(base,10,2)),0,'crossing edges without contained corners');
    assert.equal(polygonDistance(rectangle(base,10,10),rectangle(base,1,1)),0,'containment');
    assert.equal(polygonDistance(rectangle(base,2,2),rectangle({...base,x:5},2,2)),3);
  });
  test('actual core/regional data and local final Float32 Drape supply the surveyed floors',async()=>{
    const w=await fixture,out={normal:{}};
    for(const [id,height]of [['un',14.870165634155274],['zion',83.31000213623047]]){
      const p=SITE_PINS[id];w.sampler.sampleGround(p.x,p.z,out);
      assert.ok(Math.abs(out.height-height)<1e-5);assert.equal(out.surface,'pavement');assert.ok(out.normal.y>.99);
    }
    assert.equal(w.N.Terrain.cell,2);assert.equal(w.N.DATA.fullRegion.city.step,8);
    assert.equal(w.blocks.length,8);assert.ok(w.N.ride.tops.length>10000&&w.N.ride.tops.length<20000);
    assert.ok(w.draped.some(d=>d.lawn));assert.ok(w.draped.every(d=>d.positions instanceof Float32Array));
    assert.ok(w.network.edges.length>4000);assert.equal(w.sampler.colliderCount,0,'support-only fixture must not pretend to contain the city obstacles');
  });
  test('UN shifted court and all apron envelopes clear source obstacles; the reference-pin control fails',async()=>{
    const w=await fixture,f=SITE_FITS.un,c=clear(w,rectangle(f,f.width,f.length));
    assert.ok(c.pedestrians.nearest[0].distance>1.2);assert.ok(c.roads.nearest[0].distance>5.7);
    for(const p of f.pads){
      const centre={...worldPoint(f,p.u,p.v),theta:f.theta};
      clear(w,rectangle(centre,p.width+2*f.apron,p.length+2*f.apron));
      assert.ok(Math.abs(p.u)-p.width/2-f.apron>=f.spine/2,'aprons stay outside 4m spine');
    }
    const control=inspectFootprint(w,rectangle({...SITE_PINS.un,theta:0},18,34));
    assert.deepEqual(control.trees.conflicts.map(t=>t.id).sort(),['core:2272','core:5449']);
    assert.ok(control.pedestrians.conflicts.some(t=>t.id==='edge:2198:-1'));
  });
  test('Zion is entirely grass beside Waller and clears every conservative regional-road reservation',async()=>{
    const w=await fixture,f=SITE_FITS.zion,poly=rectangle(f,f.width,f.length),r=w.regionRoads.find(r=>r.id===16308);
    assert.ok(Math.abs(r.theta-f.theta)<1e-12);assert.ok(segmentDistance(f,r.a,r.b)>37);
    clear(w,poly);
    assert.ok(Math.min(...regionalRoadReservations(w).map(r=>polygonDistance(poly,r.poly)))>.89);
    for(let u=-f.width/2;u<=f.width/2;u++)for(let v=-f.length/2;v<=f.length/2;v++){
      const p=worldPoint(f,u,v),g=w.sampler.sampleGround(p.x,p.z,{normal:{}});assert.equal(g.surface,'grass');
    }
    for(const p of f.pads)assert.ok(Math.abs(p.u)-p.width/2-f.apron>=f.spine/2,'8m spine excludes aprons too');
  });
  test('small pad planes stay above independent support probes with modest local build-up',async()=>{
    const w=await fixture,g={normal:{}};
    for(const f of Object.values(SITE_FITS))for(const p of f.pads){
      const centre={...worldPoint(f,p.u,p.v),theta:f.theta},plane=fitSupportPlane(w,centre,p.width,p.length,{spacing:.25});
      assert.ok(plane.slope<.18);assert.ok(plane.maxFill<.5);assert.equal(plane.continuousMaximumCertified,false);
      // Offset grid (different from fit samples); this catches incorrect dx/dz rotation and residual sign.
      for(let u=-p.width/2+.071;u<p.width/2;u+=.37)for(let v=-p.length/2+.093;v<p.length/2;v+=.41){
        const q=worldPoint(centre,u,v);w.sampler.sampleGround(q.x,q.z,g);
        const y=plane.y+plane.dx*(q.x-plane.x)+plane.dz*(q.z-plane.z);
        assert.ok(y-g.height>.015&&y-g.height<.5,`bad plane at ${q.x},${q.z}: ${y-g.height}`);
      }
    }
    assert.ok(fitSupportPlane(w,SITE_FITS.zion,26,74).maxFill>1,'reject a single raised regional court plane');
  });
  test('UN depression stays outside court; its deep original support remains present',async()=>{
    const w=await fixture,out={normal:{}},poly=rectangle(SITE_FITS.un,SITE_FITS.un.width,SITE_FITS.un.length);
    w.sampler.sampleGround(-1052,994,out);assert.ok(out.height<8.7);assert.ok(pointPolygonDistance(poly,{x:-1052,z:994})>8.5);
    let minDistance=Infinity,count=0;
    for(let x=-1062;x<=-1030;x+=.5)for(let z=980;z<=1002;z+=.5){w.sampler.sampleGround(x,z,out);if(out.height<13){count++;minDistance=Math.min(minDistance,pointPolygonDistance(poly,{x,z}));}}
    assert.ok(count>700);assert.ok(minDistance>3.6);
  });
  for(const [id,start,end]of [['un',-56,56],['un',56,-56],['zion',-42,42],['zion',42,-42]])
    test(`native existing-floor ${id} access ${start}→${end} (support-only scope)`,async t=>{
      const w=await fixture,f=SITE_FITS[id],centre={...worldPoint(f,0,(start+end)/2),theta:f.theta};
      clear(w,rectangle(centre,f.spine,Math.abs(end-start)));
      const r=nativeFloorAccess(w,f,{start,end,throttle:.65,maxSeconds:50});
      assert.equal(r.reached,true);assert.equal(r.crashed,false);assert.equal(r.airSteps,0);
      assert.ok(r.maxCrossTrack<1e-7);assert.ok(r.maxContactError<1e-6);
      t.diagnostic(JSON.stringify(r));
    });
}
