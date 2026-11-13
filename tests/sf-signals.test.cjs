// CPU-only shared signal contract: actual graph/consumers and pinned Three shader-source builders.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
const numericTSL = require('./helpers/rendering-tsl.cjs');
const root = join(__dirname, '..');
const read = name => readFileSync(join(root, name), 'utf8');
const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
context.window = { NYC: { DEBUG_ROADS: false } };
for (const name of ['sf-geodata', 'sf-places', 'city-config']) vm.runInContext(read('js/' + name + '.js'), context);
const N = context.window.NYC;
const source = read('js/traffic.js');
const lensSource = read('js/street-details.js').match(/function createTrafficSignalLensMaterial\([\s\S]*?\n\}/)[0];
const oldLensSource = read('tests/fixtures/signal-lens-2a4cf85.txt');
const encodeSource = read('js/sf-street-details.js').match(/      mats\.lensBase\.push\(base,[\s\S]*?\);/)[0];
// Exercise the ACTUAL production encoding, without constructing furniture or allocating runtime hooks.
const encode = vm.runInNewContext(`(n,e,base=0)=>{const mats={lensBase:[]};${encodeSource}return mats.lensBase;}`,
  { SIGNAL_TIMING: N.SIGNAL_TIMING });
const phaseCode = source.match(/  const phaseOf = \(e\) => [^;]+;/)[0];
const walkCode = source.match(/  const walkOn = \(n, side\) => \{[\s\S]*?\n  \};/)[0];
const busyCode = source.match(/  const boxBusy = \(n, g\) => \{[\s\S]*?\n  \};/)[0];
const crossCode = source.match(/  function mayCross\(p\) \{[\s\S]*?\n  \}/)[0];
const consumers = vm.runInNewContext(`let clock=0;${phaseCode}\n${walkCode}\n${busyCode}\n${crossCode}
  ({phaseOf,walkOn,boxBusy,mayCross,setTime:t=>clock=t})`, { signalGroupPhase: N.signalGroupPhase,
  signalGroupWalk: N.signalGroupWalk, leadOf: list => list[0], canStop: lead => lead.stoppable });
const oldPhase = (time, avenue) => {
  const t = ((time % 60) + 60) % 60;
  return avenue ? t < 26 ? 'green' : t < 30 ? 'amber' : 'red' : t < 30 ? 'red' : t < 56 ? 'green' : 'amber';
};
const oldWalk = (time, avenue) => (((time - (avenue ? 0 : 30)) % 60) + 60) % 60 < 7;

test('legacy boolean APIs and ordinary two-group consumers are exact over negative cycles and boundaries', () => {
  for (let cycle = -4; cycle <= 4; cycle++) for (const boundary of [0, 7, 26, 30, 37, 56, 60])
    for (const epsilon of [-1e-7, 0, 1e-7]) for (const group of [0, 1]) {
      const time = cycle * 60 + boundary + epsilon;
      assert.equal(N.signalPhase(time, group === 0), oldPhase(time, group === 0));
      assert.equal(N.walkSignal(time, group === 0), oldWalk(time, group === 0));
      assert.equal(N.signalGroupPhase(time, group, 2), oldPhase(time, group === 0));
      assert.equal(N.signalGroupWalk(time, group, 2), oldWalk(time, group !== 0));
      const node = { signal: true, signalOffset: 13.25, groupCount: 2, sideArms: [{group}] };
      consumers.setTime(time - node.signalOffset);
      // Use the actual sum, including its original double-precision rounding.
      const sum = time - node.signalOffset + node.signalOffset;
      assert.equal(consumers.phaseOf({to:node,axisIndex:group}), oldPhase(sum, group === 0));
      assert.equal(consumers.walkOn(node, 0), oldWalk(sum, group !== 0));
    }
});

