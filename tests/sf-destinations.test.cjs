const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.join(__dirname,'..');
function build() {
  const c=vm.createContext({window:{NYC:{}}});
  const load=f=>vm.runInContext(fs.readFileSync(path.join(root,'js',f+'.js'),'utf8'),c);
  for(const f of ['sf-geodata','sf-places','city-config'])load(f);
  const N=c.window.NYC,original=N.PLACE_DATA.regional,pins=N.NYC_LANDMARKS.slice(),teleports={...N.TELEPORT_LOCATIONS};
  load('sf-destinations');
  return {N,original,pins,teleports};
}
test('destination union retains every source pin, teleport, regional entry and modeled site; overlay never mutates generated objects',()=>{
  const {N,original,pins,teleports}=build(),dest=N.SF_DESTINATIONS;
  assert.equal(new Set(dest.map(d=>d.id)).size,dest.length);
  for(const p of pins) {
    const runtime=N.NYC_LANDMARKS.find(d=>d.id===p.id);
    assert.equal(runtime.name,p.name);assert.equal(runtime.x,p.x);assert.equal(runtime.z,p.z);
    assert.ok(dest.some(d=>d.sources.includes(`NYC_LANDMARKS:${p.id}`)));
  }
  for(const key of Object.keys(teleports))assert.ok(dest.some(d=>d.sources.includes(`TELEPORT_LOCATIONS:${key}`)),key);
  const code=fs.readFileSync(path.join(root,'js/landmarks.js'),'utf8');
  const names=[...code.matchAll(/model\('([^']+)'/g)].map(m=>m[1]);
  names.push('Old Mission Dolores','Mission Dolores Basilica');
  for(const name of names)assert.ok(dest.some(d=>d.sources.includes(`model:${name}`)),name);
  for(const [id,p]of Object.entries(original)) {
    assert.equal(p.mode,'helicopter','original generated record is unmodified');
    assert.equal(N.PLACE_DATA.regional[id].mode,undefined);
    assert.equal(N.TELEPORT_LOCATIONS[id].mode,undefined);
  }
  for(const id of ['twinpeaks','paintedladies','goldengate','golden-gate-bridge','bay-bridge','alcatraz-island',
    'palace-of-fine-arts','fort-point','sutro-tower','yerba-buena-island'])assert.ok(dest.some(d=>d.id===id&&d.required),id);
  assert.ok(dest.every(d=>d.status!=='passed'&&d.arrival===undefined),'no fabricated native acceptance before terrain exists');
});
test('arrival proposals carry exact explicit floors and headings; native refusal is returned without fallback',()=>{
  const {N}=build();
  N.Terrain={loaded:true,originX:-10000,originZ:-10000,cell:20000,w:2,h:2,waterLevel:-1.07,
    heights:new Float32Array([40,60,80,120]),patches:[]};
  const d=N.SF_DESTINATIONS.find(d=>d.id==='paintedladies'),pin={...d.pin};
  const p=d.arrival;
  assert.ok([p.x,p.y,p.z,p.heading,p.referenceY].every(Number.isFinite));
  assert.equal(p.y,N.sfDestinationFloorAt(p.x,p.z));assert.equal(p.y,p.referenceY);
  assert.equal(p.requireClear,true);assert.equal(p.registeredSurfaceOnly,true);assert.equal(p.requiresValidation,true);
  assert.deepEqual({...d.pin},pin,'arrival never moves the researched pin');
  let request;
  assert.equal(N.getSFDestinationArrival(d.id,{findPlacementTarget:p=>{request=p;return null;}}),null);
  assert.equal(request.headingY,p.heading);assert.equal(request.referenceY,p.y);
  assert.equal(N.getSFDestinationArrival(d.id),null,'missing validator cannot approve a proposal');
  const rooftop=N.SF_DESTINATIONS.find(d=>d.id==='salesforce-park').arrival;
  const tc=N.LANDMARK_SITES['Salesforce Transit Center'];
  assert.equal(rooftop.y,tc.base+(tc.topH||30)+.4,'roof proposal is not the street floor at the same pin');
  const tp=N.TELEPORT_LOCATIONS.paintedladies;
  assert.deepEqual([tp.x,tp.y,tp.z,tp.heading],[p.x,p.y,p.z,p.heading],'toolbar teleport uses the same checked stand as the map pin');
  // Painted Ladies: an Alamo Square stand facing the seven OSM houses, not along Steiner St with them to the side.
  const houses=N.LANDMARK_SITES['Painted Ladies'].buildings.filter(b=>b.colour&&b.roof);
  const hx=houses.reduce((a,b)=>a+b.ring.filter((_,i)=>i%2===0).reduce((s,v,_,r)=>s+v/r.length,0),0)/houses.length;
  const hz=houses.reduce((a,b)=>a+b.ring.filter((_,i)=>i%2===1).reduce((s,v,_,r)=>s+v/r.length,0),0)/houses.length;
  assert.ok(Math.abs(Math.atan2(hx-p.x,hz-p.z)-p.heading)<0.05,'faces the painted houses');
  assert.ok(Math.hypot(hx-p.x,hz-p.z)>30&&Math.hypot(hx-p.x,hz-p.z)<80,'far enough back to frame the row');
});
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function flatTerrain(N,y=20) {
  N.Terrain={loaded:true,originX:-20000,originZ:-20000,cell:40000,w:2,h:2,waterLevel:-1.07,
    heights:new Float32Array([y,y,y,y]),patches:[]};
}
test('every landmark arrival faces its landmark; Alcatraz, Palace, turntable and Grace have explicit stands',()=>{
  const {N}=build();flatTerrain(N);
  const site=d=>N.LANDMARK_SITES[d.siteName]||N.LANDMARK_SITES[N.TELEPORT_LOCATIONS[Object.keys(N.TELEPORT_LOCATIONS)
    .find(k=>N.TELEPORT_LOCATIONS[k].landmark===d.name)]?.landmark];
  for(const id of ['alcatraz-island','palace-of-fine-arts','cable-car-turntable-powell-market','gracecathedral']) {
    const d=N.SF_DESTINATIONS.find(d=>d.id===id),p=d.arrival;
    assert.ok(p&&[p.x,p.y,p.z,p.heading].every(Number.isFinite),id+' has a finite proposal');
    assert.equal(p.y,N.sfDestinationFloorAt(p.x,p.z),id+' floor comes from committed terrain');
  }
  const alcatraz=N.SF_DESTINATIONS.find(d=>d.id==='alcatraz-island').arrival,ring=N.LANDMARK_SITES['Alcatraz Island'].ring;
  let inside=false;for(let i=0,j=ring.length-2;i<ring.length;j=i,i+=2)
    if((ring[i+1]>alcatraz.z)!==(ring[j+1]>alcatraz.z)&&alcatraz.x<(ring[j]-ring[i])*(alcatraz.z-ring[i+1])/(ring[j+1]-ring[i+1])+ring[i])inside=!inside;
  assert.ok(inside,'Alcatraz stand is on the island outline, not a bay/shore guess');
  // Modelled-site destinations (except the street/rooftop arrivals inside the Transit Center outline and the island
  // stand on Yerba Buena's own summit road) look within 20 degrees of their site.
  for(const d of N.SF_DESTINATIONS) {
    const p=d.arrival,s=site(d);
    if(!p||!s||['salesforce-park','salesforce-transit-center','yerba-buena-island','alcatraz-island','paintedladies'].includes(d.id))continue;
    assert.ok(Math.abs(wrap(Math.atan2(s.x-p.x,s.z-p.z)-p.heading))<0.35,d.id+' faces its landmark');
  }
  for(const id of ['twinpeaks','goldengate']) {
    const d=N.SF_DESTINATIONS.find(d=>d.id===id),p=d.arrival,t=N.PLACE_DATA.regional[id].target;
    assert.ok(Math.abs(wrap(Math.atan2(t[0]-p.x,t[1]-p.z)-p.heading))<1e-9,id+' faces its authored view target');
    assert.equal(p.x,N.PLACE_DATA.regional[id].x,'regional arrival position is unchanged');
  }
});
test('Bay Bridge arrival stands on the upper deck itself, not its first station, and refuses without a deck profile',()=>{
  const {N}=build();flatTerrain(N);
  const d=N.SF_DESTINATIONS.find(d=>d.id==='bay-bridge');
  N.SF_BRIDGE_ROUTES={baybridge:{westUpper:[905.86,56.93,392.064],westLower:[905.86,47.43,392.064],
    islandUpper:[3045.293,68.93,-2125.346],islandLower:[3045.293,59.43,-2125.346]}};
  assert.equal(d.arrival,undefined,'no deck height function: no guessed layer');
  const asked=[];N.bridgeDeckAt=(x,z,upper)=>{asked.push(upper);return {y:57.4186,onBridge:true};};
  const p=d.arrival,w=N.SF_BRIDGE_ROUTES.baybridge.westUpper;
  assert.deepEqual(asked,[true]);assert.equal(p.y,57.4186);
  assert.ok(Math.abs(Math.hypot(p.x-w[0],p.z-w[2])-Math.hypot(24,5))<1e-9,'24 m along, 5 m beside the axis');
  const u=N.SF_BRIDGE_ROUTES.baybridge.islandUpper;
  assert.ok(Math.abs(p.heading-Math.atan2(u[0]-w[0],u[2]-w[2]))<1e-12,'faces along the deck to the island');
  N.bridgeDeckAt=()=>({y:40,onBridge:false});assert.equal(d.arrival,undefined,'approach/shore height is not the deck');
});
test('terrain proposals use the rendered anti-diagonal, not bilinear interpolation across a saddle',()=>{
  const {N}=build();
  N.Terrain={loaded:true,originX:0,originZ:0,cell:2,w:2,h:2,waterLevel:-1,
    heights:new Float32Array([0,0,0,8]),patches:[]};
  assert.equal(N.sfDestinationFloorAt(.5,.5),0);
  assert.equal(N.sfDestinationFloorAt(1.5,1.5),4);
  assert.equal(N.sfDestinationFloorAt(4,4),null,'missing coverage is not a magical arrival surface');
});
