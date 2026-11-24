import { GOLDEN_ANGLE, jitter, type Rng } from '../utils/random';

/**
 * Head placement on the bouquet disc (seen from the front), before it is lifted onto
 * the dome. Starts from a golden-angle spiral (focal heads first, in the middle), then
 * relaxes so neighbouring heads overlap by at most `overlap` of their radii. Without the
 * relaxation large heads interpenetrate and their petals poke through each other.
 * Deterministic: only the seeded rng is used.
 */
export interface LayoutPoint {
  x: number;
  y: number;
}

/** Vertical squash of the disc (a bouquet reads a little wider than tall). */
export const DISC_SQUASH = 0.82;

export function layoutHeads(radii: number[], domeRadius: number, overlap: number, rng: Rng): LayoutPoint[] {
  const n = radii.length;
  const pts: LayoutPoint[] = radii.map((_, i) => {
    const r = domeRadius * Math.sqrt((i + 0.5) / n);
    const theta = i * GOLDEN_ANGLE + jitter(rng, 0.15);
    return { x: r * Math.cos(theta), y: r * Math.sin(theta) * DISC_SQUASH };
  });

  const keep = 1 - overlap;
  for (let iter = 0; iter < 80; iter++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pts[i];
        const b = pts[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const min = (radii[i] + radii[j]) * keep;
        if (d >= min) continue;
        if (d < 1e-5) {
          // coincident: separate along a fixed, index-derived direction
          dx = Math.cos(i + j);
          dy = Math.sin(i + j);
          d = 1;
        }
        const push = (min - Math.min(d, min)) / 2;
        // the bigger head moves less, so focal roses keep the centre
        const wa = radii[j] / (radii[i] + radii[j]);
        const wb = 1 - wa;
        a.x -= (dx / d) * push * 2 * wa;
        a.y -= (dy / d) * push * 2 * wa;
        b.x += (dx / d) * push * 2 * wb;
        b.y += (dy / d) * push * 2 * wb;
        moved += push;
      }
    }
    // gentle pull to the centre keeps the bunch compact
    for (const p of pts) {
      p.x *= 0.995;
      p.y *= 0.995;
    }
    if (moved < 1e-4) break;
  }
  return pts;
}
