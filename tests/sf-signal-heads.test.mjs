import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.core.js';
import {actualSignalPlacements,repairFunction,signalSource} from './helpers/sf-signal-heads.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {SfTerrainSampler} from '../js/sf-terrain-sampler.js';
const repair=repairFunction();
const distance=(a,b)=>Math.hypot(a.elements[12]-b.elements[12],a.elements[14]-b.elements[14]);
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-9,`${label}: ${a} != ${b}`);
const clone=mats=>({head:mats.head.map(m=>m.clone()),lens:mats.lens.map(m=>m.clone()),arm:mats.arm.map(m=>m.clone()),pole:mats.pole.map(m=>m.clone())});
function meshes(mats) {
  const material=new THREE.MeshBasicMaterial(),geometry=new THREE.BoxGeometry();
  const result={};
  for(const key of ['head','lens','arm']) {
    const mesh=result[key]=new THREE.InstancedMesh(geometry,material,mats[key].length);
    mats[key].forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();
  }
  return result;
}
function apply(mats) {
  const heads=mats.head,lenses=mats.lens,arms=mats.arm,poles=mats.pole;
  repair(heads,lenses,arms,poles);
  assert.equal(mats.head,heads);assert.equal(mats.lens,lenses);assert.equal(mats.arm,arms);assert.equal(mats.pole,poles);
  return meshes(mats);
}
function checkMove(before,after,i) {
  const h0=before.head[i].elements,h=after.head[i].elements,a0=before.arm[i].elements,a=after.arm[i].elements;
  assert.deepEqual(after.head[i].elements,after.lens[i].elements,'head/lens exact transform synchronization');
  for(let k=0;k<16;k++)if(k!==12&&k!==14)assert.equal(h[k],h0[k],'head orientation/height/scale unchanged');
  assert.deepEqual(after.pole[i].elements,before.pole[i].elements,'pole never changes');
  close(a[12]-a[8]/2,before.pole[i].elements[12],'arm pole end x');close(a[14]-a[10]/2,before.pole[i].elements[14],'arm pole end z');
  close(a[12]+a[8]/2,h[12],'arm reaches head x');close(a[14]+a[10]/2,h[14],'arm reaches head z');
  assert.ok(a[13]-0.055>=h[13]+.56 && a[13]+.055<=h[13]+.96,'crossarm still meets existing upper stem');
  for(let k=0;k<16;k++)if(![8,10,12,14].includes(k))assert.equal(a[k],a0[k],'arm cross-section/height/axes unchanged');
  const shift=distance(before.head[i],after.head[i]);
  assert.ok(shift>=.599999&&shift<=2.400001);
}

test('actual node136 overlap is reproduced and separated; ordinary emissions/buffers stay exact',t=>{
  const {mats,metadata}=actualSignalPlacements(),before=clone(mats),after=clone(mats);
  // Browser report porting-r3-webgpu-20261113T021619447831Z: node136, edges175/4379.
  // The bounded core graph without building obstacles numbers the SAME positions
  // node137/edges178/4468. Match observed Float32 XZs, not unstable graph IDs.
  const ia=mats.head.findIndex((m,i)=>metadata[i].group===0&&Math.hypot(m.elements[12]-653.6417846679688,m.elements[14]+166.3954620361328)<.0001);
  const ib=mats.head.findIndex((m,i)=>metadata[i].group===1&&Math.hypot(m.elements[12]-653.6570434570312,m.elements[14]+166.41065979003906)<.0001);
  assert.ok(ia>=0&&ib>ia,'actual reported head positions/groups are emitted');
  const oldDistance=distance(before.head[ia],before.head[ib]);
  assert.ok(oldDistance<.03,'negative control reproduces near-coincident baseline heads');
  const mesh=apply(after),moved=[];
  for(let i=0;i<after.head.length;i++) {
    const changed=after.head[i].elements.some((v,k)=>v!==before.head[i].elements[k]);
    if(changed) {
      assert.ok(before.head.some((m,j)=>j!==i&&Math.abs(m.elements[13]-before.head[i].elements[13])<1.12&&distance(m,before.head[i])<.55),
        'only a formerly overlapping head moves');
      checkMove(before,after,i);moved.push({index:i,...metadata[i],shift:distance(before.head[i],after.head[i])});
    } else for(const key of ['head','lens','arm'])assert.deepEqual(after[key][i].elements,before[key][i].elements);
  }
  assert.ok(distance(after.head[ia],after.head[ib])>=.55);
  for(const i of [ia,ib]) {
    const m=metadata[i],h=after.head[i].elements;
    close(h[8],-m.dx,'lens front faces its original approaching driver x');
    close(h[10],-m.dz,'lens front faces its original approaching driver z');
  }
  // Compare their apparent lateral positions from either original approach direction.
  for(const i of [ia,ib]) {
    const m=metadata[i],a=after.head[ia].elements,b=after.head[ib].elements;
    assert.ok(Math.abs((b[12]-a[12])*m.dz-(b[14]-a[14])*m.dx)>.5,'heads separate across the original driver view');
  }
  assert.equal(mesh.head.count,mats.head.length);assert.equal(mesh.lens.count,mats.lens.length);assert.equal(mesh.arm.count,mats.arm.length);
  for(const {index:i} of moved)for(const key of ['head','lens','arm'])for(let k=0;k<16;k++)
    assert.equal(mesh[key].instanceMatrix.array[i*16+k],Math.fround(after[key][i].elements[k]),'published Float32 instance agrees');
  const gpu=mesh.head.instanceMatrix.array;
  assert.ok(Math.hypot(gpu[ia*16+12]-gpu[ib*16+12],gpu[ia*16+14]-gpu[ib*16+14])>.55,'separated after actual Float32 storage');
  t.diagnostic(JSON.stringify({heads:mats.head.length,arms:mats.arm.length,instanceMatrixBytes:mesh.head.instanceMatrix.array.byteLength,
    signalBaseBytes:mats.lensBase.length*4,oldDistance,newDistance:distance(after.head[ia],after.head[ib]),
    movedPosition:Array.from(gpu.slice(ib*16+12,ib*16+15)),moved}));
});