test('3–8 groups: exclusive full slots, bounded green waits and seven-second safe WALK windows', () => {
  for (let count = 3; count <= 8; count++) {
    const cycle = 30 * count;
    const green = new Array(count).fill(0), amber = new Array(count).fill(0), walk = new Array(count).fill(0);
    for (let time = 0; time < cycle; time += .25) {
      let active = 0;
      for (let group = 0; group < count; group++) {
        const phase = N.signalGroupPhase(time, group, count);
        if (phase !== 'red') active++;
        if (phase === 'green') green[group] += .25;
        if (phase === 'amber') amber[group] += .25;
        if (N.signalGroupWalk(time, group, count)) {
          walk[group] += .25;
          assert.equal(phase, 'red', 'never launch pedestrians into own green/amber');
          // At least the old 23-second clearance remains even at the END of WALK.
          const untilOwnGreen = (group * 30 - time + cycle) % cycle;
          assert.ok(untilOwnGreen >= 23);
        }
      }
      assert.equal(active, 1, `count=${count},time=${time}`);
    }
    for (let group = 0; group < count; group++) {
      assert.equal(green[group], 26); assert.equal(amber[group], 4); assert.equal(walk[group], 7);
      for (const delta of [-1e-7, 0, 1e-7, 6.999, 7, 25.999, 26, 29.999, 30]) {
        const time = group * 30 + delta;
        const expected = ((delta % cycle) + cycle) % cycle;
        for (const repeat of [-3, -1, 0, 2]) {
          assert.equal(N.signalGroupPhase(time + repeat * cycle, group, count),
            expected < 26 ? 'green' : expected < 30 ? 'amber' : 'red');
          const start = ((group + 1) % count) * 30 + repeat * cycle;
          assert.equal(N.signalGroupWalk(start, group, count), true);
          assert.equal(N.signalGroupWalk(start + 7, group, count), false);
        }
      }
      // Last green ends at slot+26; next green arrives after cycle-26 seconds.
      assert.equal(N.signalGroupPhase(group * 30 + cycle, group, count), 'green');
      assert.equal(N.signalGroupPhase(group * 30 + cycle - 1e-7, group, count), 'red');
    }
  }
});

let graph;
function actualGraph() {
  if (graph) return graph;
  for (const name of ['terrain', 'road-network']) vm.runInContext(read('js/' + name + '.js'), context);
  const { BOX } = require('./helpers/geo-box.cjs');
  const buf = readFileSync(join(root, `data/terrain-${BOX}.bin`)), bytes = buf.readUInt32LE(4);
  const header = JSON.parse(buf.subarray(8, 8 + bytes));
  N.Terrain.load(header, new Uint16Array(buf.buffer.slice(buf.byteOffset + 8 + bytes, buf.byteOffset + buf.length), 0, header.w * header.h));
  graph = N.buildRoadNetwork(N.BLOCKS.map(block => ({ minX:block.minX,maxX:block.maxX,minZ:block.minZ,maxZ:block.maxZ,block })), []);
  return graph;
}
test('actual SF graph: all signal groups are separated, including former conflicts at node74/15', t => {
  const { nodes, edges } = actualGraph();
  const signals = nodes.filter(n => n.signal), multi = signals.filter(n => n.groupCount > 2);
  const collapsed = multi.filter(n => new Set(n.in.filter(e => e.axisIndex > 0).map(e => e.axisIndex)).size > 1);
  assert.equal(signals.length, 572); assert.equal(multi.length, 60); assert.equal(collapsed.length, 32);
  for (const n of signals) for (let slot = 0; slot < n.groupCount; slot++) {
    consumers.setTime(slot * 30 + 2 - n.signalOffset);
    const greenGroups = new Set(n.in.filter(e => consumers.phaseOf(e) === 'green').map(e => e.axisIndex));
    assert.ok(greenGroups.size <= 1, `junction ${n.id}, slot ${slot}`);
    for (const a of n.sideArms) if (consumers.walkOn(n, a.side))
      assert.equal(N.signalGroupPhase(slot * 30 + 2, a.group, n.groupCount), 'red');
  }
  for (const [id, first, second] of [[74,2563,2562],[15,2547,2554]]) {
    const n = nodes.find(n => n.id === id), a = edges.find(e => e.id === first), b = edges.find(e => e.id === second);
    assert.equal(a.to, n); assert.equal(b.to, n);
    consumers.setTime(35 - n.signalOffset);
    assert.equal(consumers.phaseOf(a), 'green'); assert.equal(consumers.phaseOf(b), 'red');
    consumers.setTime(b.axisIndex * 30 + 5 - n.signalOffset);
    assert.equal(consumers.phaseOf(a), 'red'); assert.equal(consumers.phaseOf(b), 'green');
  }
  t.diagnostic(`${nodes.length} nodes/${edges.length} edges; ${signals.length} signals/${multi.length} multigroup; all ${collapsed.length} former co-green junctions separated`);
});

