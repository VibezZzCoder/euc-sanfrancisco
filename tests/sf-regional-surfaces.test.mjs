// CPU geometry only: no renderer, browser, WebGPU adapter or geography downloads.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';

const root = new URL('../', import.meta.url);
const source = path => fs.readFileSync(new URL(path, root), 'utf8');
function context(extra = {}) {
  const c = vm.createContext({ window: { NYC: { THREE, TSL, ...extra } }, console: { info() {} },
    location: { search: '' }, URLSearchParams });
  return { c, N: c.window.NYC, load: f => vm.runInContext(source(`js/${f}.js`), c) };
}
function mergeGeometries(gs) {
  const out = new THREE.BufferGeometry();
  for (const key of Object.keys(gs[0].attributes)) {
    const size = gs[0].attributes[key].itemSize;
    out.setAttribute(key, new THREE.Float32BufferAttribute(gs.flatMap(g => Array.from(g.attributes[key].array)), size));
  }
  return out;
}
const inside = (poly,x,z) => {
  let sign = 0;
  for (let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],d=(b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x);
    if (Math.abs(d)<1e-5) continue;
    if (sign && Math.sign(d)!==sign) return false;
    sign=Math.sign(d);
  }
  return true;
};
const height = (t,x,z) => t.plane ? t.plane.y+t.plane.dx*(x-t.plane.x)+t.plane.dz*(z-t.plane.z) : t.top;
function boxContains(b,p) {
  const dx=p[0]-b.centre.x,dz=p[2]-b.centre.z,c=Math.cos(b.rotationY),s=Math.sin(b.rotationY);
  return Math.abs(c*dx-s*dz)<b.halfExtents.x-1e-5 && Math.abs(s*dx+c*dz)<b.halfExtents.z-1e-5
    && Math.abs(p[1]-b.centre.y)<b.halfExtents.y-1e-5;
}

test('source Golden Gate approaches/deck are continuously supported; Bay upper/lower tower and anchorage openings stay open', () => {
  const {N,load}=context({Addons:{mergeGeometries}});
  load('sf-geodata'); load('city-config'); load('sf-ride-geometry');
  N.Terrain={waterLevel:-1.07,groundAt:()=>12,heightAt:()=>12};
  load('landmarks'); load('sf-bridges');
  const bridge=N.buildSFBridges(new THREE.Group()),ride=N.ride,gg=bridge.routes.goldengate;
  assert.ok(bridge.colliders.every(c=>c.rideIgnore),'legacy bridge reservations must not reach native contacts');
  assert.ok(gg.stations.length>600);
  assert.ok(Math.abs(gg.south[1]-12.05)<1e-8);assert.ok(Math.abs(gg.north[1]-12.05)<1e-8);
  // Test every drawn interval's midpoint as well as its joins, in both travel orders.
  for (const stations of [gg.stations,gg.stations.slice().reverse()]) for(let i=1;i<stations.length;i++) {
    const a=stations[i-1],b=stations[i];
    assert.ok(Math.hypot(b[0]-a[0],b[2]-a[2])<9,'no source-way bend discontinuity');
    const p=a.map((v,k)=>(v+b[k])/2);
    assert.ok(ride.tops.some(t=>inside(t.poly,p[0],p[2])&&Math.abs(height(t,p[0],p[2])-p[1])<.1), 'continuous exact deck');
    assert.ok(!ride.solids.some(s=>boxContains(s,[p[0],p[1]+1,p[2]])),'Golden Gate road is not a structural collision lid');
    const obstruction=ride.prisms.find(s=>s.minY<p[1]+1&&s.maxY>p[1]+1&&inside(s.outer,p[0],p[2]));
    assert.ok(!obstruction,`Golden Gate anchorages stay below the road: ${JSON.stringify({p,obstruction})}`);
  }
  const bay=bridge.routes.baybridge;
  for(const [a,b] of [[bay.westUpper,bay.islandUpper],[bay.westLower,bay.islandLower]]) {
    for(let i=0;i<=80;i++) {
      const x=a[0]+(b[0]-a[0])*i/80,z=a[2]+(b[2]-a[2])*i/80;
      const at=bridge.bridgeDeckAt(x,z,a===bay.westUpper).y;
      assert.ok(ride.tops.some(t=>inside(t.poly,x,z)&&Math.abs(height(t,x,z)-at)<.06));
      assert.ok(!ride.solids.some(s=>boxContains(s,[x,at+1,z])),'no whole-tower, portal or deck collision lid');
      assert.ok(!ride.prisms.some(s=>s.minY<at+1&&s.maxY>at+1&&inside(s.outer,x,z)),'anchorage leaves both lanes open');
    }
  }
  assert.ok(ride.solids.every(b=>b.support===false));
  assert.ok(ride.tops.every(t=>t.layered&&t.shore));
});

