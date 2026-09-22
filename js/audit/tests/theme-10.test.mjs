import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const themeJs=await readFile('js/theme.js','utf8');
const themeCss=await readFile('css/theme.css','utf8');
const settings=await readFile('settings.html','utf8');
const feed=await readFile('feed.html','utf8');
const pages=['admin.html','chat_room.html','feed.html','friends.html','help.html','index.html','message.html','messages.html','notifications.html','profile.html','reset-password.html','room.html','room_chat.html','rooms.html','settings.html','spike_predictor.html','spike_world.html','view_user.html','coffee.html'];

test('10 canonical themes have unique ids, names, modes and identities',()=>{
  const m=[...themeJs.matchAll(/\{id:(\d+),name:'([^']+)',mode:'([^']+)',signature:'([^']+)'\}/g)].map(x=>({id:+x[1],name:x[2],mode:x[3],signature:x[4]}));
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



test('Accessible action controls and non-cyclic theme tokens',()=>{
  assert.doesNotMatch(themeCss,/--spike-glow:\s*var\(--spike-glow\)/);
  const blocks=[...themeCss.matchAll(/html\[data-spike-style="(\d+)"\]\{color-scheme:(dark|light);([\s\S]*?)\n\}/g)];
  assert.equal(blocks.length,10);
  const hex=(v)=>{const m=v.trim().match(/^#([0-9a-f]{6})$/i);return m?[parseInt(m[1].slice(0,2),16),parseInt(m[1].slice(2,4),16),parseInt(m[1].slice(4,6),16)]:null};
  const lum=(rgb)=>rgb.map(x=>x/255).map(x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  for(const m of blocks){
    const body=m[3];
    const bg=hex((body.match(/--spike-action-bg:([^;]+)/)||[])[1]||'');
    const bg2=hex((body.match(/--spike-action-bg-2:([^;]+)/)||[])[1]||'');
    assert.ok(bg && bg2,`theme ${m[1]} must define accessible action backgrounds`);
    assert.ok(ratio(1,lum(bg))>=4.5,`theme ${m[1]} action background 1 fails AA`);
    assert.ok(ratio(1,lum(bg2))>=4.5,`theme ${m[1]} action background 2 fails AA`);
  }
});

test('Every production page loads the shared theme layer',async()=>{
  for(const p of pages){const s=await readFile(p,'utf8');assert.match(s,/href="css\/theme\.css"/,p);assert.match(s,/src="js\/theme\.js"/,p);}
});
