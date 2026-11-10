import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { initialRenderPreferences, createRenderResolutionPreference, RENDER_RESOLUTION_KEY } from '../js/render-resolution.js';
import { createGraphicsQualityPreference, GRAPHICS_QUALITY_KEY } from '../js/graphics-quality.js';

const phone = { quality: 'medium', resolution: '75', phone: true }, desktop = { quality: 'high', resolution: '100', phone: false };
const env = (ua, width, height, coarse = true, touch = 5) => ({ navigator: { userAgent: ua, maxTouchPoints: touch },
  screen: { width, height }, matchMedia: () => ({ matches: coarse }) });

test('phone defaults cover rotation, mobile folded screens and reduced UAs without changing desktop defaults', () => {
  for (const e of [env('iPhone',390,844),env('iPhone',844,390),env('Android Mobile',1104,921),
    env('reduced',390,844),env('reduced',844,390),{navigator:{userAgentData:{mobile:true}}}]) {
    assert.deepEqual(initialRenderPreferences(e),phone);
  }
  for (const e of [env('Linux',1920,1080,false,0),env('Linux',390,844,false,0),env('Linux',1920,1080,false),
    env('Linux',1920,1080,true),{},env('',0,0),{get navigator(){throw Error('unavailable');}}]) {
    assert.deepEqual(initialRenderPreferences(e),desktop);
  }
});

test('tablets retain their backend and quality policy, including desktop-UA iPads and compact Android tablets', () => {
  for (const ua of ['iPad', 'Macintosh', 'Android Tablet']) {
    assert.deepEqual(initialRenderPreferences(env(ua,768,1024)),desktop);
    assert.deepEqual(initialRenderPreferences(env(ua,1024,768)),desktop);
    assert.deepEqual(initialRenderPreferences(env(ua,600,960)),{...phone,phone:false});
    const emulated = env(ua,768,1024);
    emulated.navigator.userAgentData = {mobile:true};
    assert.deepEqual(initialRenderPreferences(emulated),{...phone,phone:false});
  }
});

test('native renderer selection uses the shared phone probe once and respects both URL overrides', () => {
  const main=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
  const block=main.slice(main.indexOf('  const params ='),main.indexOf("  startup.phase('graphics');"));
  assert.equal((main.match(/initialRenderPreferences\(\)/g)||[]).length,1);
  for (const isPhone of [false,true]) for (const search of ['', '?webgpu=0', '?webgpu=1', '?webgpu=garbage']) {
    const result=vm.runInNewContext(`${block}\n({forceWebGL,phoneWebGLDefault})`,{
      URLSearchParams,location:{search},initialRenderPreferences:()=>({...desktop,phone:isPhone})});
    assert.equal(result.forceWebGL,search==='?webgpu=0'||(isPhone&&search!=='?webgpu=1'),`${isPhone}/${search}`);
  }
  assert.match(main,/reversedDepthBuffer: true, forceWebGL \}/);
});

test('saved independent choices override phone defaults; defaults do not write storage', () => {
  const writes=[],data=new Map(),store={getItem:k=>data.get(k),setItem:(k,v)=>{writes.push([k,v]);data.set(k,v);}};
  const defaults=initialRenderPreferences(env('iPhone',390,844));
  let quality=createGraphicsQualityPreference(()=>store,defaults.quality);
  let resolution=createRenderResolutionPreference(()=>store,defaults.resolution);
  assert.equal(quality.value,'medium');assert.equal(resolution.scale,.75);assert.deepEqual(writes,[]);
  assert.equal(quality.set('high'),true);assert.equal(resolution.set('100'),true);
  quality=createGraphicsQualityPreference(()=>store,defaults.quality);
  resolution=createRenderResolutionPreference(()=>store,defaults.resolution);
  assert.equal(quality.value,'high');assert.equal(resolution.scale,1);
  assert.deepEqual(writes,[[GRAPHICS_QUALITY_KEY,'high'],[RENDER_RESOLUTION_KEY,'100']]);
  data.set(GRAPHICS_QUALITY_KEY,'broken');data.delete(RENDER_RESOLUTION_KEY);
  assert.equal(createGraphicsQualityPreference(()=>store,defaults.quality).value,'medium');
  assert.equal(createRenderResolutionPreference(()=>store,defaults.resolution).value,'75');
  assert.equal(writes.length,2);
});

test('unavailable storage retains device defaults and explicit manual changes remain usable', () => {
  const denied=()=>{throw Error('private storage denied');};
  const q=createGraphicsQualityPreference(denied,'medium'),r=createRenderResolutionPreference(denied,'75');
  assert.equal(q.value,'medium');assert.equal(r.scale,.75);
  assert.equal(q.set('high'),true);assert.equal(r.set('100'),true);
  assert.equal(q.value,'high');assert.equal(r.scale,1);
});
