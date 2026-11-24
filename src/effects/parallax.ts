import * as THREE from 'three';
import { MOTION } from '../config';
import { clamp } from '../utils/random';
import type { Stage } from '../scene/stage';

/**
 * Camera parallax: pointer (desktop) or device tilt (mobile) moves the camera a little
 * around its resting position while it keeps looking at the bouquet. With no input,
 * a slow Lissajous drift keeps the depth layers sliding past each other.
 */
export interface Parallax {
  update(dt: number, time: number, motion: number): void;
}

export function createParallax(stage: Stage): Parallax {
  const input = new THREE.Vector2();
  const current = new THREE.Vector2();
  let lastInput = -Infinity;
  let now = 0;

  window.addEventListener('pointermove', (e) => {
    input.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    lastInput = now;
  });
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null || e.beta == null) return;
    input.set(clamp(e.gamma / 25, -1, 1), clamp((45 - e.beta) / 25, -1, 1));
    lastInput = now;
  });

  const idle = new THREE.Vector2();
  const goal = new THREE.Vector2();

  return {
    update(dt, time, motion) {
      now = time;
      // Blend from pointer to idle drift after 3s without input.
      const idleMix = clamp((time - lastInput - 3) / 2, 0, 1);
      idle.set(Math.sin(time * 0.23) * MOTION.idleDrift, Math.sin(time * 0.17 + 1.3) * MOTION.idleDrift * 0.7);
      goal.copy(input).lerp(idle, idleMix);

      const k = 1 - Math.pow(1 - MOTION.damping, dt * 60);
      current.lerp(goal, k);

      const s = MOTION.parallax * motion;
      const { camera, cameraBase, cameraTarget } = stage;
      camera.position.set(cameraBase.x + current.x * s, cameraBase.y + current.y * s * 0.6, cameraBase.z);
      camera.lookAt(cameraTarget);
    },
  };
}
