const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Evaluate the production TSL fog graph numerically, checking the integral against
// independent quadrature rather than copying the analytic formula into the test.
const vals = x => x instanceof N ? x.v : Array.isArray(x) ? x : [x];
const bin = (a,b,fn) => { a=vals(a);b=vals(b);return new N(Array.from({length:Math.max(a.length,b.length)},(_,i)=>fn(a[i%a.length],b[i%b.length]))); };
class N {
  constructor(v) { this.v=vals(v); }
  get x(){return new N(this.v[0]);} get y(){return new N(this.v[1]);} get z(){return new N(this.v[2]);} get rgb(){return this;} get xyz(){return new N(this.v.slice(0,3));} get w(){return new N(this.v[3]);}
  add(b){return bin(this,b,(x,y)=>x+y);} sub(b){return bin(this,b,(x,y)=>x-y);}
  mul(b){return bin(this,b,(x,y)=>x*y);} div(b){return bin(this,b,(x,y)=>x/y);}
  oneMinus(){return new N(1).sub(this);}
  negate(){return this.mul(-1);} toVar(){return new N([...this.v]);} assign(b){this.v=vals(b);return this;}
  greaterThan(b){return this.v[0]>vals(b)[0];} lessThan(b){return this.v[0]<vals(b)[0];}
  greaterThanEqual(b){return this.v[0]>=vals(b)[0];} lessThanEqual(b){return this.v[0]<=vals(b)[0];}
}
const unary = fn => x => new N(vals(x).map(fn));
const smooth = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t); };
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/lighting.js'),'utf8');
const start=source.indexOf('  createAerialFogNode('),end=source.indexOf('\n  bakeEnvironmentMap()',start);
const graph=vm.runInNewContext(`({${source.slice(start,end)}}).createAerialFogNode`,{
  Fn:fn=>fn, float:x=>new N(x), vec3:(...x)=>new N(x.flatMap(vals)),
  length:x=>new N(Math.hypot(...vals(x))), normalize:x=>x.div(Math.hypot(...vals(x))),
  max:(a,b)=>bin(a,b,Math.max), min:(a,b)=>bin(a,b,Math.min),
  exp:unary(Math.exp),abs:unary(Math.abs),sin:unary(Math.sin),
  clamp:(x,a,b)=>bin(bin(x,a,Math.max),b,Math.min),
  smoothstep:(a,b,x)=>new N(smooth(vals(a)[0],vals(b)[0],vals(x)[0])),
  mix:(a,b,t)=>new N(a).mul(new N(1).sub(t)).add(new N(b).mul(t)),
  select:(p,a,b)=>p?a:b, If:(p,fn)=>{if(p)fn();return {Else:other=>{if(!p)other();}};},
  pmremTexture:()=>new N([0.7,0.76,0.8])
});
function sample(point,eye,marine=1) {
  return graph.call({uMarine:new N(marine),uNightFactor:new N(0),uLayerTop:new N(200),uFogTime:new N(0),uFogDensity:new N(0.000084),uFogHeight:new N(900),envRenderTarget:{texture:{}}},new N(point),new N(eye)).amount.v[0];
}
test('marine fog integral matches quadrature below, across and above its ceiling',()=>{
  for(const [ya,yb] of [[10,10],[10,300],[300,10],[180,220],[250,400]]) {
    const eye=[-4000,yb,0],point=[-4000,ya,500],dist=Math.hypot(500,yb-ya);
    let mean=0;for(let i=0;i<10000;i++)mean+=1-smooth(160,240,ya+(yb-ya)*(i+0.5)/10000);mean/=10000;
    const west=1-smooth(-7000,-500,-4000),drift=Math.sin(-4000*.0008)*Math.sin(500*.0011)*.18+.82;
    const haze=.000084*dist*900/(yb+900);
    const expected=1-Math.exp(-dist*mean*(.0015+(.006-.0015)*west)*drift-haze*haze);
    assert.ok(Math.abs(sample(point,eye)-expected)<1e-7,`${ya},${yb}`);
  }
});
test('fog is finite at the eye and horizontal rays; density thins above the deck',()=>{
  for(const marine of [0,1])for(const y of [0,160,200,240,900]) {
    assert.equal(sample([0,y,0],[0,y,0],marine),0);
    const amount=sample([0,y,1000],[0,y,0],marine);assert.ok(Number.isFinite(amount)&&amount>=0&&amount<=1);
  }
  assert.ok(sample([0,300,500],[0,300,0])<sample([0,100,500],[0,100,0]));
});

