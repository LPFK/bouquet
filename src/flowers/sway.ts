import * as THREE from 'three';
import { INTERACTION, MOTION } from '../config';
import { clamp } from '../utils/random';

/**
 * Per-element animation shared by heads, sprigs and leaves:
 * - sway: small rotation of the pivot (the head's attachment point)
 * - growth: on bloom-in the pivot rises from the tie to its place while the head scales up
 *   (and folds back the same way on the outro)
 * - hover: the head turns toward the viewer and comes forward a little
 * Stems follow all of it: each vertex is moved with the pivot, weighted from 0 at the tie
 * to 1 at the head, so the top stays attached and the bundle below the tie stays put.
 */

export interface BendingStem {
  attr: THREE.BufferAttribute;
  rest: Float32Array;
  weight: Float32Array;
}

export interface Swayer {
  pivot: THREE.Object3D;
  /** the object that scales (head group) */
  body: THREE.Object3D;
  baseScale: number;
  /** resting pivot position (group space) */
  rest: THREE.Vector3;
  /** outward direction on the bouquet disc, for the hover lean */
  out: THREE.Vector2;
  phase: number;
  freq: number;
  /** sway amplitude multiplier */
  amp: number;
  /** bloom-in start, seconds after the bouquet is built */
  delay: number;
  hover: number;
  hoverTarget: number;
  stem?: BendingStem;
}

export function bendingStem(geo: THREE.BufferGeometry, tieY: number, headY: number): BendingStem {
  const attr = geo.getAttribute('position') as THREE.BufferAttribute;
  attr.setUsage(THREE.DynamicDrawUsage);
  const rest = Float32Array.from(attr.array as Float32Array);
  const weight = new Float32Array(attr.count);
  const span = Math.max(headY - tieY, 0.1);
  for (let i = 0; i < attr.count; i++) {
    const t = clamp((rest[i * 3 + 1] - tieY) / span, 0, 1);
    weight[i] = t * t;
  }
  return { attr, rest, weight };
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c = 1.5;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const easeInCubic = (t: number) => t * t * t;

/** Growth of one element: [scale, position] factors, both 0..1 (scale may overshoot). */
export function growth(age: number, delay: number, leave: number): [number, number] {
  const out = 1 - easeInCubic(clamp(leave, 0, 1));
  if (!Number.isFinite(age)) return [out, out];
  const t = clamp((age - delay) / INTERACTION.bloomDuration, 0, 1);
  return [easeOutBack(t) * out, easeOutCubic(t) * out];
}

const tmp = new THREE.Vector3();
const lift = new THREE.Vector3();

export function updateSwayer(
  s: Swayer,
  time: number,
  dt: number,
  motion: number,
  age: number,
  leave: number,
  tie: THREE.Vector3,
) {
  const k = 1 - Math.pow(1 - 0.12, dt * 60);
  s.hover += (s.hoverTarget - s.hover) * k;
  const h = s.hover;

  const amp = MOTION.swayAmplitude * motion * s.amp;
  const t = time * MOTION.swaySpeed * s.freq + s.phase;
  const lean = INTERACTION.hoverLean * h;
  // Turn toward the viewer: a head on the right (out.x > 0) turns left around Y, a head at
  // the top (out.y > 0) tips down around X.
  s.pivot.rotation.set(Math.sin(t) * amp + s.out.y * lean, Math.cos(t * 0.8) * amp - s.out.x * lean, 0);

  const [gs, gp] = growth(age, s.delay, leave);
  lift.set(0, 0, INTERACTION.hoverLift * h);
  s.pivot.position.copy(tie).lerp(s.rest, gp).add(lift);
  s.body.scale.setScalar(Math.max(s.baseScale * gs * (1 + 0.06 * h), 1e-4));

  if (s.stem) bendStem(s, gp, tie);
}

function bendStem(s: Swayer, g: number, tie: THREE.Vector3) {
  const { attr, rest, weight } = s.stem!;
  const arr = attr.array as Float32Array;
  const p = s.rest;
  const q = s.pivot.quaternion;
  const dz = s.pivot.position.z - (tie.z + (p.z - tie.z) * g);
  for (let i = 0; i < weight.length; i++) {
    const w = weight[i];
    const k = i * 3;
    let x = rest[k];
    let y = rest[k + 1];
    let z = rest[k + 2];
    if (w > 0) {
      tmp.set(x - p.x, y - p.y, z - p.z).applyQuaternion(q).add(p);
      x += (tmp.x - x) * w;
      y += (tmp.y - y) * w;
      z += (tmp.z - z) * w + dz * w;
    }
    // growth: the stem stretches up from the tie with its head
    arr[k] = tie.x + (x - tie.x) * g;
    arr[k + 1] = tie.y + (y - tie.y) * g;
    arr[k + 2] = tie.z + (z - tie.z) * g;
  }
  attr.needsUpdate = true;
}
