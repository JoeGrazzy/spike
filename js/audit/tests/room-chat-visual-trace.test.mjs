import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const read=f=>readFile(path.join(root,f),'utf8');

test('Room Chat visual authority fixes the channel control and mobile drawer geometry', async()=>{
  const html=await read('room_chat.html');
  const css=await read('css/room-chat-core.css');

  // The duplicate Room identity control was removed from the header.
  assert.doesNotMatch(html,/id="roomMark"/);
  assert.doesNotMatch(html,/\$\('#roomMark'\)/);

  // The channel control no longer uses the global .active token, which the theme runtime
  // recolors to the same value as the active background.
  assert.match(html,/class="channel current" id="channelPicker"/);
  assert.doesNotMatch(html,/class="channel active"/);
  assert.match(html,/state\.channel&&c\.id===state\.channel\.id\?'current':''/);
  assert.doesNotMatch(css,/\.channel\.active\{/);
  assert.match(css,/\.channel\.current\{[^}]*color:#fff/);

  // The final page authority is deliberately after the canonical theme runtime so geometry
  // is not reintroduced by later generic theme selectors.
  assert.match(html,/id="spike-room-chat-final-authority"/);
  assert.match(html,/\.channel\.current\{[^}]*color:var\(--spike-text\)!important/);
  assert.match(html,/\.toolbar\{min-height:40px!important;height:40px!important/);
  assert.match(html,/\.drawer\{position:fixed!important;z-index:10050!important/);
  assert.match(html,/\.drawer\{left:0!important;right:0!important;top:auto!important;bottom:0!important;width:100%!important;height:min\(72vh,620px\)!important/);
  assert.match(html,/\.drawerBody\{flex:1 1 auto!important;min-height:0!important;overflow:auto!important/);

  // The screenshot showed an oversized/empty public-room strip; keep it compact and explicit.
  assert.match(html,/\.communityBanner\{min-height:34px!important;height:34px!important/);
  assert.match(html,/\.communityBanner span\{display:none!important\}/);
});
