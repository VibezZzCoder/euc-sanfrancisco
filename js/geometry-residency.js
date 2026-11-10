// SF Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// Phone memory: release the CPU copy of construction-static geometry once its GPU buffer exists.
//
// Three keeps every BufferAttribute's typed array after upload. For meshes whose vertices never change after the
// city is built, that copy (~290 MB in SF) is dead weight, and iOS counts it toward the tab's memory limit together
// with the GPU copy. This uploads each eligible attribute through the renderer's own attribute owner (the same call a
// first render makes), then swaps its array for an empty array of the same type. Count, item size, usage, version
// and precomputed bounds are kept, so draw ranges, vertex formats and culling are unchanged, and a static attribute
// is never uploaded again (three re-uploads only on a version bump or dynamic usage).
//
// Legacy eager helper below. The upload-aware owner also admits immutable regional LODs, but NEVER core TerrainTile.
// Only explicitly named static roots qualify. Never pass core terrain tiles, actors, the rider,
// instanced or interleaved data, storage buffers, or any attribute that runtime code edits (e.g. the road-marking
// index, rewritten by ordered paint culling). Physics never reads drawn geometry.

const STATIC_DRAW = 35044; // THREE.StaticDrawUsage
const VERTEX = 1, INDEX = 2; // three AttributeType (vendored e27dfa9)
const OWNERS = new WeakMap();

function releasable(attribute) {
  return attribute?.isBufferAttribute === true && attribute.isInterleavedBufferAttribute !== true
    && attribute.isInstancedBufferAttribute !== true && attribute.isStorageBufferAttribute !== true
    && attribute.usage === STATIC_DRAW && ArrayBuffer.isView(attribute.array) && attribute.array.length > 0;
}

/**
 * @param renderer initialized WebGPURenderer (either backend)
 * @param meshes iterable of { mesh, keepIndex } for construction-static meshes
 * @returns {{ attributes: number, bytes: number }}
 */
export function releaseStaticGeometryCopies(renderer, meshes) {
  const owner = renderer._attributes;
  const stats = { attributes: 0, bytes: 0 };
  if (!owner || typeof owner.update !== 'function') return stats;
  const done = new Set();
  const release = (attribute, type) => {
    if (done.has(attribute) || !releasable(attribute)) return;
    done.add(attribute);
    owner.update(attribute, type); // creates the GPU buffer now (no-op if already uploaded at this version)
    stats.attributes++; stats.bytes += attribute.array.byteLength;
    attribute.array = new attribute.array.constructor(0);
  };
  for (const { mesh, keepIndex = false } of meshes) {
    const geometry = mesh.geometry;
    if (!geometry?.isBufferGeometry || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.isBatchedMesh) continue;
    // Bounds are computed from the CPU copy; frustum culling must never need to recompute them.
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    for (const attribute of Object.values(geometry.attributes)) release(attribute, VERTEX);
    if (geometry.index && !keepIndex) release(geometry.index, INDEX);
  }
  return stats;
}

/** Construction-static meshes of the SF scene, by explicit root/name. */
export function staticSfMeshes(scene) {
  const out = [];
  const add = (root, filter = () => true, keepIndex = false) => {
    root?.traverse(object => { if (object.isMesh && filter(object)) out.push({ mesh: object, keepIndex }); });
  };
  for (const name of ['SFGround', 'SFLandmarks', 'SFBridges', 'ManhattanCityBlocks', 'SFStreetDetails', 'SFGradeSeparation']) {
    add(scene.getObjectByName(name));
  }
  for (const child of scene.children) if (child.name.startsWith('SFSkatepark:')) add(child);
  add(scene.getObjectByName('SFRegion'), object => object.name === 'SFHorizonTerrain'); // far tiles never change LOD
  // Ordered paint culling rewrites the index every few frames; its vertex attributes are static.
  for (const child of scene.children) if (child.name === 'RoadMarkings') out.push({ mesh: child, keepIndex: true });
  return out;
}

// Geometry-level opt-in, not flags on potentially shared attributes. region.js sets this on every newly built
// immutable tile (including deferred variants), with an exact CPU rebuild recipe that owns no output arrays.
const REGION_REBUILD = 'sfTerrainCpuRebuild';
const STATIC_GEOMETRY = 'sfStaticGeometry';