test('adversarial close pairs move only along their existing crossarms, with bounded clear-candidate search',()=>{
  const matrix=(x,z,yaw=0)=>new THREE.Matrix4().makeRotationY(yaw).setPosition(x,5.42,z);
  const heads=[matrix(0,0),matrix(.02,0)],arms=[new THREE.Matrix4().makeScale(.11,.11,4).setPosition(0,6.1,-2),
    new THREE.Matrix4().makeScale(.11,.11,4).setPosition(.02,6.1,-2)];
  const mats={head:heads,lens:heads.map(m=>m.clone()),arm:arms,pole:[matrix(0,-4),matrix(.02,-4)]},before=clone(mats);
  apply(mats);assert.ok(distance(heads[0],heads[1])>=.55);checkMove(before,mats,1);
  assert.deepEqual(heads[0].elements,before.head[0].elements);
  const settled=clone(mats);apply(mats);
  for(const key of ['head','lens','arm'])for(let i=0;i<2;i++)assert.deepEqual(mats[key][i].elements,settled[key][i].elements,'idempotent');
  // A third head occupies the first candidate; find the next clear point, without moving it.
  const triple={head:[matrix(0,0),matrix(0,-.6),matrix(.02,0)],arm:[arms[0].clone(),arms[0].clone(),
    new THREE.Matrix4().makeScale(.11,.11,4).setPosition(.02,6.1,-2)]};
  triple.lens=triple.head.map(m=>m.clone());triple.pole=[matrix(0,-4),matrix(0,-4.6),matrix(.02,-4)];
  apply(triple);assert.ok(distance(triple.head[0],triple.head[2])>1.19);assert.equal(triple.head[1].elements[14],-.6);
});

test('ordinary heads and exhausted short-arm candidates remain unchanged without growing storage',()=>{
  const head=(x,z)=>new THREE.Matrix4().setPosition(x,5.42,z);
  const mats={head:[head(0,0),head(.02,0),head(4,4)],arm:[new THREE.Matrix4(),new THREE.Matrix4(),new THREE.Matrix4()],
    pole:[head(0,-.9),head(.02,-.9),head(4,0)]};
  mats.lens=mats.head.map(m=>m.clone());
  const before=clone(mats),mesh=apply(mats);
  for(const key of ['head','lens','arm','pole'])for(let i=0;i<3;i++)assert.deepEqual(mats[key][i].elements,before[key][i].elements);
  for(const key of ['head','lens','arm'])assert.equal(mesh[key].instanceMatrix.version,0,'no dirty upload for a refused/ordinary case');
  repair([],[],[],[]); // Empty emitted inventory is valid.
});

