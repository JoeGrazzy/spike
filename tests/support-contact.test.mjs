import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('Help Centre exposes the configured WhatsApp support contact without treating it as a bank destination', () => {
  const html = read('help.html');
  assert.match(html, /https:\/\/wa\.me\/2349159096952/);
  assert.match(html, /09159096952/);
  assert.match(html, /not a bank account or payment destination/i);
  assert.match(html, /Support email is not configured yet/);
});
test('Cloudinary raw upload documentation matches the 10 MB client-side limit', () => {
  const source = read('js/spike-cloudinary-storage.js');
  const docs = read('CLOUDINARY_STORAGE.md');
  assert.match(source, /MAX_RAW_BYTES = 10 \* 1024 \* 1024/);
  assert.match(docs, /10 MB maximum for raw files/);
  assert.doesNotMatch(docs, /25 MB maximum for raw files/);
});
