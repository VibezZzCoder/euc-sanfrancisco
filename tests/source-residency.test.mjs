import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { releaseSfTerrainSource, retainRegenerableTexture } from '../js/source-residency.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';

function terrainFixture(codes = [0, 1, 2500, 65535], minH = -4, scale = 0.001846341649500267) {
  const header = { w: 2, h: codes.length / 2, minH, scale, originX: 0, originZ: 0, cell: 1, waterLevel: -100 };
  const q = Uint16Array.from(codes), heights = Float32Array.from(q, code => minH + code * scale);
  return { data: { terrain: { header, q } }, terrain: { header, ...header, heights }, q };
}

test('quantized DEM handoff preserves exact Uint16 read/write API and fallback sampler values', () => {
  const { data, terrain, q } = terrainFixture();
  assert.equal(releaseSfTerrainSource(data, terrain), q.byteLength);
  assert.equal(typeof Object.getOwnPropertyDescriptor(data.terrain, 'q').get, 'function');
  const sampler = new SfTerrainSampler({ data, terrain: null });
  assert.deepEqual(sampler.fields[0].heights, terrain.heights);
  assert.deepEqual(data.terrain.q, q);
  assert.equal(data.terrain.q, data.terrain.q);
  data.terrain.q[0] = 300;
  assert.equal(data.terrain.q[0], 300);
  assert.notEqual(terrain.heights[0], 300);
});

test('assignment after DEM handoff keeps ordinary own writable enumerable data-property behavior', () => {
  const { data, terrain } = terrainFixture();
  releaseSfTerrainSource(data, terrain);
  const replacement = new Uint16Array([1, 2]);
  data.terrain.q = replacement;
  assert.deepEqual(Object.keys(data.terrain), ['header', 'q']);
  assert.equal(Object.getOwnPropertyDescriptor(data.terrain, 'q').value, replacement);
  assert.equal(releaseSfTerrainSource(data, terrain), 0);
});

test('ambiguous/lossy/custom DEM encodings reject handoff without changing caller data', () => {
  for (const edit of [f => { f.terrain.heights[0] = 123; }, f => { f.data.terrain.header.scale = 1e-20; },
    f => { Object.freeze(f.data.terrain); }, f => { f.terrain.header = {}; }]) {
    const f = terrainFixture(); edit(f);
    assert.equal(releaseSfTerrainSource(f.data, f.terrain), 0);
    assert.equal(f.data.terrain.q, f.q);
  }
  const f = terrainFixture();
  Object.defineProperty(f.data.terrain, 'q', { get() { throw Error('do not invoke caller getter'); } });
  assert.equal(releaseSfTerrainSource(f.data, f.terrain), 0);
});

test('an immutable decoded-source mutation fails closed instead of returning changed quantized codes', () => {
  const f = terrainFixture(); releaseSfTerrainSource(f.data, f.terrain);
  f.terrain.heights[0] = f.terrain.heights[1];
  assert.throws(() => f.data.terrain.q, /immutable DEM source changed/);
});

test('all committed core DEM samples round-trip exactly through the original decoded source', () => {
  const bytes = readFileSync(new URL('../data/terrain-core.bin', import.meta.url));
  const size = bytes.readUInt32LE(4), header = JSON.parse(bytes.subarray(8, 8 + size));
  const q = new Uint16Array(bytes.buffer.slice(bytes.byteOffset + 8 + size, bytes.byteOffset + bytes.length));
  const heights = Float32Array.from(q, n => header.minH + n * header.scale);
  const data = { terrain: { header, q } }, terrain = { header, heights };
  assert.equal(releaseSfTerrainSource(data, terrain), q.buffer.byteLength);
  assert.ok(Buffer.from(data.terrain.q.buffer).equals(Buffer.from(q.buffer)), 'all quantized bytes match');
});

function textureFixture() {
  const base = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 0, 7, 8, 9, 128, 10, 11, 12, 64]);
  const small = new Uint8Array([5, 6, 7, 128]);
  const texture = new THREE.DataTexture(base, 2, 2);
  texture.mipmaps = [{ data: base, width: 2, height: 2 }, { data: small, width: 1, height: 1 }];
  let rebuilds = 0;
  const recipe = () => { rebuilds++; const a = base.slice(); return [a, a, small.slice()]; };
  return { texture, base, small, recipe, get rebuilds() { return rebuilds; } };
}

