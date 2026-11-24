import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('friends.html');
const controller = read('js/spike-friends-controller.js');
const platform = read('js/spike-platform-bootstrap.js');
const nativeCss = read('css/spike-friends-native.css');
const polishCss = read('css/friends-page-polish.css');

test('Friends page exposes every relationship action through delegated button handling', () => {
  for (const action of ['add', 'accept', 'decline', 'cancel', 'unfriend', 'block', 'unblock']) {
    assert.match(controller, new RegExp(`action === '${action}'`), `missing ${action} action handler`);
  }
  assert.match(controller, /#content button\[data-action\]/);
  assert.match(controller, /await refresh\(\)/);
});

test('friend request lifecycle uses the deployed authenticated RPC contract', () => {
  const mappings = [
    ['sendFriendRequest', 'spike_send_friend_request', 'p_target_user_id'],
    ['acceptFriendRequest', 'spike_accept_friend_request', 'p_from_user_id'],
    ['declineFriendRequest', 'spike_decline_friend_request', 'p_from_user_id'],
    ['cancelFriendRequest', 'spike_cancel_friend_request', 'p_target_user_id'],
    ['unfriend', 'spike_unfriend', 'p_target_user_id']
  ];
  for (const [method, rpc, argument] of mappings) {
    const start = platform.indexOf(`async ${method}(`);
    assert.notEqual(start, -1, `missing ${method}`);
    const body = platform.slice(start, platform.indexOf('\n    },', start));
    assert.ok(body.includes(`'${rpc}'`), `${method} must call ${rpc}`);
    assert.ok(body.includes(`${argument}:`), `${method} must pass ${argument}`);
    if (method === 'unfriend') assert.match(body, /if \(del\.error\) throw del\.error/);
    else assert.match(body, /if \(error\) throw error/);
  }
  assert.match(controller, /rpc\('spike_block_member', \{ p_target_id: userId \}\)/);
  assert.match(controller, /rpc\('spike_unblock_member', \{ p_target_id: userId \}\)/);
});

test('Friends page keeps manual discovery, responsive styles and accessible tab state', () => {
  assert.match(html, /id="friendsTabDiscover"[\s\S]*data-tab="suggestions"/);
  assert.doesNotMatch(html, /QR scanner|Scan QR|qrScanner/i);
  assert.match(html, /css\/spike-friends-native\.css/);
  assert.match(html, /css\/friends-page-polish\.css/);
  assert.match(nativeCss, /@media\s*\(max-width:\s*420px\)/);
  assert.match(polishCss, /@media\s*\(max-width:/);
  assert.match(controller, /setAttribute\('aria-selected', String\(active\)\)/);
});
