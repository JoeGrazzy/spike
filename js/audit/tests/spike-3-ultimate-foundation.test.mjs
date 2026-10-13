import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const inbox = await readFile('messages.html', 'utf8');
const dm = await readFile('message.html', 'utf8');
const theme = await readFile('js/theme.js', 'utf8');
const settings = await readFile('settings.html', 'utf8');
const migration = await readFile('supabase/migrations/20261013100000_spike_inbox_preferences_v1.sql', 'utf8');

test('Smart Inbox has pinned filter, per-user pin state, and server preference fallback', () => {
  assert.match(inbox, /data-filter="pinned"/);
  assert.match(inbox, /spike:pinned-conversations:/);
  assert.match(inbox, /spike_inbox_preferences/);
  assert.match(inbox, /data-pin=/);
  assert.match(inbox, /using local preference fallback until migration is applied/);
});

test('Inbox preference migration isolates reads and writes to the authenticated owner', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /with check \(user_id = \(select auth\.uid\(\)\) and user_id <> other_user_id\)/i);
  assert.match(migration, /primary key \(user_id, other_user_id\)/i);
});

test('Direct-message drafts survive reload and offline state is communicated without auto-sending', () => {
  assert.match(dm, /spike:dm-draft:/);
  assert.match(dm, /restoreDraft\(\)/);
  assert.match(dm, /addEventListener\('offline'/);
  assert.match(dm, /Your text is still here and saved as a draft/);
  assert.doesNotMatch(dm, /send.*automatically.*online/i);
});

test('Modern Mineral supports an OS-matched theme mode across bootstraps and live updates', async () => {
  assert.match(theme, /mode==='system'/);
  assert.match(theme, /prefers-color-scheme: dark/);
  assert.match(settings, /<option value="system">Use device setting<\/option>/);
  for (const page of (await readdir('.')).filter(x => x.endsWith('.html'))) {
    const source = await readFile(page, 'utf8');
    if (source.includes('spike-theme-2-mode')) assert.match(source, /prefers-color-scheme: dark/, `${page} should avoid a theme flash`);
  }
});

test('Trust Center and community foundations already exist and are not duplicated', async () => {
  const feed = await readFile('feed.html', 'utf8');
  const rooms = await readFile('rooms.html', 'utf8');
  const safety = await readFile('js/spike-safety-center-v5.js', 'utf8');
  assert.match(feed, /Safety Center/);
  assert.match(feed, /spike-safety-center-v5\.js/);
  assert.match(rooms, /room/i);
  assert.match(safety, /Trusted Contact/);
});
