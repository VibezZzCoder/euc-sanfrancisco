import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three/build/three.core.js';
import { installSfGeometryResidency } from '../js/geometry-residency.js';
import { uploadFixture } from './helpers/geometry-upload-fixture.mjs';

function mesh(name = 'SFRegionTerrain') {
  const g = new THREE.BoxGeometry(2, 3, 4), m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  m.name = name; g.userData.sfStaticGeometry = true; return m;
}
const attributes = g => [...Object.values(g.attributes), ...(g.index ? [g.index] : [])];
const bytes = a => Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength);

for (const kind of ['webgl2', 'webgpu']) {
  test(`${kind}: actual pinned upload/accounting/layouts finish before release; invisible/unused arrays stay resident`, () => {
    const f = uploadFixture(kind), scene = new THREE.Scene(), a = mesh(), invisible = mesh();
    invisible.visible = false; scene.add(a, invisible);
    const expected = new Map(attributes(a.geometry).map(attr => [attr, Buffer.from(bytes(attr))]));
    const installed = installSfGeometryResidency(f.renderer, scene);
    assert.equal(f.calls.length, 0, 'installation never uploads invisible or visible geometry');
    assert.ok(a.geometry.boundingSphere && a.geometry.boundingBox);
    const before = f.backend.isWebGPUBackend && f.backend.attributeUtils.getVertexBufferLayout(f.object(a));
    const ro = f.submit(a, ['position', 'normal']); // UV is not consumed by this material
    for (const name of ['position', 'normal', 'index']) {
      const attr = name === 'index' ? a.geometry.index : a.geometry.attributes[name];
      assert.equal(attr.array.length, 0); assert.ok(f.buffer(attr).bytes.subarray(0, expected.get(attr).length).equals(expected.get(attr)), name);
      assert.equal(f.renderer.info.memoryMap.get(attr).size, expected.get(attr).length, 'Info sees original CPU byteLength');
      assert.equal(attr.array.BYTES_PER_ELEMENT, name === 'index' ? 2 : 4); assert.ok(attr.count > 0);
    }
    assert.ok(a.geometry.attributes.uv.array.length > 0); assert.ok(invisible.geometry.attributes.position.array.length > 0);
    if (before) assert.deepEqual(f.backend.attributeUtils.getVertexBufferLayout(f.object(a)), before, 'native layout after release');
    const creates = f.calls.length; f.submit(a, ['position', 'normal']); assert.equal(f.calls.length, creates, 'revisit does not upload');
    f.submit(a); assert.equal(a.geometry.attributes.uv.array.length, 0, 'later first-use attribute releases after its upload');
    assert.equal(installed.stats.bytes, [...expected.values()].reduce((n,b) => n+b.length, 0));
    installed.dispose(); f.stop(); assert.equal(f.buffers.size, 0); assert.equal(f.renderer.info.memory.total, 0);
  });

  test(`${kind}: later regional geometry, disposal/reupload and packed index types restore exact native bytes`, () => {
    const f = uploadFixture(kind), scene = new THREE.Scene(), installed = installSfGeometryResidency(f.renderer, scene);
    const a = mesh(); a.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(a.geometry.index.array), 1));
    a.geometry.userData.sfTerrainCpuRebuild = () => { const g = new THREE.BoxGeometry(2,3,4); g.setIndex(new THREE.BufferAttribute(new Uint32Array(g.index.array),1)); return g; };
    const expected = attributes(a.geometry).map(attr => Buffer.from(bytes(attr)));
    scene.add(a); const geometry = a.geometry;
    f.submit(a); assert.ok(attributes(geometry).every(attr => attr.array.length === 0));
    const creates = f.calls.filter(c => c.op === 'create').length;
    a.geometry = new THREE.BoxGeometry(); f.submit(a); a.geometry = geometry; f.submit(a);
    assert.equal(installed.stats.rebuilds, 0, 'normal LOD cache revisit keeps its GPU allocation');
    geometry.dispose(); f.submit(a);
    assert.equal(installed.stats.rebuilds, 1, 'native deletion restores all CPU attributes once');
    attributes(geometry).forEach((attr,i) => { assert.equal(attr.array.length,0); assert.ok(f.buffer(attr).bytes.subarray(0,expected[i].length).equals(expected[i])); });
    assert.ok(f.calls.filter(c => c.op === 'create').length > creates);
    installed.dispose(); f.stop(); assert.equal(f.buffers.size,0);
  });

  test(`${kind}: core chunks, dynamic/instance/storage/interleaved data and shared unsafe aliases are excluded`, () => {
    const f = uploadFixture(kind), scene = new THREE.Scene(), core = mesh('TerrainTile'), dynamic = mesh(), alias = mesh(), shared = mesh();
    dynamic.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const inst = new THREE.InstancedMesh(alias.geometry, undefined, 2);
    const storage = mesh(); storage.geometry.attributes.normal.isStorageBufferAttribute = true;
    const interleaved = mesh(); interleaved.geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array(24 * 6),6),3,0));
    scene.add(core,dynamic,alias,shared,inst,storage,interleaved);
    const installed = installSfGeometryResidency(f.renderer,scene);
    f.submit(core); f.submit(dynamic); f.submit(alias);
    // A storage binding may reference an ordinary BufferAttribute: preserve byteLength for later binding creation.
    const p = shared.geometry.attributes.position;
    f.submit(shared, undefined, [{ bindings: [{ isStorageBuffer:true, attribute:p, get buffer(){ return p.array; } }] }]);
    assert.ok(core.geometry.index.array.length>0 && core.geometry.attributes.position.array.length>0);
    assert.ok(dynamic.geometry.attributes.position.array.length>0); assert.ok(alias.geometry.attributes.position.array.length>0);
    assert.ok(storage.geometry.attributes.position.array.length>0 && interleaved.geometry.attributes.position.array.length>0);
    assert.ok(p.array.byteLength>0, 'plain attribute used by storage binding stays intact');
    installed.dispose(); f.stop();
  });

  test(`${kind}: upload failure is retryable; static deletion, mutation and unknown loss never upload zero bytes`, () => {
    const f=uploadFixture(kind), scene=new THREE.Scene(), a=mesh();scene.add(a);
    const installed=installSfGeometryResidency(f.renderer,scene), original=a.geometry.attributes.position.array;
    f.fail(); assert.throws(()=>f.submit(a),/controlled upload failure/); assert.equal(a.geometry.attributes.position.array,original);
    f.submit(a); const calls=f.calls.length;
    a.geometry.attributes.position.needsUpdate=true; assert.throws(()=>f.submit(a),/released attribute was mutated/); assert.equal(f.calls.length,calls);
    a.geometry.attributes.position.version--;
    const attr=a.geometry.attributes.position, native=f.backend.get(attr), buffer=f.buffer(attr);
    if(kind==='webgpu')delete native.buffer;else delete native.bufferGPU;
    assert.throws(()=>f.submit(a),/native buffer disappeared/); assert.equal(f.calls.length,calls);
    if(kind==='webgpu')native.buffer=buffer;else native.bufferGPU=buffer;
    a.geometry.dispose(); const disposed=f.calls.length;
    assert.throws(()=>f.submit(a),/buffer was deleted after CPU release/); assert.equal(f.calls.length,disposed);
    installed.dispose(); f.stop();
  });

  test(`${kind}: keep switch, receiver/return forwarding and terminal restoration preserve ownership`, () => {
    const f=uploadFixture(kind),scene=new THREE.Scene(),a=mesh();scene.add(a);
    const original=f.renderer._attributes.update, originalGeometry=f.renderer._geometries.updateForRender;
    const keep=installSfGeometryResidency(f.renderer,scene,{search:'?geocopies=keep'});f.submit(a);
    assert.equal(f.renderer._attributes.update,original);assert.ok(a.geometry.attributes.position.array.length>0);keep.dispose();
    let receiver,args;
    f.renderer._attributes.update=function(...rest){receiver=this;args=rest;original.apply(this,rest);return 42;};
    const prior=f.renderer._attributes.update, installed=installSfGeometryResidency(f.renderer,scene);
    assert.equal(f.renderer._attributes.update(a.geometry.attributes.position,1,'sentinel'),42);
    assert.equal(receiver,f.renderer._attributes);assert.equal(args[2],'sentinel');
    assert.throws(()=>installSfGeometryResidency(f.renderer,scene),/already installed/);
    f.submit(a);installed.dispose();installed.dispose();
    assert.equal(f.renderer._attributes.update,prior);assert.equal(f.renderer._geometries.updateForRender,originalGeometry);
    assert.equal(Object.hasOwn(f.renderer._geometries,'updateForRender'),false,'restore prototype lookup');
    f.stop();
  });

  test(`${kind}: omitted static families, mutable paint indices and odd-sized index buffers retain their contracts`, () => {
    const f=uploadFixture(kind),scene=new THREE.Scene();
    const shadow=mesh('ShadowProxy');shadow.userData.shadowProxy=true;delete shadow.geometry.userData.sfStaticGeometry;
    const patch=mesh('SFRegionGroundChunk');delete patch.geometry.userData.sfStaticGeometry;
    const paint=mesh('RoadMarkings');delete paint.geometry.userData.sfStaticGeometry;
    const road=mesh('SFRegionRoadPaint:0,0');
    const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,0,1,1,0,0],3));
    g.setIndex([0,1,2]);g.userData.sfStaticGeometry=true;const triangle=new THREE.Mesh(g,new THREE.MeshBasicMaterial());
    scene.add(shadow,patch,paint,road,triangle);
    const installed=installSfGeometryResidency(f.renderer,scene),paintIndex=paint.geometry.index.array;
    for(const m of [shadow,patch,paint,road,triangle])f.submit(m);
    for(const m of [shadow,patch,road,triangle])assert.equal(m.geometry.attributes.position.array.length,0,m.name);
    assert.equal(paint.geometry.index.array,paintIndex,'ordered paint culling keeps the writable CPU index');
    assert.equal(f.buffer(g.index).size,kind==='webgpu'?8:6,'native index alignment unaffected');
    paint.geometry.index.needsUpdate=true;f.submit(paint);assert.ok(f.calls.some(c=>c.op==='update'));
    shadow.material.wireframe=true;assert.throws(()=>f.submit(shadow),/wireframe requested/);
    installed.dispose();f.stop();
  });

  test(`${kind}: a later wrapper is not overwritten during terminal cleanup`, () => {
    const f=uploadFixture(kind),scene=new THREE.Scene(),a=mesh();scene.add(a);
    const installed=installSfGeometryResidency(f.renderer,scene),inner=f.renderer._attributes.update;
    const later=function(){return inner.apply(this,arguments);};f.renderer._attributes.update=later;
    f.submit(a);installed.dispose();assert.equal(f.renderer._attributes.update,later);f.stop();
  });

  test(`${kind}: a failed regeneration restores nothing and a later exact retry uploads normally`, () => {
    const f=uploadFixture(kind),scene=new THREE.Scene(),a=mesh();let bad=false;
    a.geometry.userData.sfTerrainCpuRebuild=()=>bad?new THREE.PlaneGeometry():new THREE.BoxGeometry(2,3,4);scene.add(a);
    const installed=installSfGeometryResidency(f.renderer,scene);f.submit(a);a.geometry.dispose();bad=true;
    const calls=f.calls.length;assert.throws(()=>f.submit(a),/rebuild changed attribute layout/);
    assert.equal(f.calls.length,calls);assert.ok(attributes(a.geometry).every(attr=>attr.array.length===0));
    bad=false;f.submit(a);assert.equal(installed.stats.rebuilds,1);installed.dispose();f.stop();
  });
}

