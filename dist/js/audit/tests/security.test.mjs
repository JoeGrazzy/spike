import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const htmlFiles = ['index.html','feed.html','friends.html','messages.html','message.html','notifications.html','profile.html','rooms.html','room.html','room_chat.html','chat_room.html','settings.html','help.html','spike_predictor.html','admin.html'];

for (const page of htmlFiles) test(`security baseline: ${page}`, async () => {
  const html = await readFile(page, 'utf8');
  assert.doesNotMatch(html, /<script[^>]+src=["']http:/i);
  assert.doesNotMatch(html, /<form[^>]*action=["']javascript:/i);
  assert.doesNotMatch(html, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9_-]+/i);
  assert.doesNotMatch(html, /(?:service_role|secret[_-]?key)\s*[:=]/i);
  assert.doesNotMatch(html, /\beval\s*\(/i);
});

test('security baseline: no privileged credentials in shared JS', async () => {
  const js = await Promise.all(['js/telemetry.js','js/theme.js','js/ui-fix.js','js/premium-back.js'].map(x => readFile(x, 'utf8')));
  for (const source of js) {
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9_-]+/i);
  }
});
