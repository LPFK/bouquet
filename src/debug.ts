import { FX, MOTION } from './config';
import { sharedContact, sharedSss } from './flowers/materials';
import type { PostFX } from './effects/postfx';

/** Live tuning panel, loaded only with ?debug. Copy good values back into config.ts. */
export async function mountDebug(fx: PostFX, state: { motion: number }, info: { render: { calls: number; triangles: number } }) {
  const { default: GUI } = await import('lil-gui');
  const gui = new GUI({ title: 'Bouquet debug' });

  const stats = gui.addFolder('Stats');
  const live = { drawCalls: 0, triangles: 0 };
  stats.add(live, 'drawCalls').listen().disable();
  stats.add(live, 'triangles').listen().disable();
  // whole-frame totals (scene + post passes), sampled once per second
  setInterval(() => {
    live.drawCalls = info.render.calls;
    live.triangles = info.render.triangles;
  }, 1000);

  const bokeh = gui.addFolder('Depth of field');
  const bu = fx.bokeh.uniforms as Record<string, { value: number }>;
  bokeh.add(fx.bokeh, 'enabled');
  bokeh.add(FX.bokeh, 'focusOffset', -2, 2, 0.01);
  bokeh.add(bu['aperture'], 'value', 0, 0.01, 0.0001).name('aperture');
  bokeh.add(bu['maxblur'], 'value', 0, 0.03, 0.0005).name('maxblur');

  const bloom = gui.addFolder('Bloom');
  bloom.add(fx.bloom, 'enabled');
  bloom.add(fx.bloom, 'strength', 0, 2, 0.01);
  bloom.add(fx.bloom, 'radius', 0, 1.5, 0.01);
  bloom.add(fx.bloom, 'threshold', 0, 1.5, 0.01);

  const film = gui.addFolder('Film');
  film.add(fx.grain.uniforms['uGrain'], 'value', 0, 0.2, 0.001).name('grain');
  film.add(fx.grain.uniforms['uVignette'], 'value', 0, 1, 0.01).name('vignette');

  const petals = gui.addFolder('Petals');
  petals.add(sharedSss, 'value', 0, 1.5, 0.01).name('subsurface');
  petals.add(sharedContact.strength, 'value', 0, 1, 0.01).name('contact shade');

  const motion = gui.addFolder('Motion');
  motion.add(state, 'motion', 0, 2, 0.01).name('global motion');
  motion.add(MOTION, 'parallax', 0, 2, 0.01);
  motion.add(MOTION, 'swayAmplitude', 0, 0.2, 0.001);
  motion.add(MOTION, 'swaySpeed', 0, 3, 0.01);
  motion.add(MOTION, 'idleDrift', 0, 1, 0.01);

  gui
    .add({ log: () => console.table({ FX, MOTION, subsurface: sharedSss.value, contactShade: sharedContact.strength.value }) }, 'log')
    .name('log values');
}
