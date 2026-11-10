// SF Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// Memory fix for the vendored cascaded sun shadow (three e27dfa95ae7f453b5d7a9a36ffdb563f7c9b529b,
// examples/jsm/lights/SunShadowNode.js, MIT © three.js authors; see vendor/three/LICENSE).
//
// SunShadowNode._setupCascades(builder, filterFn) creates each cascade's matrix/range uniforms with
// onRenderUpdate(() => shadow…) closures inside the method, so those closures share the method's scope, which holds
// `builder`. The uniforms live on in the cached NodeBuilderState.updateNodes, so every material that receives sun
// shadows kept its whole NodeBuilder (all build caches) alive: ~220 MB across SF's ~200 shader programs, measured by
// counting live builders after compile + GC (heap-snapshot retainer: UniformNode.update -> builder scope).
//
// This replaces the method with the same body, except that the two per-cascade uniforms come from a module-level
// helper whose closures capture only `shadow` and `i`. Node creation order and every generated shader are unchanged.
import { If, float, mix, normalWorld, positionView, reference, renderGroup, shadowPositionWorld, smoothstep, uniform, vec4 } from 'three/tsl';
import { SunShadowNode } from 'three/addons/lights/SunShadowNode.js';

function cascadeUniforms(shadow, i) {
  const shadowMatrix = uniform('mat4').setGroup(renderGroup).onRenderUpdate(() => shadow.getMatrix(i));
  // ( begin, end, fade start ) view depths of the cascade
  const cascade = uniform('vec4').setGroup(renderGroup).onRenderUpdate(() => shadow._cascadeData[i]);
  return { shadowMatrix, cascade };
}

export function installSunShadowRetentionFix() {
  const proto = SunShadowNode.prototype;
  if (proto._sfBuilderRetentionFix) return false;
  proto._sfBuilderRetentionFix = true;
  // Cascaded sun shadows sample only depth (ShadowNode.setupShadowFilter ignores shadowTexture).
  // Keep the colour attachment and its logical RGBA/vec4 shader interface, but use one native byte per texel.
  // R8 is core colour-renderable in WebGL2; r8unorm is a required WebGPU render-attachment format.
  // The pinned backends use internalFormat for storage/pipeline targets, independently of shader output typing.
  // Wrap the pinned allocator once so depth ownership, resize/disposal, flags and atlas dimensions stay native.
  const setupRenderTarget = proto.setupRenderTarget;
  proto.setupRenderTarget = function (shadow, builder) {
    const result = setupRenderTarget.call(this, shadow, builder);
    const backend = builder.renderer.backend;
    if (backend.isWebGLBackend) result.shadowMap.texture.internalFormat = 'R8';
    else if (backend.isWebGPUBackend) result.shadowMap.texture.internalFormat = 'r8unorm';
    return result;
  };
  proto._setupCascades = function (builder, filterFn) {
    // Full node updates refresh resized atlas bindings, even for stationary objects.
    builder.observer.hasNode = true;
    const { shadow, shadowMap } = this;
    const depthTexture = shadowMap.depthTexture;
    const shadowIntensity = reference('intensity', 'float', shadow).setGroup(renderGroup);
    const normalBias = reference('normalBias', 'float', shadow).setGroup(renderGroup);
    // evaluated outside the cascade branches so nodes shared with the rest of
    // the shader, like the world normal, are not trapped in a branch scope
    const shadowPosition = vec4(shadowPositionWorld.add(normalWorld.mul(normalBias)), 1).toVar();
    const viewDepth = positionView.z.negate().toVar();
    const shadowValue = float(1).toVar('shadowValue');
    // walk the cascades back to front so each fade band can blend with the shadow behind it
    for (let i = shadow.getViewportCount() - 1; i >= 0; i--) {
      const { shadowMatrix, cascade } = cascadeUniforms(shadow, i);
      If(viewDepth.greaterThanEqual(cascade.x).and(viewDepth.lessThan(cascade.y)), () => {
        const shadowCoord = this.setupShadowCoord(builder, shadowMatrix.mul(shadowPosition));
        const cascadeShadow = this.setupShadowFilter(builder, {
          filterFn,
          shadowTexture: shadowMap.texture,
          depthTexture,
          shadowCoord,
          shadow: this._filterShadow,
          depthLayer: this.depthLayer
        });
        shadowValue.assign(mix(cascadeShadow, shadowValue, smoothstep(cascade.z, cascade.y, viewDepth)));
      });
    }
    return mix(1, shadowValue, shadowIntensity);
  };
  return true;
}
