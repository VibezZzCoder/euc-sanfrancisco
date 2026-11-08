// Shared core/regional collar: committed DEM + native controller, and actual Three CPU triangles at every LOD.
// No renderer, browser, generated geography or test hooks in production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';
import { EucController } from '../js/euc/simulation/EucController.js';
import runtime from './helpers/runtime-region.cjs';

const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function context() {
  const c=vm.createContext({window:{NYC:{THREE,TSL,cityUniforms:{uInteriorGlow:TSL.uniform(0),uTime:TSL.uniform(0)},
    createTerrainMaterial:()=>new THREE.MeshStandardNodeMaterial(),SHADOW_PROXY_LAYER:3}},
    console:{info(){}},location:{search:''},URLSearchParams});
  const load=name=>vm.runInContext(read(`js/${name}.js`),c);
  load('terrain');load('region');
  return {N:c.window.NYC,load};
}
function install(N,city) {
  const data={city,horizon:{...city,tiles:[]},buildings:[],trees:new Float32Array(),roads:new Float32Array(),
    mask:new Uint8Array(1),manifest:{horizon:city,mask:{originX:city.x0,originZ:city.z0,w:1,h:1},waterLevel:-100,ferries:[],cargo:[]}};
  N.DATA={fullRegion:data,groundMask:{header:{w:1,h:1},mask:new Uint8Array(1)}};
  N.installRegionTerrain(data);
  return new SfTerrainSampler({city:N,waterAt:()=>false});
}
function synthetic() {
  const world=context(),T=world.N.Terrain;
  Object.assign(T,{loaded:true,originX:-14,originZ:-6,cell:2,w:129,h:97,waterLevel:-100});
  T.heights=Float32Array.from({length:T.w*T.h},(_,k)=>{
    const i=k%T.w,j=Math.floor(k/T.w),x=T.originX+i*2,z=T.originZ+j*2;
    return 80+x*.18+z*.09+.7*Math.cos(i*.8)+.4*Math.sin(j*.9);
  });
  const C={x0:-128,z0:-128,x1:512,z1:512,step:8,w:81,h:81,tiles:[]};
  C.heights=Float32Array.from({length:C.w*C.h},(_,k)=>{
    const x=C.x0+k%C.w*8,z=C.z0+Math.floor(k/C.w)*8;
    return 79+x*.18+z*.09+.3*Math.sin(x*.03)*Math.cos(z*.02);
  });
  for(let z=C.z0;z<C.z1;z+=128)for(let x=C.x0;x<C.x1;x+=128)C.tiles.push({x,z,w:17,h:17,size:128});
  return {...world,T,C,sampler:install(world.N,C)};
}
function committed() {
  const world=context(),T=world.N.Terrain,{header,ab}=runtime.readBin(new URL('data/terrain-core.bin',root));
  T.load(header,new Uint16Array(ab));
  runtime.loadRegionPatches(new URL('.',root).pathname,T);
  const p=T.patches.shift();T.patches.length=0;
  const C={x0:p.x0,z0:p.z0,x1:p.x0+(p.nx-1)*p.step,z1:p.z0+(p.nz-1)*p.step,
    w:p.nx,h:p.nz,step:p.step,heights:p.h,tiles:[]};
  return {...world,T,C,sampler:install(world.N,C)};
}
const real=committed();
const perimeter=(r,spacing)=>{
  const points=[];
  for(let x=r.x0;x<=r.x1;x+=spacing)for(const z of [r.z0,r.z1])points.push([x,z,0,z===r.z0?-1:1]);
  for(let z=r.z0;z<=r.z1;z+=spacing)for(const x of [r.x0,r.x1])points.push([x,z,x===r.x0?-1:1,0]);
  return points;
};
const coreRect=T=>({x0:T.originX,z0:T.originZ,x1:T.originX+(T.w-1)*T.cell,z1:T.originZ+(T.h-1)*T.cell});

