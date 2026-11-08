(function () {
// js/data-loader.js
// Fetches the pipeline's binary data (provenance/formats.md) named in GEO.data before the city is built (main.js):
//   window.NYC.DATA.terrain   { header, q: Uint16Array }                  height field (tools/geo-terrain.mjs)
//   window.NYC.DATA.buildings { header, table, verts, masses: Float32Array }   footprints (tools/geo-buildings.mjs)
//   window.NYC.DATA.groundMask { header, mask: Uint8Array }                 ground classes, 1 m (tools/geo-groundmask.mjs)
//   window.NYC.DATA.fullRegion City/horizon tiles, footprint boxes, trees and ground mask (tools/geo-region.mjs)

const { GEO } = window.NYC;

// Generated URLs name the committed SFB1 bytes; delivery is their lossless `${url}.gz` copy
// (tools/compress-data.mjs). Sniff the gzip magic: a host that adds Content-Encoding: gzip hands
// back bytes the browser already inflated (pattern: mrdoob/slop-newyork 062c4a9 + 2813f08, MIT).
// Static hosts (GitHub Pages) occasionally answer a single file with a transient 5xx/429 or drop the
// connection. Retry only those, a bounded three attempts with short backoff; 404 and bad bytes fail at once.
const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);
async function fetchWithRetry(url, attempts = 3) {
  for (let i = 1; ; i++) {
    let res;
    try { res = await fetch(url); } catch (error) { if (i >= attempts) throw error; }
    if (res && (res.ok || !TRANSIENT.has(res.status) || i >= attempts)) return res;
    await new Promise(resolve => setTimeout(resolve, 400 * 3 ** (i - 1)));
  }
}

async function fetchBin(url, onBytes) {
  const res = await fetchWithRetry(`${url}.gz`);
  if (!res.ok) throw new Error(`${url}.gz: HTTP ${res.status}`);
  let buf = await res.arrayBuffer();
  const lead = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (lead[0] === 0x1f && lead[1] === 0x8b) {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot decompress the city data (DecompressionStream is unavailable).');
    buf = await new Response(new Response(buf).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  if (onBytes) onBytes(buf.byteLength);
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
  if (magic !== 'SFB1') throw new Error(`${url}: not an SFB1 file`);
  const n = new DataView(buf).getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, n)));
  return { header, buf, offset: 8 + n };
}

async function loadCityData(onProgress) {
  const d = GEO.data;
  let done = 0;
  const step = () => onProgress && onProgress(++done / 3);
  const [t, b, m, fullRegion] = await Promise.all([fetchBin(d.terrain.url, step), fetchBin(d.buildings.url, step), fetchBin(d.groundMask.url, step), window.NYC.loadSFRegion(fetchBin)]);
  const DATA = {
    terrain: { header: t.header, q: new Uint16Array(t.buf, t.offset, t.header.w * t.header.h) },
    buildings: {
      header: b.header,
      table: new Float32Array(b.buf, b.offset, b.header.tableFloats),
      verts: new Float32Array(b.buf, b.offset + b.header.tableFloats * 4, b.header.vertexFloats),
      masses: new Float32Array(b.buf, b.offset + (b.header.tableFloats + b.header.vertexFloats) * 4, b.header.massFloats || 0)
    },
    groundMask: { header: m.header, mask: new Uint8Array(m.buf, m.offset, m.header.w * m.header.h) }
  };
  DATA.fullRegion = fullRegion;
  window.NYC.DATA = DATA;
  window.NYC.Terrain.load(DATA.terrain.header, DATA.terrain.q);
  window.NYC.installRegionTerrain(fullRegion);
  return DATA;
}

Object.assign(window.NYC, { loadCityData, fetchWithRetry });
})();
