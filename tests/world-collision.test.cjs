// Retained shared geometry regressions. Old player-car controller/hero-model cases were removed;
// WorldCollision still screens authored sidewalk placement and navigation reservations.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function geometry(){
 const window={NYC:{}};
 vm.runInNewContext(fs.readFileSync('js/world-collision.js','utf8'),{window});
 return window.NYC.WorldCollision;
}
const box=(minX,maxX,minZ,maxZ,minY=0,maxY=20)=>({minX,maxX,minZ,maxZ,minY,maxY});
function outline(points){return {...box(Math.min(...points.map(p=>p[0])),Math.max(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[1]))),polygon:points.map(([x,z])=>({x,z}))};}
test('full SAT checks footprint axes against an oriented wall, in either winding',()=>{
 const G=geometry();
 for(const a of [0,.2,.7,1.3,2.4]){
  const cs=Math.cos(a),sn=Math.sin(a),world=(x,z)=>({x:x*cs+z*sn,z:-x*sn+z*cs});
  const pts=[[1.9,-2.1],[2.1,-2.1],[2.1,-1.9],[1.9,-1.9]].map(([x,z])=>world(x,z));
  const c=outline(pts.map(p=>[p.x,p.z]));
  assert.equal(G.contact(G.carShape({x:0,z:0},Math.PI/4+a),c),null);
  c.polygon.reverse();assert.equal(G.contact(G.carShape({x:0,z:0},Math.PI/4+a),{...c}),null);
 }
});
test('concave courtyard remains open and contact exits the complete polygon, not an internal seam',()=>{
 const points=[[0,0],[8,0],[8,2],[2,2],[2,8],[0,8]];
 for(const reverse of [false,true]){
  const collider=outline(reverse?points.slice().reverse():points),G=geometry();
  assert.equal(G.contact(G.carShape({x:5,z:5},0),collider),null);
  for(const [x,z,heading] of [[3,4,0],[1,1,0],[1.7,4,.7],[4,1.9,1.3]]){
   const p={x,z},hit=G.contact(G.carShape(p,heading),collider);assert.ok(hit);
   p.x+=hit.nx*(hit.depth+G.SKIN);p.z+=hit.nz*(hit.depth+G.SKIN);
   assert.equal(G.contact(G.carShape(p,heading),collider),null,JSON.stringify({x,z,heading,hit,p}));
  }
 }
});
test('thin triangular facade does not occupy the rectangular strip beside its slanted edge',()=>{
 const collider=outline([[0,0],[10,0],[10,10]]),G=geometry();
 assert.equal(G.contact(G.circleShape({x:5,z:5.4},.25),collider),null);
 const hit=G.contact(G.circleShape({x:5,z:5.2},.25),collider);assert.ok(hit);
 assert.ok(Math.abs(hit.depth-(.25-.2/Math.sqrt(2)))<1e-8);
});
test('circular placement uses corner contact rather than a square exclusion zone',()=>{
 const G=geometry(),c=box(1,3,1,3);
 assert.equal(G.contact(G.circleShape({x:.4,z:.4},.8),c),null);
 const hit=G.contact(G.circleShape({x:.5,z:.5},.8),c);assert.ok(hit);
 assert.ok(Math.abs(hit.nx+Math.SQRT1_2)<1e-8&&Math.abs(hit.nz+Math.SQRT1_2)<1e-8);
});