test('actual moved overhead assembly has matching old/new drawn faces and native contacts, with unchanged ground and budgets',async t=>{
  const {mats}=actualSignalPlacements(),after=clone(mats);
  repair(after.head,after.lens,after.arm,after.pole);
  const index=1219;
  const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root),'utf8');
  const mergeCode=read('vendor/three/examples/jsm/utils/BufferGeometryUtils.js').replace("from 'three'",`from '${new URL('vendor/three/build/three.core.js',root).href}'`);
  const {mergeGeometries}=await import(`data:text/javascript;base64,${Buffer.from(mergeCode).toString('base64')}`);
  const workspace=signalSource.slice(signalSource.indexOf('function streetContactsWorkspace()'),signalSource.indexOf('// Construction-only overlap repair'));
  const shapes=signalSource.slice(signalSource.indexOf('  const unitBox ='),signalSource.indexOf('  const plateGeo ='));
  const registration=signalSource.slice(signalSource.indexOf('  const meshContacts ='),signalSource.indexOf("  add(unitCyl, metal, mats.stopPole"));
  assert.ok(workspace.length>0&&shapes.length>0&&registration.length>0);
  const build=placements=>{
    const N={THREE},c=vm.createContext({window:{NYC:N},THREE,mergeGeometries,
      mats:{head:[placements.head[index]],lens:[placements.lens[index]],arm:[placements.arm[index]],pole:[placements.pole[index]],
        lensBase:mats.lensBase.slice(index*3,index*3+3)},group:new THREE.Group(),
      metal:new THREE.MeshBasicMaterial(),housing:new THREE.MeshBasicMaterial(),lensMat:new THREE.MeshBasicMaterial(),separateSignalHeads:repair});
    vm.runInContext(read('js/sf-ride-geometry.js'),c);
    vm.runInContext(workspace+shapes+registration,c);
    const terrain={originX:600,originZ:-200,cell:100,w:2,h:2,heights:new Float64Array([4,4,4,4]),waterLevel:0};
    const sampler=new SfTerrainSampler({city:N,terrain,ride:N.ride,waterAt:()=>false});
    const buffers=new Set();let bytes=0,tops=0;
    for(const b of N.ride.tops){tops+=b.packedTops?b.length:1;for(const v of Object.values(b))if(ArrayBuffer.isView(v)&&!buffers.has(v.buffer)){buffers.add(v.buffer);bytes+=v.buffer.byteLength;}}
    const mesh=c.group.getObjectByName('SignalHeads');c.group.updateMatrixWorld(true);
    return {sampler,mesh,budget:{tops,solids:N.ride.solids.length,prisms:N.ride.prisms.length,typedBytes:bytes},
      arm:c.group.getObjectByName('SignalArms')};
  };
  const old=build(mats),current=build(after);
  assert.deepEqual(current.budget,old.budget,'same actual registry facet/body/typed storage counts');
  const normal=new THREE.Vector3(mats.head[index].elements[8],0,mats.head[index].elements[10]);
  const direction=normal.clone().negate(),ray=new THREE.Raycaster();
  for(const [name,matrix,expectedOld,expectedCurrent] of [['old',mats.head[index],true,false],['new',after.head[index],false,true]]) {
    const centre=new THREE.Vector3().setFromMatrixPosition(matrix),origin=centre.clone().addScaledVector(normal,.8);
    for(const [world,hitExpected]of [[old,expectedOld],[current,expectedCurrent]]) {
      ray.set(origin,direction);ray.near=0;ray.far=1.6;
      const drawn=ray.intersectObject(world.mesh,false)[0]?.distance??null;
      const contact=world.sampler.raycastObstacle(origin,direction,1.6,0);
      assert.equal(drawn!==null,hitExpected,`${name} face drawing`);assert.equal(contact!==null,hitExpected,`${name} face native ray`);
      if(hitExpected)assert.ok(Math.abs(drawn-contact)<.0001,'native ray meets actual drawn face within Float32 precision');
      assert.equal(world.sampler.isVolumeClear({x:centre.x,z:centre.z,headingY:0,halfWidthMetres:.01,halfLengthMetres:.01,minY:centre.y-.01,maxY:centre.y+.01}),!hitExpected,
        `${name} head-volume contact`);
      assert.equal(world.sampler.sampleGround(centre.x,centre.z,{normal:{},base:{normal:{}}},4).height,4,'street ground unchanged');
      assert.equal(world.sampler.isVolumeClear({x:centre.x,z:centre.z,headingY:0,halfWidthMetres:.2,halfLengthMetres:.2,minY:4.05,maxY:6}),true,'street-level clearance unchanged');
    }
  }
  // The adjusted arm now reaches the existing pole; its added endpoint span must
  // be physical as well as visible. Probe between the old clamp end and the pole.
  const a=after.arm[index].elements,p=after.pole[index].elements;
  const origin=new THREE.Vector3(p[12]+a[8]*.04,a[13]-1,p[14]+a[10]*.04),up=new THREE.Vector3(0,1,0);
  for(const [world,expected]of [[old,false],[current,true]]){
    ray.set(origin,up);ray.near=0;ray.far=1.5;
    const drawn=ray.intersectObject(world.arm,false)[0]?.distance??null;
    const physical=world.sampler.raycastObstacle(origin,up,1.5,0);
    assert.equal(drawn!==null,expected,'arm endpoint drawing');assert.equal(physical!==null,expected,'arm endpoint contact');
    if(expected)assert.ok(Math.abs(drawn-physical)<.0001);
  }
  t.diagnostic(JSON.stringify({assembly:index,before:old.budget,after:current.budget,faceAndGroundProbes:'pass'}));
});
