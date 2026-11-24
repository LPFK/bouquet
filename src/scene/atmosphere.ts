import * as THREE from 'three';
import { SCENE } from '../config';
import { createRng, range } from '../utils/random';
import { sharedLight } from '../flowers/materials';
import { createBackground } from './background';

/**
 * Depth layers that sell the 2.5D effect:
 * - a gradient backdrop far behind (charcoal edges, slate glow)
 * - floating dust far behind the bouquet (blurred by DOF)
 * - a few large motes in front of it (heavily blurred foreground)
 */
export interface Atmosphere {
  /** `time` drives the slow light sweep; pass a frozen time for ?still */
  update(dt: number, time: number, motion: number): void;
}

function softDotTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function backdrop(sweep: { value: THREE.Vector2 }): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      uInner: { value: new THREE.Color(SCENE.backdropInner) },
      uOuter: { value: new THREE.Color(SCENE.backdropOuter) },
      uPool: { value: SCENE.lightSweep.pool },
      uSweep: sweep,
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInner;
      uniform vec3 uOuter;
      uniform float uPool;
      uniform vec2 uSweep;
      varying vec2 vUv;
      void main() {
        float d = length((vUv - vec2(0.5, 0.58)) * vec2(1.0, 1.25));
        vec3 col = mix(uInner, uOuter, smoothstep(0.0, 0.55, d));
        // a soft warm pool of light drifting slowly across the wall
        float p = length((vUv - uSweep) * vec2(1.0, 1.4));
        col += vec3(1.0, 0.78, 0.55) * uPool * exp(-p * p / 0.012);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(48, 34), mat);
  mesh.position.set(0, 0, -14);
  return mesh;
}

interface DustLayer {
  points: THREE.Points;
  speeds: Float32Array;
  bounds: { y: [number, number] };
}

function dustLayer(
  seed: number,
  count: number,
  box: { x: [number, number]; y: [number, number]; z: [number, number] },
  size: number,
  opacity: number,
  map: THREE.Texture,
): DustLayer {
  const rng = createRng(seed);
  const pos = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = range(rng, ...box.x);
    pos[i * 3 + 1] = range(rng, ...box.y);
    pos[i * 3 + 2] = range(rng, ...box.z);
    speeds[i] = range(rng, 0.03, 0.12);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map,
    size,
    color: SCENE.dust.color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  return { points: new THREE.Points(geo, mat), speeds, bounds: { y: box.y } };
}

export function createAtmosphere(scene: THREE.Scene, seed: number, keyLight: THREE.DirectionalLight): Atmosphere {
  const sweep = { value: new THREE.Vector2(0.5, 0.6) };
  scene.add(backdrop(sweep));
  createBackground(scene, seed);
  const baseLight = sharedLight.value.clone();
  const baseKey = keyLight.position.clone();
  const euler = new THREE.Euler();
  const map = softDotTexture();
  const layers = [
    dustLayer(seed + 1, SCENE.dust.far, { x: [-9, 9], y: [-6, 6], z: [-12, -2] }, 0.09, 0.55, map),
    dustLayer(seed + 2, SCENE.dust.near, { x: [-3, 3], y: [-2.5, 2.5], z: [3, 5.5] }, 0.16, 0.35, map),
  ];
  layers.forEach((l) => scene.add(l.points));

  return {
    update(dt, time, motion) {
      // Slow light sweep: the warm pool and the key light swing together (one cycle per
      // `period` seconds), so petal shading shifts gently over time.
      const { keySwing, period } = SCENE.lightSweep;
      const ph = (time / period) * Math.PI * 2;
      const swing = Math.sin(ph) * keySwing * Math.min(motion * 2, 1);
      sweep.value.set(0.5 + 0.09 * Math.sin(ph), 0.6 + 0.03 * Math.cos(ph * 1.3));
      euler.set(Math.sin(ph * 0.7) * swing * 0.4, swing, 0);
      sharedLight.value.copy(baseLight).applyEuler(euler);
      keyLight.position.copy(baseKey).applyEuler(euler);

      for (const layer of layers) {
        const attr = layer.points.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const [minY, maxY] = layer.bounds.y;
        for (let i = 0; i < layer.speeds.length; i++) {
          let y = arr[i * 3 + 1] + layer.speeds[i] * dt * (0.3 + motion * 0.7);
          if (y > maxY) y = minY;
          arr[i * 3 + 1] = y;
        }
        attr.needsUpdate = true;
      }
    },
  };
}