test('public upload callback parks shared image/mips and later reads reconstruct once with exact aliasing', async () => {
  const f = textureFixture(), image = f.texture.image, mip0 = f.texture.mipmaps[0];
  assert.equal(retainRegenerableTexture(f.texture, f.recipe), true);
  assert.equal(f.texture.image.data, f.base); assert.equal(f.rebuilds, 0);
  f.texture.onUpdate(f.texture);
  assert.equal(f.texture.mipmaps[1].data.byteLength, 4, 'post-callback renderer accounting uses existing pixels');
  assert.equal(f.rebuilds, 0);
  await Promise.resolve();
  assert.deepEqual(f.texture.mipmaps[1].data, f.small); assert.equal(f.rebuilds, 1);
  assert.equal(f.texture.image.data, f.texture.mipmaps[0].data);
  assert.equal(f.texture.image, image); assert.equal(f.texture.mipmaps[0], mip0);
  assert.deepEqual(f.base, f.texture.image.data, 'escaped original data is untouched');
  f.texture.onUpdate(f.texture); await Promise.resolve(); f.texture.needsUpdate = true;
  assert.deepEqual(f.texture.image.data, f.base); assert.equal(f.rebuilds, 2);
  f.texture.dispose();
});

test('texture copy/clone shares reconstructible Source and preserves native pixel access', async () => {
  const f = textureFixture(); retainRegenerableTexture(f.texture, f.recipe); f.texture.onUpdate(f.texture);
  await Promise.resolve();
  const copy = f.texture.clone();
  assert.equal(copy.source, f.texture.source);
  assert.deepEqual(copy.image.data, f.base); assert.equal(f.rebuilds, 1);
  assert.equal(copy.mipmaps[0].data, copy.image.data);
  copy.dispose(); f.texture.dispose();
});

test('explicit pixel mutation opts out and is never overwritten by regeneration', async () => {
  const f = textureFixture(); retainRegenerableTexture(f.texture, f.recipe); f.texture.onUpdate(f.texture);
  await Promise.resolve();
  const pixels = new Uint8Array(16).fill(42); f.texture.image.data = pixels;
  f.texture.onUpdate(f.texture);
  await Promise.resolve();
  assert.equal(f.texture.image.data, pixels); assert.equal(f.rebuilds, 1);
});

test('texture dataReady=false and incomplete source ownership retain the original pixels', () => {
  const f = textureFixture(); retainRegenerableTexture(f.texture, f.recipe);
  f.texture.source.dataReady = false; f.texture.onUpdate(f.texture);
  assert.equal(f.texture.image.data, f.base); assert.equal(f.rebuilds, 0);
  f.texture.source.dataReady = true; f.texture.image.width = 3; f.texture.onUpdate(f.texture);
  assert.equal(f.texture.image.data, f.base);
});

test('unsupported sources or existing callbacks remain caller-owned; invalid regeneration fails closed', async () => {
  const f = textureFixture(); f.texture.onUpdate = () => {};
  assert.equal(retainRegenerableTexture(f.texture, f.recipe), false);
  const g = textureFixture(); assert.equal(retainRegenerableTexture(g.texture, () => []), true);
  g.texture.onUpdate(g.texture);
  await Promise.resolve();
  assert.throws(() => g.texture.image.data, /procedural texture source changed/);
});

test('an escaped shared Source does not retain its original Texture through getter closures', () => {
  const helper = new URL('../js/source-residency.js', import.meta.url).href;
  const three = new URL('../vendor/three/build/three.webgpu.js', import.meta.url).href;
  const script = `import {retainRegenerableTexture} from ${JSON.stringify(helper)};
    import {DataTexture} from ${JSON.stringify(three)};
    let texture=new DataTexture(new Uint8Array(16),2,2);
    retainRegenerableTexture(texture,()=>[new Uint8Array(16)]);
    const source=texture.source,weak=new WeakRef(texture);texture.onUpdate(texture);
    texture=null;await Promise.resolve();
    for(let i=0;i<6;i++){await new Promise(r=>setTimeout(r,0));global.gc();}
    if(weak.deref())throw Error('Source retains original Texture');
    if(source.data.data.length!==16)throw Error('Escaped Source stopped regenerating');`;
  execFileSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], { timeout: 10000, stdio: 'pipe' });
});
