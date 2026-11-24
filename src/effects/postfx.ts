import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FX } from '../config';
import type { Quality, Stage } from '../scene/stage';

/** Film grain + vignette, applied last in display (sRGB) space. */
const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: FX.grain },
    uVignette: { value: FX.vignette },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float n = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 97.0) - 0.5;
      c.rgb += n * uGrain;
      float d = length((vUv - 0.5) * vec2(1.0, 1.15));
      c.rgb *= mix(1.0, 1.0 - uVignette, smoothstep(0.25, 0.85, d));
      gl_FragColor = c;
    }
  `,
};

export interface PostFX {
  composer: EffectComposer;
  bokeh: BokehPass;
  bloom: UnrealBloomPass;
  grain: ShaderPass;
  setFocus(distance: number): void;
  render(dt: number, time: number): void;
}

export function createPostFX(stage: Stage, quality: Quality): PostFX {
  const { renderer, scene, camera } = stage;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: quality === 'high' ? 4 : 2,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const bokeh = new BokehPass(scene, camera, { focus: 8, aperture: FX.bokeh.aperture, maxblur: FX.bokeh.maxblur });
  bokeh.enabled = quality === 'high';
  // Petals are double-sided; make the depth prepass see their back faces too.
  bokeh.materialDepth.side = THREE.DoubleSide;
  composer.addPass(bokeh);

  const bloom = new UnrealBloomPass(size.clone(), FX.bloom.strength, FX.bloom.radius, FX.bloom.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const grain = new ShaderPass(GrainVignetteShader);
  composer.addPass(grain);

  stage.onResize((w, h) => {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
  });

  const bokehUniforms = bokeh.uniforms as Record<string, THREE.IUniform<number>>;

  return {
    composer,
    bokeh,
    bloom,
    grain,
    setFocus(distance) {
      bokehUniforms['focus'].value = distance;
    },
    render(dt, time) {
      grain.uniforms['uTime'].value = time;
      composer.render(dt);
    },
  };
}
