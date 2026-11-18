import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

test('inbox and direct-message pages load the messaging controller after Supabase bootstrap', () => {
  for (const page of ['messages.html','message.html']) {
    const html = read(page);
    assert.match(html, /js\/spike-platform-bootstrap\.js/);
    assert.match(html, /js\/spike-messaging\.js/);
    assert.match(html, /js\/spike-supabase-guard\.js/);
  }
});

test('messaging controller uses membership-scoped queries, history, inserts, signed attachments and realtime', () => {
  const js = read('js/spike-messaging.js');
  assert.match(js, /from\('conversation_members'\)/);
  assert.match(js, /from\('conversations'\)/);
  assert.match(js, /from\('messages'\)/);
  assert.match(js, /createSignedUrl\(row\.attachment_path,300\)/);
  assert.match(js, /postgres_changes/);
  assert.match(js, /last_read_at/);
});

test('social connection rows provide a real direct-message entry point', () => {
  const js = read('js/spike-social-connections.js');
  assert.match(js, /message\.html\?user_id=/);
  assert.match(js, /textContent = 'Message'/);
});