// Evaluate the production reconstruction and the pinned helper bodies numerically. Projection,
// camera transforms and hardware-depth mapping are independent real Three matrix operations.
for (const backend of ['webgpu', 'webgl2']) for (const reversedDepthBuffer of [false, true]) {
  test(`${backend} ${reversedDepthBuffer ? 'reversed' : 'normal'} depth round-trips rotated/translated SF-height world points`, async () => {
    const THREE = await import('../vendor/three/build/three.core.js');
    const renderer = { coordinateSystem: backend === 'webgpu' ? THREE.WebGPUCoordinateSystem : THREE.WebGLCoordinateSystem,
      reversedDepthBuffer };
    const tsl = fs.readFileSync(require('node:path').join(__dirname, '../vendor/three/build/three.tsl.js'), 'utf8');
    const helperSource = name => {
      const start = tsl.indexOf(`const ${name} =`), end = tsl.indexOf('\n} );', start);
      assert.ok(start >= 0 && end > start, `pinned helper ${name}`);
      return tsl.slice(start, end + '\n} );'.length);
    };
    const vectors = { vec2: (...v) => new N(v.flatMap(vals)), vec3: (...v) => new N(v.flatMap(vals)), vec4: (...v) => new N(v.flatMap(vals)) };
    const helpers = vm.runInNewContext(`${helperSource('getViewPosition')}\n${helperSource('isBackgroundDepth')}\n({getViewPosition,isBackgroundDepth});`, {
      ...vectors, WebGPUCoordinateSystem: THREE.WebGPUCoordinateSystem,
      Fn: callback => (...inputs) => callback(inputs, { renderer })
    });
    const post = fs.readFileSync(require('node:path').join(__dirname, '../js/post-processing.js'), 'utf8');
    const start = post.indexOf('      const view ='), end = post.indexOf('      // Surface fog', start);
    assert.ok(start >= 0 && end > start);
    const reconstruct = vm.runInNewContext(`(screenUV,depth,inverseProjection,cameraWorld)=>{${post.slice(start,end)};return {world,eye};}`, {
      ...vectors, ...helpers
    });
    const camera = new THREE.PerspectiveCamera(62, 1.5, .35, 60000);
    camera.coordinateSystem = renderer.coordinateSystem;
    camera._reversedDepth = reversedDepthBuffer; // same flag the pinned renderer sets before scene submission
    camera.setViewOffset(1500, 1000, 100, 90, 1280, 720);
    camera.position.set(-950, 110, -330);
    camera.rotation.set(.21, 1.1, -.07, 'YXZ');
    camera.updateMatrixWorld(true);
    const matrixNode = matrix => ({ mul: v => new N(new THREE.Vector4(...vals(v)).applyMatrix4(matrix).toArray()) });
    for (const point of [[0,0,-.35], [.2,-.1,-.7], [10,5,-100], [-1200,600,-10000], [200,-300,-59999]]) {
      const view = new THREE.Vector3(...point), ndc = view.clone().applyMatrix4(camera.projectionMatrix);
      const depth = renderer.coordinateSystem === THREE.WebGPUCoordinateSystem || reversedDepthBuffer ? ndc.z : ndc.z * .5 + .5;
      // screenUV is top-left on both backends; on GL the pinned ScreenNode flips bottom-left gl_FragCoord first.
      const screenUV = new N([(ndc.x + 1) / 2, (1 - ndc.y) / 2]);
      const result = reconstruct(screenUV, { r: new N(depth) }, matrixNode(camera.projectionMatrixInverse), matrixNode(camera.matrixWorld));
      const expected = view.applyMatrix4(camera.matrixWorld).toArray();
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(result.world.v[i] - expected[i]) < 2e-6, `${point}, axis ${i}`);
      assert.deepEqual([...result.eye.v], camera.position.toArray());
      assert.equal(helpers.isBackgroundDepth(new N(depth)), false, 'near and far surfaces receive aerial fog');
    }
    const clear = reversedDepthBuffer ? 0 : 1, near = reversedDepthBuffer ? 1 : 0;
    assert.equal(helpers.isBackgroundDepth(new N(clear)), true, 'cleared sky receives horizon haze');
    assert.equal(helpers.isBackgroundDepth(new N(near)), false, 'near-plane depth is not background');
  });
}
