import * as THREE from 'three';

/**
 * Procedural petal / leaf surface.
 *
 * Local convention (keep this consistent everywhere):
 * - the petal grows along +Y from the origin (its attachment point)
 * - a flat petal faces +Z (the flower axis, toward the viewer for a head facing the camera)
 * - `cup` lifts the margins toward +Z (concave on the inside)
 * - `curl` rolls the tip back toward -Z
 * - uv.x runs across the petal (0..1), uv.y along it (0 base .. 1 tip)
 */
export interface PetalShape {
  length: number;
  width: number;
  /** 0 = blunt, rounded tip; 1 = pointed tip */
  pointiness: number;
  /** concavity across the petal */
  cup: number;
  /** backward roll of the tip */
  curl: number;
  /** position of the widest point along the petal, 0..1 (default 0.6) */
  widest?: number;
  /** wavy margins, fraction of the width (default 0) */
  ruffle?: number;
  /** pulls the middle of the tip back into a heart-shaped notch, 0..1 (default 0) */
  notch?: number;
  /** integer that changes the ruffle phase, so neighbouring petals differ (default 0) */
  variant?: number;
}

/** Number of distinct ruffle variants worth asking for. */
export const SHAPE_VARIANTS = 3;

const cache = new Map<string, THREE.BufferGeometry>();
const q = (n: number) => n.toFixed(2);
const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function petalGeometry(shape: PetalShape, segU = 8, segV = 14): THREE.BufferGeometry {
  const widest = shape.widest ?? 0.6;
  const ruffle = shape.ruffle ?? 0;
  const notch = shape.notch ?? 0;
  const variant = ruffle > 0 ? (shape.variant ?? 0) % SHAPE_VARIANTS : 0;
  const key = [shape.length, shape.width, shape.pointiness, shape.cup, shape.curl, widest, ruffle, notch]
    .map(q)
    .concat(String(variant), String(segU), String(segV))
    .join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  const { length: L, width: W, pointiness, cup, curl } = shape;
  // v^k reaches 0.5 at v = widest, so sin(pi * v^k) peaks there.
  const k = Math.log(0.5) / Math.log(THREE.MathUtils.clamp(widest, 0.15, 0.9));
  // Low exponent keeps the tip blunt, high exponent makes it taper to a point.
  const e = THREE.MathUtils.lerp(0.32, 1.0, pointiness);
  const phase = variant * 2.17;

  const cols = segU + 1;
  const rows = segV + 1;
  const positions = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const indices: number[] = [];

  for (let j = 0; j < rows; j++) {
    const v = j / segV;
    const profile = Math.pow(Math.max(Math.sin(Math.PI * Math.pow(v, k)), 0), e);
    // a slightly irregular outline: the width breathes along the petal
    const wobble = 1 + ruffle * 0.8 * Math.sin(v * 11 + phase) * v;
    const hw = Math.max((W / 2) * profile * wobble, W * 0.015);
    for (let i = 0; i < cols; i++) {
      const u = (i / segU) * 2 - 1;
      const idx = j * cols + i;
      const edge = u * u;
      const tipZone = smooth(0.6, 1.0, v);
      // notch: the centre of the tip is pulled back toward the base
      const len = v * L * (1 - notch * 0.12 * (1 - edge) * tipZone);
      // ruffle: margins wave in and out, more toward the tip
      const wave = ruffle * W * Math.sin(u * 6.5 + v * 4 + phase) * edge * smooth(0.3, 1.0, v);
      positions[idx * 3 + 0] = u * hw;
      positions[idx * 3 + 1] = len;
      positions[idx * 3 + 2] = cup * hw * edge - curl * L * v * v * v + wave;
      uvs[idx * 2 + 0] = i / segU;
      uvs[idx * 2 + 1] = v;
    }
  }

  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  cache.set(key, geo);
  return geo;
}
