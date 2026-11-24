import * as THREE from 'three';
import { CAMERA, SCENE } from '../config';

export type Quality = 'high' | 'low';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** resting camera position, recomputed on resize (parallax offsets from it) */
  cameraBase: THREE.Vector3;
  cameraTarget: THREE.Vector3;
  keyLight: THREE.DirectionalLight;
  width: number;
  height: number;
  onResize(cb: (w: number, h: number) => void): void;
  resize(): void;
}

export function createStage(container: HTMLElement, quality: Quality): Stage {
  // Antialiasing is done by the MSAA render target in postfx, not the default framebuffer.
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5));
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps petal saturation better than ACES
  renderer.toneMappingExposure = SCENE.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE.background);

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 40);

  // Lights only affect MeshStandardMaterial parts (stems, hearts, ribbon).
  scene.add(new THREE.HemisphereLight(0xdfe6ef, 0x1c2026, 1.1));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
  key.position.set(-3, 4, 5);
  scene.add(key);

  const listeners: Array<(w: number, h: number) => void> = [];
  const stage: Stage = {
    renderer,
    scene,
    camera,
    cameraBase: new THREE.Vector3(),
    cameraTarget: new THREE.Vector3(...CAMERA.target),
    keyLight: key,
    width: 1,
    height: 1,
    onResize: (cb) => listeners.push(cb),
    resize() {
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      stage.width = w;
      stage.height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Back off on narrow (portrait) screens so the whole bouquet stays in frame.
      const fit = Math.max(1, CAMERA.minAspect / camera.aspect);
      stage.cameraBase.set(0, CAMERA.height, CAMERA.distance * fit);
      camera.position.copy(stage.cameraBase);
      camera.lookAt(stage.cameraTarget);
      camera.updateProjectionMatrix();
      listeners.forEach((cb) => cb(w, h));
    },
  };

  window.addEventListener('resize', () => stage.resize());
  return stage;
}
