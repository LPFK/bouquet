import * as THREE from 'three';
import { BOUQUET, FX, INTERACTION, MOTION, PERF, THEME_NAMES, THEMES, type FlowerKind, type ThemeName } from './config';
import { createStage, type Quality } from './scene/stage';
import { createAtmosphere } from './scene/atmosphere';
import { buildBouquet, buildSolo, type Bouquet } from './flowers/bouquet';
import { createPostFX } from './effects/postfx';
import { createParallax } from './effects/parallax';
import { createFalling } from './effects/falling';
import { createControls, type Controls } from './ui/controls';
import { createEnvelope } from './secret/envelope';
import type { Letter } from './secret/crypto';

/**
 * App shell: owns the current view (bouquet or single flower), transitions between views
 * (old flowers fold back into the wrap, new ones bloom), pointer interaction (hover lean,
 * click to regenerate, focus follows the hovered head), falling petals, and the render
 * loop with its performance guards (pause when hidden, adaptive quality).
 *
 * The view lives in the URL (?seed, ?theme, ?solo) so every bouquet can be linked to.
 */

export interface View {
  mode: 'bouquet' | 'solo';
  kind: FlowerKind;
  seed: number;
  theme: ThemeName;
}

const KINDS: FlowerKind[] = ['rose', 'tulip', 'daisy', 'bud'];

export function viewFromUrl(): View {
  const p = new URLSearchParams(location.search);
  const solo = p.get('solo');
  const theme = p.get('theme');
  return {
    mode: solo ? 'solo' : 'bouquet',
    kind: KINDS.includes(solo as FlowerKind) ? (solo as FlowerKind) : 'rose',
    seed: Number(p.get('seed') ?? BOUQUET.seed) || BOUQUET.seed,
    theme: THEME_NAMES.includes(theme as ThemeName) ? (theme as ThemeName) : THEME_NAMES[0],
  };
}

function urlFor(view: View): string {
  const p = new URLSearchParams(location.search);
  p.set('seed', String(view.seed));
  if (view.theme === THEME_NAMES[0]) p.delete('theme');
  else p.set('theme', view.theme);
  if (view.mode === 'solo') p.set('solo', view.kind);
  else p.delete('solo');
  return `${location.pathname}?${p.toString()}`;
}

export interface AppOptions {
  quality: Quality;
  /** true when ?quality was given: never adapt */
  qualityForced: boolean;
  still: boolean;
  debug: boolean;
}

