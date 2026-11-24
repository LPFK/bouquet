import { THEMES, PALETTES, type FlowerKind, type ThemeName } from '../config';

/**
 * Discreet control bar (bottom centre): new bouquet, back to the bouquet, single-flower
 * views, colour theme. Icon buttons with French labels shown as tooltips; the bar fades
 * when the pointer is idle and comes back on any movement, touch or keyboard focus.
 */

export interface ControlsState {
  mode: 'bouquet' | 'solo';
  kind: FlowerKind;
  theme: ThemeName;
  /** the secret page is unlocked / currently shown */
  unlocked?: boolean;
  secret?: boolean;
}

export interface ControlsHandlers {
  onNew(): void;
  onBouquet(): void;
  onSolo(kind: FlowerKind): void;
  onTheme(): void;
  onSecret(): void;
}

export interface Controls {
  setState(state: ControlsState): void;
  /** show a short message above the bar for a few seconds */
  hint(text: string, ms?: number): void;
}

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
  shuffle: svg(
    '<path d="M3 7h3.2c2 0 3 1.1 4.4 3.5S13.3 14 15.6 14H20"/><path d="M17 11l3 3-3 3"/><path d="M3 17h3.2c1.2 0 2-.4 2.8-1.2"/><path d="M13 8.2c.7-.8 1.5-1.2 2.6-1.2H20"/><path d="M17 4l3 3-3 3"/>',
  ),
  bouquet: svg('<path d="M8.2 12.5L12 21l3.8-8.5"/><circle cx="8.8" cy="9.6" r="2.6"/><circle cx="15.2" cy="9.6" r="2.6"/><circle cx="12" cy="5.6" r="2.6"/>'),
  rose: svg(
    '<circle cx="12" cy="9.5" r="5.8"/><path d="M12 9.6c0-1.3 1.4-1.8 2.2-1 .9.9.3 2.6-1.3 3-1.9.5-3.6-.9-3.3-2.9.3-2.2 2.8-3.4 4.9-2.6"/><path d="M12 15.3V21"/><path d="M12 18.6c-1.4-1.3-2.8-1.6-3.8-1.3"/>',
  ),
  tulip: svg('<path d="M7 4.5l2.6 3.2L12 3.8l2.4 3.9L17 4.5v5.2a5 5 0 0 1-10 0z"/><path d="M12 14.7V21"/><path d="M12 18.2c1.4-1.4 2.9-1.9 4.4-1.7"/>'),
  daisy: svg(
    '<circle cx="12" cy="10" r="2.1"/><path d="M12 3.6v2.6M12 13.8v2.6M5.6 10h2.6M15.8 10h2.6M7.5 5.5l1.8 1.8M14.7 12.7l1.8 1.8M7.5 14.5l1.8-1.8M14.7 7.3l1.8-1.8" stroke-width="2.1"/><path d="M12 16.4V21"/>',
  ),
  bud: svg('<path d="M12 3.5c3 2.6 3.4 6.2 0 9.3-3.4-3.1-3-6.7 0-9.3z"/><path d="M9.3 11.3L12 14l2.7-2.7"/><path d="M12 14v7"/>'),
  lock: svg('<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.4"/><path d="M8.6 10.5V8a3.4 3.4 0 0 1 6.8 0v2.5"/>'),
  heart: svg('<path d="M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4z"/>'),
};

const SOLO: Array<{ kind: FlowerKind; label: string }> = [
  { kind: 'rose', label: 'Rose' },
  { kind: 'tulip', label: 'Tulipe' },
  { kind: 'daisy', label: 'Marguerite' },
  { kind: 'bud', label: 'Bouton' },
];

function button(label: string, icon: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ctl';
  b.setAttribute('aria-label', label);
  b.dataset.label = label;
  b.innerHTML = icon;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function separator(): HTMLElement {
  const s = document.createElement('span');
  s.className = 'ctl-sep';
  s.setAttribute('aria-hidden', 'true');
  return s;
}

export function createControls(handlers: ControlsHandlers): Controls {
  const bar = document.createElement('nav');
  bar.className = 'controls';
  bar.setAttribute('aria-label', 'Commandes du bouquet');
  // clicks on the bar must never reach the canvas (which regenerates on click)
  for (const type of ['pointerdown', 'pointerup', 'click'] as const) bar.addEventListener(type, (e) => e.stopPropagation());

  const newBtn = button('Nouveau bouquet', ICONS.shuffle, handlers.onNew);
  const bouquetBtn = button('Bouquet', ICONS.bouquet, handlers.onBouquet);
  const soloBtns = SOLO.map(({ kind, label }) => button(label, ICONS[kind], () => handlers.onSolo(kind)));
  const themeBtn = button('Thème', '', handlers.onTheme);
  themeBtn.classList.add('ctl-theme');
  const secretBtn = button('Secret', ICONS.lock, handlers.onSecret);
  secretBtn.classList.add('ctl-secret');

  bar.append(newBtn, bouquetBtn, separator(), ...soloBtns, separator(), themeBtn, secretBtn);
  document.body.appendChild(bar);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = matchMedia('(pointer: coarse)').matches
    ? 'Touchez pour faire éclore un nouveau bouquet'
    : 'Cliquez pour faire éclore un nouveau bouquet';
  document.body.appendChild(hint);
  let hintTimer = 0;
  const showHint = (text: string, ms = 4700) => {
    hint.textContent = text;
    hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => hint.classList.remove('show'), ms);
  };
  setTimeout(() => showHint(hint.textContent ?? ''), 1800);

  // Idle fade: the bar dims after a few seconds without input.
  let idleTimer = 0;
  const wake = () => {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (!bar.matches(':hover, :focus-within')) document.body.classList.add('idle');
    }, 2800);
  };
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'focusin'] as const) window.addEventListener(type, wake, { passive: true });
  wake();

  return {
    hint: showHint,
    setState({ mode, kind, theme, unlocked = false, secret = false }) {
      secretBtn.classList.toggle('unlocked', unlocked);
      secretBtn.classList.toggle('active', secret);
      secretBtn.setAttribute('aria-pressed', String(secret));
      secretBtn.innerHTML = unlocked ? ICONS.heart : ICONS.lock;
      secretBtn.dataset.label = !unlocked ? 'Secret' : secret ? 'Quitter la page secrète' : 'Page secrète';
      secretBtn.setAttribute('aria-label', secretBtn.dataset.label);
      bouquetBtn.classList.toggle('active', mode === 'bouquet' && !secret);
      bouquetBtn.setAttribute('aria-pressed', String(mode === 'bouquet'));
      soloBtns.forEach((b, i) => {
        const on = mode === 'solo' && SOLO[i].kind === kind;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      newBtn.dataset.label = mode === 'bouquet' ? 'Nouveau bouquet' : 'Une autre fleur';
      newBtn.setAttribute('aria-label', newBtn.dataset.label);
      const t = THEMES[theme];
      const label = `Thème : ${t.label}`;
      themeBtn.dataset.label = label;
      themeBtn.setAttribute('aria-label', `${label} (changer)`);
      const dots = [t.flowers[0], t.flowers[2], t.flowers[4]]
        .map((p) => `<i style="background:${PALETTES[p].tip}"></i>`)
        .join('');
      themeBtn.innerHTML = `<span class="swatch" aria-hidden="true">${dots}</span>`;
    },
  };
}
