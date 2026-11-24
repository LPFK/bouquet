import * as THREE from 'three';
import { BOUQUET, FILLERS, INTERACTION, PALETTES, type FlowerKind, type FlowerPalette, type Theme } from '../config';
import { createRng, jitter, range, TAU } from '../utils/random';
import { buildLeaf, FLOWER_BUILDERS, FOCAL_WEIGHT, HEAD_RADIUS, UPRIGHT } from './kinds';
import { DISC_SQUASH, layoutHeads } from './layout';
import { buildWrap } from './wrap';
import { buildBabysBreath, buildEucalyptus, findGaps } from './fillers';
import { matteMaterial, sharedContact } from './materials';
import { bendingStem, growth, updateSwayer, type Swayer } from './sway';

export interface HeadInfo {
  pivot: THREE.Object3D;
  palette: FlowerPalette;
  kind: FlowerKind;
}

export interface Bouquet {
  group: THREE.Group;
  /** meshes for pointer picking; `userData.head` is the head index */
  pickables: THREE.Object3D[];
  /** heads a petal may fall from (empty in solo mode) */
  heads: HeadInfo[];
  /** world position of head `index` */
  headPosition(index: number, target: THREE.Vector3): THREE.Vector3;
  /**
   * `age`: seconds since built (Infinity = fully grown, e.g. ?still);
   * `leave`: 0..1 progress of the outro (flowers fold back into the wrap).
   */
  update(time: number, dt: number, motion: number, age: number, leave: number): void;
  setHover(index: number | null): void;
  dispose(): void;
}

type Entry = { kind: FlowerKind; palette: FlowerPalette; scale: number; order: number };

/** Kinds that read as filler sit a little behind the focal heads. */
const DEPTH_OFFSET: Record<FlowerKind, number> = { rose: 0.04, tulip: 0, daisy: -0.06, bud: -0.04 };

const Z = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

function makeSwayer(
  pivot: THREE.Object3D,
  body: THREE.Object3D,
  anim: () => number,
  opts: { amp?: number; delay: number; out?: THREE.Vector2; stem?: Swayer['stem'] },
): Swayer {
  body.scale.setScalar(1e-4);
  return {
    pivot,
    body,
    baseScale: 1,
    rest: pivot.position.clone(),
    out: opts.out ?? new THREE.Vector2(),
    phase: anim() * TAU,
    freq: 0.7 + anim() * 0.6,
    amp: opts.amp ?? 1,
    delay: opts.delay,
    hover: 0,
    hoverTarget: 0,
    stem: opts.stem,
  };
}

function disposeOwned(group: THREE.Object3D) {
  // Petal geometries and materials are cached and shared; only geometry built for this
  // bouquet (flagged `userData.owned`: merged heads, stems, paper, ribbon) is freed.
  group.traverse((o) => {
    if ((o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) && o.userData.owned) o.geometry.dispose();
  });
  group.removeFromParent();
}

