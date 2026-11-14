// SF Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// Release only explicitly owned, reconstructible CPU sources. No native texture deletion.

const descriptor = (object, key) => object && Object.getOwnPropertyDescriptor(object, key);
const value = (object, key) => descriptor(object, key)?.value;
const dataProperty = (object, key, item) => Object.defineProperty(object, key,
  { value: item, writable: true, configurable: true, enumerable: true });

/** Native DATA handoff only, after construction. Core decoded heights are immutable thereafter.
 * Keep DATA.terrain.q's ordinary Uint16Array read/write API through a one-time exact reconstruction.
 * Unknown/ambiguous encodings retain their original source. No terrain or support values are changed.
 */
export function releaseSfTerrainSource(data, terrain) {
  const record = value(data, 'terrain'), header = value(record, 'header'), d = descriptor(record, 'q');
  const q = d?.value, heights = value(terrain, 'heights');
  const w = value(header, 'w'), h = value(header, 'h'), minH = value(header, 'minH'), scale = value(header, 'scale');
  const n = w * h;
  if (!d?.configurable || !d.writable || !d.enumerable || !(q instanceof Uint16Array)
    || !(heights instanceof Float32Array) || value(terrain, 'header') !== header
    || !Number.isSafeInteger(n) || n < 1 || n > 10000000 || q.length !== n || heights.length !== n
    || !Number.isFinite(minH) || !Number.isFinite(scale) || scale <= 0) return 0;
  let hashA = 2166136261, hashB = 0;
  for (let i = 0; i < n; i++) {
    const code = q[i], decoded = heights[i];
    if (!Object.is(Math.fround(minH + code * scale), decoded) || Math.round((decoded - minH) / scale) !== code) return 0;
    hashA = Math.imul(hashA ^ code, 16777619) >>> 0;
    hashB = (hashB + Math.imul(code, i + 1)) >>> 0;
  }
  const bytes = q.buffer.byteLength;
  // The getters capture decoded heights and scalar metadata, never the original q/buffer.
  Object.defineProperty(record, 'q', { configurable: true, enumerable: true,
    get() {
      const restored = new Uint16Array(n);
      let a = 2166136261, b = 0;
      for (let i = 0; i < n; i++) {
        const decoded = heights[i], code = Math.round((decoded - minH) / scale);
        if (!Number.isInteger(code) || code < 0 || code > 65535 || !Object.is(Math.fround(minH + code * scale), decoded))
          throw new Error('SF immutable DEM source changed; reload required');
        restored[i] = code;
        a = Math.imul(a ^ code, 16777619) >>> 0;
        b = (b + Math.imul(code, i + 1)) >>> 0;
      }
      if (a !== hashA || b !== hashB) throw new Error('SF immutable DEM source changed; reload required');
      dataProperty(record, 'q', restored);
      return restored;
    },
    set(array) { dataProperty(record, 'q', array); }
  });
  return bytes;
}

// Separate closure owner: an escaped Source/clone must not retain the original Texture via its data getters.
function texturePixels(arrays, meta, rebuild) {
  const aliases = arrays.map(a => arrays.indexOf(a));
  let managed = true;
  function restore() {
    if (arrays) return arrays;
    const fresh = rebuild();
    if (!Array.isArray(fresh) || fresh.length !== meta.length || fresh.some((a, i) =>
      !(a instanceof meta[i].Type) || a.length !== meta[i].length || (aliases[i] < i && a !== fresh[aliases[i]])))
      throw new Error('SF procedural texture source changed; reload required');
    arrays = fresh;
    return arrays;
  }
  return {
    read(i) { return restore()[i]; },
    write(i, array) { restore()[i] = array; managed = false; },
    release() { if (managed) arrays = null; }
  };
}

function pixelsProperty(pixels, i) {
  return { configurable: true, enumerable: true, get() { return pixels.read(i); }, set(array) { pixels.write(i, array); } };
}

/** Explicit procedural DataTextures only. Public onUpdate runs after synchronous data upload in pinned Three.
 * Preserve image/mip records, dimensions, formats and base/mip0 aliasing. A later read, version bump, clone upload
 * or native recreation regenerates the exact CPU source. Escaped arrays are never overwritten or detached.
 */
export function retainRegenerableTexture(texture, rebuild) {
  if (!texture?.isDataTexture || typeof rebuild !== 'function' || texture.onUpdate !== null
    || texture.source?.data !== texture.image || texture.mipmaps.length > 16) return false;
  const source = texture.source, image = texture.image, mips = texture.mipmaps.slice();
  const records = [image, ...mips];
  if (new Set(records).size !== records.length || records.some(r => !ArrayBuffer.isView(value(r, 'data'))
    || !descriptor(r, 'data')?.configurable || !descriptor(r, 'data')?.writable)) return false;
  const meta = records.map(r => ({ width: r.width, height: r.height,
    Type: r.data.constructor, length: r.data.length }));
  const pixels = texturePixels(records.map(r => r.data), meta, rebuild);
  for (let i = 0; i < records.length; i++) Object.defineProperty(records[i], 'data', pixelsProperty(pixels, i));
  texture.onUpdate = function () {
    if (texture.source !== source || source.dataReady !== true || texture.image !== image
      || texture.mipmaps.length !== mips.length || texture.mipmaps.some((m, i) => m !== mips[i])
      || records.some((r, i) => r.width !== meta[i].width || r.height !== meta[i].height)) return;
    // Pinned Three accounts explicit mip byteLengths AFTER onUpdate. Finish that synchronous owner first;
    // otherwise its accounting read immediately reconstructs the whole atlas and keeps it resident again.
    queueMicrotask(pixels.release);
  };
  return true;
}