test('existing intersection occupancy and pedestrian committed-vehicle checks still veto admission', () => {
  const n = { signal:true,groupCount:4,signalOffset:0,sideArms:[{group:2}],box:[0,1,0,0],crossing:[0],approach:[{occ:[[]]}] };
  assert.equal(consumers.boxBusy(n, 2), true); assert.equal(consumers.boxBusy(n, 1), false);
  consumers.setTime(95); // next group 3: group 2 can WALK.
  const ped = {node:n,side:0};
  assert.equal(consumers.mayCross(ped), true);
  n.crossing[0] = 1; assert.equal(consumers.mayCross(ped), false);
  n.crossing[0] = 0; n.approach[0].occ[0].push({stoppable:false});
  assert.equal(consumers.mayCross(ped), false);
  n.approach[0].occ[0][0].stoppable = true; assert.equal(consumers.mayCross(ped), true);
  consumers.setTime(65); assert.equal(consumers.mayCross(ped), false, 'own group green');
  n.signal = false; assert.equal(consumers.walkOn(n,0), true, 'stop-sign policy unchanged');
  assert.match(source, /if \(boxBusy\(n, e\.axisIndex\)\) return false;/);
});

function numericMaterial(code) {
  const { tsl, state } = numericTSL();
  const Node = tsl.float(0).constructor;
  Node.prototype.max = function(b) { return tsl.max(this,b); };
  Node.prototype.min = function(b) { return tsl.min(this,b); };
  tsl.mod = (a,b) => new Node(() => {
    const x = typeof a === 'number' ? a : a.eval()[0], y = typeof b === 'number' ? b : b.eval()[0];
    return [x - y * Math.floor(x / y)];
  });
  tsl.positionWorld = tsl.attribute('world');
  const factory = vm.runInNewContext(code + '\ncreateTrafficSignalLensMaterial;', {
    THREE:{MeshBasicNodeMaterial:class{}}, ...tsl, SIGNAL_TIMING:N.SIGNAL_TIMING });
  const clock = tsl.attribute('clock');
  return {state, factory, clock};
}
function sampleNumeric(m, material, time, base, height) {
  m.state.epoch++;
  m.state.snapshots = new Map();
  m.state.attrs = {signalBase:base,clock:[time],world:[0,height,0]};
  return material.colorNode.eval();
}

test('actual lens encoding/evaluation matches CPU phases; legacy colors stay bit-exact', t => {
  const current = numericMaterial(lensSource), old = numericMaterial(oldLensSource);
  const lens = current.factory(true,current.clock,true);
  const legacy = old.factory(true,old.clock,true);
  let samples = 0;
  for (const count of [2,3,4,5,8]) for (let group = 0; group < count; group++) {
    const packed = new Float32Array(encode({groupCount:count,signalOffset:13.25},{axisIndex:group},100));
    assert.equal(packed.byteLength,12); assert.equal(packed.length,3);
    assert.equal(packed[2],count > 2 ? count : group === 0 ? 1 : 0);
    const period = count * 30;
    for (let slot = -count; slot <= count; slot++) for (const inside of [0,7,25.99,26,29.99,30]) {
      const time = slot * 30 + inside - 13.25;
      const cpu = N.signalGroupPhase(Math.fround(time) + 13.25,group,count);
      for (const [phase,height] of [['green',105.06],['amber',105.42],['red',105.78]]) {
        const rgb = sampleNumeric(current,lens,time,packed,height);
        // The independent legacy material supplies exactly the lit/dark color for each lens.
        const referenceTime = cpu === 'green' ? 0 : cpu === 'amber' ? 26 : 30;
        const expected = sampleNumeric(old,legacy,referenceTime,[100,0,1],height);
        assert.deepEqual(rgb,expected,`count=${count},group=${group},time=${time},lens=${phase}`);
        if (count === 2) assert.deepEqual(rgb,sampleNumeric(old,legacy,time,packed,height));
        samples++;
      }
    }
  }
  // Legacy non-instanced material still uses its boolean argument and zero ground base.
  for (const avenue of [true,false]) {
    const a = current.factory(avenue,current.clock), b = old.factory(avenue,old.clock);
    for (const time of [-120,-60,-30,-4,-.01,0,26,30,56,60,120]) for (const h of [5.06,5.42,5.78])
      assert.deepEqual(sampleNumeric(current,a,time,null,h),sampleNumeric(old,b,time,null,h));
  }
  assert.equal(samples,4644);
  t.diagnostic(`${samples} Float32 lens evaluations plus 66 non-instanced legacy samples`);
});

