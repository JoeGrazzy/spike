import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const themeJs=await readFile('js/theme.js','utf8');
const themeCss=await readFile('css/theme.css','utf8');
const settings=await readFile('settings.html','utf8');
const feed=await readFile('feed.html','utf8');
const pages=['admin.html','chat_room.html','feed.html','friends.html','help.html','index.html','message.html','messages.html','notifications.html','profile.html','reset-password.html','room.html','room_chat.html','rooms.html','settings.html','spike_predictor.html'];

test('10 canonical themes have unique ids, names, modes and identities',()=>{
  const m=[...themeJs.matchAll(/\{id:(\d+),name:'([^']+)',mode:'([^']+)',signature:'([^']+)'\}/g)].map(x=>({id:+x[1],name:x[2],mode:x[3]}));
  assert.equal(m.length,10); assert.deepEqual(m.map(x=>x.id),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(new Set(m.map(x=>x.name)).size,10); assert.ok(m.every(x=>['dark','light'].includes(x.mode)));
  const cssBlocks=[...themeCss.matchAll(/html\[data-spike-style="(\d+)"\]\{([^}]*)\}/g)].filter(x=>+x[1]>=1&&+x[1]<=10);
  assert.equal(new Set(cssBlocks.map(x=>x[1])).size,10);
  const signatures=cssBlocks.map(x=>x[2]);
  assert.equal(new Set(signatures).size,10);
});

test('Feed switcher is hardened for all 10 themes',()=>{
  assert.match(feed,/of 10/);
  assert.match(themeJs,/const THEMES=\[/);
  assert.ok(themeJs.includes('function next(){return apply(read()%THEMES.length+1);}'));
  assert.match(themeJs,/spikeThemeHardened/);
  assert.match(themeJs,/window\.SPIKE_THEME\.next\(\)/);
});

test('Settings exposes exactly the same 10 theme names',()=>{
  const opts=[...settings.matchAll(/<option value="(\d+)">([^<]+)</g)].map(x=>({id:+x[1],name:x[2]}));
  assert.deepEqual(opts.slice(0,10),[
    {id:1,name:'Aurora Glass'},{id:2,name:'Velvet Nocturne'},{id:3,name:'Solar Ember'},
    {id:4,name:'Emerald Atelier'},{id:5,name:'Ocean Cobalt'},{id:6,name:'Desert Rose'},
    {id:7,name:'Royal Amethyst'},{id:8,name:'Arctic Platinum'},{id:9,name:'Neon Citrus'},{id:10,name:'Midnight Cherry'}
  ]);
  assert.match(settings,/const ALLOWED_THEMES=\[1,2,3,4,5,6,7,8,9,10\]/);
});

test('Every production page loads the shared theme layer',async()=>{
  for(const p of pages){const s=await readFile(p,'utf8');assert.match(s,/href="css\/theme\.css"/,p);assert.match(s,/src="js\/theme\.js"/,p);}
});
