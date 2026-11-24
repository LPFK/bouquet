import './style.css';
import type { Quality } from './scene/stage';
import { startApp } from './app';

/**
 * URL params:
 *   ?seed=42          another deterministic bouquet
 *   ?theme=automne    colour theme (classique|printemps|automne|mariage)
 *   ?solo=rose        one large flower (rose|tulip|daisy|bud)
 *   ?quality=low|high force a quality tier (default: auto, adapts down if frames are slow)
 *   ?debug            live tuning panel
 *   ?still            freeze time, skip bloom-in, hide UI (for screenshots and visual diffs)
 */
const params = new URLSearchParams(location.search);

function resolveQuality(): Quality {
  const forced = params.get('quality');
  if (forced === 'low' || forced === 'high') return forced;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  return coarse || cores <= 4 ? 'low' : 'high';
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

const container = document.getElementById('app');
if (!container || !webglAvailable()) {
  document.getElementById('fallback')?.removeAttribute('hidden');
} else {
  const forced = params.get('quality');
  startApp(container, {
    quality: resolveQuality(),
    qualityForced: forced === 'low' || forced === 'high',
    still: params.has('still'),
    debug: params.has('debug'),
  });
}
