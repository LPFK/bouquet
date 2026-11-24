import { openLetter, type Letter } from './crypto';

/**
 * DOM overlays for the secret page (French text):
 * - askPassword(): small glass dialog; resolves with the decrypted letter, or null if closed
 * - showLetter(): the envelope opens, the letter slides out and unfolds into the poem
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Overlay plumbing shared by both dialogs: Escape and backdrop click close it. */
function overlay(cls: string, label: string, onClose: () => void) {
  const root = el('div', `overlay ${cls}`);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', label);
  // never let clicks reach the canvas (which regenerates the bouquet)
  for (const type of ['pointerdown', 'pointerup', 'click'] as const) root.addEventListener(type, (e) => e.stopPropagation());
  root.addEventListener('click', (e) => {
    if (e.target === root) onClose();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    e.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);
  document.body.appendChild(root);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('in')));
  const remove = () => {
    window.removeEventListener('keydown', onKey, true);
    root.classList.remove('in');
    root.classList.add('leaving');
    setTimeout(() => root.remove(), 600);
  };
  return { root, remove };
}

const LOCK_ICON =
  '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/><circle cx="12" cy="15.5" r="1.2"/></svg>';

export function askPassword(): Promise<Letter | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (letter: Letter | null) => {
      if (done) return;
      done = true;
      ui.remove();
      resolve(letter);
    };
    const ui = overlay('lock', 'Page secrète', () => finish(null));

    const form = el('form', 'lock-card');
    form.innerHTML = LOCK_ICON;
    const label = el('label', 'lock-label', 'Un mot de passe pour entrer');
    label.htmlFor = 'secret-password';
    const input = el('input', 'lock-input');
    input.id = 'secret-password';
    input.type = 'password';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    const submit = el('button', 'lock-submit', 'Ouvrir');
    submit.type = 'submit';
    const error = el('p', 'lock-error');
    error.setAttribute('aria-live', 'polite');
    const row = el('div', 'lock-row');
    row.append(input, submit);
    form.append(label, row, error);
    ui.root.appendChild(form);
    setTimeout(() => input.focus(), 250);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      submit.disabled = true;
      error.textContent = '';
      const letter = await openLetter(input.value);
      submit.disabled = false;
      if (letter) {
        form.classList.add('ok');
        setTimeout(() => finish(letter), 450);
      } else {
        error.textContent = 'Ce n’est pas le bon mot de passe';
        form.classList.remove('shake');
        void form.offsetWidth; // restart the animation
        form.classList.add('shake');
        input.select();
      }
    });
  });
}

export function showLetter(letter: Letter): Promise<void> {
  return new Promise((resolve) => {
    const timers: number[] = [];
    const ui = overlay('letter', letter.title, () => {
      timers.forEach(clearTimeout);
      ui.remove();
      resolve();
    });
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // the envelope, drawn in CSS
    const env = el('div', 'env');
    env.append(el('div', 'env-back'), el('div', 'env-peek'), el('div', 'env-front'), el('div', 'env-flap'));
    const seal = el('div', 'env-seal', 'B');
    env.appendChild(seal);

    // the letter itself
    const card = el('article', 'letter-card');
    const close = el('button', 'letter-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fermer la lettre');
    close.innerHTML = '&times;';
    close.onclick = () => {
      timers.forEach(clearTimeout);
      ui.remove();
      resolve();
    };
    const title = el('h2', 'letter-title', letter.title);
    const poem = el('div', 'poem');
    letter.stanzas.forEach((lines, i) => {
      const p = el('p');
      p.style.setProperty('--i', String(i));
      lines.forEach((line, j) => {
        if (j) p.appendChild(el('br'));
        p.appendChild(document.createTextNode(line));
      });
      poem.appendChild(p);
    });
    const end = el('p', 'letter-end', '♡');
    card.append(close, title, poem, end);
    ui.root.append(env, card);

    // envelope: appear -> seal fades and flap opens -> letter rises -> letter unfolds.
    // Each step waits for the previous one, so a busy main thread delays the sequence
    // instead of collapsing it.
    const steps: Array<[string, number]> = reduced
      ? [['reading', 50]]
      : [
          ['open', 900],
          ['rise', 700],
          ['reading', 900],
        ];
    const run = (i: number) => {
      if (i >= steps.length) {
        close.focus({ preventScroll: true });
        return;
      }
      const [cls, wait] = steps[i];
      timers.push(
        window.setTimeout(() => {
          ui.root.classList.add(cls);
          run(i + 1);
        }, wait),
      );
    };
    run(0);
  });
}
