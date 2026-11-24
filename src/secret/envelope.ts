import * as THREE from 'three';

/**
 * The envelope resting at the foot of the bouquet on the secret page: a cream envelope
 * with its flap folds and a red wax seal, drawn on a canvas (no image assets). It floats
 * a little, glows when hovered, and pops in when the secret page opens.
 */
export interface Envelope {
  mesh: THREE.Mesh;
  /** `visible` animates in/out; `hover` lifts it */
  update(time: number, dt: number, visible: boolean, hover: boolean): void;
}

function envelopeTexture(): THREE.CanvasTexture {
  const w = 640;
  const h = 420;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;

  // paper with a soft vertical gradient
  const paper = c.createLinearGradient(0, 0, 0, h);
  paper.addColorStop(0, '#f7ecdc');
  paper.addColorStop(1, '#e9d8bf');
  c.fillStyle = paper;
  c.beginPath();
  c.roundRect(4, 4, w - 8, h - 8, 14);
  c.fill();

  // side and bottom folds
  c.strokeStyle = 'rgba(120, 90, 60, 0.28)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(10, h - 10);
  c.lineTo(w / 2, h * 0.5);
  c.lineTo(w - 10, h - 10);
  c.stroke();

  // top flap, slightly shaded
  c.fillStyle = 'rgba(214, 190, 158, 0.55)';
  c.beginPath();
  c.moveTo(8, 10);
  c.lineTo(w / 2, h * 0.58);
  c.lineTo(w - 8, 10);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(120, 90, 60, 0.35)';
  c.stroke();

  // wax seal
  const sx = w / 2;
  const sy = h * 0.58;
  c.save();
  c.shadowColor = 'rgba(60, 0, 10, 0.45)';
  c.shadowBlur = 10;
  c.shadowOffsetY = 3;
  c.fillStyle = '#8e1426';
  c.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 46 + (i % 2 === 0 ? 3 : -2);
    c.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
  }
  c.fill();
  c.restore();
  c.fillStyle = '#a8213a';
  c.beginPath();
  c.arc(sx, sy, 34, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255, 220, 220, 0.85)';
  c.font = 'italic 44px Georgia, "Times New Roman", serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('B', sx, sy + 2);

  // handwritten-ish address line
  c.fillStyle = 'rgba(70, 45, 30, 0.75)';
  c.font = 'italic 34px Georgia, "Times New Roman", serif';
  c.fillText('À ma Bibi', w / 2, h * 0.84);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createEnvelope(scene: THREE.Scene): Envelope {
  const mat = new THREE.MeshStandardMaterial({
    map: envelopeTexture(),
    roughness: 0.85,
    transparent: true,
    emissive: new THREE.Color('#ffd9b0'),
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.63), mat);
  const rest = new THREE.Vector3(0.82, -1.72, 0.75);
  mesh.position.copy(rest);
  mesh.rotation.set(-0.22, -0.12, -0.16);
  mesh.scale.setScalar(1e-4);
  mesh.visible = false;
  scene.add(mesh);

  let shown = 0;
  let lift = 0;
  return {
    mesh,
    update(time, dt, visible, hover) {
      const k = (rate: number) => 1 - Math.pow(1 - rate, dt * 60);
      shown += ((visible ? 1 : 0) - shown) * k(0.06);
      lift += ((hover ? 1 : 0) - lift) * k(0.15);
      mesh.visible = shown > 0.01;
      // a little overshoot as it appears
      const pop = shown * (1 + 0.12 * Math.sin(Math.min(shown, 1) * Math.PI));
      mesh.scale.setScalar(Math.max(pop * (1 + 0.07 * lift), 1e-4));
      mesh.position.set(rest.x, rest.y + Math.sin(time * 1.1) * 0.025 + lift * 0.06, rest.z + lift * 0.12);
      mesh.rotation.z = -0.16 + Math.sin(time * 0.8) * 0.03 + lift * 0.08;
      mat.emissiveIntensity = 0.08 + lift * 0.22;
      mat.opacity = Math.min(shown * 1.2, 1);
    },
  };
}
