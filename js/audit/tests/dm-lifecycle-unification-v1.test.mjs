import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const page = fs.readFileSync(path.join(root, 'message.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261112035419_spike_dm_lifecycle_unification_v1.sql'), 'utf8');
const redaction = fs.readFileSync(path.join(root, 'supabase/migrations/20261112035519_spike_dm_delete_redaction_fix_v1.sql'), 'utf8');
const cleanup = fs.readFileSync(path.join(root, 'supabase/functions/spike-dm-media-cleanup/index.ts'), 'utf8');

test('DM reactions use the single atomic RPC, not competing client upserts', () => {
  assert.match(page, /db\.rpc\('dm_toggle_reaction'/);
  assert.doesNotMatch(page, /from\('private_message_reactions'\)\.upsert/);
  assert.match(migration, /PRIMARY KEY \(message_id, user_id\)/);
  assert.match(migration, /ON CONFLICT \(message_id, user_id\) DO NOTHING/);
});

test('DM deletion is sender-scoped and redacts all message media metadata', () => {
  assert.match(page, /db\.rpc\('dm_delete_message'/);
  assert.match(redaction, /sender_id = auth\.uid\(\)/);
  for (const field of ['body = \'\'', 'attachment = NULL', 'media_path = NULL', 'media_mime_type = NULL', 'voice_duration_seconds = NULL']) {
    assert.ok(redaction.includes(field), `missing redaction: ${field}`);
  }
});

test('Deleted-message attachments are queued, not removed with SQL against Storage internals', () => {
  assert.match(migration, /spike_dm_media_cleanup_queue/);
  assert.match(migration, /private-message-media/);
  assert.match(migration, /VALUES \('dm-media'/);
  assert.match(cleanup, /authClient\.auth\.getUser\(token\)/);
  assert.match(cleanup, /admin\.storage[\s\S]*\.remove\(\[claimed\.object_path\]\)/);
  assert.match(cleanup, /next_attempt_at/);
});

test('Legacy DM attachment metadata remains readable while new uploads use the canonical bucket', () => {
  assert.match(page, /from\('private_message_attachments'\)\.select/);
  assert.match(page, /_bucket:'dm-media'/);
  assert.match(page, /MEDIA_BUCKET='private-message-media'/);
});
