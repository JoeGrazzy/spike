import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../../message.html', import.meta.url), 'utf8');

test('conversation header profile photo has an accessible full-screen viewer', () => {
  assert.match(html, /id="profilePhotoShade"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="profilePhotoLarge"[^>]*hidden/);
  assert.match(html, /id="profilePhotoClose"[^>]*aria-label="Close profile photo"/);
  assert.match(html, /aria-label','View profile photo/);
});

test('profile viewer opens the current avatar image without stretching it', () => {
  assert.match(html, /thumb\?\.currentSrc\|\|thumb\?\.src/);
  assert.match(html, /photoLarge\.src=src/);
  assert.match(html, /object-fit:contain/);
  assert.match(html, /max-height:calc\(100dvh/);
});

test('profile viewer closes on outside tap, close button, Escape and browser Back', () => {
  assert.match(html, /e\.target===photoShade\)closeProfilePhoto\(\)/);
  assert.match(html, /profilePhotoClose'\)\.addEventListener\('click',\(\)=>closeProfilePhoto\(\)\)/);
  assert.match(html, /e\.key==='Escape'&&photoShade\.classList\.contains\('show'\)/);
  assert.match(html, /window\.addEventListener\('popstate'/);
});

test('avatar supports keyboard activation and viewer restores scrolling/focus on close', () => {
  assert.match(html, /e\.key==='Enter'\|\|e\.key===' '/);
  assert.match(html, /document\.body\.classList\.remove\('profile-photo-open'\)/);
  assert.match(html, /avatarEl\?\.focus\?\.\(\{preventScroll:true\}\)/);
});
