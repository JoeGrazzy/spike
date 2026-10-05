import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const production=[
'admin.html','chat_room.html','coffee.html','engagement.html','feed.html','friends.html','guide.html','help.html','index.html','legal.html','leveling.html','live.html','message.html','messages.html','notifications.html','policy.html','policy_appeals.html','profile.html','reset-password.html','room.html','room_chat.html','rooms.html','settings.html','share.html','spike_edu.html','spike_intelligence.html','spike_predictor.html','spike_world.html','view_user.html'
];
function read(f){return fs.readFileSync(path.join(root,f),'utf8')}
test('global visual authority is loaded exactly once and after Theme V3 on every production page',()=>{
 for(const f of production){const s=read(f);const links=[...s.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);assert.equal(links.filter(x=>x.includes('spike-global-page-authority-v2.css')).length,1,f);const gi=links.findIndex(x=>x.includes('spike-global-page-authority-v2.css'));const ti=links.findIndex(x=>x.includes('spike-theme-experience-v3.css'));assert.ok(ti>=0&&gi>ti,`${f}: global authority must follow Theme V3`);}
});
test('production pages have exactly one safe-area stylesheet',()=>{
 for(const f of production){const s=read(f);const n=(s.match(/<link[^>]+href=["'][^"']*safe-area[^"']*["'][^>]*>/gi)||[]).length;assert.equal(n,1,f);}
});
test('remote font CSS is absent except for Room Chat font-picker feature',()=>{
 for(const f of production){const s=read(f);const remote=(s.match(/https?:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*/gi)||[]);if(f==='room_chat.html') continue;assert.equal(remote.length,0,`${f}: remote font dependency remains`);}
});
test('bundled SPIKE Inter declares discrete 800 and 900 weights',()=>{
 const s=read('css/spike-global-page-authority-v2.css');assert.match(s,/Inter-ExtraBold\.otf[^}]*font-weight:800/);assert.match(s,/Inter-ExtraBold\.otf[^}]*font-weight:900/);assert.match(s,/font-synthesis:none/);
});
test('global geometry authority provides structural containment without relying on page clipping alone',()=>{
 const s=read('css/spike-global-page-authority-v2.css');assert.match(s,/box-sizing:inherit/);assert.match(s,/input,textarea,select,button\{[^}]*max-width:100%[^}]*min-width:0/);assert.match(s,/img,video,canvas,svg,iframe,object,embed\{[^}]*max-width:100%/);assert.match(s,/pre\{[^}]*overflow:auto[^}]*white-space:pre-wrap/);
});
