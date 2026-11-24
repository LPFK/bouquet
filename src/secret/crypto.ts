import sealed from './letter.enc.json';

/**
 * The secret letter ships encrypted (see scripts/encrypt-letter.mjs). The password the
 * visitor types is the key: a wrong one fails AES-GCM authentication. Case and extra spaces
 * do not matter ("Mot  DE passe" matches "mot de passe"); anything else does.
 */

export interface Letter {
  title: string;
  /** stanzas, each a list of lines */
  stanzas: string[][];
}

export const normalisePassword = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Resolves with the letter, or null when the password is wrong. */
export async function openLetter(password: string): Promise<Letter | null> {
  try {
    const subtle = crypto.subtle;
    const baseKey = await subtle.importKey('raw', new TextEncoder().encode(normalisePassword(password)), 'PBKDF2', false, [
      'deriveKey',
    ]);
    const key = await subtle.deriveKey(
      { name: 'PBKDF2', salt: bytes(sealed.salt), iterations: sealed.iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: bytes(sealed.iv) }, key, bytes(sealed.data));
    const [title, ...rest] = new TextDecoder().decode(plain).split('\n');
    const stanzas = rest
      .join('\n')
      .trim()
      .split(/\n\s*\n/)
      .map((s) => s.split('\n').map((l) => l.trim()));
    return { title: title.trim(), stanzas };
  } catch {
    return null;
  }
}
