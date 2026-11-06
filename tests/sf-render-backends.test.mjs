// Targeted e27dfa9 compatibility checks: real TSL builders/buffers/textures, no browser or GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const postSource = read('../js/post-processing.js');
// Resolve this addon's single browser import against the same local runtime; no vendored edits.
const utilsSource = read('../vendor/three/examples/jsm/utils/BufferGeometryUtils.js')
  .replace(/import \{([^]*?)\} from 'three';/, 'const {$1} = THREE;')
  .replace(/export \{([^]*?)\};/, 'return {$1};');
const utils = vm.runInNewContext(`(function(){${utilsSource}})()`, { THREE });
const city = { THREE, TSL, Addons: utils };
vm.runInNewContext(read('../js/pedestrians.js'), { window: { NYC: city }, console });
vm.runInNewContext(read('../js/tsl-materials.js'), { window: { NYC: city }, console });

function rendererStub(backend, reversedDepthBuffer = false) {
  return {
    contextNode: TSL.context({}), library: new THREE.StandardNodeLibrary(),
    coordinateSystem: backend === 'wgsl' ? THREE.WebGPUCoordinateSystem : THREE.WebGLCoordinateSystem,
    reversedDepthBuffer,
    backend: { isWebGPUBackend: backend === 'wgsl', isWebGLBackend: backend === 'glsl', has: () => false,
      capabilities: { getUniformBufferLimit: () => 65536 }, utils: { getTextureSampleData: () => ({ primarySamples: 1 }) } },
    debug: { diagnostics: {} }, lighting: { enabled: false }, shadowMap: { enabled: false },
    getRenderTarget: () => null, getMRT: () => null, getOutputRenderTarget: () => null,
    getColorBufferType: () => THREE.UnsignedByteType, hasFeature: () => false, hasCompatibility: () => false,
    outputColorSpace: THREE.LinearSRGBColorSpace, toneMapping: THREE.NoToneMapping,
    getDrawingBufferSize: v => v.set(1280, 720), getPixelRatio: () => 1,
    getCanvasTarget: () => ({ textures: [{ format: THREE.RGBAFormat, type: THREE.UnsignedByteType }] })
  };
}
function build(mesh, renderer, camera = new THREE.PerspectiveCamera()) {
  const builder = new (renderer.backend.isWebGPUBackend ? THREE.WGSLNodeBuilder : THREE.GLSLNodeBuilder)(mesh, renderer);
  builder.scene = new THREE.Scene(); builder.camera = camera;
  builder.build();
  assert.doesNotMatch(builder.vertexShader + builder.fragmentShader, /NaN|undefined/);
  return builder;
}

// Check the emitted interfaces as well as Three's graph metadata: these constants feed
// discontinuous fragment hashes, so nominally equal vertex values cannot be interpolated.
function assertFlat(builder, name, backend) {
  assert.equal(builder.varyings.find(v => v.name === name)?.interpolationType, 'flat', name);
  for (const shader of [builder.vertexShader, builder.fragmentShader]) {
    assert.match(shader, backend === 'wgsl'
      ? new RegExp(`@interpolate\\(\\s*flat[^)]*\\)\\s+${name}\\s*:`)
      : new RegExp(`flat\\s+(?:in|out)\\s+vec4\\s+${name}\\s*;`), name);
  }
}

