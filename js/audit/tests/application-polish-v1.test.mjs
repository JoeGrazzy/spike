import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const production=['admin.html','chat_room.html','coffee.html','engagement.html','feed.html','friends.html','guide.html','help.html','index.html','legal.html','leveling.html','live.html','message.html','messages.html','notifications.html','policy.html','policy_appeals.html','profile.html','reset-password.html','room.html','room_chat.html','rooms.html','settings.html','share.html','spike_edu.html','spike_intelligence.html','spike_predictor.html','spike_world.html','view_user.html'];
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('application polish layer is loaded exactly once on all 29 production pages after global authority',()=>{
 for(const f of production){const s=read(f);const links=[...s.matchAll(/<link[^>]+href=["']([^"']+)['"][^>]*>/gi)].map(m=>m[1]);assert.equal(links.filter(x=>x.includes('spike-application-polish-v1.css')).length,1,f);assert.ok(links.findIndex(x=>x.includes('spike-application-polish-v1.css'))>links.findIndex(x=>x.includes('spike-global-page-authority-v2.css')),f);}
});
test('application polish includes visible keyboard focus and reduced-motion support',()=>{const s=read('css/spike-application-polish-v1.css');assert.match(s,/focus-visible/);assert.match(s,/prefers-reduced-motion:\s*reduce/);assert.match(s,/outline-offset/);});
test('application polish avoids page geometry and routing overrides',()=>{const s=read('css/spike-application-polish-v1.css');assert.doesNotMatch(s,/(?:position\s*:\s*fixed|z-index\s*:|!important\s*;?\s*\/\*\s*layout)/i);assert.doesNotMatch(s,/display\s*:\s*(?:grid|flex|block)\s*!important/i);});
