(function () {
// Phase 6: real citywide scenery. Facade shader and chunk instancing adapted from boroughs.js.
const { THREE, cityUniforms, Terrain } = window.NYC;
const { Fn, uv:texUV, float, vec2, vec3, vec4, attribute, varying, texture, positionWorld, positionGeometry, normalGeometry,
  normalWorld, sin, abs, floor, fract, max, min, clamp, mix, step, smoothstep, dot, fwidth, select } = window.NYC.TSL;
const toLinear = c => Math.pow(c, 2.2);
const srgb = (r, g, b) => vec3(toLinear(r), toLinear(g), toLinear(b));
const hash12 = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)));

const valueNoise = Fn(([p]) => {
  const pv = vec2(p).toVar();
  const i = floor(pv).toVar();
  const f = fract(pv).toVar();
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0))).toVar();
  const a = hash12(i);
  const b = hash12(i.add(vec2(1.0, 0.0)));
  const c = hash12(i.add(vec2(0.0, 1.0)));
  const d = hash12(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

// Box-filtered periodic pulse (fraction of a footprint `w` around `x` where fract() lies in [a, b]): settles to the mean
// coverage once a period shrinks below a pixel, so grids never shimmer at distance
const boxPulse = Fn(([x, a, b, w]) => {
  const p = float(x).toVar();
  const lo = float(a).toVar();
  const hi = float(b).toVar();
  const hw = max(float(w), 0.0001).mul(0.5).toVar();
  const integral = (t) => floor(t).mul(hi.sub(lo)).add(clamp(fract(t), lo, hi).sub(lo));
  return integral(p.add(hw)).sub(integral(p.sub(hw))).div(hw.mul(2.0));
});

// 0 by day, ~0.75 at blue hour, 1 at night
const nightFactorNode = () => smoothstep(0.7, 1.45, cityUniforms.uInteriorGlow);

function createBoroughBuildingMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0.0 });
  const info = varying(attribute('bInfo', 'vec4'), 'vRegionInfo').setInterpolation('flat');
  const tint = varying(attribute('bTint', 'vec4'), 'vRegionTint').setInterpolation('flat');
  const pG = positionGeometry;
  const nG = normalGeometry;
  const style = tint.w;

  const isRoof = step(0.5, nG.y).toVar();
  const faceX = step(0.5, abs(nG.x));
  const wallW = mix(info.x, info.z, faceX);
  const u = mix(pG.x, pG.z, faceX).add(0.5).mul(wallW).add(info.w.mul(3.7)).toVar();
  const y = pG.y.mul(info.y).toVar();

  const s0 = style.lessThan(0.5);
  const s1 = style.lessThan(1.5);
  const s2 = style.lessThan(2.5);
  const s3 = style.lessThan(3.5);
  const pick = (a, b, c, d, e) => select(s0, float(a), select(s1, float(b), select(s2, float(c), select(s3, float(d), float(e)))));
  const bay = pick(3.0, 1.6, 4.8, 2.2, 2.6);
  const floorH = pick(3.1, 3.7, 4.6, 3.3, 3.4);
  const winW = pick(0.44, 0.88, 0.62, 0.96, 0.46);
  const winH = pick(0.54, 0.74, 0.46, 0.44, 0.56);
  const litProb = pick(0.32, 0.36, 0.14, 0.3, 0.3);
  const glassy = pick(0.15, 1.0, 0.1, 0.35, 0.15);

  const gu = u.div(bay).toVar();
  const gv = y.div(floorH).toVar();
  const fwU = fwidth(gu).toVar();
  const fwV = fwidth(gv).toVar();
  const winMask = boxPulse(gu, float(0.5).sub(winW.mul(0.5)), float(0.5).add(winW.mul(0.5)), fwU)
    .mul(boxPulse(gv, float(0.42).sub(winH.mul(0.5)), float(0.42).add(winH.mul(0.5)), fwV))
    .mul(float(1.0).sub(isRoof))
    .mul(step(1.0, gv))
    .mul(float(1.0).sub(step(info.y.sub(1.2), y)))
    .toVar();
  const cellHash = hash12(floor(vec2(gu, gv)).add(vec2(info.w.mul(0.61), info.w.mul(1.37))));
  const far = smoothstep(0.35, 1.2, max(fwU, fwV)).toVar();
  const lit = mix(step(cellHash, litProb), litProb, far).toVar();

  const bHash = fract(info.w.mul(0.1373));
  const grime = valueNoise(vec2(u.mul(0.45), y.mul(0.05).add(info.w))).toVar();
  const fwY = fwidth(y);
  const parapet = smoothstep(fwY.negate(), fwY, y.sub(info.y.sub(0.85))).mul(float(1.0).sub(isRoof));
  const wallBase = tint.rgb.mul(float(0.84).add(bHash.mul(0.3))).mul(mix(float(0.78), float(1.0), smoothstep(0.0, 9.0, y)));
  const wallCol = mix(wallBase.mul(mix(float(0.86), float(1.07), grime)), wallBase.mul(mix(float(0.62), float(1.3), step(0.55, bHash))), parapet);
  const storefront = float(1.0).sub(step(4.2, y)).mul(float(1.0).sub(isRoof));
  // Window frames & sills (white / cream trim on masonry, dark mullions on glass & warehouses, aluminium on modern)
  const frameMask = boxPulse(gu, float(0.45).sub(winW.mul(0.5)), float(0.55).add(winW.mul(0.5)), fwU)
    .mul(boxPulse(gv, float(0.36).sub(winH.mul(0.5)), float(0.45).add(winH.mul(0.5)), fwV))
    .mul(float(1.0).sub(isRoof))
    .mul(step(1.0, gv))
    .mul(float(1.0).sub(step(info.y.sub(1.2), y)));
  const frame = max(frameMask.sub(winMask), 0.0);
  const cFrame = vec3(1.0, 0.98, 0.94).mul(pick(0.58, 0.04, 0.05, 0.34, 0.5));
  // Dark interiors (the sky shows up through Fresnel reflection), some drawn blinds; tinted curtain-wall glass
  const winHash = hash12(floor(vec2(gu, gv)).add(vec2(info.w.mul(1.91), 5.3)));
  const blinds = mix(step(0.84, winHash), float(0.16), far).mul(float(1.0).sub(glassy));
  const cGlass = mix(mix(vec3(0.012, 0.014, 0.017), vec3(0.05, 0.065, 0.08), glassy), srgb(0.56, 0.53, 0.47), blinds);
  const roofCol = mix(srgb(0.30, 0.30, 0.31), srgb(0.66, 0.66, 0.65), step(0.72, bHash));
  let col = mix(wallCol, cFrame, frame);
  col = mix(col, cGlass, winMask);
  col = mix(col, vec3(0.09, 0.085, 0.08), storefront.mul(0.65));
  col = mix(col, roofCol, isRoof);
  mat.colorNode = col;
  mat.roughnessNode = mix(mix(float(0.86), float(0.5), frame), mix(float(0.14), float(0.06), glassy), winMask);
  mat.metalnessNode = winMask.mul(glassy).mul(0.6);

  const night = nightFactorNode();
  const warm = mix(vec3(1.0, 0.66, 0.36), vec3(0.92, 0.86, 0.76), step(0.78, cellHash));
  const dimmer = mix(fract(cellHash.mul(13.7)).mul(0.75).add(0.25), float(0.62), far);
  const shop = storefront.mul(step(0.35, hash12(vec2(floor(gu), info.w)))).mul(0.8);
  mat.emissiveNode = warm.mul(winMask.mul(lit).mul(dimmer).add(shop)).mul(night.mul(0.95).add(cityUniforms.uInteriorGlow.mul(0.1)));
  return mat;
}

