import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const page = fs.readFileSync(path.join(root, 'message.html'), 'utf8');

test('DM attachments open inside one accessible full-screen viewer', () => {
  assert.match(page, /id="dmViewer"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(page, /data-attachment-open=/);
  assert.match(page, /Tap to view photo/);
  assert.match(page, /createSignedUrl\(path,60\)/);
  assert.match(page, /stage\.append\(img\)/);
  assert.doesNotMatch(page, /window\.open\(data\.signedUrl/);
});

test('Viewer has explicit close, backdrop, Escape, and Android back handling', () => {
  assert.match(page, /dmViewerClose/);
  assert.match(page, /e\.target===\$\('dmViewer'\)/);
  assert.match(page, /e\.key==='Escape'[\s\S]{0,100}closeDmViewer/);
  assert.match(page, /addEventListener\('popstate'[\s\S]{0,120}closeDmViewer\(true\)/);
});

test('Viewer supports image zoom, video and audio previews, and download', () => {
  assert.match(page, /setDmZoom\(value\)/);
  assert.match(page, /dblclick/);
  assert.match(page, /video\.controls=true/);
  assert.match(page, /audio\.controls=true/);
  assert.match(page, /dmViewerDownload/);
});

test('Viewer preserves private bucket selection and legacy attachment compatibility', () => {
  assert.match(page, /attachment\._bucket\|\|MEDIA_BUCKET/);
  assert.match(page, /_bucket:'dm-media'/);
  assert.match(page, /includes\(me\.id\).*message\.deleted_at/);
});

test('Long-press menu follows the active SPIKE theme and avoids scroll-triggered activation', () => {
  assert.match(page, /background:linear-gradient\(145deg,var\(--spike-surface-2/);
  assert.match(page, /var\(--spike-line/);
  assert.match(page, /var\(--spike-accent/);
  assert.match(page, /addEventListener\('pointerdown'/);
  assert.match(page, /Math\.hypot\(dx,dy\)>12/);
  assert.match(page, /setTimeout\(\(\)=>\{if\(pressPointer!==e\.pointerId\|\|!swipeStart\)return;pressTriggered=true/);
  assert.doesNotMatch(page, /addEventListener\('touchstart'/);
});

test('Top-right download starts from attachment metadata without waiting for preview URL', () => {
  assert.match(page, /downloadDmAttachment\(dmViewerMessage\)/);
  assert.match(page, /createSignedUrl\(attachment\.path,60,\{download:fileName\}\)/);
  assert.match(page, /link\.click\(\)/);
  assert.doesNotMatch(page, /dmViewerDownload'\)\.addEventListener\('click',\(\)=>\{if\(!dmViewerMessage\|\|!dmViewerUrl\)/);
});