test('committed regional DEM supplies both Golden Gate landings; actual graded approaches keep registered support', async t => {
  const {N,c,load}=context({Addons:{mergeGeometries}});
  for(const f of ['sf-geodata','sf-places','city-config','sf-destinations','terrain','sf-ride-geometry'])load(f);
  const bin=fs.readFileSync(new URL('data/terrain-core.bin',root)),n=bin.readUInt32LE(4),header=JSON.parse(bin.toString('utf8',8,8+n));
  N.Terrain.load(header,new Uint16Array(bin.buffer.slice(bin.byteOffset+8+n,bin.byteOffset+bin.length)));
  c.fetch=async()=>({ok:true,json:async()=>JSON.parse(source('data/region/manifest.json'))});
  load('region');
  const data=await N.loadSFRegion(async url=>{
    const b=fs.readFileSync(new URL(url,root)),n=b.readUInt32LE(4);
    return {header:JSON.parse(b.toString('utf8',8,8+n)),buf:b.buffer.slice(b.byteOffset,b.byteOffset+b.length),offset:8+n};
  });
  N.installRegionTerrain(data);load('landmarks');load('sf-bridges');
  const r=N.buildSFBridges(new THREE.Group()),route=r.routes.goldengate;
  for(const p of [route.south,route.north]) {
    const floor=N.sfDestinationFloorAt(p[0],p[2]);
    assert.ok(floor>N.Terrain.waterLevel+.05,'endpoint has committed dry DEM coverage');
    assert.ok(Math.abs(p[1]-floor-.05)<1e-6,'visible approach ends 5 cm above the same triangular land profile');
  }
  let maxStep=0;
  for(let i=1;i<route.stations.length;i++) {
    const a=route.stations[i-1],b=route.stations[i];maxStep=Math.max(maxStep,Math.abs(b[1]-a[1]));
    const p=a.map((v,k)=>(v+b[k])/2);
    assert.ok(N.ride.tops.some(s=>inside(s.poly,p[0],p[2])&&Math.abs(height(s,p[0],p[2])-p[1])<.1));
  }
  t.diagnostic(JSON.stringify({south:route.south,north:route.north,stations:route.stations.length,
    maxStationRise:maxStep,tops:N.ride.tops.length,boxes:N.ride.solids.length,prisms:N.ride.prisms.length}));
});