test('collar is bounded, Float64, atomic/idempotent, core/region buffers and patch priority stay unchanged',()=>{
  const {N,T,C,sampler}=synthetic(),core=T.heights.slice(),region=C.heights.slice(),transition=T.coreTransition;
  assert.equal(T.installCoreTransition(T.patches.at(-2)),transition);
  assert.equal(transition.patches.length,4);
  const buffers=new Set(transition.patches.map(p=>p.h.buffer));assert.equal(buffers.size,4);
  let cells=0;
  for(const p of transition.patches){
    assert.equal(Object.prototype.toString.call(p.h),'[object Float64Array]');cells+=p.h.length;
    assert.equal(p.h.byteLength,p.nx*p.nz*8);
  }
  assert.ok(cells<40000,'only a perimeter collar, not a dense extended core');
  assert.deepEqual(T.heights,core);assert.deepEqual(C.heights,region);
  const baseline=new SfTerrainSampler({terrain:{...T,patches:[]},waterAt:()=>false});
  for(let z=T.originZ+.3;z<180;z+=11.1)for(let x=T.originX+.7;x<240;x+=13.7)
    near(sampler.sampleGround(x,z,{normal:{}}).height,baseline.sampleGround(x,z,{normal:{}}).height);
  T.patches.unshift({x0:-44,z0:24,step:2,nx:3,nz:3,h:new Float64Array(9).fill(200),rect:true});
  const withDetail=new SfTerrainSampler({city:N,waterAt:()=>false});
  near(withDetail.sampleGround(-42,26,{normal:{}}).height,200);
  near(T.heightAt(-42,26),200);
  T.patchesEnabled=false;assert.equal(T.heightAt(-42,26),-105);T.patchesEnabled=true;
  const invalid=context().N.Terrain;Object.assign(invalid,{...T,patches:[],coreTransition:null});
  assert.throws(()=>invalid.installCoreTransition({x0:0,z0:0,step:8,nx:2,nz:2,h:new Float32Array(4)}),/coverage/);
  assert.equal(invalid.patches.length,0);assert.equal(invalid.coreTransition,null);
  T.load({originX:0,originZ:0,cell:2,w:2,h:2,minH:0,scale:.1,waterLevel:-100},new Uint16Array(4));
  assert.equal(T.coreTransition,null);
  assert.ok(transition.patches.every(p=>!T.patches.includes(p)),'reloading releases owned collar memberships');
});

test('all four committed edges, corners and outer joins are continuous with no source-grid step',t=>{
  const {T,sampler}=real,r=coreRect(T),o=T.coreTransition.outer;
  let worst=0,count=0;
  for(const b of [r,o])for(const [x,z,dx,dz] of perimeter(b,13.37)){
    const a=sampler.sampleGround(x-dx*1e-5,z-dz*1e-5,{normal:{}}).height;
    const c=sampler.sampleGround(x+dx*1e-5,z+dz*1e-5,{normal:{}}).height;
    const delta=Math.abs(a-c);worst=Math.max(worst,delta);count++;
    assert.ok(delta<.001,`edge ${x},${z}: ${delta}`);
  }
  for(const b of [r,o])for(const x of [b.x0,b.x1])for(const z of [b.z0,b.z1]){
    const h=sampler.sampleGround(x,z,{normal:{}}).height;
    for(const dx of [-1,1])for(const dz of [-1,1])near(sampler.sampleGround(x+dx*1e-6,z+dz*1e-6,{normal:{}}).height,h,1e-4);
  }
  const core=sampler.sampleGround(-238.2,2697.99,{normal:{}}).height;
  const region=sampler.sampleGround(-238.2,2698.01,{normal:{}}).height;
  assert.ok(Math.abs(core-region)<.015,'reported 0.594 m step is gone');
  t.diagnostic(JSON.stringify({crossings:count,worst20MicrometreJump:worst,reportedPoint20MillimetreDifference:core-region,
    float64Bytes:T.coreTransition.patches.reduce((n,p)=>n+p.h.byteLength,0)}));
});

test('actual core, collar and clipped regional triangles agree with native support at remote/near LODs and corners',()=>{
  const {N,T,C,sampler,load}=synthetic();load('terrain-mesh');
  const scene=new THREE.Scene(),core=N.buildTerrainMesh(scene),region=N.buildSFRegion(scene),r=coreRect(T),o=T.coreTransition.outer;
  const meshes=()=>{scene.updateMatrixWorld(true);return scene.children.flatMap(g=>g.children).filter(m=>
    m.name==='TerrainTile'||m.name==='SFRegionTerrain'||m.name==='SFRegionTerrainTransition');};
  const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0),0,2000);
  const points=[];
  for(const b of [r,o])for(const [x,z,dx,dz] of perimeter(b,17.13))for(const offset of [-.11,0,.11])points.push([x+dx*offset,z+dz*offset]);
  for(const x of [r.x0,r.x1])for(const z of [r.z0,r.z1])for(const dx of [-3.31,-.07,.07,3.31])for(const dz of [-3.27,-.07,.07,3.27])points.push([x+dx,z+dz]);
  // Probe facets, not just edge vertices: both fine triangle halves and the body of each strip.
  for(const p of T.coreTransition.patches)for(let j=1;j<p.nz-1;j+=3)for(let i=1;i<p.nx-1;i+=19)
    points.push([p.x0+(i+.21)*p.step,p.z0+(j+.37)*p.step],[p.x0+(i+.79)*p.step,p.z0+(j+.73)*p.step]);
  const profiles=[];
  for(const camera of [{x:20000,y:500,z:20000},{x:3000,y:200,z:40},{x:0,y:90,z:0}]){
    const clock=profiles.length+1;core.update(camera,clock,{x:20000,z:20000});region.update({position:camera},clock,{x:20000,z:20000});
    if(profiles.length===0)assert.ok(core.stats().lods[3]>0,'interior still coarsens with remote camera');
    const drawn=meshes(),profile=[];
    for(const [x,z] of points){
      ray.ray.origin.set(x,1000,z);const hits=ray.intersectObjects(drawn,false);assert.ok(hits.length,`no drawn hole at ${x},${z}`);
      const h=sampler.sampleGround(x,z,{normal:{}}).height;
      near(hits[0].point.y,h,3e-5);profile.push(hits[0].point.y);
      const below=hits.filter(a=>Math.abs(a.point.y-h)>1e-4);
      // Vertical chunk skirts can hit at exact grid boundaries; they must never create a higher support lid.
      assert.ok(below.every(a=>a.point.y<h+1e-4));
    }
    profiles.push(profile);
  }
  assert.deepEqual(profiles[0],profiles[1]);assert.deepEqual(profiles[1],profiles[2]);
  for(const m of region.group.children.filter(m=>m.name==='SFRegionTerrainTransition')){
    assert.equal(m.geometry.attributes.position.array.byteLength,m.geometry.attributes.position.count*12);
    assert.ok(!T.coreTransition.patches.some(p=>p.h.buffer===m.geometry.attributes.position.array.buffer));
  }
  assert.equal(region.group.children.filter(m=>m.name==='SFRegionTerrainTransition').length,4);
  // Water and mask arrays do not participate in geometry ownership.
  assert.equal(C.heights,T.patches.at(-2).h);
  const disposalCounts=new Map();
  for(const m of region.group.children.filter(m=>m.name==='SFRegionTerrainTransition')){
    disposalCounts.set(m.geometry,0);m.geometry.addEventListener('dispose',()=>disposalCounts.set(m.geometry,disposalCounts.get(m.geometry)+1));
  }
  core.dispose();region.disposeTerrainCache();region.disposeTerrainCache();
  assert.ok([...disposalCounts.values()].every(n=>n===0),'attached collar belongs to drained scene disposal, not the variant cache');
  const owned=new Set();scene.traverse(m=>{if(m.geometry)owned.add(m.geometry);});for(const g of owned)g.dispose();
  assert.ok([...disposalCounts.values()].every(n=>n===1),'each collar geometry disposed exactly once');
});

