// Explicit classic/ESM seam. SF source: unable12/slop-sanfrancisco@bdd5d37 (MIT).
// All addons use index.html's local e27dfa9 import map, shared with the EUC modules.
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { SunLightNode } from 'three/addons/lights/SunLightNode.js';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import { installSunShadowRetentionFix } from './sun-shadow-retention.js';
import { retainRegenerableTexture } from './source-residency.js';

// Before any material builds: cascaded sun shadows must not keep each material's node builder alive.
installSunShadowRetentionFix();

// IIFEs capture namespace members when they execute: order is a contract.
export const CITY_SCRIPTS = Object.freeze([
  'sf-geodata', 'sf-places', 'city-config', 'sf-destinations', 'data-loader', 'terrain', 'drape',
  'sf-ride-geometry', // construction registry precedes all geometry builders
  'tsl-materials', 'trees', 'actor-models', 'world-collision', 'vehicle-lights', 'pedestrians',
  'lighting', 'terrain-mesh', 'region', 'sf-ground', 'sf-style', 'buildings', 'sf-buildings', 'sf-jail-exterior',
  'landmarks', 'sf-bridges', 'street-details', 'sf-street-details', 'sf-sidewalk-scenes',
  'road-network', 'road-paint', 'grade-separation', 'sf-dynamic-bodies', 'traffic', 'sf-transit',
  'sf-map', 'scene-culling', 'post-processing'
]);
let initialization;
export function initializeCity(startup) {
  if (initialization) return initialization;
  initialization = (async () => {
    window.NYC = { THREE, TSL, retainRegenerableTexture, PostFX: { bloom, ssr },
      Addons: { mergeGeometries, mergeVertices, SkyMesh, SunLight, SunLightNode, ClusteredLighting } };
    startup.phase('city-scripts');
    // Fetch concurrently; evaluation below stays strictly ordered and every load has a rejection path.
    for (const name of CITY_SCRIPTS) {
      const preload = document.createElement('link');
      preload.rel = 'preload'; preload.as = 'script';
      preload.href = new URL(`./${name}.js`, import.meta.url).href;
      document.head.append(preload);
    }
    for (const name of CITY_SCRIPTS) {
      if (startup.failed) throw new Error('City initialization interrupted');
      document.getElementById('loading-status').textContent = `Loading San Francisco city systems… ${name}`;
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL(`./${name}.js`, import.meta.url).href;
        script.async = false; script.onload = resolve;
        script.onerror = () => reject(new Error(`Required city script failed: js/${name}.js`));
        document.head.append(script);
      });
    }
    if (startup.failed) throw new Error('City initialization interrupted');
    return window.NYC;
  })();
  return initialization;
}