const BOX_GEO = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const src = g.index.array;
  const keep = [];
  for (let i = 0; i < src.length; i++) if (i < 18 || i >= 24) keep.push(src[i]);
  g.setIndex(keep);
  g.clearGroups();
  return g;
})();

function buildBuildingChunks(list, material, chunkSize, name) {
  const chunks = new Map();
  for (const b of list) {
    const key = Math.floor(b.x / chunkSize) + ',' + Math.floor(b.z / chunkSize);
    let arr = chunks.get(key);
    if (!arr) chunks.set(key, (arr = []));
    arr.push(b);
  }
  const meshes = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (const [key, arr] of chunks) {
    const geo = new THREE.BufferGeometry();
    geo.setIndex(BOX_GEO.index);
    geo.setAttribute('position', BOX_GEO.attributes.position);
    geo.setAttribute('normal', BOX_GEO.attributes.normal);
    const info = new Float32Array(arr.length * 4);
    const tint = new Float32Array(arr.length * 4);
    const mesh = new THREE.InstancedMesh(geo, material, arr.length);
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      q.setFromAxisAngle(yAxis, b.rot);
      m.compose(p.set(b.x, b.y, b.z), q, s.set(b.w, b.h, b.d));
      mesh.setMatrixAt(i, m);
      info[i * 4] = b.w;
      info[i * 4 + 1] = b.h;
      info[i * 4 + 2] = b.d;
      info[i * 4 + 3] = b.seed;
      tint[i * 4] = toLinear(b.tint[0]);
      tint[i * 4 + 1] = toLinear(b.tint[1]);
      tint[i * 4 + 2] = toLinear(b.tint[2]);
      tint[i * 4 + 3] = b.style;
    }
    geo.setAttribute('bInfo', new THREE.InstancedBufferAttribute(info, 4));
    geo.setAttribute('bTint', new THREE.InstancedBufferAttribute(tint, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = name + ':' + key;
    meshes.push(mesh);
  }
  return meshes;
}


function decodeRegionRLE(runs, count) {
  const mask = new Uint8Array(count); let offset = 0;
  for (const run of runs) { const n = run >>> 8, value = run & 255; if (!n || value > 8 || offset + n > count) throw Error('Invalid region mask run'); mask.fill(value, offset, offset + n); offset += n; }
  if (offset !== count) throw Error('Incomplete region mask');
  return mask;
}
async function loadSFRegion(fetchBin) {
  const response = await fetch('data/region/manifest.json');
  if (!response.ok) throw Error(`Region manifest: HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest.version !== 1) throw Error('Unsupported region manifest');
  const jobs = [...manifest.city.files, ...manifest.horizon.files, ...manifest.buildings.files, manifest.mask, manifest.trees, manifest.roads];
  const files = new Map(); let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < jobs.length) { const item = jobs[next++]; files.set(item.url, await fetchBin(item.url)); }
  }));
  const makeGrid = tier => {
    const { x0, z0, step, w, h } = tier;
    const heights = new Float32Array(w * h).fill(manifest.waterLevel);
    const tiles = [];
    for (const f of tier.files) {
      const { header: H, buf, offset } = files.get(f.url), q = new Uint16Array(buf, offset, H.w * H.h);
      const ix = Math.round((H.originX-x0)/step), iz = Math.round((H.originZ-z0)/step);
      for (let j=0;j<H.h;j++)for(let i=0;i<H.w;i++)heights[(iz+j)*w+ix+i]=H.minH+q[j*H.w+i]*H.scale;
      tiles.push({ x:H.originX,z:H.originZ,w:H.w,h:H.h,ix,iz,size:tier.size });
    }
    return { ...tier, heights, tiles };
  };
  const city = makeGrid(manifest.city), horizon = makeGrid(manifest.horizon);
  const m = files.get(manifest.mask.url), mask = decodeRegionRLE(new Uint32Array(m.buf,m.offset),m.header.w*m.header.h);
  const b = manifest.buildings.files.map(f => { const bin=files.get(f.url);return {header:bin.header,records:new Int32Array(bin.buf,bin.offset)}; });
  const t=files.get(manifest.trees.url),trees=new Float32Array(t.buf,t.offset);
  const r=files.get(manifest.roads.url),roads=new Float32Array(r.buf,r.offset);
  return { manifest, city, horizon, mask, buildings:b, trees, roads };
}
function installRegionTerrain(data) {
  const h=data.manifest.horizon;
  window.NYC.FLIGHT_BOUNDS={minX:h.x0,maxX:h.x1,minZ:h.z0,maxZ:h.z1};
  // Fine landmark patches precede these. Core sampling remains authoritative inside its own grid.
  for (const g of [data.city,data.horizon]) Terrain.addPatch({x0:g.x0,z0:g.z0,step:g.step,nx:g.w,nz:g.h,h:g.heights,rect:true});
}
// Specialized for this builder's indexed, non-normalized, non-interleaved Float32 XYZ geometry.
// Arithmetic/order from Three e27dfa95ae7f453b5d7a9a36ffdb563f7c9b529b (MIT, vendor/three/LICENSE):
// BufferGeometry.computeVertexNormals/normalizeNormals and Vector3 cross/normalize.
// Float32 writes after EACH face addition are intentional; Float64 accumulation changes the lighting.
function computeRegionVertexNormals(geo) {
  const positions=geo.attributes.position.array,indices=geo.index.array;
  let normal=geo.attributes.normal;
  if(!normal||normal.count!==positions.length/3){
    normal=new THREE.BufferAttribute(new Float32Array(positions.length),3);
    geo.setAttribute('normal',normal);
  }else normal.array.fill(0);
  const normals=normal.array;
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
    const cbx=positions[c]-positions[b],cby=positions[c+1]-positions[b+1],cbz=positions[c+2]-positions[b+2];
    const abx=positions[a]-positions[b],aby=positions[a+1]-positions[b+1],abz=positions[a+2]-positions[b+2];
    const nx=cby*abz-cbz*aby,ny=cbz*abx-cbx*abz,nz=cbx*aby-cby*abx;
    // Read all three old normals before any writes, including repeated indices in degenerate triangles.
    const ax=normals[a]+nx,ay=normals[a+1]+ny,az=normals[a+2]+nz;
    const bx=normals[b]+nx,by=normals[b+1]+ny,bz=normals[b+2]+nz;
    const cx=normals[c]+nx,cy=normals[c+1]+ny,cz=normals[c+2]+nz;
    normals[a]=ax;normals[a+1]=ay;normals[a+2]=az;
    normals[b]=bx;normals[b+1]=by;normals[b+2]=bz;
    normals[c]=cx;normals[c+1]=cy;normals[c+2]=cz;
  }
  for(let i=0;i<normals.length;i+=3){
    const x=normals[i],y=normals[i+1],z=normals[i+2];
    // Match Vector3.length() || 1, divideScalar's reciprocal, then multiplyScalar (not hypot/division).
    const scale=1/(Math.sqrt(x*x+y*y+z*z)||1);
    normals[i]=x*scale;normals[i+1]=y*scale;normals[i+2]=z*scale;
  }
  normal.needsUpdate=true;
}
function buildSFRegion(scene, { paintIntervals = null } = {}) {
  const ride = window.NYC.RideGeometry;
  const data=window.NYC.DATA.fullRegion;
  if(!data || new URLSearchParams(location.search).get('region')==='0')return { update(){}, disposeTerrainCache(){}, stats:()=>({}) };
  const group=new THREE.Group();group.name='SFRegion';scene.add(group);
  const C=data.city,H=data.horizon,M=data.manifest.mask,water=data.manifest.waterLevel;
  const maskTexture=new THREE.DataTexture(data.mask,M.w,M.h,THREE.RedFormat,THREE.UnsignedByteType);
  maskTexture.minFilter=maskTexture.magFilter=THREE.NearestFilter;maskTexture.generateMipmaps=false;maskTexture.needsUpdate=true;
  const groundMat=new THREE.MeshStandardNodeMaterial({roughness:0.97});
  const uv=vec2(positionWorld.x.sub(M.originX).div(M.w*4),positionWorld.z.sub(M.originZ).div(M.h*4));
  const kind=texture(maskTexture,clamp(uv,0,1)).r.mul(255).round();
  const colors=[0x777366,0x454950,0x6b8053,0xb9ad83,0x77746c,0x3e593f,0x768267,0x7b7972,0x536b70].map(v=>new THREE.Color(v));
  const maskColor=k=>{let c=vec3(colors[0].r,colors[0].g,colors[0].b);for(let i=1;i<colors.length;i++)c=select(k.equal(float(i)),vec3(colors[i].r,colors[i].g,colors[i].b),c);return c;};
  // Visual only: the 4 m class raster's nearest cells drew 4 m stair-steps along roads/lawns. Contour-filter the four
  // nearest classes instead: same-class bilinear coverage s, sharpened as w*s^e (e from the screen footprint), so edges
  // follow the bilinear iso-line ~1-2 px wide when close and soften where cells shrink below a pixel. Branch-free;
  // derivatives are taken unconditionally. Mask, terrain geometry, support and collision are unchanged.
  const tc=vec2(positionWorld.x.sub(M.originX).div(4),positionWorld.z.sub(M.originZ).div(4)).sub(0.5).toVar();
  const maskCell=floor(tc).toVar(),maskF=fract(tc).toVar(),fw=fwidth(tc);
  const sharp=clamp(float(0.6).div(max(max(fw.x,fw.y),0.0001)).sub(1),1,8).toVar();
  const kindAt=(i,j)=>texture(maskTexture,clamp(maskCell.add(vec2(i+0.5,j+0.5)).div(vec2(M.w,M.h)),0,1)).r.mul(255).round().toVar();
  const k00=kindAt(0,0),k10=kindAt(1,0),k01=kindAt(0,1),k11=kindAt(1,1);
  const w00=float(1).sub(maskF.x).mul(float(1).sub(maskF.y)),w10=maskF.x.mul(float(1).sub(maskF.y)),w01=float(1).sub(maskF.x).mul(maskF.y),w11=maskF.x.mul(maskF.y);
  const same=(a,b)=>select(a.equal(b),float(1),float(0));
  const e0=same(k00,k10),e1=same(k00,k01),e2=same(k00,k11),e3=same(k10,k01),e4=same(k10,k11),e5=same(k01,k11);
  const g00=w00.mul(w00.add(w10.mul(e0)).add(w01.mul(e1)).add(w11.mul(e2)).pow(sharp));
  const g10=w10.mul(w10.add(w00.mul(e0)).add(w01.mul(e3)).add(w11.mul(e4)).pow(sharp));
  const g01=w01.mul(w01.add(w00.mul(e1)).add(w10.mul(e3)).add(w11.mul(e5)).pow(sharp));
  const g11=w11.mul(w11.add(w00.mul(e2)).add(w10.mul(e4)).add(w01.mul(e5)).pow(sharp));
  const gSum=g00.add(g10).add(g01).add(g11).add(1e-12).toVar();
  const col=maskColor(k00).mul(g00).add(maskColor(k10).mul(g10)).add(maskColor(k01).mul(g01)).add(maskColor(k11).mul(g11)).div(gSum);
  const asphalt=same(k00,float(1)).mul(g00).add(same(k10,float(1)).mul(g10)).add(same(k01,float(1)).mul(g01)).add(same(k11,float(1)).mul(g11)).div(gSum);
  const grain=sin(positionWorld.x.mul(0.17)).mul(sin(positionWorld.z.mul(0.21))).mul(0.035).add(0.97);
  groundMat.colorNode=col.mul(grain);
  groundMat.emissiveNode=vec3(1,0.63,0.3).mul(asphalt).mul(nightFactorNode()).mul(0.025);
  const farMat=new THREE.MeshStandardNodeMaterial({vertexColors:true,roughness:1});
  const core={x0:Terrain.originX,z0:Terrain.originZ,x1:Terrain.originX+(Terrain.w-1)*Terrain.cell,z1:Terrain.originZ+(Terrain.h-1)*Terrain.cell};
  const innerCore=core;
  const finePatches=(Terrain.patches||[]).filter(p=>p.rect&&p.step<C.step).map(p=>({
    x0:p.x0,z0:p.z0,x1:p.x0+(p.nx-1)*p.step,z1:p.z0+(p.nz-1)*p.step
  }));
  const cutRects=[core,...finePatches];
  const inRect=(x,z,b)=>x>=b.x0&&x<=b.x1&&z>=b.z0&&z<=b.z1;
  const sample=(g,x,z)=>{
    const u=Math.max(0,Math.min(g.w-1,(x-g.x0)/g.step)),v=Math.max(0,Math.min(g.h-1,(z-g.z0)/g.step));
    const i=Math.min(g.w-2,Math.floor(u)),j=Math.min(g.h-2,Math.floor(v)),a=u-i,b=v-j,k=j*g.w+i,q=g.heights;
    return(q[k]*(1-a)+q[k+1]*a)*(1-b)+(q[k+g.w]*(1-a)+q[k+g.w+1]*a)*b;
  };
  const terrain=[];
  function geometry(g,t,stride,far){
    const n=Math.ceil((t.w-1)/stride),row=n+1,vertices=row*row;
    // Construction stays Float64 through clipping; round only at the original final conversion.
    // These are call-local workspaces, not retained LOD caches. Grow only for clipped polygons.
    let pos=new Float64Array((vertices+row*4)*3),idx=new Uint32Array(n*n*6+n*24),
      positionCount=0,indexCount=0,maxIndex=0;
    const endX=t.x+Math.min(n*stride,t.w-1)*g.step,endZ=t.z+Math.min(n*stride,t.h-1)*g.step;
    // A cut disjoint from the entire grid cannot affect any of its triangles or clipped pieces.
    const tileCuts=far?[]:cutRects.filter(r=>endX>r.x0&&t.x<r.x1&&endZ>r.z0&&t.z<r.z1);
    const color=far?new Float32Array(pos.length):null;
    const reservePositions=count=>{
      if(count<=pos.length)return;
      const grown=new Float64Array(Math.max(count,pos.length*2));grown.set(pos);pos=grown;
    };
    const indices=(a,b,c)=>{
      if(indexCount+3>idx.length){const grown=new Uint32Array(Math.max(indexCount+3,idx.length*2));grown.set(idx);idx=grown;}
      idx[indexCount++]=a;idx[indexCount++]=b;idx[indexCount++]=c;
      maxIndex=Math.max(maxIndex,a,b,c);
    };
    const green=new THREE.Color(0x667553),rock=new THREE.Color(0x797569),shade=new THREE.Color();
    const ys=new Uint8Array(vertices),hide=new Uint8Array(vertices);
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
      const x=t.x+Math.min(i*stride,t.w-1)*g.step,z=t.z+Math.min(j*stride,t.h-1)*g.step;
      let y=sample(g,x,z);const insideCity=inRect(x,z,C);
      if(far&&insideCity)y=sample(C,x,z)-0.2;
      const wet=y<=water+0.05;if(wet)y=water-4;
      const k=j*row+i;ys[k]=wet;hide[k]=far?insideCity:inRect(x,z,innerCore);
      pos[positionCount++]=x;pos[positionCount++]=y;pos[positionCount++]=z;
      if(far){shade.copy(green).lerp(rock,Math.min(1,Math.max(0,y-200)/600));color[k*3]=shade.r;color[k*3+1]=shade.g;color[k*3+2]=shade.b;}
    }
    const clip = (poly, distance) => {
      const out=[];
      for(let i=0,j=poly.length-1;i<poly.length;j=i++){
        const a=poly[j],b=poly[i],da=distance(a),db=distance(b);
        if((da<0)!==(db<0)){const t=da/(da-db);out.push(a.map((v,k)=>v+(b[k]-v)*t));}
        if(db>=0)out.push(b);
      }
      return out;
    };
    const triangle = (a,b,c) => {
      if(!tileCuts.length){indices(a,b,c);return;}
      const x0=Math.min(pos[a*3],pos[b*3],pos[c*3]),x1=Math.max(pos[a*3],pos[b*3],pos[c*3]);
      const z0=Math.min(pos[a*3+2],pos[b*3+2],pos[c*3+2]),z1=Math.max(pos[a*3+2],pos[b*3+2],pos[c*3+2]);
      let overlaps=false;
      for(const r of tileCuts)if(x1>r.x0&&x0<r.x1&&z1>r.z0&&z0<r.z1){overlaps=true;break;}
      // Most triangles miss every cut. Allocate polygons only for the original clipping path.
      if(!overlaps){indices(a,b,c);return;}
      let pieces=[[pos.slice(a*3,a*3+3),pos.slice(b*3,b*3+3),pos.slice(c*3,c*3+3)]],changed=false;
      // Alcatraz's fine committed patch is authoritative too; do not draw a coarse city lid over it.
      for(const cut of tileCuts){
        const next=[];
        for(let inside of pieces){
          if(inside.every(p=>p[0]<=cut.x0)||inside.every(p=>p[0]>=cut.x1)||inside.every(p=>p[2]<=cut.z0)||inside.every(p=>p[2]>=cut.z1)){
            next.push(inside);continue;
          }
          changed=true;
          for(const d of [p=>p[0]-cut.x0,p=>cut.x1-p[0],p=>p[2]-cut.z0,p=>cut.z1-p[2]]){
            if(inside.length<3)break;
            const outside=clip(inside,p=>-d(p));
            if(outside.length>=3)next.push(outside);
            inside=clip(inside,d);
          }
        }
        pieces=next;
      }
      if(!changed){indices(a,b,c);return;}
      for(const outside of pieces){
        const base=positionCount/3;reservePositions(positionCount+outside.length*3);
        for(const p of outside){pos[positionCount++]=p[0];pos[positionCount++]=p[1];pos[positionCount++]=p[2];}
        for(let i=1;i+1<outside.length;i++)indices(base,base+i,base+i+1);
      }
    };
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      const k=j*row+i,a=k+1,b=k+row,c=b+1;
      if((ys[k]&&ys[a]&&ys[b]&&ys[c])||(hide[k]&&hide[a]&&hide[b]&&hide[c]))continue;
      triangle(k,b,a);triangle(a,b,c);
    }
    // Skirts hide the cracks between neighboring levels of detail.
    for(const edge of [Array.from({length:row},(_,i)=>i),Array.from({length:row},(_,i)=>n*row+i),Array.from({length:row},(_,i)=>i*row),Array.from({length:row},(_,i)=>i*row+n)]){
      const base=positionCount/3;reservePositions(positionCount+row*3);
      for(const k of edge){
        const offset=positionCount;pos[positionCount++]=pos[k*3];pos[positionCount++]=pos[k*3+1]-Math.max(3,g.step*stride/2);pos[positionCount++]=pos[k*3+2];
        if(far){color[offset]=color[k*3];color[offset+1]=color[k*3+1];color[offset+2]=color[k*3+2];}
      }
      for(let i=0;i<n;i++){indices(edge[i],base+i,edge[i+1]);indices(edge[i+1],base+i,base+i+1);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos.subarray(0,positionCount),3));
    // Match Three's arrayNeedsUint32 (65535 itself also selects Uint32); keep exact-sized owned outputs.
    const Index=maxIndex>=65535?THREE.Uint32BufferAttribute:THREE.Uint16BufferAttribute;
    geo.setIndex(new Index(idx.subarray(0,indexCount),1));if(far)geo.setAttribute('color',new THREE.Float32BufferAttribute(color,3));computeRegionVertexNormals(geo);geo.computeBoundingSphere();return geo;
  }
  for(const [g,far]of[[C,false],[H,true]])for(const t of g.tiles){
    const bounds={x0:t.x,z0:t.z,x1:t.x+t.size,z1:t.z+t.size},exclude=far?C:innerCore;
    if(inRect(bounds.x0,bounds.z0,exclude)&&inRect(bounds.x1,bounds.z1,exclude))continue;
    const stride=far?1:4,mesh=new THREE.Mesh(geometry(g,t,stride,far),far?farMat:groundMat);
    mesh.name=far?'SFHorizonTerrain':'SFRegionTerrain';mesh.receiveShadow=!far;mesh.castShadow=false;group.add(mesh);terrain.push({g,t,far,stride,mesh,geometries:new Map([[stride,mesh.geometry]])});
  }
  // Dashed centre paint follows measured centreline geometry. Marking style is an estimate at this tier.
  const roadCells=new Map(),paintMat=new THREE.MeshBasicNodeMaterial({color:0xc6b67d,alphaTest:.5});
  paintMat.opacityNode=step(.45,fract(texUV().x)).mul(select(kind.equal(float(1)),float(1),float(0)));
  for(let k=0;k<data.roads.length;k+=4){
    const ax=data.roads[k],az=data.roads[k+1],bx=data.roads[k+2],bz=data.roads[k+3],length=Math.hypot(bx-ax,bz-az);
    if(length<.1)continue;
    const dx=(bx-ax)/length,dz=(bz-az)/length,n=Math.ceil(length/16);
    for(let i=0;i<n;i++){
      // Authored former-street pavement suppresses only its dashed paint. Source
      // linework, ground, vehicle routes and UV distance elsewhere stay unchanged.
      const intervals=paintIntervals?paintIntervals(ax,az,dx,dz,i*length/n,(i+1)*length/n):[[i*length/n,(i+1)*length/n]];
      for(const [a,b]of intervals){
      const x=ax+dx*(a+b)/2,z=az+dz*(a+b)/2;
      if(inRect(x,z,{x0:core.x0-32,z0:core.z0-32,x1:core.x1+32,z1:core.z1+32})||sample(C,x,z)<=water+.05)continue;
      const key=Math.floor(x/1200)+','+Math.floor(z/1200);
      if(!roadCells.has(key))roadCells.set(key,{pos:[],uv:[]});const cell=roadCells.get(key);
      for(const [distance,side]of[[a,-1],[a,1],[b,-1],[a,1],[b,1],[b,-1]]){
        const px=ax+dx*distance-dz*.12*side,pz=az+dz*distance+dx*.12*side;
        cell.pos.push(px,sample(C,px,pz)+.08,pz);cell.uv.push(distance/8,(side+1)/2);
      }
      }
    }
  }
  const roadMeshes=[];
  for(const [key,cell]of roadCells){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(cell.pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(cell.uv,2));geo.computeBoundingSphere();const mesh=new THREE.Mesh(geo,paintMat);mesh.name='SFRegionRoadPaint:'+key;group.add(mesh);roadMeshes.push(mesh);}
  roadCells.clear();
  const buildings=[],palette=[[0.82,0.78,0.67],[0.7,0.73,0.72],[0.74,0.64,0.52],[0.65,0.72,0.65],[0.8,0.8,0.78]];
  for(const file of data.buildings){const h=file.header,q=file.records;for(let k=0;k<q.length;k+=7){const base=q[k+2]*0.1;buildings.push({x:h.originX+q[k]*0.1,z:h.originZ+q[k+1]*0.1,y:base-1,h:Math.max(1,(q[k+3]-q[k+2])*0.1+1),w:q[k+4]*0.1,d:q[k+5]*0.1,rot:q[k+6]*0.0001,seed:(k/7+1)*0.137,tint:palette[(k/7)%palette.length],style:0});}}
  const buildingCount=buildings.length;
  for (const b of buildings) ride?.addBox({ x: b.x, y: b.y + b.h / 2, z: b.z },
    { x: b.w / 2, y: b.h / 2, z: b.d / 2 }, b.rot, { support: false });
  const buildingMeshes=buildBuildingChunks(buildings,createBoroughBuildingMaterial(),1200,'SFRegionBuildings');
  buildings.length=0;
  for(const mesh of buildingMeshes)group.add(mesh);
  const treeGroups=new Map();for(let k=0;k<data.trees.length;k+=4){const x=data.trees[k],z=data.trees[k+2],key=Math.floor(x/1200)+','+Math.floor(z/1200);if(!treeGroups.has(key))treeGroups.set(key,[]);treeGroups.get(key).push(k);}
  const matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(),position=new THREE.Vector3();
  const regionTrees=buildRegionalTrees(data,M,group);group.userData.treePool=regionTrees.stats;
  const treeMeshes=[];
  for(const [key,ks]of treeGroups){
    for(let i=0;i<ks.length;i++){
      const k=ks[i],h=data.trees[k+3],x=data.trees[k],y=data.trees[k+1],z=data.trees[k+2];
      // Physical trunks are unchanged: the drawn far trunk (and the near species trunk) cover this prism.
      const radius=Math.max(.08,h*.022),height=h*.5;
      ride?.addPrism(Array.from({length:8},(_,j)=>({x:x+Math.sin(j*Math.PI/4)*radius,z:z+Math.cos(j*Math.PI/4)*radius})),
        y,y+height,{support:false});
    }
    const mesh=regionTrees.farChunk(ks);mesh.name='SFRegionTrees:'+key;group.add(mesh);treeMeshes.push(mesh);
  }
  // Boats follow mapped ferry routes. Models, speeds and cargo anchorage movement are scenery estimates.
  const boats=[];
  const hullMat=new THREE.MeshStandardNodeMaterial({color:0x214356,roughness:.55}),cabinMat=new THREE.MeshStandardNodeMaterial({color:0xe6e7dd,roughness:.6}),glassMat=new THREE.MeshStandardNodeMaterial({color:0x253a43,roughness:.25});
  const boatBox=new THREE.BoxGeometry(1,1,1);
  const part=(parent,mat,x,y,z,w,h,d)=>{const mesh=new THREE.Mesh(boatBox,mat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);};
  for(let n=0;n<data.manifest.ferries.length;n++){
    const route=data.manifest.ferries[n],boat=new THREE.Group();boat.name=route.name;
    part(boat,hullMat,-4,1,0,2,3,30);part(boat,hullMat,4,1,0,2,3,30);
    part(boat,cabinMat,0,3,0,10,2,26);part(boat,glassMat,0,5,-2,9,2,18);part(boat,cabinMat,0,6.2,-2,10,.5,20);
    group.add(boat);const lengths=[0];for(let i=1;i<route.pts.length;i++)lengths.push(lengths.at(-1)+Math.hypot(route.pts[i][0]-route.pts[i-1][0],route.pts[i][1]-route.pts[i-1][1]));
    boats.push({boat,route,lengths,length:lengths.at(-1),phase:n*.21});
  }
  const cargo=[];const cargoMat=new THREE.MeshStandardNodeMaterial({color:0x383f43,roughness:.85});
  const containerMats=[0x9c5146,0x4d6575,0xa89973].map(color=>new THREE.MeshStandardNodeMaterial({color,roughness:.9}));
  for(const [x,z]of data.manifest.cargo){const ship=new THREE.Group();ship.name='Container ship';part(ship,cargoMat,0,4,0,30,10,180);part(ship,cabinMat,0,17,-65,26,18,20);
    for(let tint=0;tint<3;tint++){
      const entries=[];
      for(let row=0;row<7;row++)for(let col=0;col<4;col++)for(let level=0;level<2;level++)if((row+col+level)%3===tint)entries.push([(col-1.5)*6.2,11+level*3,-40+row*17]);
      const mesh=new THREE.InstancedMesh(boatBox,containerMats[tint],entries.length);
      for(let i=0;i<entries.length;i++){matrix.compose(position.set(...entries[i]),quat,scale.set(6,3,16));mesh.setMatrixAt(i,matrix);}
      mesh.computeBoundingSphere();ship.add(mesh);
    }
    ship.position.set(x,water,z);group.add(ship);cargo.push({ship,x,z});
  }
  const foamPos=[];
  for(const pier of window.NYC.WATERFRONT_PIERS || [])for(let i=0;i<pier.ring.length;i++){
    const a=pier.ring[i],b=pier.ring[(i+1)%pier.ring.length],L=Math.hypot(b.x-a.x,b.z-a.z);if(!L)continue;
    const dx=-(b.z-a.z)/L*.7,dz=(b.x-a.x)/L*.7,y=water+.04;
    foamPos.push(a.x-dx,y,a.z-dz,b.x-dx,y,b.z-dz,a.x+dx,y,a.z+dz,a.x+dx,y,a.z+dz,b.x-dx,y,b.z-dz,b.x+dx,y,b.z+dz);
  }
  const foamMat=new THREE.MeshBasicNodeMaterial({color:0xc4d1c7,transparent:true,opacity:.26,depthWrite:false,side:THREE.DoubleSide});
  foamMat.opacityNode=sin(positionWorld.x.mul(.8).add(positionWorld.z.mul(.7)).add(cityUniforms.uTime || window.NYC.TSL.time)).mul(.1).add(.16);
  const foamGeo=new THREE.BufferGeometry();foamGeo.setAttribute('position',new THREE.Float32BufferAttribute(foamPos,3));group.add(new THREE.Mesh(foamGeo,foamMat));

  let last=-Infinity, buildingDistance=8500, treeDistance=6000;
  const lastRider={x:Infinity,z:Infinity};
  let disposed=false;
  // Terminal teardown after render/compile readers drain. Scene traversal owns attached geometry;
  // this owner releases the otherwise unreachable visited-stride variants, without double disposal.
  // No runtime eviction: retain exact LOD selection and avoid unmeasured regeneration stalls.
  function disposeTerrainCache(){
    if(disposed)return;
    disposed=true;
    for(const item of terrain){
      for(const cached of item.geometries.values())if(cached!==item.mesh.geometry)cached.dispose();
      item.geometries.clear();
    }
  }
  return {group,disposeTerrainCache,setQuality(distance, trees){buildingDistance=distance;treeDistance=trees;last=-Infinity;},stats:()=>({buildings:buildingCount,trees:data.trees.length/4,terrainTiles:terrain.length}),update(camera,elapsed,playerPosition=camera.position){
    if(disposed)return;
    for(const b of boats){
      const cycle=(elapsed*b.route.speed+b.length*b.phase)%(2*b.length),forward=cycle<b.length,d=forward?cycle:2*b.length-cycle;
      let i=1;while(i<b.lengths.length-1&&b.lengths[i]<d)i++;
      const a=b.route.pts[i-1],c=b.route.pts[i],u=(d-b.lengths[i-1])/Math.max(.01,b.lengths[i]-b.lengths[i-1]);
      b.boat.position.set(a[0]+(c[0]-a[0])*u,water+Math.sin(elapsed*1.2+b.phase)*.12,a[1]+(c[1]-a[1])*u);
      b.boat.rotation.y=Math.atan2(c[0]-a[0],c[1]-a[1])+(forward?0:Math.PI);
    }
    for(const c of cargo)c.ship.position.z=c.z+Math.sin(elapsed*.003)*80;
    const rider=playerPosition.position||playerPosition,moved=Math.hypot(rider.x-lastRider.x,rider.z-lastRider.z)>100;
    if(elapsed-last<0.75&&!moved)return;last=elapsed;lastRider.x=rider.x;lastRider.z=rider.z;
    for(const item of terrain){if(item.far)continue;const d=Math.hypot(camera.position.x-item.t.x-item.t.size/2,camera.position.z-item.t.z-item.t.size/2);
      const rd=Math.hypot(Math.max(item.t.x-rider.x,0,rider.x-item.t.x-item.t.size),Math.max(item.t.z-rider.z,0,rider.z-item.t.z-item.t.size));
      const stride=rd<250||d<1600?1:d<4500?2:4;if(stride!==item.stride){if(!item.geometries.has(stride))item.geometries.set(stride,geometry(item.g,item.t,stride,false));item.mesh.geometry=item.geometries.get(stride);item.stride=stride;}}
    for(const mesh of roadMeshes){const c=mesh.geometry.boundingSphere.center;mesh.visible=Math.hypot(camera.position.x-c.x,camera.position.z-c.z)<3000;}
    for(const mesh of buildingMeshes){const c=mesh.boundingSphere.center;mesh.visible=Math.hypot(camera.position.x-c.x,camera.position.z-c.z)<buildingDistance;}
    regionTrees.update(camera.position);
    for(const mesh of treeMeshes){const c=mesh.geometry.boundingSphere.center;mesh.visible=Math.hypot(camera.position.x-c.x,camera.position.z-c.z)<treeDistance;}
  }};
}
// =====================================================================================================================
// Regional trees. Within NEAR_RADIUS of the camera: the downtown street trees' own species geometry and material
// (trees.js, shared), regrouped every NEAR_STEP m (level 0 near, casting shadows; level 2 beyond). Elsewhere: one
// 28-triangle tree per instance (a square trunk and a smooth, lumpy icosahedron crown shaped by its species: base, width,
// cone) in ONE draw per 1200 m chunk, positioned entirely in the vertex shader from 36 bytes of instance data (no
// instance matrices), and collapsed where the near pool draws the tree. Positions, heights and physical trunks are
// data/region/trees.bin's, unchanged; species, yaw and size jitter are deterministic visual estimates from
// each tree's position (the regional data carries no species).
// =====================================================================================================================
const { cos, normalize, uniform, transformNormalToView } = window.NYC.TSL;
// Full species detail within trees.js's LOD_NEAR (105 m), its whole-crown level 2 beyond, to NEAR_RADIUS. One variant
// per species and no middle level: every pool is a draw (and a shadow-cascade draw for level 0), so 12 pools, not 30.
const NEAR_RADIUS = 520, NEAR_FULL = 105, NEAR_STEP = 40, NEAR_CELL = 100, NEAR_MAX_ABOVE = 350;
// trees.js species (0 plane, 1 locust, 2 elm, 3 ficus, 4 palm, 5 conifer) per regional source. Street inventory: the
// class shares of the 27,918 core DataSF street trees (js/sf-geodata.js, tools/tree-classes.json); forest and park
// canopy (land-cover estimates in tools/geo-region.mjs): visual estimates.
const REGION_SPECIES = {
  inventory: [[3, 0.428], [0, 0.221], [2, 0.196], [1, 0.099], [4, 0.029], [5, 0.027]],
  forest: [[3, 0.45], [5, 0.35], [2, 0.2]], // eucalyptus, cypress & pine stands: dense evergreen, conifer, tall broadleaf
  park: [[0, 0.3], [2, 0.3], [3, 0.25], [1, 0.15]]
};
// [crown base, top, crown radius] (m, scale 1) of trees.js's level-2 species trees, for runs without trees.js (tests)
const FALLBACK_TREE_SHAPES = [[3.9, 12.6, 6], [1.5, 9.8, 5.4], [4.4, 13.5, 7.5], [0.9, 7.4, 4.5], [6.1, 12.3, 4.9], [1.4, 11.6, 5.4]];
const hashTree = (x, z, s) => { const v = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };

// Unit far tree: crown = icosahedron (y -1..1, radially jittered 0.88..1, smooth outward normals, brighter on top);
// trunk = square prism (y 0..1) whose inscribed circle has radius 1, so it encloses the octagonal physical trunk.
// aFarPart: x = 0 trunk / 1 crown, y = baked occlusion.
function farTreeGeometry() {
  const t = (1 + Math.sqrt(5)) / 2;
  const ico = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  const faces = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  const pos = [], nrm = [], part = [], idx = [];
  ico.forEach(([x, y, z], i) => {
    const l = Math.hypot(x, y, z), r = 0.88 + 0.12 * hashTree(i, 3.1, 0.7);
    pos.push(x / l * r, y / l * r, z / l * r); nrm.push(x / l, y / l, z / l); part.push(1, 0.5 + 0.5 * (y / l * 0.5 + 0.5));
  });
  idx.push(...faces);
  for (let j = 0; j < 8; j++) {
    const a = Math.PI / 4 + (j % 4) * Math.PI / 2;
    pos.push(Math.cos(a) * Math.SQRT2, j < 4 ? 0 : 1, Math.sin(a) * Math.SQRT2); nrm.push(Math.cos(a), 0, Math.sin(a)); part.push(0, 0.75);
  }
  for (let j = 0; j < 4; j++) { const b0 = 12 + j, b1 = 12 + (j + 1) % 4; idx.push(b0, b0 + 4, b1, b1, b0 + 4, b1 + 4); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aFarPart', new THREE.Float32BufferAttribute(part, 2));
  g.setIndex(idx);
  return g;
}

// Far tree shading follows trees.js / createTreeMaterial: per-tree linear tint at the leaf atlas's mean brightness,
// crown occlusion, the foliage lighting model's light through the leaves, and the canyon sky-visibility curve taken
// from the height above the tree's base (tsl-materials.js treeLocalSkyAO). Opaque and front-faced: no alpha test.
// aFarPos (x, base y, z, height), aFarShape (yaw, crown base / height, crown radius / height, cone 0..1),
// aFarTint (unorm8 linear rgb). Instances within `radius` of `center` (xz) collapse to a point (drawn by the near pool).
function createFarTreeMaterial(center, radius) {
  const Mat = window.NYC.TreeNodeMaterial || THREE.MeshStandardNodeMaterial;
  const mat = new Mat({ roughness: 0.75, metalness: 0 });
  const P = attribute('aFarPos', 'vec4'), S = attribute('aFarShape', 'vec4'), C = attribute('aFarTint', 'vec4');
  const part = attribute('aFarPart', 'vec2'), isCrown = part.x, ao = part.y;
  const g = positionGeometry, n = normalGeometry;
  const h = P.w, base = S.y.mul(h), crownH = h.sub(base), rc = S.z.mul(h);
  const t = g.y.mul(0.5).add(0.5);
  const width = rc.mul(mix(float(1), float(1.7).mul(float(1).sub(t)).add(0.15), S.w));
  const trunkR = max(h.mul(0.022), 0.08);
  const crownP = vec3(g.x.mul(width), base.add(crownH.mul(t)), g.z.mul(width));
  // (up into the crown and at least to the physical prism's top, h / 2)
  const trunkP = vec3(g.x.mul(trunkR), g.y.mul(max(base.add(crownH.mul(0.3)), h.mul(0.5))), g.z.mul(trunkR));
  const local = mix(trunkP, crownP, isCrown);
  const cs = cos(S.x), sn = sin(S.x);
  const yaw = (v) => vec3(cs.mul(v.x).add(sn.mul(v.z)), v.y, cs.mul(v.z).sub(sn.mul(v.x)));
  const d = P.xz.sub(center);
  mat.positionNode = mix(P.xyz, yaw(local).add(P.xyz), step(radius.mul(radius), dot(d, d)));
  // Ellipsoid shell normals tipped skyward like trees.js's crown shell; the trunk keeps its radial normals
  const crownN = normalize(normalize(vec3(n.x.div(width), n.y.div(crownH.mul(0.5)), n.z.div(width))).add(vec3(0, 0.22, 0)));
  const worldN = varying(yaw(mix(n, crownN, isCrown)), 'vFarTreeNormal');
  mat.normalNode = transformNormalToView(worldN).normalize();
  const above = varying(local.y, 'vFarTreeHeight');
  const bark = new THREE.Color(0x4a3f31);
  const leaf = C.rgb.mul(1.05).mul(ao.mul(0.45).add(0.55));
  mat.colorNode = mix(vec3(bark.r, bark.g, bark.b).mul(ao.mul(0.4).add(0.6)), leaf, isCrown);
  mat.roughnessNode = mix(float(0.93), float(0.66), isCrown);
  mat.aoNode = mix(float(0.44), float(1.0), smoothstep(0.0, 68.0, above)).mul(smoothstep(0.0, 7.5, above).mul(0.22).add(0.78))
    .mul(ao.mul(0.75).add(0.25));
  mat.translucencyNode = C.rgb.mul(vec3(1.0, 1.2, 0.45)).mul(1.05).mul(ao.mul(0.8).add(0.2)).mul(isCrown);
  return mat;
}

function buildRegionalTrees(data, M, group) {
  const T = data.trees, count = T.length / 4, inventory = data.manifest.trees?.counts?.inventory ?? count;
  const NYC = window.NYC, assets = NYC.getTreeAssets ? NYC.getTreeAssets() : null, SPECIES = NYC.TREE_SPECIES;
  // Far crown proportions from the species' level-2 trees: a solid crown a little inside the leaf cards' extent
  const shapes = FALLBACK_TREE_SHAPES.map(([b, top, r], s) => {
    if (assets) {
      const geo = assets.geos[s][0][2], p = geo.attributes.position.array, a = geo.attributes.aTree.array;
      b = Infinity; top = 0; r = 0;
      for (let i = 0; i < p.length / 3; i++) {
        top = Math.max(top, p[i * 3 + 1]);
        if (a[i * 4] > 0.5) { b = Math.min(b, p[i * 3 + 1]); r = Math.max(r, Math.hypot(p[i * 3], p[i * 3 + 2])); }
      }
    }
    return { top, base: (b + (top - b) * 0.12) / top, radius: r * 0.72 / top, cone: s === 5 ? 1 : 0 };
  });
  const tintOf = (s, r3, r1, out) => {
    out.setHex(SPECIES ? SPECIES[s].tints[Math.floor(r3 * 2.999)] : 0x486745).multiplyScalar(0.82 + r1 * 0.36);
    return out;
  };
  // Per-tree visual parameters (deterministic from the position; r1..r3 as trees.js's per-site jitter)
  const info = { species: 0, yaw: 0, sy: 1, sxz: 1, r1: 0, r2: 0, r3: 0 };
  function treeInfo(i) {
    const k = i * 4, x = T[k], z = T[k + 2], h = T[k + 3];
    const r1 = hashTree(x, z, 1.3), r2 = hashTree(z, x, 7.1), r3 = hashTree(x + z, 0.7, 3.3), r4 = hashTree(x, z, 5.9);
    let shares = REGION_SPECIES.inventory;
    if (i >= inventory) {
      const mx = Math.floor((x - M.originX) / 4), mz = Math.floor((z - M.originZ) / 4);
      shares = mx >= 0 && mz >= 0 && mx < M.w && mz < M.h && data.mask[mz * M.w + mx] === 5 ? REGION_SPECIES.forest : REGION_SPECIES.park;
    }
    let s = shares[shares.length - 1][0];
    for (let a = 0, acc = 0; a < shares.length; a++) { acc += shares[a][1]; if (r4 < acc) { s = shares[a][0]; break; } }
    info.species = s; info.yaw = r2 * Math.PI * 2;
    info.sy = h / shapes[s].top; info.sxz = info.sy * (0.9 + r3 * 0.2); info.r1 = r1; info.r2 = r2; info.r3 = r3;
    return info;
  }
  const speciesOf = new Uint8Array(count);
  for (let i = 0; i < count; i++) speciesOf[i] = treeInfo(i).species;

  const farGeo = farTreeGeometry();
  const nearCenter = uniform(new THREE.Vector2(1e9, 1e9)), nearRadius = uniform(0);
  const farMat = createFarTreeMaterial(nearCenter, nearRadius);
  farMat.name = 'SFRegionFarTrees';
  const tint = new THREE.Color();
  // One draw for the trees at data offsets `ks` (k = 4 * index)
  function farChunk(ks) {
    const n = ks.length, pos = new Float32Array(n * 4), shape = new Float32Array(n * 4), col = new Uint8Array(n * 4);
    const box = new THREE.Box3(), p = new THREE.Vector3();
    for (let j = 0; j < n; j++) {
      const i = ks[j] / 4, k = ks[j], x = T[k], y = T[k + 1], z = T[k + 2], h = T[k + 3];
      const { species: s, yaw, sy, sxz, r1, r3 } = treeInfo(i), sh = shapes[s];
      pos[j * 4] = x; pos[j * 4 + 1] = y; pos[j * 4 + 2] = z; pos[j * 4 + 3] = h;
      shape[j * 4] = yaw; shape[j * 4 + 1] = sh.base; shape[j * 4 + 2] = sh.radius * sxz / sy; shape[j * 4 + 3] = sh.cone;
      tintOf(s, r3, r1, tint);
      col[j * 4] = Math.min(255, Math.round(tint.r * 255)); col[j * 4 + 1] = Math.min(255, Math.round(tint.g * 255));
      col[j * 4 + 2] = Math.min(255, Math.round(tint.b * 255)); col[j * 4 + 3] = 255;
      box.expandByPoint(p.set(x - h * 0.5, y, z - h * 0.5)); box.expandByPoint(p.set(x + h * 0.5, y + h * 1.05, z + h * 0.5));
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(farGeo.index);
    for (const name of ['position', 'normal', 'aFarPart']) geo.setAttribute(name, farGeo.attributes[name]);
    geo.setAttribute('aFarPos', new THREE.InstancedBufferAttribute(pos, 4));
    geo.setAttribute('aFarShape', new THREE.InstancedBufferAttribute(shape, 4));
    geo.setAttribute('aFarTint', new THREE.InstancedBufferAttribute(col, 4, true));
    geo.instanceCount = n;
    geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geo, farMat);
    mesh.castShadow = false; mesh.receiveShadow = false;
    return mesh;
  }

  // ---- Near pool (needs trees.js's shared species geometry) ----
  const stats = { nearRadius: 0, nearInstances: 0, regroups: 0, pools: 0, capacity: 0 };
  let regroup = null;
  if (assets && count) {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let k = 0; k < T.length; k += 4) { minX = Math.min(minX, T[k]); maxX = Math.max(maxX, T[k]); minZ = Math.min(minZ, T[k + 2]); maxZ = Math.max(maxZ, T[k + 2]); }
    const gw = Math.floor((maxX - minX) / NEAR_CELL) + 1, gh = Math.floor((maxZ - minZ) / NEAR_CELL) + 1;
    const cellOf = (i) => Math.floor((T[i * 4 + 2] - minZ) / NEAR_CELL) * gw + Math.floor((T[i * 4] - minX) / NEAR_CELL);
    const start = new Int32Array(gw * gh + 1), members = new Int32Array(count);
    for (let i = 0; i < count; i++) start[cellOf(i) + 1]++;
    for (let c = 0; c < gw * gh; c++) start[c + 1] += start[c];
    const cursor = start.slice(0, gw * gh);
    for (let i = 0; i < count; i++) members[cursor[cellOf(i)]++] = i;
    // Capacity: the most trees any W x W block of cells holds (W cells cover a disk of radius r wherever it is centred)
    const sums = new Int32Array((gw + 1) * (gh + 1));
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const c = j * gw + i;
      sums[(j + 1) * (gw + 1) + i + 1] = start[c + 1] - start[c] + sums[j * (gw + 1) + i + 1] + sums[(j + 1) * (gw + 1) + i] - sums[j * (gw + 1) + i];
    }
    const densest = (r) => {
      const w = Math.ceil(2 * r / NEAR_CELL) + 1;
      let best = 0;
      for (let j = 0; j <= Math.max(0, gh - w); j++) for (let i = 0; i <= Math.max(0, gw - w); i++) {
        const j1 = Math.min(gh, j + w), i1 = Math.min(gw, i + w);
        best = Math.max(best, sums[j1 * (gw + 1) + i1] - sums[j * (gw + 1) + i1] - sums[j1 * (gw + 1) + i] + sums[j * (gw + 1) + i]);
      }
      return best;
    };
    const totals = new Int32Array(6);
    for (let i = 0; i < count; i++) totals[speciesOf[i]]++;
    const capFar = densest(NEAR_RADIUS), capFull = densest(NEAR_FULL);
    const material = assets.regionalMaterial, pools = [], lod0 = new Array(6).fill(null), lod2 = new Array(6).fill(null);
    const makePool = (geo, cap, name, shadow) => {
      if (cap <= 0) return null;
      const g = new THREE.BufferGeometry();
      for (const a of Object.keys(geo.attributes)) g.setAttribute(a, geo.attributes[a]);
      g.setIndex(geo.index);
      g.boundingSphere = geo.boundingSphere;
      g.setAttribute('aTreeData', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
      const mesh = new THREE.InstancedMesh(g, material, cap);
      mesh.name = name; mesh.castShadow = shadow; mesh.receiveShadow = true;
      // One zero-scale instance until the first regroup, so the startup precompile sees the pipeline (as trees.js does)
      mesh.instanceMatrix.array.fill(0, 0, 16); mesh.count = 1; mesh.visible = true;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      group.add(mesh); pools.push(mesh); stats.capacity += cap;
      return mesh;
    };
    for (let s = 0; s < 6; s++) {
      const name = SPECIES[s].name;
      lod2[s] = makePool(assets.geos[s][0][2], Math.min(totals[s], capFar), `SFRegionTrees_${name}_lod2`, false);
      lod0[s] = makePool(assets.geos[s][0][0], Math.min(totals[s], capFull), `SFRegionTrees_${name}_lod0`, true);
    }
    stats.pools = pools.length;
    const counts = new Int32Array(pools.length), poolIndex = new Map(pools.map((m, i) => [m, i]));
    const bmin = new Float64Array(pools.length * 3), bmax = new Float64Array(pools.length * 3);
    regroup = (cx, cy, cz) => {
      const above = cy - (Terrain && Terrain.loaded ? Terrain.groundAt(cx, cz) : 0);
      const R = above > NEAR_MAX_ABOVE ? 0 : NEAR_RADIUS, R2 = R * R, F2 = NEAR_FULL * NEAR_FULL;
      counts.fill(0); bmin.fill(Infinity); bmax.fill(-Infinity);
      if (R > 0) {
        const i0 = Math.max(0, Math.floor((cx - R - minX) / NEAR_CELL)), i1 = Math.min(gw - 1, Math.floor((cx + R - minX) / NEAR_CELL));
        const j0 = Math.max(0, Math.floor((cz - R - minZ) / NEAR_CELL)), j1 = Math.min(gh - 1, Math.floor((cz + R - minZ) / NEAR_CELL));
        for (let j = j0; j <= j1; j++) for (let ci = i0; ci <= i1; ci++) {
          const c = j * gw + ci;
          for (let m = start[c]; m < start[c + 1]; m++) {
            const i = members[m], k = i * 4, x = T[k], y = T[k + 1], z = T[k + 2], h = T[k + 3];
            const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
            if (d2 >= R2) continue;
            const dy = y + h * 0.5 - cy, s = speciesOf[i];
            const mesh = d2 + dy * dy < F2 ? lod0[s] : lod2[s];
            const pi = poolIndex.get(mesh), n = counts[pi]++;
            const { yaw, sy, sxz, r1, r2, r3 } = treeInfo(i), cs = Math.cos(yaw), sn = Math.sin(yaw);
            const e = mesh.instanceMatrix.array, o = n * 16;
            e[o] = cs * sxz; e[o + 1] = 0; e[o + 2] = -sn * sxz; e[o + 3] = 0;
            e[o + 4] = 0; e[o + 5] = sy; e[o + 6] = 0; e[o + 7] = 0;
            e[o + 8] = sn * sxz; e[o + 9] = 0; e[o + 10] = cs * sxz; e[o + 11] = 0;
            e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
            tintOf(s, r3, r1, tint);
            const td = mesh.geometry.attributes.aTreeData.array;
            td[n * 4] = tint.r; td[n * 4 + 1] = tint.g; td[n * 4 + 2] = tint.b; td[n * 4 + 3] = s + r2 * 0.999;
            const b = pi * 3, w = shapes[s].radius * h * 1.6;
            bmin[b] = Math.min(bmin[b], x - w); bmin[b + 1] = Math.min(bmin[b + 1], y); bmin[b + 2] = Math.min(bmin[b + 2], z - w);
            bmax[b] = Math.max(bmax[b], x + w); bmax[b + 1] = Math.max(bmax[b + 1], y + h * 1.1); bmax[b + 2] = Math.max(bmax[b + 2], z + w);
          }
        }
      }
      let total = 0;
      pools.forEach((mesh, pi) => {
        const n = counts[pi];
        total += n;
        if (n > 0) {
          // Upload just the instances in use. Resolve the attributes here: main.js swaps instanceMatrix for a storage
          // attribute on WebGPU.
          for (const attr of [mesh.instanceMatrix, mesh.geometry.attributes.aTreeData]) {
            attr.clearUpdateRanges(); attr.addUpdateRange(0, n * attr.itemSize); attr.needsUpdate = true;
          }
          const b = pi * 3, sphere = mesh.boundingSphere;
          sphere.center.set((bmin[b] + bmax[b]) / 2, (bmin[b + 1] + bmax[b + 1]) / 2, (bmin[b + 2] + bmax[b + 2]) / 2);
          sphere.radius = Math.hypot(bmax[b] - bmin[b], bmax[b + 1] - bmin[b + 1], bmax[b + 2] - bmin[b + 2]) / 2;
        }
        mesh.count = n; mesh.visible = n > 0;
      });
      // The far trees hide exactly the disk the pool draws, from the next render on
      nearCenter.value.set(cx, cz); nearRadius.value = R;
      stats.nearRadius = R; stats.nearInstances = total; stats.regroups++;
    };
  }
  let lastX = Infinity, lastY = Infinity, lastZ = Infinity;
  return {
    farChunk,
    stats: () => ({ ...stats }),
    update(p) {
      if (!regroup || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
      const y = Number.isFinite(p.y) ? p.y : 0, dx = p.x - lastX, dz = p.z - lastZ;
      if (dx * dx + dz * dz < NEAR_STEP * NEAR_STEP && Math.abs(y - lastY) < NEAR_STEP) return;
      lastX = p.x; lastY = y; lastZ = p.z;
      regroup(p.x, y, p.z);
    }
  };
}

Object.assign(window.NYC,{loadSFRegion,installRegionTerrain,buildSFRegion,decodeRegionRLE});
})();
