import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const html=fs.readFileSync(path.join(root,'message.html'),'utf8');
const runtime=fs.readFileSync(path.join(root,'js/spike-dm-realtime-calls-v2.js'),'utf8');
test('DM typing is handled only by the composer and blank drafts stop typing',()=>{
 assert.match(html,/function handleThreadTyping\(event\)/);
 assert.match(html,/event\?\.target\?\.id!=='body'/);
 assert.match(html,/!value\.trim\(\)/);
 assert.match(html,/event\.stopImmediatePropagation\(\)/);assert.match(html,/Math\.min\(input\.scrollHeight,140\)/);
});
test('DM typing is pair-scoped and remote indicator expires',()=>{
 assert.match(html,/const typingTopic='spike:dm-typing:v1:'/);
 assert.match(html,/payload\?\.from!==other\|\|payload\?\.to!==me\.id/);
 assert.match(html,/remoteTypingTimer=setTimeout/);
 assert.match(html,/clearThreadTyping\(notify=true\)/);
});
test('DM typing cleanup runs on blur, hidden tab, pagehide, and channel errors',()=>{
 assert.match(html,/stopImmediatePropagation\(\);stopThreadTyping\(\)/);
 assert.match(html,/if\(document\.hidden\)stopThreadTyping\(\)/);
 assert.match(html,/pagehide',\(\)=>\{clearThreadTyping\(true\)/);
 assert.match(html,/state==='CHANNEL_ERROR'\|\|state==='TIMED_OUT'\)\{clearThreadTyping\(false\)/);
 assert.match(runtime,/function typing\(\)/); // protected call runtime remains unchanged
});
