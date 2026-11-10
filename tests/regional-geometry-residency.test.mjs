// Current regional factory/selectors with pinned native upload/disposal mocks. No browser/GPU, edits or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';
import { installSfGeometryResidency } from '../js/geometry-residency.js';
import { uploadFixture } from './helpers/geometry-upload-fixture.mjs';

const source = readFileSync(new URL('../js/region.js', import.meta.url), 'utf8');
const attrs = g => [...Object.values(g.attributes), g.index].filter(Boolean);
const snapshot = g => attrs(g).map(a => ({ Type:a.array.constructor, count:a.count, itemSize:a.itemSize,
  bytes:Buffer.from(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength)) }));
function fixture() {
  const Terrain = { loaded:true, originX:0, originZ:0, w:3, h:3, cell:2, waterLevel:-10, patches:[],
    coreTransition:{ patches:[], outer:{x0:900,z0:600,x1:1000,z1:700} } };
  const city = { x0:-1000,z0:-500,x1:1048,z1:1036,step:64,w:33,h:25,
    heights:Float32Array.from({length:33*25},(_,i)=>3+(i%33)*1.7+Math.floor(i/33)*.9+Math.sin(i)*2),tiles:[] };
  for(let z=0;z<3;z++)for(let x=0;x<4;x++)city.tiles.push({x:-1000+x*512,z:-500+z*512,w:9,h:9,size:512});
  const horizon={...city,x0:9000,z0:9000,x1:9512,z1:9512,w:9,h:9,heights:new Float32Array(81).fill(40),tiles:[{x:9000,z:9000,w:9,h:9,size:512}]};
  const data={city,horizon,mask:new Uint8Array(256),roads:new Float32Array(),buildings:[],trees:new Float32Array(),
    manifest:{mask:{originX:-1000,originZ:-500,w:16,h:16},waterLevel:-10,ferries:[],cargo:[]} };
  const window={NYC:{THREE,TSL,Terrain,DATA:{fullRegion:data},cityUniforms:{uInteriorGlow:TSL.uniform(1),uTime:TSL.uniform(0)}}};
  new Function('window','location',source)(window,{search:''});
  const scene=new THREE.Scene(),region=window.NYC.buildSFRegion(scene);
  return {scene,region,tiles:region.group.children.filter(m=>m.name==='SFRegionTerrain'||m.name==='SFHorizonTerrain')};
}

for(const kind of ['webgl2','webgpu'])test(`${kind}: actual regional deferred publications/revisits/teardown preserve native bytes without eager upload`,()=>{
  const {scene,region,tiles}=fixture(), f=uploadFixture(kind), owner=installSfGeometryResidency(f.renderer,scene);
  region.setLodBudget(1e-9);
  const checked=new WeakSet(), consumed=new Set(); let builds=0;
  const submit=m=>{
    const g=m.geometry;
    if(!checked.has(g)){
      const expected=snapshot(g), copy=g.userData.sfTerrainCpuRebuild();
      const rebuilt=snapshot(copy);
      assert.equal(rebuilt.length,expected.length);
      for(let i=0;i<expected.length;i++)assert.ok(rebuilt[i].bytes.equals(expected[i].bytes),'recipe exactly regenerates clipped normals/indices');
      copy.dispose(); f.submit(m);
      attrs(g).forEach((a,i)=>assert.ok(f.buffer(a).bytes.subarray(0,expected[i].bytes.length).equals(expected[i].bytes),'pinned upload bytes'));
      checked.add(g);consumed.add(g);builds++;
    } else f.submit(m);
    assert.ok(attrs(g).every(a=>a.array.length===0));
  };
  submit(tiles[0]);
  assert.ok(attrs(tiles.at(-1).geometry).every(a=>a.array.length>0),'unsubmitted horizon stays CPU-resident');
  const stops=[[0,0],[4800,0],[-900,-400],[9000,0],[0,0]];
  for(let i=0;i<stops.length;i++){
    const [x,z]=stops[i],camera={position:{x,y:80,z}},rider={x:20000,z:20000};
    region.update(camera,i+1,rider);
    const before=f.calls.length;
    let calls=0;
    while(region.pendingTerrain()){region.update(camera,i+1,rider);assert.ok(++calls<100);}
    assert.equal(f.calls.length,before,'building/publishing never invokes native upload');
    for(const m of tiles.slice(0,6))submit(m);
  }
  assert.ok(builds>6,'later variants actually exercised');
  assert.equal(owner.stats.rebuilds,0,'cache switches never dispose/reupload existing variants');
  const m=tiles[0], original=m.geometry, expected=original.userData.sfTerrainCpuRebuild(), snap=snapshot(expected);expected.dispose();
  original.dispose(); f.submit(m);
  assert.equal(owner.stats.rebuilds,1,'actual regional recipe recovers a disposed variant before native upload');
  attrs(original).forEach((a,i)=>assert.ok(f.buffer(a).bytes.subarray(0,snap[i].bytes.length).equals(snap[i].bytes)));
  region.disposeTerrainCache();scene.traverse(m=>m.geometry?.dispose());
  assert.equal(f.buffers.size,0);assert.equal(f.renderer.info.memory.total,0);
  owner.dispose();f.stop();
});

test('9e9416b region differs only by immutable tags, recovery recipe and regional body ownership callees',t=>{
  let before;
  try{before=execFileSync('git',['show','9e9416b:js/region.js'],{cwd:new URL('../',import.meta.url),encoding:'utf8'});}
  catch{t.skip('private baseline not in curated source');return;}
  const stripped=source.replace(`computeRegionVertexNormals(geo);geo.computeBoundingSphere();
    // Drawing-only, immutable output. The upload owner can drop CPU copies, including later LODs. This recipe
    // binds only already-owned source grids/tile metadata. An arrow here would retain closure-shared clip arenas.
    geo.userData.sfTerrainCpuRebuild=geometry.bind(null,g,t,stride,far,transition);
    return geo;`,`computeRegionVertexNormals(geo);geo.computeBoundingSphere();return geo;`)
    .replace('geo.computeBoundingSphere();geo.userData.sfStaticGeometry=true;const mesh','geo.computeBoundingSphere();const mesh')
    .replace('ride?.addRegionalBox(', 'ride?.addBox(').replace('ride?.addRegionalPrism(', 'ride?.addPrism(');
  assert.ok(stripped===before,'all geometry, thresholds, physics and publication code remains identical to independent baseline');
});

test('a retained regional recipe does not keep its construction Float64 arrays alive', {skip:typeof global.gc!=='function'&&'run with --expose-gc'}, async()=>{
  const {region,tiles}=fixture(), g=tiles[0].geometry;
  // The factory itself has several closures sharing pos/idx. Track every Float64 workspace through only WeakRefs.
  const weak=[];
  class Tracked extends Float64Array { constructor(...args){super(...args);weak.push(new WeakRef(this));} }
  const old=globalThis.Float64Array;
  let rebuilt;
  try{globalThis.Float64Array=Tracked;rebuilt=g.userData.sfTerrainCpuRebuild();}finally{globalThis.Float64Array=old;}
  assert.ok(weak.length>0);
  for(let i=0;i<3;i++){await new Promise(setImmediate);global.gc();}
  assert.ok(weak.every(ref=>ref.deref()===undefined),'retaining geometry+recipe must not retain construction arenas');
  assert.ok(rebuilt.userData.sfTerrainCpuRebuild && rebuilt.attributes.position.array.length>0);
  rebuilt.dispose();region.disposeTerrainCache();
});
