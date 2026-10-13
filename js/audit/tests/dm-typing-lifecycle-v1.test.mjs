import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const html=fs.readFileSync(path.join(process.cwd(),'message.html'),'utf8');
const runtime=fs.readFileSync(path.join(process.cwd(),'js/spike-dm-realtime-calls-v2.js'),'utf8');
const signals=fs.readFileSync(path.join(process.cwd(),'js/spike-dm-signals.js'),'utf8');
test('DM typing is handled only by the composer and blank drafts stop typing',()=>{
 assert.match(html,/function handleThreadTyping\(event\)/); assert.match(html,/event\?\.target\?\.id!=='body'/); assert.match(html,/!value\.trim\(\)/); assert.match(html,/event\.stopImmediatePropagation\(\)/); assert.match(html,/Math\.min\(input\.scrollHeight,140\)/);
});
test('DM typing uses the shared pair topic and remote indicator expires',()=>{
 assert.match(html,/signals\.subscribeTyping\(db,me\.id,other/); assert.match(signals,/spike:dm-typing:v1:/); assert.match(html,/remoteTypingTimer=setTimeout/); assert.match(html,/clearThreadTyping\(notify=true\)/);
});
test('DM typing cleanup runs on blur, hidden tab, pagehide, and channel errors',()=>{
 assert.match(html,/stopImmediatePropagation\(\);stopThreadTyping\(\)/); assert.match(html,/if\(document\.hidden\)stopThreadTyping\(\)/); assert.match(html,/pagehide',\(\)=>\{clearThreadTyping\(true\)/); assert.match(html,/state==='CHANNEL_ERROR'\|\|state==='TIMED_OUT'\|\|state==='CLOSED'/);
 assert.doesNotMatch(runtime,/function typing\(\)/); assert.doesNotMatch(runtime,/spike:dm-typing:v1:/);
});