function ordinary(mesh) {
  const g = mesh?.geometry;
  return mesh?.isMesh === true && g?.isBufferGeometry === true && !mesh.isInstancedMesh && !mesh.isSkinnedMesh
    && !mesh.isBatchedMesh && !g.isInstancedBufferGeometry && !mesh.userData?.dynamicInstances
    && !mesh.morphTargetInfluences && mesh.name !== 'TerrainTile'
    && !Object.values(g.attributes).some(a => a.isInstancedBufferAttribute || a.isInterleavedBufferAttribute
      || a.isStorageBufferAttribute || a.isStorageInstancedBufferAttribute)
    && !(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(m => m?.wireframe);
}

/** Extra construction-static ordinary meshes. Core terrain tiles and all instance/storage data stay CPU-owned. */
function additionalSfMeshes(scene) {
  const out = [];
  scene.traverse(mesh => {
    if (!ordinary(mesh)) return;
    const g = mesh.geometry, name = mesh.name;
    if (typeof g.userData?.[REGION_REBUILD] === 'function' || g.userData?.[STATIC_GEOMETRY] === true
      || name === 'SFRegionGroundChunk' || (name === 'ShadowProxy' && mesh.userData?.shadowProxy === true)) out.push({ mesh });
  });
  return out;
}

/**
 * Install after scene construction/culling (and the existing static bulk release, if used). No GPU work here;
 * already emptied attributes are ineligible. Additional/regional candidates wait for their native consumption.
 * Pinned e27dfa9: Geometries.updateForRender uploads attributes before layouts/bindings/draw; Attributes.update
 * returns only after backend creation AND Info accounting. We empty only successfully uploaded ordinary attributes
 * after the outer geometry update returns. Array type/BYTES_PER_ELEMENT, attribute count and native buffer size stay
 * intact. Storage bindings read CPU byteLength, so storage/instance/interleaved attributes are never admitted.
 *
 * Discovery is construction-only. Later regional geometries self-identify at their first native submission.
 * Weak ownership only: no Set of historical geometries/arrays, per-frame scene walk, polling, or eager upload.
 * dispose() is TERMINAL, after render/compile readers drain; it restores only methods still owned by this instance.
 * Cached regional buffers can be regenerated after native deletion. Other immutable buffers reject unexpected
 * deletion/mutation before a zero upload; their owner must rebuild the world (the host treats device loss as terminal).
 */
export function installSfGeometryResidency(renderer, scene, { search = globalThis.location?.search || '' } = {}) {
  const stats = { attributes: 0, bytes: 0, rebuilds: 0, restoredBytes: 0 };
  const noop = { stats, dispose() {} };
  if (new URLSearchParams(search).get('geocopies') === 'keep') return noop;
  if (OWNERS.has(renderer)) throw new Error('SF geometry residency is already installed');
  const owner = renderer._attributes, geometries = renderer._geometries, backend = renderer.backend;
  if (!owner?.update || !owner.get || !owner.has || !geometries?.updateForRender || !backend?.get || !backend.has
    || (!backend.isWebGPUBackend && !backend.isWebGLBackend)) return noop;
  const originalUpdate = owner.update, originalGeometryUpdate = geometries.updateForRender;
  const originalUpdateDescriptor = Object.getOwnPropertyDescriptor(owner, 'update');
  const originalGeometryDescriptor = Object.getOwnPropertyDescriptor(geometries, 'updateForRender');
  const allowed = new WeakMap(), registered = new WeakMap(), released = new WeakMap(), blocked = new WeakSet();
  let stopped = false;
  const error = message => new Error(`SF immutable geometry CPU copy: ${message}; rebuild/reload required`);
  const nativeBuffer = a => {
    if (!backend.has(a)) return null; // get() creates ownership; never invent a native record for an unuploaded array
    const data = backend.get(a);
    return backend.isWebGPUBackend ? data.buffer : data.bufferGPU;
  };
  const supported = (a, type) => releasable(a) && !a.isStorageInstancedBufferAttribute
    && (type === INDEX ? a.array instanceof Uint16Array || a.array instanceof Uint32Array : a.array instanceof Float32Array);
  // An ordinary proxy can share attributes with an excluded instanced source. Never release through that alias.
  scene.traverse(mesh => {
    if (!mesh.geometry || ordinary(mesh)) return;
    for (const a of [...Object.values(mesh.geometry.attributes || {}), mesh.geometry.index]) if (a) blocked.add(a);
  });
  function register(mesh, keepIndex = false) {
    if (!ordinary(mesh)) return null;
    const g = mesh.geometry;
    if (registered.has(g)) return registered.get(g);
    // Bounds must be final before the first array disappears. Compute neither from an already released alias.
    if ((!g.boundingSphere || !g.boundingBox) && g.attributes.position?.array.length === 0) return null;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingBox) g.computeBoundingBox();
    const record = { geometry: g, entries: [], rebuild: g.userData?.[REGION_REBUILD], rebuilding: false };
    for (const [name, a] of [...Object.entries(g.attributes), ...(!keepIndex && g.index ? [['index', g.index]] : [])]) {
      const type = name === 'index' ? INDEX : VERTEX;
      if (blocked.has(a) || !supported(a, type)) continue;
      // Geometry owners may share immutable ordinary attributes. The first owner controls their one native buffer.
      if (!allowed.has(a)) allowed.set(a, { record, name, type });
      record.entries.push(a);
    }
    registered.set(g, record);
    return record;
  }
  for (const { mesh, keepIndex } of [...staticSfMeshes(scene), ...additionalSfMeshes(scene)]) register(mesh, keepIndex);

  function restore(record) {
    if (typeof record.rebuild !== 'function' || record.rebuilding) throw error('buffer was deleted after CPU release');
    record.rebuilding = true;
    let replacement;
    try {
      replacement = record.rebuild();
      const restore = [];
      for (const a of record.entries) {
        const saved = released.get(a);
        if (!saved) continue;
        const { name } = allowed.get(a), fresh = name === 'index' ? replacement.index : replacement.attributes[name];
        if (!fresh || fresh.array.constructor !== saved.Type || fresh.array.byteLength !== saved.bytes
          || fresh.count !== a.count || fresh.itemSize !== a.itemSize || fresh.normalized !== a.normalized)
          throw error('regional rebuild changed attribute layout');
        restore.push([a, fresh.array, saved.bytes]);
      }
      // Validate the whole restoration before changing any live attribute. The replacement is never uploaded.
      for (const [a, array, bytes] of restore) { a.array = array; released.delete(a); stats.restoredBytes += bytes; }
      stats.rebuilds++;
    } finally { replacement?.dispose(); record.rebuilding = false; }
  }
  function update(attribute, type) {
    if (this !== owner) return originalUpdate.apply(this, arguments);
    const saved = released.get(attribute);
    if (saved) {
      // Never send empty data on a changed version/usage/type, or a missing/recreated native buffer.
      if (stopped || attribute.array !== saved.empty || attribute.version !== saved.version
        || attribute.usage !== STATIC_DRAW || type !== saved.type) throw error('released attribute was mutated');
      if (!owner.has(attribute) || owner.get(attribute).version === undefined) restore(allowed.get(attribute).record);
      else if (!nativeBuffer(attribute)) throw error('native buffer disappeared without owner disposal');
    }
    return originalUpdate.apply(this, arguments);
  }
  function release(record) {
    for (const a of record.entries) {
      const entry = allowed.get(a);
      if (!entry || blocked.has(a) || !supported(a, entry.type)) continue;
      if (!owner.has(a)) continue; // Attributes.delete assumes an existing record owns a dispose listener/WeakRef
      const data = owner.get(a);
      // Some attributes (e.g. unused UVs) have not been submitted at all. Keep them; never create a GPU buffer here.
      if (data.version !== a.version || !nativeBuffer(a)) continue;
      const Type = a.array.constructor, bytes = a.array.byteLength, empty = new Type(0);
      released.set(a, { Type, bytes, empty, version: a.version, type: entry.type });
      a.array = empty; stats.attributes++; stats.bytes += bytes;
    }
  }
  function updateGeometry(renderObject) {
    if (this !== geometries || stopped) return originalGeometryUpdate.apply(this, arguments);
    const mesh = renderObject.object, g = renderObject.geometry;
    let record = registered.get(g);
    if (!record && mesh?.geometry === g && typeof g?.userData?.[REGION_REBUILD] === 'function') record = register(mesh);
    if (record && renderObject.material?.wireframe && record.entries.some(a => released.has(a)))
      throw error('wireframe requested after CPU release');
    const result = originalGeometryUpdate.apply(this, arguments);
    if (record) {
      // TSL can bind an otherwise ordinary attribute as storage without changing its class. Binding creation runs
      // AFTER geometry upload; its CPU byteLength must remain valid. Inspect this object's already-built bindings.
      for (const group of renderObject.getBindings?.() || []) for (const binding of group.bindings || []) {
        if (binding.isStorageBuffer && binding.attribute) blocked.add(binding.attribute);
      }
      release(record);
    }
    return result;
  }
  owner.update = update;
  geometries.updateForRender = updateGeometry;
  const api = { stats, dispose() {
    if (stopped) return;
    stopped = true;
    const restoreMethod = (object, key, wrapper, descriptor) => {
      if (object[key] !== wrapper) return; // never overwrite a later owner's wrapper
      if (descriptor) Object.defineProperty(object, key, descriptor); else delete object[key];
    };
    restoreMethod(owner, 'update', update, originalUpdateDescriptor);
    restoreMethod(geometries, 'updateForRender', updateGeometry, originalGeometryDescriptor);
    OWNERS.delete(renderer);
  } };
  OWNERS.set(renderer, api);
  return api;
}