let THREE, TSL;
test.before(async () => {
  THREE = await import(pathToFileURL(join(root,'vendor/three/build/three.webgpu.js')).href);
  TSL = await import(pathToFileURL(join(root,'vendor/three/build/three.tsl.js')).href);
});
function buildShader(code,backend,perInstance=true,avenue=true) {
  const factory = vm.runInNewContext(code + '\ncreateTrafficSignalLensMaterial;', {THREE,...TSL,SIGNAL_TIMING:N.SIGNAL_TIMING});
  const material = factory(avenue,TSL.uniform(0),perInstance);
  const geometry = new THREE.BoxGeometry();
  if (perInstance) geometry.setAttribute('signalBase',new THREE.InstancedBufferAttribute(new Float32Array([100,-46.75,4,100,13.25,0]),3));
  const mesh = perInstance ? new THREE.InstancedMesh(geometry,material,2) : new THREE.Mesh(geometry,material);
  const renderer = {
    contextNode:TSL.context({}),library:new THREE.StandardNodeLibrary(),
    coordinateSystem:backend==='wgsl'?THREE.WebGPUCoordinateSystem:THREE.WebGLCoordinateSystem,
    backend:{isWebGPUBackend:backend==='wgsl',isWebGLBackend:backend==='glsl',has:()=>false,
      capabilities:{getUniformBufferLimit:()=>65536},utils:{getTextureSampleData:()=>({primarySamples:1})}},
    debug:{diagnostics:{}},lighting:{enabled:false},shadowMap:{enabled:false},
    getRenderTarget:()=>null,getMRT:()=>null,getOutputRenderTarget:()=>null,
    getColorBufferType:()=>THREE.UnsignedByteType,hasFeature:()=>false,hasCompatibility:()=>false,
    outputColorSpace:THREE.LinearSRGBColorSpace,toneMapping:THREE.NoToneMapping,
    getDrawingBufferSize:v=>v.set(1280,720),getPixelRatio:()=>1,
    getCanvasTarget:()=>({textures:[{format:THREE.RGBAFormat,type:THREE.UnsignedByteType}]})
  };
  try {
    const builder = new (backend==='wgsl'?THREE.WGSLNodeBuilder:THREE.GLSLNodeBuilder)(mesh,renderer);
    builder.scene=new THREE.Scene();builder.camera=new THREE.PerspectiveCamera();builder.build();
    assert.doesNotMatch(builder.vertexShader+builder.fragmentShader,/NaN|undefined/);
    return builder;
  } finally {geometry.dispose();material.dispose();mesh.dispose?.();}
}
for (const backend of ['wgsl','glsl']) test(`${backend}: real TSL builder emits flat signal metadata with unchanged resource layout`, t => {
  const current=buildShader(lensSource,backend), old=buildShader(oldLensSource,backend);
  assert.equal(current.varyings.find(v=>v.name==='vSignalBase')?.interpolationType,'flat');
  assert.match(current.vertexShader, /signalBase/);
  assert.match(current.fragmentShader, /max\( vSignalBase\.z, 2\.0 \)/);
  assert.match(current.fragmentShader, /min\( vSignalBase\.z, 1\.0 \)/);
  assert.ok((backend==='wgsl'?/@interpolate\( flat \) vSignalBase\s*:\s*vec3<f32>/ : /flat\s+in vec3 vSignalBase;/)
    .test(current.fragmentShader),'flat vec3 declaration in generated fragment shader');
  const attributes=b=>b.attributes.map(a=>[a.name,a.type]);
  assert.deepEqual(attributes(current),attributes(old),'same vertex/instance attributes');
  for(const stage of ['vertex','fragment']) {
    assert.equal(current.uniforms[stage].length,old.uniforms[stage].length,stage+' uniform count');
  }
  const interpolated=b=>b.varyings.filter(v=>v.needsInterpolation).map(v=>v.type).sort();
  assert.deepEqual(interpolated(current),interpolated(old),'same varying component widths');
  const bindings = b => b.getBindings().map(g => ({name:g.name,bindings:g.bindings.map(v =>
    ({type:v.constructor.name,bytes:v.byteLength}))}));
  assert.ok(current.getBindings().length > 0,'inspect real generated bindings');
  assert.deepEqual(bindings(current),bindings(old),'same binding groups/types/byte lengths');
  t.diagnostic(JSON.stringify({backend,attributes:attributes(current),varyings:interpolated(current),bindings:bindings(current)}));
  // The legacy path emits byte-identical shader code, including its boolean branch.
  for(const avenue of [true,false]) {
    const a=buildShader(lensSource,backend,false,avenue),b=buildShader(oldLensSource,backend,false,avenue);
    assert.equal(a.vertexShader,b.vertexShader);assert.equal(a.fragmentShader,b.fragmentShader);
  }
});