export function buildBouquet(seed: number, theme: Theme, cfg = BOUQUET): Bouquet {
  const rng = createRng(seed);
  // Animation timing has its own stream so it never changes the composition.
  const anim = createRng(seed ^ 0x5bd1e995);
  const group = new THREE.Group();
  const swayers: Swayer[] = [];
  const headSwayers: Swayer[] = [];
  const heads: HeadInfo[] = [];
  const pickables: THREE.Object3D[] = [];
  const tie = new THREE.Vector3(...cfg.tiePoint);
  const stagger = INTERACTION.bloomStagger;

  // Expand the recipe, then order: focal flowers in the middle, small ones at the rim.
  const entries: Entry[] = [];
  cfg.flowers.forEach((spec, g) => {
    const palette = PALETTES[theme.flowers[g] ?? spec.palette];
    for (let i = 0; i < spec.count; i++) {
      entries.push({
        kind: spec.kind,
        palette,
        scale: range(rng, spec.scale[0], spec.scale[1]),
        order: FOCAL_WEIGHT[spec.kind] + rng() * 1.6,
      });
    }
  });
  entries.sort((a, b) => a.order - b.order);

  const radii = entries.map((e) => HEAD_RADIUS[e.kind] * e.scale);
  const points = layoutHeads(radii, cfg.domeRadius, cfg.headOverlap, rng);
  // The dome grows to hold every head (normalised disc radius, undoing the squash).
  const discR = points.map((p) => Math.hypot(p.x, p.y / DISC_SQUASH));
  const R = Math.max(cfg.domeRadius, Math.max(...discR) * 1.04);
  const domeRadii = new THREE.Vector3(R, R * DISC_SQUASH, R * cfg.domeDepth);
  const domeZ = (r: number) => Math.sqrt(Math.max(R * R - r * r, 0)) * cfg.domeDepth;

  const stemMat = matteMaterial(PALETTES.stem.tip, 0.8);

  // Foliage collar around the back rim (grows first).
  for (let i = 0; i < cfg.leaves; i++) {
    const a = (i / cfg.leaves) * TAU + jitter(rng, 0.2);
    const leaf = buildLeaf(rng);
    leaf.rotation.z = a - Math.PI / 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.55 - 0.1, -0.2 + jitter(rng, 0.08));
    pivot.add(leaf);
    group.add(pivot);
    swayers.push(makeSwayer(pivot, leaf, anim, { amp: 0.35, delay: anim() * 0.25 }));
  }

  entries.forEach((entry, i) => {
    const { x, y } = points[i];
    const r = discR[i];
    // Depth stagger so touching rims sit at different depths instead of slicing each other.
    const depth = DEPTH_OFFSET[entry.kind] + (i % 2 === 0 ? 0.04 : -0.04) + jitter(rng, 0.03);
    const pos = new THREE.Vector3(x, y, domeZ(r) + depth);
    const normal = new THREE.Vector3(x, y, R * 1.15).normalize();

    const head = FLOWER_BUILDERS[entry.kind]({ rng, palette: entry.palette });
    // Lean toward up only in the upper part of the dome; lower heads would lean into
    // the heads above them, so they face out instead.
    const lean = UPRIGHT[entry.kind] * THREE.MathUtils.smoothstep(y, -0.45 * R, 0.35 * R);
    const axis = normal.clone().addScaledVector(UP, lean).normalize();
    head.quaternion.setFromUnitVectors(Z, axis);
    head.rotateZ(rng() * TAU);
    head.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.userData.head = heads.length;
        pickables.push(o);
      }
    });

    const pivot = new THREE.Group();
    pivot.position.copy(pos);
    pivot.add(head);
    group.add(pivot);

    // Stem: from under the head, converging at the tie, splaying slightly below it.
    const start = pos.clone().addScaledVector(normal, -0.04);
    const mid = start.clone().lerp(tie, 0.45).addScaledVector(normal, -0.15);
    const below = tie.clone().add(new THREE.Vector3(x * 0.12, -cfg.stemTail, pos.z * 0.05 + jitter(rng, 0.05)));
    const curve = new THREE.CatmullRomCurve3([start, mid, tie.clone().add(new THREE.Vector3(x * 0.03, 0, 0)), below]);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.017, 6), stemMat);
    stem.userData.owned = true;
    stem.frustumCulled = false; // vertices move every frame; the bounding sphere is stale
    group.add(stem);

    const sw = makeSwayer(pivot, head, anim, {
      delay: 0.25 + (i / entries.length) * stagger + anim() * 0.15,
      out: new THREE.Vector2(x, y).normalize(),
      stem: bendingStem(stem.geometry, tie.y, pos.y),
    });
    sw.baseScale = entry.scale;
    swayers.push(sw);
    headSwayers.push(sw);
    heads.push({ pivot, palette: entry.palette, kind: entry.kind });
  });

  // Eucalyptus sprigs poking out around the upper rim and the sides.
  for (let i = 0; i < FILLERS.eucalyptus; i++) {
    const a = -0.2 + ((Math.PI + 0.4) * (i + 0.5)) / FILLERS.eucalyptus + jitter(rng, 0.2);
    const sprig = buildEucalyptus(rng);
    sprig.rotation.x = 0.3 + jitter(rng, 0.1);
    const body = new THREE.Group();
    body.rotation.z = a - Math.PI / 2;
    body.add(sprig);
    const pivot = new THREE.Group();
    const r = R * 0.72;
    pivot.position.set(Math.cos(a) * r, Math.sin(a) * r * DISC_SQUASH, domeZ(r) - 0.3);
    pivot.add(body);
    group.add(pivot);
    swayers.push(makeSwayer(pivot, body, anim, { amp: 0.7, delay: 0.15 + anim() * stagger * 0.6 }));
  }

  // Baby's breath in the biggest gaps between heads.
  const gaps = findGaps(points, radii, R, FILLERS.babysBreath).map((g) => {
    const r = Math.hypot(g.x, g.y / DISC_SQUASH);
    return {
      position: new THREE.Vector3(g.x, g.y, domeZ(r) - 0.02),
      normal: new THREE.Vector3(g.x, g.y, R * 1.15).normalize(),
    };
  });
  const babysBreath = buildBabysBreath(rng, gaps, FILLERS.babysBreathFlorets);
  group.add(babysBreath);

  // Paper wrap and ribbon bow.
  group.add(buildWrap(rng, { tissue: PALETTES[theme.tissue], ribbon: PALETTES[theme.ribbon] }));

  // Contact shading: world space -> unit dome space of this bouquet.
  sharedContact.strength.value = cfg.contactShade;
  const domeScale = new THREE.Matrix4().makeScale(1 / domeRadii.x, 1 / domeRadii.y, 1 / domeRadii.z);
  const updateDome = () => {
    group.updateMatrixWorld();
    sharedContact.domeMatrix.value.copy(group.matrixWorld).invert().premultiply(domeScale);
  };
  updateDome();

  return {
    group,
    pickables,
    heads,
    headPosition: (index, target) => heads[index].pivot.getWorldPosition(target),
    update(time, dt, motion, age, leave) {
      for (const s of swayers) updateSwayer(s, time, dt, motion, age, leave, tie);
      babysBreath.scale.setScalar(Math.max(growth(age, 0.5 * stagger, leave)[0], 1e-4));
      group.rotation.y = Math.sin(time * 0.15) * 0.06 * motion;
      updateDome();
    },
    setHover(index) {
      headSwayers.forEach((s, i) => (s.hoverTarget = i === index ? 1 : 0));
    },
    dispose: () => disposeOwned(group),
  };
}