for (const backend of ['wgsl', 'glsl']) {
  test(`${backend}: regional building metadata stays flat and procedural coordinates stay smooth`, () => {
    // Evaluate the real material and its helper graph without loading regional data/cache ownership.
    const source = read('../js/region.js');
    const end = source.indexOf('const BOX_GEO =');
    assert.ok(end > 0);
    const createMaterial = vm.runInNewContext(`${source.slice(0, end)}return createBoroughBuildingMaterial; })();`,
      { window: { NYC: city } });
    const material = createMaterial();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, .5, 0);
    // Different dimensions, fractional seeds, colours and styles share one instanced shader.
    geometry.setAttribute('bInfo', new THREE.InstancedBufferAttribute(new Float32Array([
      12, 24, 15, 29.37, 10, 20, 9, 433.83
    ]), 4));
    geometry.setAttribute('bTint', new THREE.InstancedBufferAttribute(new Float32Array([
      .45, .32, .21, 0, .17, .24, .29, 3
    ]), 4));
    const mesh = new THREE.InstancedMesh(geometry, material, 2);
    mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(12, 24, 15).setPosition(-4000, 230, 3880));
    mesh.setMatrixAt(1, new THREE.Matrix4().makeScale(10, 20, 9).setPosition(-4020, 240, 3900));
    try {
      const builder = build(mesh, rendererStub(backend));
      assertFlat(builder, 'vRegionInfo', backend);
      assertFlat(builder, 'vRegionTint', backend);
      for (const attribute of ['position', 'normal']) {
        const assignments = Array.from(builder.vertexShader.matchAll(
          new RegExp(`(?:varyings\\.)?(\\w+)\\s*=\\s*${attribute}\\s*;`, 'g')), match => match[1]);
        const spatial = builder.varyings.find(v => assignments.includes(v.name) && v.needsInterpolation);
        assert.ok(spatial?.needsInterpolation, `${attribute} is consumed by the fragment shader`);
        assert.notEqual(spatial.interpolationType, 'flat', `${attribute} must stay smooth`);
      }
      assert.match(builder.fragmentShader, /fwidth\(/, 'footprint-filtered window detail survives');
      assert.match(builder.fragmentShader, /sin\(/, 'regional procedural hashes remain active');
      assert.equal(material.fog, true);
    } finally { geometry.dispose(); material.dispose(); }
  });

  for (const kind of ['masonry', 'paint', 'glass']) {
    test(`${backend}: ${kind} facade identity stays flat while hill floors and spatial detail remain live`, () => {
      const material = kind === 'glass' ? city.createCurtainWallMaterial({ boxLocal: true })
        : city.createPreWarBuildingMaterial({ boxLocal: true, paint: kind === 'paint' });
      const mesh = city.createFacadeBoxes(material, [
        { x: 0, y: 101, z: 0, w: 12, h: 24, d: 15, base: 87, plinth: 2, storeyH: 3.9,
          tone: .37, faces: [0, 1, 2, 3], paint: [0xc4a998, 0xe9e2cf, 2, .4] },
        { x: 50, y: 210, z: -30, w: 10, h: 20, d: 9, base: 200, ry: .4,
          tone: .83, faces: [4, 2, 1, 0], paint: [0xa3c1b0, 0xf1e3dc, 1, .6] }
      ]);
      try {
        const builder = build(mesh, rendererStub(backend));
        assertFlat(builder, 'vFacadeBox', backend);
        assertFlat(builder, 'vFacadeFaces', backend);
        assert.ok(builder.attributes.some(a => a.name === 'boxBase'), 'SF base/plinth/storey data reaches the shader');
        const world = builder.varyings.find(v => v.name === 'v_positionWorld');
        assert.ok(world, 'window and wall coordinates still use world position');
        assert.notEqual(world.interpolationType, 'flat', 'do not flatten spatial detail');
        assert.equal(material.fog, true);
      } finally { mesh.geometry.dispose(); material.dispose(); }
    });
  }
}