export function startApp(container: HTMLElement, opts: AppOptions) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { motion: reduced ? MOTION.reducedFactor : 1 };
  let view = viewFromUrl();

  const stage = createStage(container, opts.quality);
  const atmosphere = createAtmosphere(stage.scene, view.seed, stage.keyLight);
  const fx = createPostFX(stage, opts.quality);
  const parallax = createParallax(stage);
  const falling = createFalling(stage.scene, view.seed);
  stage.resize();

  if (opts.debug) void import('./debug').then((m) => m.mountDebug(fx, state, stage.renderer.info));

  // ---------- views and transitions ----------
  const build = (v: View): Bouquet =>
    v.mode === 'solo' ? buildSolo(v.kind, v.seed, THEMES[v.theme]) : buildBouquet(v.seed, THEMES[v.theme]);

  // ?still and reduced motion skip the bloom-in: the view appears fully grown
  const instant = opts.still || reduced;
  let current = build(view);
  stage.scene.add(current.group);
  let age = instant ? Infinity : 0;
  let leave = -1; // < 0: not leaving; 0..1: outro progress
  let pending: View | null = null;
  let hovered: number | null = null;

  let controls: Controls | null = null;

  // ---------- secret page: unlocked by password, shows an envelope at the bouquet's foot ----------
  let letter: Letter | null = null;
  let secret = false;
  let letterOpen = false;
  /** one more frame is drawn after the letter opens (envelope lifted), then rendering pauses */
  let letterShown = false;
  let envelopeHover = false;
  const envelope = opts.still ? null : createEnvelope(stage.scene);
  const syncControls = () => controls?.setState({ ...view, unlocked: letter !== null, secret });

  async function toggleSecret() {
    if (secret) {
      secret = false;
      syncControls();
      return;
    }
    if (!letter) {
      const { askPassword } = await import('./secret/letter-ui');
      letter = await askPassword();
      if (!letter) return;
    }
    secret = true;
    // our bouquet: the classic red roses
    show({ ...view, mode: 'bouquet', theme: THEME_NAMES[0] }, view.mode === 'bouquet' ? 'replace' : 'push');
    controls?.hint('Une lettre t’attend… clique sur l’enveloppe', 6000);
  }

  async function readLetter() {
    if (!letter || letterOpen) return;
    letterOpen = true;
    const { showLetter } = await import('./secret/letter-ui');
    await showLetter(letter);
    letterOpen = false;
  }

  function show(next: View, history: 'push' | 'replace' | 'none') {
    if (history !== 'none') {
      const url = urlFor(next);
      if (history === 'push') window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
    }
    if (next.mode !== 'bouquet') secret = false;
    view = next;
    syncControls();
    pending = next;
    if (instant) swap();
    else if (leave < 0) leave = 0;
  }

  function swap() {
    if (!pending) return;
    current.dispose();
    current = build(pending);
    stage.scene.add(current.group);
    pending = null;
    leave = -1;
    age = instant ? Infinity : 0;
    hovered = null;
  }

  const randomSeed = () => 1 + Math.floor(Math.random() * 999_999);
  const regenerate = () => show({ ...view, seed: randomSeed() }, 'replace');

  if (!opts.still) {
    controls = createControls({
      onNew: regenerate,
      onBouquet: () => view.mode !== 'bouquet' && show({ ...view, mode: 'bouquet' }, 'push'),
      onSolo: (kind) => show({ ...view, mode: 'solo', kind, seed: view.mode === 'solo' ? view.seed : randomSeed() }, 'push'),
      onTheme: () => {
        const i = THEME_NAMES.indexOf(view.theme);
        show({ ...view, theme: THEME_NAMES[(i + 1) % THEME_NAMES.length] }, 'replace');
      },
      onSecret: () => void toggleSecret(),
    });
    syncControls();
  }
  window.addEventListener('popstate', () => show(viewFromUrl(), 'none'));

  // ---------- pointer: hover, click to regenerate ----------
  const canvas = stage.renderer.domElement;
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  let pointerInside = false;
  let pickDirty = false;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    pointerInside = true;
    pickDirty = true;
  });
  canvas.addEventListener('pointerleave', () => {
    pointerInside = false;
    pickDirty = true;
  });
  let down: { x: number; y: number; t: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || opts.still) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const held = performance.now() - down.t;
    down = null;
    if (moved >= 10 || held >= 600) return;
    // the envelope takes the click before the bouquet does
    if (envelopeVisible()) {
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, stage.camera);
      if (raycaster.intersectObject(envelope!.mesh, false).length) {
        void readLetter();
        return;
      }
    }
    regenerate();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'n' && !e.repeat && !(e.target instanceof HTMLInputElement)) regenerate();
  });

  const envelopeVisible = () => !!envelope && secret && view.mode === 'bouquet' && leave < 0;

  function pick() {
    pickDirty = false;
    let index: number | null = null;
    envelopeHover = false;
    if (pointerInside && leave < 0) {
      raycaster.setFromCamera(ndc, stage.camera);
      envelopeHover = envelopeVisible() && raycaster.intersectObject(envelope!.mesh, false).length > 0;
      const hit = envelopeHover ? undefined : raycaster.intersectObjects(current.pickables, false)[0];
      if (hit) index = hit.object.userData.head as number;
    }
    if (index !== hovered) {
      hovered = index;
      current.setHover(index);
    }
  }

  // ---------- focus: follows the hovered head ----------
  const headPos = new THREE.Vector3();
  let focus = stage.camera.position.distanceTo(stage.cameraTarget) + FX.bokeh.focusOffset;

  // ---------- performance guards ----------
  let slowFor = 0;
  let avgMs = 16;
  let warmup = 2;
  let adaptive = !opts.qualityForced && !opts.still && opts.quality === 'high';
  function watchPerf(rawDt: number) {
    if (!adaptive) return;
    if (warmup > 0) {
      warmup -= rawDt;
      return;
    }
    avgMs += (rawDt * 1000 - avgMs) * 0.05;
    slowFor = avgMs > PERF.slowFrameMs ? slowFor + rawDt : 0;
    if (slowFor > PERF.slowFor) {
      adaptive = false;
      fx.bokeh.enabled = false;
      stage.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      stage.resize();
      console.info(`[bouquet] frames averaged ${avgMs.toFixed(1)} ms: switched to low quality`);
    }
  }

  // ---------- loop ----------
  // Count draw calls per frame (all passes), not per renderer.render() call.
  stage.renderer.info.autoReset = false;
  const clock = new THREE.Clock();
  let time = 0;
  function frame() {
    const rawDt = clock.getDelta();
    // The letter covers the scene (blurred backdrop): stop rendering so its animation and
    // scrolling get the whole device. The last frame stays on the canvas behind it.
    if (letterOpen && letterShown) return;
    letterShown = letterOpen;
    stage.renderer.info.reset();
    const dt = Math.min(rawDt, 1 / 20);
    // Transitions run on (capped) real time, so they keep their duration on slow devices.
    const tdt = Math.min(rawDt, 0.25);
    watchPerf(rawDt);
    if (!opts.still) {
      time += dt;
      if (Number.isFinite(age)) age += tdt;
    }
    if (leave >= 0) {
      leave += tdt / INTERACTION.outroDuration;
      if (leave >= 1) swap();
    }

    parallax.update(dt, time, state.motion);
    if (pickDirty) pick();
    current.update(time, dt, state.motion, age, Math.max(leave, 0));
    atmosphere.update(opts.still ? 0 : dt, time, state.motion);
    envelope?.update(time, dt, envelopeVisible(), envelopeHover || letterOpen);
    if (!opts.still) falling.update(dt, state.motion, leave < 0 && view.mode === 'bouquet' ? current : null);

    // Focal plane: the hovered head, else the front of the bouquet.
    const camDist = stage.camera.position.distanceTo(stage.cameraTarget);
    const target = hovered !== null ? stage.camera.position.distanceTo(current.headPosition(hovered, headPos)) : camDist + FX.bokeh.focusOffset;
    focus += (target - focus) * (1 - Math.pow(1 - 0.08, dt * 60));
    fx.setFocus(opts.still ? camDist + FX.bokeh.focusOffset : focus);
    fx.render(dt, time);
  }

  stage.renderer.setAnimationLoop(frame);
  // Nothing to see in a hidden tab: stop rendering entirely.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stage.renderer.setAnimationLoop(null);
    else {
      clock.getDelta(); // drop the time spent hidden
      stage.renderer.setAnimationLoop(frame);
    }
  });

  requestAnimationFrame(() => document.body.classList.add('ready'));
}
