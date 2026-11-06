// Regional trees (2026-11-05) replaced the inherited single-blob regional trees: drawing moved to region.js's
// buildRegionalTrees module, appended before the exports. Source-exactness guards for terrain construction, LOD,
// cache and teardown undo exactly these edits (and nothing else) before comparing with their pinned checkpoints.
// Physical trunk registration is unchanged inside the edited block; tests/sf-regional-surfaces.test.mjs checks it.
const MODULE_START = '// =====================================================================================================================\n// Regional trees.';
const MODULE_END = 'Object.assign(window.NYC,{loadSFRegion,';
const EDITS = [
  ["  const treeGroups=new Map();for(let k=0;k<data.trees.length;k+=4){const x=data.trees[k],z=data.trees[k+2],key=Math.floor(x/1200)+','+Math.floor(z/1200);if(!treeGroups.has(key))treeGroups.set(key,[]);treeGroups.get(key).push(k);}\n  const matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(),position=new THREE.Vector3();\n  const regionTrees=buildRegionalTrees(data,M,group);group.userData.treePool=regionTrees.stats;\n  const treeMeshes=[];\n  for(const [key,ks]of treeGroups){\n    for(let i=0;i<ks.length;i++){\n      const k=ks[i],h=data.trees[k+3],x=data.trees[k],y=data.trees[k+1],z=data.trees[k+2];\n      // Physical trunks are unchanged: the drawn far trunk (and the near species trunk) cover this prism.\n      const radius=Math.max(.08,h*.022),height=h*.5;\n      ride?.addPrism(Array.from({length:8},(_,j)=>({x:x+Math.sin(j*Math.PI/4)*radius,z:z+Math.cos(j*Math.PI/4)*radius})),\n        y,y+height,{support:false});\n    }\n    const mesh=regionTrees.farChunk(ks);mesh.name='SFRegionTrees:'+key;group.add(mesh);treeMeshes.push(mesh);\n  }\n",
   "  const treeGroups=new Map();for(let k=0;k<data.trees.length;k+=4){const x=data.trees[k],z=data.trees[k+2],key=Math.floor(x/1200)+','+Math.floor(z/1200);if(!treeGroups.has(key))treeGroups.set(key,[]);treeGroups.get(key).push(k);}\n  const treeMat=new THREE.MeshStandardNodeMaterial({color:0x486745,roughness:0.9}),treeGeo=new THREE.IcosahedronGeometry(1,0),matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(),position=new THREE.Vector3();\n  const treeMeshes=[];\n  const trunkGeo = new THREE.CylinderGeometry(1, 1, 1, 8), trunkMat = new THREE.MeshStandardNodeMaterial({color:0x66503d,roughness:1});\n  for(const [key,ks]of treeGroups){\n    const mesh=new THREE.InstancedMesh(treeGeo,treeMat,ks.length),trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,ks.length);\n    for(let i=0;i<ks.length;i++){\n      const k=ks[i],h=data.trees[k+3],x=data.trees[k],y=data.trees[k+1],z=data.trees[k+2];\n      matrix.compose(position.set(x,y+h*0.65,z),quat,scale.set(h*0.34,h*0.45,h*0.34));mesh.setMatrixAt(i,matrix);\n      // The inherited low-poly crowns float above the ground. Author the trunk visibly as well as physically.\n      const radius=Math.max(.08,h*.022),height=h*.5;\n      matrix.compose(position.set(x,y+height/2,z),quat,scale.set(radius,height,radius));trunks.setMatrixAt(i,matrix);\n      ride?.addPrism(Array.from({length:8},(_,j)=>({x:x+Math.sin(j*Math.PI/4)*radius,z:z+Math.cos(j*Math.PI/4)*radius})),\n        y,y+height,{support:false});\n    }\n    for(const [m,name]of[[mesh,'SFRegionTrees:'],[trunks,'SFRegionTrunks:']]){\n      m.computeBoundingSphere();m.name=name+key;group.add(m);treeMeshes.push(m);\n    }\n  }\n"],
  ["    regionTrees.update(camera.position);\n    for(const mesh of treeMeshes){const c=mesh.geometry.boundingSphere.center;mesh.visible=Math.hypot(camera.position.x-c.x,camera.position.z-c.z)<treeDistance;}\n",
   "    for(const mesh of treeMeshes){const c=mesh.boundingSphere.center;mesh.visible=Math.hypot(camera.position.x-c.x,camera.position.z-c.z)<treeDistance;}\n"]
];
export function withoutRegionalTreeEdits(source) {
  const a = source.indexOf(MODULE_START), b = source.indexOf(MODULE_END);
  if (a < 0 || b < a) throw Error('regional tree module anchors missing');
  let out = source.slice(0, a) + source.slice(b);
  for (const [now, was] of EDITS) {
    if (out.split(now).length !== 2) throw Error('regional tree edit anchor not unique: ' + now.slice(0, 60));
    out = out.replace(now, () => was);
  }
  return out;
}
