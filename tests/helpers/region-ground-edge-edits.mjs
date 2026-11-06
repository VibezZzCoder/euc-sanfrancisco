// Regional ground edges (2026-11-05): the 4 m class mask is contour-filtered in the regional ground material instead
// of drawn as nearest cells (visual only). Source-exactness guards undo exactly this material block before comparing
// with their pinned checkpoints; terrain construction, LOD, cache and teardown stay byte-compared.
const START = '  const maskColor=k=>{';
const END = '  const grain=sin(positionWorld.x.mul(0.17))';
const WAS = "  let col=vec3(colors[0].r,colors[0].g,colors[0].b);\n  for(let i=1;i<colors.length;i++)col=select(kind.equal(float(i)),vec3(colors[i].r,colors[i].g,colors[i].b),col);\n";
const EMISSIVE_NOW = 'groundMat.emissiveNode=vec3(1,0.63,0.3).mul(asphalt).mul(nightFactorNode()).mul(0.025);';
const EMISSIVE_WAS = 'groundMat.emissiveNode=vec3(1,0.63,0.3).mul(step(0.5,kind).mul(float(1).sub(step(1.5,kind)))).mul(nightFactorNode()).mul(0.025);';
export function withoutGroundEdgeEdits(source) {
  const a = source.indexOf(START), b = source.indexOf(END);
  if (a < 0 || b < a || source.indexOf(START, a + 1) >= 0) throw Error('regional ground edge anchors missing');
  const out = source.slice(0, a) + WAS + source.slice(b);
  if (out.split(EMISSIVE_NOW).length !== 2) throw Error('regional ground emissive anchor not unique');
  return out.replace(EMISSIVE_NOW, () => EMISSIVE_WAS);
}
