import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const feed = await readFile('feed.html','utf8');
const notifications = await readFile('notifications.html','utf8');
const center = await readFile('js/spike-notification-center-v1.js','utf8');
const badgeRuntime = await readFile('js/feed-runtime-04-2.js','utf8');
const production = await readFile('supabase/migrations/20260904102000_notifications_production_hardening_v1.sql','utf8');
const smart = await readFile('supabase/migrations/20260904120000_notifications_smart_activity_engine_v1.sql','utf8');

test('Feed exposes a persistent notification entry point with unread badge', () => {
  assert.match(feed, /class="spike-notification-trigger"[^>]*data-spike-notification-badge/);
  assert.match(feed, /href="notifications\.html"/);
  assert.match(feed, /class="spike-notification-badge-count"/);
  assert.match(feed, /js\/spike-notification-center-v1\.js/);
});

test('Notifications page exposes its own authoritative unread badge', () => {
  assert.match(notifications, /data-spike-notification-page/);
  assert.match(notifications, /class="icon-btn notification-page-bell"[^>]*data-spike-notification-badge/);
  assert.match(notifications, /id="unreadCount"/);
  assert.match(notifications, /window\.SPIKENotificationCenter\?\.setCount\(count\)/);
});

test('shared notification center uses the existing summary RPC and private user topic', () => {
  assert.match(center, /rpc\('get_notification_summary'\)/);
  assert.match(center, /user:\$\{userId\}:notifications/);
  assert.match(center, /notification_created/);
  assert.match(center, /notification_updated/);
  assert.match(center, /notification_deleted/);
  assert.match(center, /data-spike-notification-page/);
});

test('Feed badge no longer uses a separate raw notification-count implementation', () => {
  assert.match(badgeRuntime, /window\.SPIKENotificationCenter\?\.refresh/);
  assert.match(badgeRuntime, /rpc\('get_notification_summary'\)/);
  assert.doesNotMatch(badgeRuntime, /from\('notifications'\)\.select\('id',\{count:'exact',head:true\}\)/);
});

test('existing notification backend protects unread/read operations', () => {
  assert.match(production, /create or replace function public\.get_notification_summary\(\)/);
  assert.match(production, /count\(\*\) filter\(where not read\)/);
  assert.match(production, /create or replace function public\.mark_notification_read\(p_notification_id uuid\)/);
  assert.match(production, /create or replace function public\.mark_all_notifications_read\(\)/);
  assert.match(production, /grant execute on function .*get_notification_summary\(\).* to authenticated/);
});

test('existing backend broadcasts notification changes privately per authenticated user', () => {
  assert.match(smart, /realtime\.send\(/);
  assert.match(smart, /user:'\|\|v_user_id::text\|\|':notifications/);
  assert.match(smart, /create trigger notifications_realtime_broadcast/);
  assert.match(smart, /split_part\(topic,':',2\)=\(select auth\.uid\(\)\)::text/);
});
