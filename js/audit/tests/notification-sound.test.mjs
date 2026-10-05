import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('notifications.mp3 exists at the shared runtime path',()=>{
  assert.equal(fs.existsSync(path.join(root,'assets/mp3/notifications.mp3')),true);
});

test('shared notification sound module points to notifications.mp3',()=>{
  const s=read('js/spike-notification-sound-v1.js');
  assert.match(s,/assets\/mp3\/notifications\.mp3/);
  assert.match(s,/window\.SPIKENotificationSound/);
});

test('shared sound unlocks from a user gesture for mobile autoplay policy',()=>{
  const s=read('js/spike-notification-sound-v1.js');
  assert.match(s,/pointerdown/);
  assert.match(s,/touchstart/);
  assert.match(s,/keydown/);
  assert.match(s,/a\.muted=true/);
});

test('notification center plays sound only after unread count increases',()=>{
  const s=read('js/spike-notification-center-v1.js');
  assert.match(s,/lastCount!==null&&n>lastCount/);
  assert.match(s,/SPIKENotificationSound\?\.play\(\)/);
});

test('message center plays sound only after unread count increases',()=>{
  const s=read('js/spike-message-center-v1.js');
  assert.match(s,/lastCount!==null&&n>lastCount/);
  assert.match(s,/SPIKENotificationSound\?\.play\(\)/);
});

test('messages page plays notifications.mp3 for incoming messages, not own sends',()=>{
  const s=read('messages.html');
  assert.match(s,/m\.sender_id!==me\.id\) window\.SPIKENotificationSound\?\.play\(\)/);
  assert.match(s,/js\/spike-notification-sound-v1\.js/);
});

test('private message page also uses the shared incoming-message sound',()=>{
  const s=read('message.html');
  assert.match(s,/m\.sender_id!==me\.id\) window\.SPIKENotificationSound\?\.play\(\)/);
  assert.match(s,/js\/spike-notification-sound-v1\.js/);
});

test('notifications page has the concrete audio asset and shared sound module',()=>{
  const s=read('notifications.html');
  assert.match(s,/id="notificationTone"[^>]+src="assets\/mp3\/notifications\.mp3"/);
  assert.match(s,/js\/spike-notification-sound-v1\.js/);
});
