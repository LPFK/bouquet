import * as THREE from 'three';
import { FX, type FlowerPalette } from '../config';

/**
 * Stylised petal shader: base-to-tip gradient, throat shadow, fanned veins,
 * wrap lighting, rim glow and a darker, warmer back face (fake translucency).
 * Works in linear space; tone mapping and sRGB conversion happen in OutputPass.
 *
 * Per-petal variety comes from the `aTint` vertex attribute (rgb multiplier, a = shade), so
 * all petals of a head share one material and can be merged into one mesh. Every geometry
 * drawn with this material MUST carry `aTint` (see `setTint`); a missing attribute reads
 * as black.
 *
 * Contact shading: `uDomeMatrix` maps world space into the bouquet's unit dome
 * (length 1 = on the dome surface). Fragments deep inside it, in the gaps between
 * heads and at the base of petals, are darkened by `uContact`.
 */

const vertexShader = /* glsl */ `
  attribute vec4 aTint;
  varying vec4 vTint;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vTint = aTint;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vec4 mv = viewMatrix * world;
    vViewPos = mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform vec3 uLightDir;
  uniform vec3 uBackLightDir;
  uniform float uVein;
  uniform float uRim;
  uniform float uBackTint;
  uniform float uSss;
  uniform float uContact;
  uniform mat4 uDomeMatrix;
  varying vec4 vTint;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vWorldPos;

  void main() {
    float along = vUv.y;
    float across = vUv.x * 2.0 - 1.0;

    vec3 col = mix(uBase, uTip, smoothstep(0.05, 1.0, along));
    // throat shadow where the petal meets the receptacle
    col *= mix(0.42, 1.0, smoothstep(0.0, 0.34, along));
    // fine veins fanning out from the base
    float veins = abs(sin((across / max(along, 0.18)) * 9.0));
    col *= 1.0 - uVein * (1.0 - smoothstep(0.0, 0.35, veins)) * smoothstep(0.1, 0.6, along);
    // paper-thin margins catch more light
    col = mix(col, uTip * 1.05, smoothstep(0.7, 1.0, abs(across)) * 0.22);

    vec3 n = normalize(vNormalV);
    if (!gl_FrontFacing) {
      n = -n;
      col *= uBackTint;
    }
    vec3 L = normalize(uLightDir);
    float ndl = dot(n, L);
    col *= mix(0.36, 1.0, ndl * 0.5 + 0.5);

    // fake subsurface: thin tips and margins glow warm where light comes through them,
    // from the key light (surfaces facing away from it) or the kicker behind the bouquet
    float thin = smoothstep(0.25, 1.0, along) * (0.65 + 0.35 * abs(across));
    float fromKey = smoothstep(-0.15, 0.85, -ndl);
    float fromBack = pow(max(dot(-n, normalize(uBackLightDir)), 0.0), 2.0);
    float trans = max(fromKey, fromBack) * thin;
    col += uSss * trans * uTip * vec3(1.0, 0.72, 0.52);

    // rim light, only on the side that faces the key light (no halo on shadowed edges)
    float rim = pow(1.0 - abs(dot(n, normalize(-vViewPos))), 3.0) * smoothstep(-0.2, 0.6, ndl);
    col += uRim * rim * uTip;

    // contact shading inside the bouquet dome
    float depth = length((uDomeMatrix * vec4(vWorldPos, 1.0)).xyz);
    col *= mix(1.0 - uContact, 1.0, smoothstep(0.55, 1.08, depth));

    gl_FragColor = vec4(col * vTint.rgb * vTint.a, 1.0);
  }
`;

/** Light direction in view space, shared by every petal material. */
export const sharedLight = { value: new THREE.Vector3(-0.45, 0.75, 0.55).normalize() };

/** Warm kicker behind the bouquet (view space), only used for petal translucency. */
export const sharedBackLight = { value: new THREE.Vector3(0.5, 0.55, -0.65).normalize() };

/** Contact-shading uniforms shared by every petal material; the bouquet updates them. */
export const sharedContact = {
  strength: { value: 0 },
  domeMatrix: { value: new THREE.Matrix4() },
};

/** Fake subsurface strength shared by every petal material. */
export const sharedSss = { value: FX.subsurface };

/** Per-vertex tint: rgb multiplier and shade (a). */
export type Tint = [number, number, number, number];
export const NO_TINT: Tint = [1, 1, 1, 1];

/** A subtle random colour shift so petals of one head are not one flat tint. */
export function petalTint(rng: () => number, shade = 1, amount = 0.05): Tint {
  const j = () => (rng() * 2 - 1) * amount;
  const light = 1 + j() * 0.8;
  return [(1 + j()) * light, (1 + j() * 0.6) * light, (1 + j()) * light, shade];
}

/** Fill (or replace) the `aTint` attribute of a geometry with one constant tint. */
export function setTint(geo: THREE.BufferGeometry, tint: Tint): THREE.BufferGeometry {
  const n = geo.getAttribute('position').count;
  const existing = geo.getAttribute('aTint') as THREE.BufferAttribute | undefined;
  // reuse the buffer when re-tinting (falling petals), so no GPU buffer is orphaned
  const attr = existing && existing.count === n ? existing : new THREE.BufferAttribute(new Float32Array(n * 4), 4);
  const data = attr.array as Float32Array;
  for (let i = 0; i < n; i++) data.set(tint, i * 4);
  attr.needsUpdate = true;
  if (attr !== existing) geo.setAttribute('aTint', attr);
  return geo;
}

export interface PetalMaterialOptions {
  vein?: number;
  rim?: number;
  backTint?: number;
}

const cache = new Map<string, THREE.ShaderMaterial>();

export function petalMaterial(palette: FlowerPalette, opts: PetalMaterialOptions = {}): THREE.ShaderMaterial {
  const { vein = 0.12, rim = 0.2, backTint = 0.75 } = opts;
  const key = `${palette.base}|${palette.tip}|${vein}|${rim}|${backTint}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    uniforms: {
      uBase: { value: new THREE.Color(palette.base) },
      uTip: { value: new THREE.Color(palette.tip) },
      uLightDir: sharedLight,
      uBackLightDir: sharedBackLight,
      uVein: { value: vein },
      uRim: { value: rim },
      uBackTint: { value: backTint },
      uSss: sharedSss,
      uContact: sharedContact.strength,
      uDomeMatrix: sharedContact.domeMatrix,
    },
  });
  cache.set(key, mat);
  return mat;
}

const matteCache = new Map<string, THREE.MeshStandardMaterial>();

/** Matte lit material for stems, flower hearts, ribbon. Cached; do not mutate. */
export function matteMaterial(color: string, roughness = 0.85, doubleSided = false): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${doubleSided}`;
  const hit = matteCache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  matteCache.set(key, mat);
  return mat;
}
