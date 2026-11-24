import * as THREE from 'three';
import { INTERACTION } from '../config';
import { createRng, range } from '../utils/random';
import { petalMaterial, petalTint, setTint } from '../flowers/materials';
import { petalGeometry } from '../flowers/petal';
import type { Bouquet } from '../flowers/bouquet';

/**
 * Now and then a petal comes loose from a head and drifts down: a slow fall with a side
 * swing and a tumble, fading out (shrinking) near the end. Small pool, no physics engine.
 * Timing and choices use a seeded rng, so a given seed always drops the same petals.
 */
export interface Falling {
  update(dt: number, motion: number, bouquet: Bouquet | null): void;
}

interface Drop {
  mesh: THREE.Mesh;
  alive: boolean;
  age: number;
  life: number;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  swing: number;
  phase: number;
}

const FLOOR_Y = -3.4;

export function createFalling(scene: THREE.Scene, seed: number): Falling {
  const rng = createRng(seed ^ 0x2545f491);
  // one shape per pool slot, a small rose-like petal; tint attribute is required by the shader
  const pool: Drop[] = Array.from({ length: 3 }, (_, i) => {
    const geo = setTint(
      petalGeometry({ length: 0.2, width: 0.17, pointiness: 0.1, cup: 0.5, curl: 0.15, widest: 0.62, ruffle: 0.05, variant: i }).clone(),
      [1, 1, 1, 1],
    );
    const mesh = new THREE.Mesh(geo);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, alive: false, age: 0, life: 1, vel: new THREE.Vector3(), spin: new THREE.Vector3(), swing: 0, phase: 0 };
  });

  const [minWait, maxWait] = INTERACTION.fallingEvery;
  let wait = range(rng, minWait * 0.5, maxWait * 0.6);
  const from = new THREE.Vector3();

  function spawn(bouquet: Bouquet) {
    const drop = pool.find((d) => !d.alive);
    if (!drop || bouquet.heads.length === 0) return;
    const index = Math.floor(rng() * bouquet.heads.length);
    const head = bouquet.heads[index];
    if (head.kind === 'bud') return; // buds keep their petals
    bouquet.headPosition(index, from);
    drop.mesh.material = petalMaterial(head.palette, { vein: 0.06, rim: 0.18 });
    setTint(drop.mesh.geometry, petalTint(rng));
    drop.mesh.position.copy(from).add(new THREE.Vector3(range(rng, -0.1, 0.1), 0.05, 0.15));
    drop.mesh.rotation.set(rng() * 6.28, rng() * 6.28, rng() * 6.28);
    drop.mesh.scale.setScalar(1);
    drop.vel.set(range(rng, -0.05, 0.05), -range(rng, 0.16, 0.24), range(rng, 0.03, 0.08));
    drop.spin.set(range(rng, -1, 1), range(rng, -1.4, 1.4), range(rng, -0.8, 0.8));
    drop.swing = range(rng, 0.15, 0.3);
    drop.phase = rng() * 6.28;
    drop.age = 0;
    drop.life = (drop.mesh.position.y - FLOOR_Y) / -drop.vel.y;
    drop.alive = true;
    drop.mesh.visible = true;
  }

  return {
    update(dt, motion, bouquet) {
      if (motion > 0.5 && bouquet) {
        wait -= dt;
        if (wait <= 0) {
          spawn(bouquet);
          wait = range(rng, minWait, maxWait);
        }
      }
      for (const d of pool) {
        if (!d.alive) continue;
        d.age += dt;
        const m = d.mesh;
        // falling leaf motion: side swing, faster fall on the down-swing
        const s = Math.sin(d.age * 1.4 + d.phase);
        m.position.x += (d.vel.x + s * d.swing) * dt;
        m.position.y += d.vel.y * (1 + 0.35 * Math.abs(s)) * dt;
        m.position.z += d.vel.z * dt;
        m.rotation.x += d.spin.x * dt;
        m.rotation.y += d.spin.y * dt;
        m.rotation.z += d.spin.z * dt;
        const fadeIn = Math.min(d.age / 0.4, 1);
        const fadeOut = Math.min((d.life - d.age) / 1.5, 1);
        m.scale.setScalar(Math.max(Math.min(fadeIn, fadeOut), 1e-4));
        if (d.age >= d.life) {
          d.alive = false;
          m.visible = false;
        }
      }
    },
  };
}
