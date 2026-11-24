import * as THREE from 'three';
import { PALETTES } from '../config';
import { GOLDEN_ANGLE, jitter, lerp, range, type Rng } from '../utils/random';
import { HeadAssembler } from './assembler';
import { matteMaterial, petalMaterial, petalTint } from './materials';
import { petalGeometry } from './petal';
import { DISC_SQUASH, type LayoutPoint } from './layout';

/**
 * Fillers: the small things between and around the focal heads.
 * - eucalyptus sprig: a curved stem with paired round leaves, shrinking toward the tip.
 *   Local +Y runs along the sprig from its base; leaves face +Z.
 * - baby's breath: clouds of tiny florets tucked into the gaps between heads, all drawn
 *   with one InstancedMesh.
 */

export function buildEucalyptus(rng: Rng): THREE.Group {
  const length = range(rng, 0.55, 0.75);
  // a clear arc to one side, drooping a little at the tip
  const bend = (rng() < 0.5 ? -1 : 1) * range(rng, 0.12, 0.22);
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(bend, length * 0.6, 0.05),
    new THREE.Vector3(bend * 1.9, length * 0.95, -0.04),
  );
  const head = new HeadAssembler();
  const mat = petalMaterial(PALETTES.eucalyptus, { vein: 0.04, rim: 0.14, backTint: 0.85 });
  const pairs = 5;
  const m = new THREE.Matrix4();
  const r = new THREE.Matrix4();
  for (let i = 0; i < pairs; i++) {
    const t = 0.22 + (i / (pairs - 1)) * 0.74;
    const size = lerp(0.19, 0.1, t) * range(rng, 0.85, 1.1);
    const geo = petalGeometry({ length: size, width: size * 0.95, pointiness: 0, cup: 0.25, curl: 0.04, widest: 0.5 }, 6, 8);
    const p = curve.getPoint(t);
    for (const side of [-1, 1]) {
      if (rng() < 0.15) continue; // the odd missing leaf keeps it from looking combed
      // leaf grows sideways from the stem, alternating slightly up the stem
      const spin = side * (Math.PI / 2 - 0.35 + jitter(rng, 0.15));
      m.makeTranslation(p.x, p.y + side * 0.012, p.z);
      m.multiply(r.makeRotationZ(-spin));
      m.multiply(r.makeRotationX(jitter(rng, 0.35)));
      head.place(geo, mat, m, petalTint(rng, 1, 0.07));
    }
  }
  const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.009, 5), matteMaterial(PALETTES.eucalyptus.base, 0.8));
  stem.userData.owned = true;
  head.add(stem);
  return head.build();
}

export interface Gap {
  x: number;
  y: number;
}

/**
 * Find the `count` biggest gaps between heads on the bouquet disc. Candidates sit on a
 * golden-angle spiral; each pick is the candidate farthest from every head rim, and
 * candidates close to an earlier pick are skipped. Deterministic.
 */
export function findGaps(points: LayoutPoint[], radii: number[], discRadius: number, count: number): Gap[] {
  const candidates: Gap[] = [];
  const N = 320;
  for (let i = 0; i < N; i++) {
    const r = discRadius * 0.92 * Math.sqrt((i + 0.5) / N);
    const a = i * GOLDEN_ANGLE;
    candidates.push({ x: r * Math.cos(a), y: r * Math.sin(a) * DISC_SQUASH });
  }
  const score = (c: Gap) => {
    let best = Infinity;
    points.forEach((p, i) => {
      best = Math.min(best, Math.hypot(c.x - p.x, c.y - p.y) - radii[i] * 0.85);
    });
    return best;
  };
  const scored = candidates.map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s);
  const picks: Gap[] = [];
  for (const { c } of scored) {
    if (picks.length >= count) break;
    if (picks.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 0.4)) continue;
    picks.push(c);
  }
  return picks;
}

/** Shared by every bouquet (not disposed). */
const floretMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });

/** One InstancedMesh holding every floret of every cluster. */
export function buildBabysBreath(
  rng: Rng,
  clusters: Array<{ position: THREE.Vector3; normal: THREE.Vector3 }>,
  florets: number,
): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(0.02, 1);
  const mat = floretMaterial;
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(clusters.length * florets, 1));
  mesh.userData.owned = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const colour = new THREE.Color();
  let n = 0;
  for (const cluster of clusters) {
    tangent.set(1, 0, 0).cross(cluster.normal).normalize();
    bitangent.copy(cluster.normal).cross(tangent);
    for (let i = 0; i < florets; i++) {
      // a shallow spray: florets on a little dome above the cluster point
      const a = rng() * Math.PI * 2;
      const r = 0.15 * Math.sqrt(rng());
      const h = 0.06 * (1 - (r / 0.15) ** 2) + jitter(rng, 0.015);
      p.copy(cluster.position)
        .addScaledVector(tangent, Math.cos(a) * r)
        .addScaledVector(bitangent, Math.sin(a) * r)
        .addScaledVector(cluster.normal, h);
      s.setScalar(range(rng, 0.6, 1.15));
      m.compose(p, q, s);
      mesh.setMatrixAt(n, m);
      colour.setRGB(0.96, 0.95 - rng() * 0.03, 0.92 - rng() * 0.04);
      mesh.setColorAt(n, colour);
      n++;
    }
  }
  mesh.count = clusters.length * florets;
  return mesh;
}
