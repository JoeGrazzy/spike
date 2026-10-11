import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../../', import.meta.url);
const html = await readFile(new URL('feed.html', root), 'utf8');
const loader = await readFile(new URL('js/feed-runtime-07.js', root), 'utf8');
const data = await readFile(new URL('js/feed-runtime-04-1.js', root), 'utf8');
const restore = await readFile(new URL('js/feed-runtime-02.js', root), 'utf8');
const runtime = await readFile(new URL('js/feed-runtime-04-3.js', root), 'utf8');

test('Feed restoration never CSS-hides the loader before session validation', () => {
  assert.match(restore, /documentElement\.dataset\.spikeFeedRestore='1'/);
  assert.doesNotMatch(html, /data-spike-feed-restore=["']1["']\s*#spike-feed-loader\s*\{\s*display:\s*none\s*!important/);
  assert.match(runtime, /if \(!\(await requireUser\(\)\)\) return;/);
  assert.match(runtime, /window\.SPIKE_HIDE_FEED_LOADER\?\.\(\)/);
});

test('Feed loader offers retry on slow startup instead of automatically exposing a half-loaded page', () => {
  assert.match(html, /id="spikeFeedRetry"[^>]*hidden/);
  assert.match(loader, /core\.register\(loader/);
  assert.match(loader, /retry: "reload"/);
  assert.match(loader, /This is taking longer than usual/);
  assert.doesNotMatch(loader, /window\.setTimeout\(hide,\s*9000\)/);
  assert.match(runtime, /if \(!bootFailed\) window\.SPIKE_HIDE_FEED_LOADER\?\.\(\)/);
});

test('Overlapping Feed requests cannot replace state with a stale response or another user’s response', () => {
  assert.match(data, /postsLoadGeneration:\s*0/);
  assert.match(data, /const requestedUserId = String\(state\.user\?\.id \|\| ''\)/);
  assert.match(data, /generation !== state\.postsLoadGeneration \|\| requestedUserId !== String\(state\.user\?\.id \|\| ''\)/);
});

test('Feed real-time updates reconcile soft-deletes, content edits and row deletion events', () => {
  assert.match(runtime, /if \(post\.deleted === true && postId\)/);
  assert.match(runtime, /const contentChanged = p\?\.eventType === 'UPDATE'/);
  assert.match(runtime, /event: 'DELETE', schema: 'public', table: 'app_documents'/);
  assert.match(runtime, /scheduleRefresh\('posts-delete'\)/);
});

test('Feed recovery UI remains accessible and preserves reduced-motion handling', () => {
  assert.match(html, /id="spikeFeedRetry"/);
  assert.match(html, /aria-live="polite" id="spike-feed-loader" role="status"/);
  assert.match(html, /prefers-reduced-motion:reduce/);
});