test('camera rays use the same fine collar facets, including oblique intersections',()=>{
  const {T,sampler}=synthetic();
  for(const p of T.coreTransition.patches){
    const x=p.x0+3.13,z=p.z0+3.27,h=sampler.sampleGround(x,z,{normal:{}}).height;
    near(sampler.raycast({x,y:h+10,z},{x:0,y:-1,z:0},20),10);
    const length=Math.hypot(1,4,.3),d={x:1/length,y:-4/length,z:.3/length};
    const distance=sampler.raycast({x:x-d.x*2,y:h-d.y*2,z:z-d.z*2},d,4);
    near(distance,2,1e-6);
    assert.equal(sampler.raycastObstacle({x,y:h+1,z},{x:1,y:0,z:0},2,.3),null,'collar adds no fabricated box walls');
  }
});

test('native wheel crosses reproduced Vermont seam and passing control both directions; raw-grid control still fails',t=>{
  const {T,sampler}=real,raw=new SfTerrainSampler({terrain:{...T,patches:T.patches.filter(p=>!p.coreTransition)},waterAt:()=>false});
  const actions={throttle:.4,steer:0,crouch:false,hop:false,hopHeld:false,swing:false,reset:false};
  const ride=(s,x,direction,before=6,after=4)=>{
    const z=2698-direction*before,y=s.sampleGround(x,z,{normal:{}}).height;
    const spawn={position:{x,y,z},headingY:direction>0?0:Math.PI};
    const rider=new EucController(s,{spawn});assert.ok(rider.reset(spawn,4));rider.invulnerableTimer=0;
    let result;
    for(let tick=0;tick<(before+after>20?1200:360);tick++){
      rider.step(1/120,actions);result=rider.snapshot();
      if(result.crashed||(result.position.z-2698)*direction>after)break;
    }
    return result;
  };
  const negative=ride(raw,-238.2,-1);assert.ok(negative.crashed&&negative.blocked,'unrepaired source-grid native obstruction reproduced');
  assert.equal(negative.crashCause,'obstacle');
  const outcomes=[];
  for(const x of [-242.2,-238.2,-234.2,-214.2])for(const direction of [-1,1]){
    const result=ride(sampler,x,direction);
    assert.ok(!result.crashed&&!result.blocked,`${x}/${direction}: ${JSON.stringify(result.position)} ${result.crashCause}`);
    assert.ok((result.position.z-2698)*direction>4,`${x}/${direction}: actually traversed the seam`);
    outcomes.push({x,direction,z:result.position.z});
  }
  const wholeCollar=[];
  for(const x of [-238.2,-214.2])for(const direction of [-1,1]){
    const before=direction<0?40:6,after=direction<0?6:40,result=ride(sampler,x,direction,before,after);
    assert.ok(!result.crashed&&!result.blocked,`full collar ${x}/${direction}: ${result.crashCause}`);
    assert.ok((result.position.z-2698)*direction>after,'traverses both inner and outer collar joins');
    wholeCollar.push({x,direction,z:result.position.z});
  }
  t.diagnostic(JSON.stringify({negative:{position:negative.position,cause:negative.crashCause},repaired:outcomes,wholeCollar}));
});
