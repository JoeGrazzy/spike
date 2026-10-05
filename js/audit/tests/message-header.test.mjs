import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const feed=await readFile('feed.html','utf8');
const center=await readFile('js/spike-message-center-v1.js','utf8');

assert.match(feed,/js\/spike-message-center-v1\.js/,'Feed must load the message center');
assert.match(feed,/data-spike-message-badge/,'Feed must expose a message badge target');
assert.match(feed,/href="messages\.html"[^>]*title="Messages"/,'Header message control must navigate to Messages');
assert.match(feed,/spike-message-badge-count/,'Header must contain the unread badge');
assert.match(center,/dm_list_conversations/,'Message center must use the existing conversation RPC');
assert.match(center,/\.unread/,'Message center must aggregate unread conversations');
assert.match(center,/table:'private_messages'/,'Message center must listen for incoming private messages');
assert.match(center,/recipient_id=eq\.\$\{userId\}/,'Realtime subscription must target the current recipient');
assert.match(center,/setInterval\(\(\)=>\{if\(document\.visibilityState==='visible'\)refresh\(\)\},30000\)/,'Message count must refresh while visible');
assert.match(center,/Messages, \$\{n\} unread message/,'Badge must expose an accessible unread-message label');
console.log('message-header.test.mjs: 10/10 passed');
