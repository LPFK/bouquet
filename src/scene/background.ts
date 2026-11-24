import * as THREE from 'three';
import { SCENE } from '../config';
import { createRng, range, type Rng } from '../utils/random';

/**
 * Soft depth layers between the backdrop and the bouquet, drawn procedurally on canvases
 * (no image assets). They are pre-blurred so they read as out of focus even at
 * quality=low, where the Bokeh pass is off.
 * - window light: a warm, blurred four-pane window glow, upper left, far back
 * - foliage: dark leaf silhouettes at the lower corners, mid distance
 * - shadow: the bouquet's soft shadow on a plane just behind it (key light is upper left)
 *
 * Blur trick: shapes are drawn off-canvas and only their `shadowBlur` lands on the canvas,
 * which works in every browser (unlike ctx.filter).
 */

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Draw `path` blurred by `blur` px in `color`, without drawing the sharp shape itself. */
function blurred(ctx: CanvasRenderingContext2D, blur: number, color: string, path: (ctx: CanvasRenderingContext2D) => void) {
  const off = 10000;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = off;
  ctx.translate(-off, 0);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  path(ctx);
  ctx.fill();
  ctx.restore();
}

function plane(tex: THREE.Texture, w: number, h: number, opacity: number, blending: THREE.Blending): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, blending });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

function windowLight(): THREE.Mesh {
  const tex = canvasTexture(256, 256, (ctx) => {
    // four panes separated by mullions
    const pane = (x: number, y: number) => (c: CanvasRenderingContext2D) => c.rect(x, y, 70, 82);
    for (const [x, y] of [
      [55, 40],
      [131, 40],
      [55, 128],
      [131, 128],
    ]) {
      blurred(ctx, 26, 'rgba(255,214,160,0.9)', pane(x, y));
    }
  });
  const mesh = plane(tex, 7, 7, SCENE.windowLight, THREE.AdditiveBlending);
  mesh.position.set(-6.2, 3.2, -10);
  mesh.rotation.z = 0.06;
  return mesh;
}

function leafPath(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, angle: number, width: number) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy * width;
  const ny = dx * width;
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + dx * len * 0.5 + nx, y + dy * len * 0.5 + ny, x + dx * len, y + dy * len);
  ctx.quadraticCurveTo(x + dx * len * 0.5 - nx, y + dy * len * 0.5 - ny, x, y);
}

function foliage(rng: Rng, flip: boolean): THREE.Mesh {
  const tex = canvasTexture(256, 256, (ctx) => {
    // a branch rising from the corner with leaves along it
    blurred(ctx, 14, 'rgba(6,7,8,1)', (c) => {
      let x = flip ? 250 : 6;
      let y = 256;
      let a = flip ? -2.1 : -1.05;
      for (let i = 0; i < 9; i++) {
        const step = range(rng, 18, 28);
        x += Math.cos(a) * step;
        y += Math.sin(a) * step;
        a += range(rng, -0.18, 0.18);
        const side = i % 2 === 0 ? 1 : -1;
        leafPath(c, x, y, range(rng, 40, 70), a + side * range(rng, 0.6, 1.0), range(rng, 10, 16));
      }
    });
  });
  const mesh = plane(tex, 5.5, 5.5, SCENE.foliage, THREE.NormalBlending);
  mesh.position.set(flip ? 4.6 : -4.6, -2.6, -6);
  return mesh;
}

function bouquetShadow(): THREE.Mesh {
  const tex = canvasTexture(256, 320, (ctx) => {
    blurred(ctx, 34, 'rgba(0,0,0,0.85)', (c) => {
      // flower mass
      c.ellipse(128, 105, 78, 68, 0, 0, Math.PI * 2);
    });
    blurred(ctx, 24, 'rgba(0,0,0,0.75)', (c) => {
      // paper cone below it
      c.moveTo(70, 140);
      c.lineTo(186, 140);
      c.lineTo(136, 290);
      c.lineTo(120, 290);
      c.closePath();
    });
  });
  const mesh = plane(tex, 4.2, 5.25, SCENE.shadow, THREE.NormalBlending);
  // offset down-right of the bouquet, away from the upper-left key light
  mesh.position.set(0.55, -0.85, -2.6);
  return mesh;
}

export function createBackground(scene: THREE.Scene, seed: number): void {
  const rng = createRng(seed ^ 0x68e31da4);
  scene.add(windowLight());
  scene.add(foliage(rng, false));
  scene.add(foliage(rng, true));
  scene.add(bouquetShadow());
}
