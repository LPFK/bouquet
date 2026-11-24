import * as THREE from 'three';
import { BOUQUET, PALETTES, type FlowerPalette } from '../config';
import { jitter, lerp, type Rng } from '../utils/random';
import { matteMaterial, petalMaterial, petalTint, setTint } from './materials';
import { petalGeometry } from './petal';

/**
 * Florist's wrap: folded paper sheets on a cone around the stems, opening upward, plus
 * a ribbon bow at the tie. The cone axis is vertical through the tie point. Around it,
 * theta = 0 faces the camera (+Z) and theta = PI is the back. Each sheet's top edge is
 * high at the back (framing the heads) and low at the front (showing the flowers).
 *
 * Sheets use the petal shader: uv.y runs bottom to top, so the throat shadow darkens the
 * narrow end of the cone, and the back face (the inside of the paper) is darker.
 */

type WrapConfig = (typeof BOUQUET)['wrap'];

interface SheetSpec {
  palette: FlowerPalette;
  /** angular span, radians (0 = front) */
  from: number;
  to: number;
  /** radius multiplier, so overlapping sheets do not z-fight */
  scale: number;
  /** extra height at the back */
  rise: number;
}

/** Radius of the cone at height y (group space). */
function coneRadius(cfg: WrapConfig, tieY: number, y: number): number {
  const bottom = tieY - cfg.below;
  if (y <= tieY) return lerp(cfg.radiusBottom, cfg.radiusTie, (y - bottom) / (tieY - bottom));
  const d = y - tieY;
  const open = cfg.radiusTie + d * cfg.flare;
  return cfg.maxRadius * Math.tanh(open / cfg.maxRadius);
}

function sheetGeometry(
  cfg: WrapConfig,
  tie: THREE.Vector3,
  spec: SheetSpec,
  phase: number,
  pleatPhase: number,
): THREE.BufferGeometry {
  const segU = 48;
  const segV = 18;
  const bottom = tie.y - cfg.below;
  const positions = new Float32Array((segU + 1) * (segV + 1) * 3);
  const uvs = new Float32Array((segU + 1) * (segV + 1) * 2);
  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    for (let i = 0; i <= segU; i++) {
      const theta = lerp(spec.from, spec.to, i / segU);
      const backness = Math.pow(0.5 - 0.5 * Math.cos(theta), 0.8);
      const top = lerp(cfg.frontY, cfg.backY + spec.rise, backness) + 0.05 * Math.sin(theta * 5 + phase);
      const y = lerp(bottom, top, v);
      // Pleats: the paper is folded, so the radius ripples around the cone. All sheets share
      // the pleat phase, so stacked sheets stay parallel instead of weaving through each other.
      const pleat = 1 + 0.03 * Math.sin(theta * 9 + pleatPhase) * (0.25 + 0.75 * v);
      const r = coneRadius(cfg, tie.y, y) * spec.scale * pleat;
      const k = (j * (segU + 1) + i) * 3;
      positions[k] = r * Math.sin(theta);
      positions[k + 1] = y;
      positions[k + 2] = tie.z + r * Math.cos(theta);
      const u = (j * (segU + 1) + i) * 2;
      uvs[u] = i / segU;
      uvs[u + 1] = v;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i;
      const b = a + 1;
      const c = a + segU + 1;
      const d = c + 1;
      // (b - a) x (c - a) points away from the axis: the front face is the outside.
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function bow(cfg: WrapConfig, tie: THREE.Vector3, rng: Rng, ribbon: FlowerPalette): THREE.Group {
  const group = new THREE.Group();
  const satin = matteMaterial(ribbon.tip, 0.42, true);
  const bandR = coneRadius(cfg, tie.y, tie.y) * 1.02 + 0.012;

  const band = new THREE.Mesh(new THREE.TorusGeometry(bandR, 0.028, 10, 48), satin);
  band.position.copy(tie);
  band.rotation.x = Math.PI / 2;
  band.scale.set(1, 1, 1.6); // flat ribbon, not a rope
  group.add(band);

  const knotPos = new THREE.Vector3(tie.x, tie.y, tie.z + bandR + 0.02);
  const loopGeo = new THREE.TorusGeometry(0.105, 0.024, 8, 32);
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(loopGeo, satin);
    loop.position.copy(knotPos).add(new THREE.Vector3(side * 0.1, 0.02, -0.015));
    loop.scale.set(1, 0.55, 0.7);
    loop.rotation.set(0, side * 0.45, side * 0.25);
    group.add(loop);
  }

  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 10), satin);
  knot.position.copy(knotPos);
  knot.scale.set(1, 1.2, 0.7);
  group.add(knot);

  // Tails: notched ribbon strips hanging down from the knot.
  for (const side of [-1, 1]) {
    const geo = petalGeometry({
      length: 0.62 + jitter(rng, 0.06),
      width: 0.06,
      pointiness: 0,
      cup: 0.2,
      curl: -0.06,
      widest: 0.95,
      notch: 1,
    });
    const tail = new THREE.Mesh(geo, satin);
    tail.position.copy(knotPos);
    tail.rotation.set(0.12, side * 0.25, Math.PI + side * (0.16 + jitter(rng, 0.04)));
    group.add(tail);
  }
  return group;
}

export interface WrapColours {
  tissue: FlowerPalette;
  ribbon: FlowerPalette;
}

export function buildWrap(rng: Rng, colours: WrapColours, cfg = BOUQUET.wrap): THREE.Group {
  const group = new THREE.Group();
  const tie = new THREE.Vector3(...BOUQUET.tiePoint);
  const sheets: SheetSpec[] = [
    // tissue behind the flowers, peeking above the kraft
    { palette: colours.tissue, from: Math.PI * 0.5, to: Math.PI * 1.5, scale: 1.06, rise: 0.22 },
    // two kraft sheets, overlapping at the front and at the back
    { palette: PALETTES.kraft, from: -3.35, to: 0.85, scale: 1.0, rise: 0 },
    { palette: PALETTES.kraft, from: -0.75, to: 3.4, scale: 1.035, rise: 0.06 },
  ];
  const pleatPhase = rng() * 6.28;
  for (const spec of sheets) {
    // thin paper: the inside is only a little darker
    const mat = petalMaterial(spec.palette, { vein: 0, rim: 0.04, backTint: 0.82 });
    const geo = setTint(sheetGeometry(cfg, tie, spec, rng() * 6.28, pleatPhase), petalTint(rng, 1, 0.04));
    group.add(new THREE.Mesh(geo, mat));
  }
  group.add(bow(cfg, tie, rng, colours.ribbon));
  // Everything here except the ribbon tails (petal cache) is built per bouquet.
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.geometry.type !== 'BufferGeometry') o.userData.owned = true;
  });
  for (const sheet of group.children) if (sheet instanceof THREE.Mesh) sheet.userData.owned = true;
  return group;
}
