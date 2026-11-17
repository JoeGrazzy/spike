import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../message.html', import.meta.url), 'utf8');

test('voice player preserves the attachment storage bucket', () => {
  assert.match(html, /data-voice-bucket=\"\$\{esc\(m\.attachment\?\._bucket\|\|MEDIA_BUCKET\)\}\"/);
});

test('voice playback retries legacy dm-media only after canonical bucket failure', () => {
  assert.match(html, /createSignedUrl\(path,3600\);if\(result\.error&&bucket===MEDIA_BUCKET\)/);
  assert.match(html, /from\('dm-media'\)\.createSignedUrl\(path,3600\)/);
  assert.match(html, /audio\.dataset\.resolvedBucket=bucket/);
});