test('regional recipe uses a bound call rather than an escaping construction-arena closure', () => {
  const source=readFileSync(new URL('../js/region.js',import.meta.url),'utf8');
  assert.match(source,/geo\.userData\.sfTerrainCpuRebuild=geometry\.bind\(null,g,t,stride,far,transition\)/);
  assert.doesNotMatch(source,/sfTerrainCpuRebuild\s*=\s*\([^)]*\)\s*=>/,'an escaping closure can pin clipping scratch');
});

test('the installed owner retains neither disposed historical geometry nor released CPU arrays',
  {skip:typeof global.gc!=='function'&&'run with --expose-gc'},async()=>{
    const f=uploadFixture('webgl2'),scene=new THREE.Scene(),installed=installSfGeometryResidency(f.renderer,scene);
    const refs=(()=>{
      const a=mesh();scene.add(a);
      // Later immutable terrain uses the same weak registration path as runtime regional LODs.
      a.geometry.userData.sfTerrainCpuRebuild=()=>new THREE.BoxGeometry(2,3,4);
      const refs=[new WeakRef(a.geometry),...attributes(a.geometry).map(attr=>new WeakRef(attr.array))];
      f.submit(a);a.removeFromParent();a.geometry.dispose();return refs;
    })();
    for(let i=0;i<3;i++){await new Promise(setImmediate);global.gc();}
    assert.ok(refs.every(ref=>ref.deref()===undefined),'weak registries cannot retain old tiles/typed backing');
    installed.dispose();f.stop();
  });