/** ?solo=<kind>: one large head facing the camera. */
export function buildSolo(kind: string, seed: number, theme: Theme): Bouquet {
  const k = (kind in FLOWER_BUILDERS ? kind : 'rose') as FlowerKind;
  const g = BOUQUET.flowers.findIndex((f) => f.kind === k);
  const palette = PALETTES[theme.flowers[g] ?? BOUQUET.flowers[g].palette];
  const head = FLOWER_BUILDERS[k]({ rng: createRng(seed), palette });
  head.rotation.x = -0.35 - UPRIGHT[k] * 0.6;
  const pivot = new THREE.Group();
  pivot.position.set(0, -0.35, 0);
  pivot.add(head);
  const group = new THREE.Group();
  group.add(pivot);
  const pickables: THREE.Object3D[] = [];
  head.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.userData.head = 0;
      pickables.push(o);
    }
  });
  const sw = makeSwayer(pivot, head, createRng(seed), { amp: 1.5, delay: 0.1 });
  sw.baseScale = 0.8 / HEAD_RADIUS[k];
  sharedContact.strength.value = 0;
  return {
    group,
    pickables,
    heads: [],
    headPosition: (_i, target) => pivot.getWorldPosition(target),
    update(time, dt, motion, age, leave) {
      updateSwayer(sw, time, dt, motion, age, leave, sw.rest);
    },
    setHover(index) {
      sw.hoverTarget = index === 0 ? 0.5 : 0;
    },
    dispose: () => disposeOwned(group),
  };
}
