import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const html=fs.readFileSync(path.join(root,'room_chat.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css/room-chat-premium-v4.css'),'utf8');
test('Premium Room Chat V4 is layered after the existing room chat styles',()=>{
  assert.match(html,/css\/room-chat-premium-v4\.css\?v=room-chat-v4/);
  assert.match(html,/<title>SPIKE Room Chat<\/title>/);
  assert.match(html,/id="spike-room-chat-v4-viewport"/);
});
test('V4 preserves the existing database and realtime message contracts',()=>{
  assert.match(html,/room_public_send_message/);
  assert.match(html,/room_messages/);
  assert.match(html,/postgres_changes/);
  assert.match(html,/read_receipt/);
  assert.match(html,/room_message_reactions/);
});
test('V4 uses theme tokens, safe areas, and mobile keyboard viewport sizing',()=>{
  assert.match(css,/var\(--spike-accent/);
  assert.match(css,/env\(safe-area-inset-top\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(html,/visualViewport/);
  assert.match(html,/--spike-room-viewport-height/);
});
test('V4 keeps the existing shared dialog and presence integrations',()=>{
  assert.match(html,/js\/spike-dialog\.js/);
  assert.match(html,/js\/presence\.js\?v=presence-v2-global-20261112/);
  assert.match(html,/SPIKEPremiumDialog/);
});
test('Room Chat surfaces use the one shared typing runtime exactly once',()=>{
  for(const file of ['room.html','room_chat.html']){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    assert.equal((source.match(/js\/spike-typing\.js/g)||[]).length,1,file);
    assert.match(source,/SpikeTyping\?\.startRoom\(/,file);
  }
});
