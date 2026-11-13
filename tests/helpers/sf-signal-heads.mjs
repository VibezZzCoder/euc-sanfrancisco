// CPU fixture: real committed road graph/terrain and actual signal-emission code.
// Captures construction matrices before the draw-only repair; no renderer/device.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three/build/three.core.js';
const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
export const signalSource = read('js/sf-street-details.js');
export function signalPlacements(N, network) {
  const start = signalSource.indexOf('  const T = window.NYC.Terrain;', signalSource.indexOf('function buildSFStreetDetails('));
  const end = signalSource.indexOf('  // 3. Lamps along', start);
  assert.ok(start > 0 && end > start);
  let code = signalSource.slice(start,end);
  const marker = '      signals++;';
  assert.equal(code.split(marker).length,2);
  code = code.replace(marker, marker + '\n      metadata.push({edge:e.id,node:n.id,group:e.axisIndex,dx:e.dx,dz:e.dz});');
  return vm.runInNewContext(`(function(){const footprints=[],metadata=[];${code}return {mats,footprints,metadata};})()`,
    {window:{NYC:N},network,THREE,blockAt:N.blockAt,CURB_H:N.CURB_H,SIGNAL_TIMING:N.SIGNAL_TIMING,POLE_H:6.4,HEAD_Y:5.42});
}
export function actualSignalPlacements() {
  const context=vm.createContext(vm.constants.DONT_CONTEXTIFY);
  context.window={NYC:{DEBUG_ROADS:false}};
  for(const name of ['sf-geodata','sf-places','city-config','terrain','road-network']) vm.runInContext(read(`js/${name}.js`),context);
  const N=context.window.NYC;
  const {BOX}=createRequire(import.meta.url)('./geo-box.cjs');
  const buf=readFileSync(new URL(`data/terrain-${BOX}.bin`,root)),n=buf.readUInt32LE(4),header=JSON.parse(buf.subarray(8,8+n));
  N.Terrain.load(header,new Uint16Array(buf.buffer.slice(buf.byteOffset+8+n,buf.byteOffset+buf.length),0,header.w*header.h));
  const network=N.buildRoadNetwork(N.BLOCKS.map(b=>({...b,block:b})),[]);
  return signalPlacements(N,network);
}
export function repairFunction() {
  const start=signalSource.indexOf('function separateSignalHeads('),end=signalSource.indexOf('\nfunction buildSFStreetDetails(',start);
  assert.ok(start>=0&&end>start);
  return vm.runInNewContext(signalSource.slice(start,end)+'\nseparateSignalHeads;');
}
