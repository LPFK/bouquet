// Encrypts the letter for the secret page, so the published site never contains it in clear.
//
//   node scripts/encrypt-letter.mjs [path/to/letter.txt]
//
// The password is asked for on the terminal (or read from the LETTER_PASSWORD environment
// variable). It is never written to any file, so the repository does not reveal it.
//
// Reads A_Letter_to_Bibi.txt (first line = title, the rest = poem), derives an AES-GCM key
// from the password with PBKDF2, and writes src/secret/letter.enc.json. The page decrypts it
// in the browser with the password the visitor types; a wrong password fails the AES-GCM
// authentication, so the password itself is never stored anywhere.
//
// The password is normalised exactly like in src/secret/crypto.ts (trim, lower case,
// collapse spaces). Re-run with another password to change it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const ITERATIONS = 250_000;

async function askPassword() {
  if (process.env.LETTER_PASSWORD) return process.env.LETTER_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Password for the letter: ');
  rl.close();
  return answer;
}

const PASSWORD = await askPassword();
if (!PASSWORD.trim()) {
  console.error('No password given, nothing written.');
  process.exit(1);
}

const normalise = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const b64 = (buf) => Buffer.from(buf).toString('base64');

const source = process.argv[2] ?? 'A_Letter_to_Bibi.txt';
const text = readFileSync(source, 'utf8').replace(/\r\n/g, '\n').trim();

const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalise(PASSWORD)), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt'],
);
const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));

mkdirSync('src/secret', { recursive: true });
writeFileSync(
  'src/secret/letter.enc.json',
  JSON.stringify({ v: 1, iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) }, null, 2) + '\n',
);
console.log(`encrypted ${text.length} characters from ${source} -> src/secret/letter.enc.json`);