test('regional buildings use actual base/yaw/height; tree bodies have matching visible trunks and survive culling', () => {
  const Terrain={loaded:true,originX:0,originZ:0,w:3,h:3,cell:2,waterLevel:-10,heightAt:()=>2,
    patches:[{rect:true,x0:24,z0:24,nx:3,nz:3,step:2,h:new Float32Array(9).fill(2)}]};
  const C={x0:-16,z0:-16,x1:48,z1:48,step:8,w:9,h:9,heights:new Float32Array(81).fill(2),
    tiles:[{x:-16,z:-16,w:9,h:9,size:64}]};
  const data={city:C,horizon:{...C,tiles:[]},manifest:{mask:{originX:-16,originZ:-16,w:16,h:16},waterLevel:-10,ferries:[],cargo:[]},
    mask:new Uint8Array(256),roads:new Float32Array(),trees:new Float32Array([20,2,20,10]),
    buildings:[{header:{originX:0,originZ:0},records:new Int32Array([100,100,100,200,40,60,5000])}]};
  const {N,load}=context({Terrain,DATA:{fullRegion:data},cityUniforms:{uInteriorGlow:TSL.uniform(1),uTime:TSL.uniform(0)}});
  load('sf-ride-geometry');load('region');
  const r=N.buildSFRegion(new THREE.Group()),b=N.ride.solids[0];
  assert.deepEqual({...b.centre},{x:10,y:14.5,z:10});assert.deepEqual({...b.halfExtents},{x:2,y:5.5,z:3});assert.equal(b.rotationY,.5);
  const trunk=N.ride.prisms[0];assert.equal(trunk.minY,2);assert.equal(trunk.maxY,7);assert.equal(trunk.outer.length,8);
  // Far regional trees: instance data feeds the vertex shader; the trunk is a unit square prism (inscribed radius 1,
  // y 0..1) scaled to the physical prism's radius and at least its height, so it encloses the octagonal body.
  const drawn=r.group.children.find(m=>m.name.startsWith('SFRegionTrees:'));
  assert.deepEqual([...drawn.geometry.attributes.aFarPos.array],[20,2,20,10]);assert.equal(drawn.geometry.instanceCount,1);
  const unit=drawn.geometry.attributes.position.array,part=drawn.geometry.attributes.aFarPart.array;let trunkVerts=0;
  for(let i=0;i<part.length/2;i++)if(part[i*2]===0){trunkVerts++;assert.ok(Math.abs(Math.max(Math.abs(unit[i*3]),Math.abs(unit[i*3+2]))-1)<1e-6);assert.ok(unit[i*3+1]===0||unit[i*3+1]===1);}
  assert.equal(trunkVerts,8);
  const src=source('js/region.js');
  assert.ok(src.includes('const trunkR = max(h.mul(0.022), 0.08);')&&src.includes('g.y.mul(max(base.add(crownH.mul(0.3)), h.mul(0.5)))'),'drawn trunk radius/height follow the physical prism');
  const ground=r.group.children.find(m=>m.name==='SFRegionTerrain'),coarse=ground.geometry.index.count;
  r.update({position:{x:20000,z:20000}},0,{x:10,z:10});
  assert.ok(ground.geometry.index.count>coarse,'8 m near-rider drawing even when the camera is remote');
  assert.equal(drawn.visible,false);assert.equal(N.ride.prisms.length,1,'culling never removes physical trunks');
  const pos=ground.geometry.attributes.position.array,idx=ground.geometry.index.array;
  for(let k=0;k<idx.length;k+=3){
    const x=(pos[idx[k]*3]+pos[idx[k+1]*3]+pos[idx[k+2]*3])/3,z=(pos[idx[k]*3+2]+pos[idx[k+1]*3+2]+pos[idx[k+2]*3+2])/3;
    assert.ok(!(x>0&&x<4&&z>0&&z<4),'regional drawing does not replace the 2 m core');
    assert.ok(!(x>24&&x<28&&z>24&&z<28),'regional drawing does not cover a finer landmark patch');
  }
});

test('core drawing stays on its physical 2 m diagonal around the rider with a remote camera', () => {
  const Terrain={loaded:true,originX:0,originZ:0,w:9,h:9,cell:2,waterLevel:-10,
    heights:Float32Array.from({length:81},(_,i)=>2+(i%9)*.5+Math.floor(i/9)*.2)};
  const {N,load}=context({Terrain,DATA:{groundMask:{header:{w:16,h:16},mask:new Uint8Array(256)}},
    createTerrainMaterial:()=>new THREE.MeshStandardNodeMaterial(),SHADOW_PROXY_LAYER:3});
  load('terrain-mesh');const mesh=N.buildTerrainMesh(new THREE.Group());
  mesh.update({x:20000,y:300,z:20000},0,{x:4,z:4});
  assert.equal(mesh.stats().lods[0],1);assert.equal(mesh.stats().lods[3],0);
  const geometry=mesh.group.children.find(m=>m.name==='TerrainTile').geometry;
  const pos=geometry.attributes.position.array,idx=geometry.index.array;
  const tri=Array.from(idx.slice(0,3)).map(k=>Array.from(pos.slice(k*3,k*3+3)));
  assert.deepEqual(tri.map(p=>[p[0],p[2]]),[[0,0],[0,2],[2,0]]);
  assert.ok(Math.abs(tri[2][1]-2.5)<1e-6,'real uphill profile retained');
});