for (const backend of ['wgsl', 'glsl']) for (const reversed of [false, true]) for (const glow of [true, false]) {
  test(`${backend}/${reversed ? 'reversed' : 'normal'}/glow=${glow}: SF post graph builds with native depth/background predicates`, () => {
    // Keep the real final SF graph. Bloom's offscreen passes are outside this targeted test;
    // substituting its output leaves the entire fog reconstruction, branch and grading intact.
    let blooms = 0;
    const bloom = () => {
      blooms++;
      return Object.assign(TSL.vec4(0), {
        strength: TSL.uniform(.24), threshold: TSL.uniform(1.2), smoothWidth: TSL.uniform(.3), setResolutionScale() {}
      });
    };
    const namespace = { THREE, TSL, PostFX: { bloom } };
    vm.runInNewContext(postSource, { window: { NYC: namespace } });
    const renderer = rendererStub(backend, reversed), camera = new THREE.PerspectiveCamera(56, 1280 / 720, .35, 60000);
    camera.coordinateSystem = renderer.coordinateSystem; camera._reversedDepth = reversed; camera.updateProjectionMatrix();
    const source = new THREE.DataTexture(new Float32Array([.5, .6, .7, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    const depth = new THREE.DepthTexture(1, 1);
    const lighting = { uNightFactor: TSL.uniform(0), uMarine: TSL.uniform(1),
      createAerialFogNode(world, eye) { return { color: world.sub(eye).abs().mul(.001), amount: TSL.uniform(.4) }; } };
    const graph = namespace.createPostProcessing(renderer, TSL.texture(source, TSL.screenUV), TSL.vec4(0),
      TSL.texture(depth, TSL.screenUV), camera, lighting, { glow });
    assert.equal(blooms, Number(glow), 'Low does not allocate an unused bloom graph');
    assert.equal(graph.bloomPass === null, !glow);
    assert.equal(graph.fogEnabled.value, 1, 'quality selection retains SF aerial fog');
    const material = new THREE.MeshBasicNodeMaterial(); material.fragmentNode = graph.outputNode;
    const geometry = new THREE.PlaneGeometry(2, 2);
    try {
      const builder = build(new THREE.Mesh(geometry, material), renderer, camera);
      const shader = builder.fragmentShader;
      assert.match(shader, reversed ? /<= 0\.0/ : />= 1\.0/, 'sky test follows the actual renderer depth mode');
      assert.match(shader, /mat4|mat4x4/, 'world reconstruction retains the camera matrices');
    } finally { source.dispose(); depth.dispose(); geometry.dispose(); material.dispose(); }
  });
}

for (const backend of ['wgsl', 'glsl']) {
  test(`${backend}: both actual SF crowd material LODs build with the selected storage path`, () => {
    const crowd = new city.PersonCrowd(3);
    try {
      for (const { mesh, pose } of crowd.lods) {
        assert.equal(pose.getPBO(), true); assert.equal(pose.access, 'readOnly');
        assert.equal(pose.value.pbo, undefined, 'flagging PBO allocates no texture');
        assert.equal(mesh.castShadow, true); assert.equal(mesh.receiveShadow, true);
        const builder = build(mesh, rendererStub(backend));
        assert.ok(builder.vertexShader.length > 1000);
        for (const name of ['vPersonPartA', 'vPersonPartB', 'vPersonPartC', 'vPersonSkin']) assertFlat(builder, name, backend);
        assert.doesNotMatch(builder.fragmentShader, /43758\.5453|12\.9898/, 'palette hashes must leave the fragment stage');
        assert.match(builder.vertexShader, /43758\.5453/, 'palette hashes still run per vertex');
        assert.equal(mesh.material.fog, true);
        assert.ok(builder.varyings.some(v => v.needsInterpolation && v.interpolationType !== 'flat'),
          'skinned positions, normals and clothing detail retain smooth interpolation');
        if (backend === 'glsl') {
          assert.equal(pose.value.pbo.isPBOTexture, true, 'indexed reads invoke the real GLSL PBO allocator');
          assert.match(builder.vertexShader, /texelFetch/);
        } else assert.equal(pose.value.pbo, undefined, 'WebGPU retains native storage without a texture');
      }
    } finally {
      for (const { mesh, pose } of crowd.lods) { mesh.geometry.dispose(); mesh.material.dispose(); pose.value.pbo?.dispose(); }
    }
  });
}

for (const fallback of [false, true]) {
  test(`${fallback ? 'WebGL2 PBO' : 'WebGPU storage'}: crowd CPU writes, warm-up zeroing, empty/revival and padded buffers remain coherent`, () => {
    const crowd = new city.PersonCrowd(3);
    const rig = new city.PersonRig({ seed: .7, female: true });
    rig.reset(12, -8, .4, () => 110);
    const floats = rig.pose.length;
    let registrations = 0;
    const allocator = { shaderStage: 'vertex', context: {}, getUniformFromNode(node, type) {
      assert.equal(node.isTextureNode, true); assert.equal(type, 'texture'); registrations++;
    } };
    const setup = pose => { if (fallback) THREE.GLSLNodeBuilder.prototype.setupPBO.call(allocator, pose); };
    const draw = people => { crowd.begin(); for (const [person, distance] of people) crowd.add(person, distance); crowd.end(); };
    // The first pose may arrive before GLSL setup replaces its array. The real allocator must retain it.
    draw([[rig, 0], [rig, 40]]);
    const resources = Array.from(crowd.lods, ({ pose }) => {
      const attr = pose.value, original = attr.array;
      setup(pose);
      if (fallback) {
        assert.notEqual(attr.array, original); assert.ok(attr.array.length > original.length, 'fixture exercises row padding');
        assert.deepEqual(bytes(attr.array.subarray(0, original.length)), bytes(original));
        assert.equal(attr.pbo.image.data, attr.array);
        assert.equal(attr.pbo.type, THREE.FloatType); assert.equal(attr.pbo.format, THREE.RGBAFormat);
      } else assert.equal(attr.pbo, undefined);
      return { pose, attr, array: attr.array, texture: attr.pbo };
    });
    function frame(people, expectedWrites) {
      const versions = resources.map(({ attr, texture }) => [attr.version, texture?.version, texture?.source.version]);
      draw(people);
      resources.forEach(({ pose, attr, array, texture }, i) => {
        setup(pose);
        assert.equal(pose.value, attr); assert.equal(attr.array, array); assert.equal(attr.pbo, texture);
        assert.equal(attr.version, versions[i][0] + expectedWrites[i]);
        if (texture) {
          assert.equal(texture.image.data, array);
          assert.equal(texture.version, versions[i][1] + expectedWrites[i], 'CPU changes signal a texture upload');
          assert.equal(texture.source.version, versions[i][2] + expectedWrites[i]);
        }
        if (expectedWrites[i]) assert.deepEqual(Array.from(attr.updateRanges, ({ start, count }) => ({ start, count })),
          [{ start: 0, count: Math.max(1, crowd.lods[i].count) * floats }]);
      });
      assert.equal(registrations, fallback ? 2 : 0, 'one lazy texture per LOD, no per-frame allocation');
    }
    try {
      frame([], [1, 1]); // second warm-up: clear an earlier nonzero pose in BOTH representations
      for (const { array } of resources) assert.ok(array.subarray(0, floats).every(v => v === 0));
      for (let i = 0; i < 4; i++) frame([], [0, 0]);
      for (const mesh of crowd.meshes) { assert.equal(mesh.visible, false); assert.equal(mesh.count, 0); }
      for (let i = 0; i < 8; i++) {
        rig.reset(41 + i, 22, -.4, () => 110 + i);
        const lod = i % 2;
        frame([[rig, lod ? 40 : 0]], lod ? [0, 1] : [1, 0]);
        assert.deepEqual(bytes(resources[lod].array.subarray(0, floats)), bytes(rig.pose), 'pose bytes reach the current backing array');
        assert.equal(crowd.meshes[lod].visible, true); assert.equal(crowd.meshes[1 - lod].visible, false);
      }
      frame([[rig, 0], [rig, 0], [rig, 40]], [1, 1]);
      assert.deepEqual(bytes(resources[0].array.subarray(floats, 2 * floats)), bytes(rig.pose));
      frame([[rig, 0], [rig, 0], [rig, 0], [rig, 0]], [1, 0]);
      assert.equal(crowd.meshes[0].count, 3, 'capacity admission stays bounded');
    } finally {
      for (const { mesh, pose } of crowd.lods) { mesh.geometry.dispose(); mesh.material.dispose(); pose.value.pbo?.dispose(); }
    }
  });
}

test('ordered bootstrap loads destination and dynamic-body registries before their consumers', () => {
  const source = read('../js/sf-bootstrap.js');
  const scripts = vm.runInNewContext(source.match(/Object\.freeze\(\[[^]*?\]\)/)[0], { Object });
  assert.equal(scripts[scripts.indexOf('city-config') + 1], 'sf-destinations');
  assert.equal(scripts[scripts.indexOf('traffic') - 1], 'sf-dynamic-bodies');
  assert.ok(scripts.indexOf('sf-dynamic-bodies') < scripts.indexOf('sf-transit'));
  assert.equal(new Set(scripts).size, scripts.length);
});
