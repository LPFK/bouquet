import * as THREE from 'three';
import { PALETTES, type FlowerKind, type FlowerPalette } from '../config';
import { GOLDEN_ANGLE, jitter, lerp, TAU, type Rng } from '../utils/random';
import { petalGeometry, SHAPE_VARIANTS } from './petal';
import { matteMaterial, petalMaterial, petalTint } from './materials';
import { HeadAssembler } from './assembler';

/**
 * Flower head builders. Each returns a Group whose axis is +Z (facing out of the head).
 * Petals are added through a HeadAssembler (spin around the axis, then tilt toward it by
 * `closure` radians: 0 = flat open, ~PI/2 = upright / closed) and merged into one mesh
 * per material, so a head costs one or two draw calls.
 */

export interface FlowerContext {
  rng: Rng;
  palette: FlowerPalette;
}

export type FlowerBuilder = (ctx: FlowerContext) => THREE.Group;

const smoothstep01 = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

/** Petals per rose, placed on a golden-angle spiral from the bud outward. */
const ROSE_PETALS = 17;

const rose: FlowerBuilder = ({ rng, palette }) => {
  const head = new HeadAssembler();
  const mat = petalMaterial(palette, { vein: 0.06, rim: 0.18 });
  const start = rng() * TAU;
  for (let i = 0; i < ROSE_PETALS; i++) {
    const t = i / (ROSE_PETALS - 1); // 0 = innermost .. 1 = outermost
    // Petals grow and open monotonically, so each one nests outside the previous ones.
    const geo = petalGeometry({
      length: lerp(0.15, 0.32, Math.pow(t, 0.8)),
      width: lerp(0.15, 0.34, t),
      pointiness: 0.06,
      cup: lerp(1.15, 0.45, t),
      curl: lerp(0, 0.38, t * t),
      widest: 0.66,
      ruffle: lerp(0.01, 0.07, t),
      notch: lerp(0, 0.7, t),
      variant: Math.floor(rng() * SHAPE_VARIANTS),
    });
    // Inner petals sit in the shadow of the cup.
    const shade = lerp(0.62, 1, smoothstep01(t / 0.7));
    const spin = start + i * GOLDEN_ANGLE + jitter(rng, 0.08);
    const closure = lerp(1.52, 0.6, Math.pow(t, 1.2)) + jitter(rng, 0.04);
    head.petal(geo, mat, spin, closure, lerp(0.004, 0.05, t), lerp(0.035, 0, t), petalTint(rng, shade));
  }
  return head.build();
};

const tulip: FlowerBuilder = ({ rng, palette }) => {
  const head = new HeadAssembler();
  const mat = petalMaterial(palette, { vein: 0.1, rim: 0.2 });
  for (let k = 0; k < 6; k++) {
    const inner = k % 2 === 1;
    // Negative curl rolls the tips back toward the axis, closing the cup into an egg shape.
    const geo = petalGeometry({
      length: inner ? 0.5 : 0.54,
      width: inner ? 0.27 : 0.3,
      pointiness: 0.62,
      cup: 1.05,
      curl: -0.14,
      widest: 0.5,
      ruffle: 0.015,
      variant: k,
    });
    const spin = (k / 6) * TAU + jitter(rng, 0.06);
    const closure = (inner ? 1.4 : 1.3) + jitter(rng, 0.04);
    head.petal(geo, mat, spin, closure, inner ? 0.0 : 0.025, 0, petalTint(rng, inner ? 0.85 : 1));
  }
  return head.build();
};

const daisy: FlowerBuilder = ({ rng, palette }) => {
  const head = new HeadAssembler();
  const mat = petalMaterial(palette, { vein: 0.18, rim: 0.15 });
  const count = 18 + Math.floor(rng() * 6);
  for (let ring = 0; ring < 2; ring++) {
    for (let k = 0; k < count; k++) {
      const geo = petalGeometry({
        length: 0.3 * (1 + jitter(rng, 0.06)),
        width: 0.075,
        pointiness: 0.2,
        cup: 0.15,
        curl: 0.06,
        widest: 0.62,
        ruffle: 0.04,
        notch: 0.9,
        variant: Math.floor(rng() * SHAPE_VARIANTS),
      });
      const spin = ((k + ring * 0.5) / count) * TAU + jitter(rng, 0.05);
      head.petal(geo, mat, spin, 0.14 + ring * 0.1 + jitter(rng, 0.07), 0.04, ring * 0.01, petalTint(rng));
    }
  }
  const disc = new THREE.Mesh(new THREE.SphereGeometry(0.065, 20, 10), matteMaterial(palette.center ?? '#e0a526', 0.95));
  disc.scale.set(1, 1, 0.5);
  disc.position.z = 0.02;
  disc.userData.owned = true;
  head.add(disc);
  return head.build();
};

const bud: FlowerBuilder = ({ rng, palette }) => {
  const head = new HeadAssembler();
  const mat = petalMaterial(palette, { vein: 0.05, rim: 0.25 });
  const geo = petalGeometry({ length: 0.24, width: 0.18, pointiness: 0.35, cup: 0.9, curl: 0, widest: 0.55 });
  for (let k = 0; k < 4; k++) {
    head.petal(geo, mat, (k / 4) * TAU + jitter(rng, 0.1), 1.42 + jitter(rng, 0.05), 0, 0, petalTint(rng));
  }
  const sepalMat = petalMaterial(PALETTES.leaf, { vein: 0.05, rim: 0.2 });
  const sepal = petalGeometry({ length: 0.14, width: 0.06, pointiness: 0.9, cup: 0.3, curl: 0.1 });
  for (let k = 0; k < 5; k++) {
    head.petal(sepal, sepalMat, (k / 5) * TAU + 0.3, 0.9 + jitter(rng, 0.1), 0, -0.01);
  }
  return head.build();
};

export const FLOWER_BUILDERS: Record<FlowerKind, FlowerBuilder> = { rose, tulip, daisy, bud };

/** Lower = placed closer to the centre of the bouquet. */
export const FOCAL_WEIGHT: Record<FlowerKind, number> = { rose: 0, tulip: 1, daisy: 2, bud: 3 };

/** Approximate radius of each head seen along its axis, at scale 1 (used by the layout). */
export const HEAD_RADIUS: Record<FlowerKind, number> = { rose: 0.31, tulip: 0.22, daisy: 0.33, bud: 0.12 };

/**
 * How far a head's axis leans from the dome normal toward world up. Tulips and buds read
 * best from the side (a cup seen from above looks like a rose); roses and daisies face out.
 */
export const UPRIGHT: Record<FlowerKind, number> = { rose: 0, tulip: 1.4, daisy: 0, bud: 0.7 };

export function buildLeaf(rng: Rng): THREE.Group {
  const geo = petalGeometry(
    {
      length: 0.95 + jitter(rng, 0.15),
      width: 0.3,
      pointiness: 0.9,
      cup: 0.35,
      curl: 0.22,
      widest: 0.42,
      ruffle: 0.025,
      variant: Math.floor(rng() * SHAPE_VARIANTS),
    },
    6,
    16,
  );
  const mat = petalMaterial(PALETTES.leaf, { vein: 0.2, rim: 0.08, backTint: 0.7 });
  return new HeadAssembler().petal(geo, mat, 0, -0.35 + jitter(rng, 0.15), 0, 0, petalTint(rng, 1, 0.06)).build();
}
