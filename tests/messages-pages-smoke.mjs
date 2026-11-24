import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['messages.html', 'message.html'];
const jsFiles = ['js/spike-messages.js', 'js/spike-media-routing.js'];

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert.match(html, /<html lang="en"/i, `${page}: document language missing`);
  assert.match(html, /name="viewport"/, `${page}: viewport missing`);
  assert.match(html, /js\/spike-messages\.js\?v=messages-v1-fix-20261124/, `${page}: cache-busted message runtime missing`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${page}: duplicate HTML IDs`);
  for (const [, src] of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/gi)) {
    if (/^(?:https?:)?\/\//i.test(src)) continue;
    const local = src.split('?')[0];
    assert.ok(fs.existsSync(path.join(root, local)), `${page}: missing local asset ${local}`);
  }
}

for (const file of jsFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  new vm.Script(source, { filename: file });
}

const inbox = fs.readFileSync(path.join(root, 'messages.html'), 'utf8');
const thread = fs.readFileSync(path.join(root, 'message.html'), 'utf8');
assert.match(inbox, /id="list"/);
assert.match(inbox, /data-filter="unread"/);
assert.match(inbox, /id="contactPicker"/);
assert.match(thread, /id="thread"/);
assert.match(thread, /id="form"/);
assert.match(thread, /id="mediaInput"/);
assert.match(thread, /id="mediaShade"/);
assert.match(thread, /id="privateShareTitle"/);
assert.match(thread, /aria-labelledby="privateShareTitle"/);
for (const kind of ['image', 'video', 'audio', 'pdf', 'archive', 'any']) {
  assert.match(thread, new RegExp(`data-media-kind="${kind}"`), `private share option missing: ${kind}`);
}
assert.match(thread, /css\/spike-private-share\.css/, 'private share stylesheet missing');
const shareCss = fs.readFileSync(path.join(root, 'css/spike-private-share.css'), 'utf8');
assert.match(shareCss, /prefers-reduced-motion/);
assert.match(shareCss, /safe-area-inset-bottom/);
const mediaRouting = fs.readFileSync(path.join(root, 'js/spike-media-routing.js'), 'utf8');
assert.match(mediaRouting, /event\.key === 'Escape'/);
assert.match(mediaRouting, /aria-hidden', 'false'/);
assert.match(mediaRouting, /createSignedUrl|uploadPrivate/);
assert.match(thread, /id="typingIndicator"/);
assert.match(thread, /id="loadOlder"/);

console.log('SPIKE messages pages smoke tests passed.');
