import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'room_chat.html'), 'utf8');
const cssPath = path.join(root, 'css/spike-room-chat-next.css');
const css = fs.readFileSync(cssPath, 'utf8');

test('room chat uses one final page-specific visual authority', () => {
  assert.match(html, /href="css\/spike-room-chat-next\.css\?v=1"/);
  assert.ok(html.indexOf('css/spike-room-chat-next.css?v=1') > html.indexOf('css/spike-five-theme-authority.css'));
  for (const legacy of ['room-chat-core.css', 'room-chat-premium-v4.css', 'room-chat-premium-v5.css']) {
    assert.ok(!html.includes(legacy), `legacy room chat stylesheet still linked: ${legacy}`);
  }
  for (const legacyId of [
    'spike-room-chat-compact-final', 'spike-high-volume-final', 'spike-chat-ui-overhaul',
    'spike-message-style-final-fix', 'spike-message-feed-placement', 'spike-user-action-ui',
    'spike-top-ranking-drawer-ui', 'spike-room-chat-final-authority'
  ]) assert.ok(!html.includes(`id="${legacyId}"`), `legacy inline style still present: ${legacyId}`);
});

test('new room chat design covers the live DOM and overlays', () => {
  for (const selector of ['.page', '.top', '.chat', '.toolbar', '.communityBanner', '.messages', '.msg', '.bubble', '.composerWrap', '.composer', '.drawer', '.actionSheetShade', '.modalShade', '.deleteShade', '.userActionShade', '.modConfirmShade', '.join']) {
    assert.ok(css.includes(selector), `missing styling for ${selector}`);
  }
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test('room chat backend and interaction hooks remain in place', () => {
  for (const token of [
    'window.__SPIKE_SUPABASE__', "sb.rpc('rooms_list')", "sb.from('room_members')",
    "sb.from('room_channels')", "sb.from('room_messages')", 'room_public_send_message',
    'room_public_vip_status', 'AppPresence', 'onAuthStateChange', 'id="messages"',
    'id="input"', 'id="send"', 'id="drawer"', 'id="menuBtn"'
  ]) assert.ok(html.includes(token), `missing preserved integration: ${token}`);
});
