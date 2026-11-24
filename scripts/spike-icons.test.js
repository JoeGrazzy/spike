import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = p => fs.readFileSync(path.join(root,p),'utf8');
test('central icon registry defines semantic action, navigation and feature icons', () => {
  const source=read('js/spike-icons.js');
  for(const name of ['flag','trash','ban','archive','phone','video','pin','reply','copy','share','heart','users','user','message','comments','search','home','bell','settings','gift','shield','coins','microphone','headphones','file','image','film','music','compass','sparkle']) assert.match(source,new RegExp(`\\b${name}\\s*:`),`${name} icon should exist`);
  assert.match(source,/window\.SPIKEIcons\s*=\s*Object\.freeze/);
  assert.match(source,/MutationObserver/);
  assert.match(source,/root\.matches\?\.\('\[data-spike-icon\]'\)/);
});
test('legacy Font Awesome mappings cover icons used by the project',()=>{
 const source=read('js/spike-icons.js');
 for(const name of ['fa-flag','fa-trash','fa-ban','fa-box-archive','fa-phone','fa-video','fa-thumbtack','fa-comments','fa-chevron-right','fa-headphones','fa-user','fa-user-group','fa-magnifying-glass','fa-house','fa-xmark','fa-rotate','fa-microphone','fa-file-pdf','fa-coins'])assert.ok(source.includes(name),`legacy ${name} mapping must be present`);
});
test('report message prompt and message actions use meaningful icons',()=>{
 const runtime=read('js/spike-messages.js'); const message=read('message.html'); const feed=read('feed.html');
 assert.match(runtime,/title: 'Report message'[^}]*icon: 'flag'/);
 for(const name of ['reply','copy','share','heart','flag','trash','x'])assert.match(message,new RegExp(`data-spike-icon="${name}"`));
 assert.match(feed,/id="confirmReport"[^>]*><span data-spike-icon="flag"/);
});
test('all 28 pages load the icon runtime and shared icon stylesheet',()=>{
 const pages=fs.readdirSync(root).filter(name=>name.endsWith('.html')); assert.equal(pages.length,28);
 for(const page of pages){const html=read(page);assert.match(html,/js\/spike-icons\.js\?v=semantic-icons-2/,`${page} must load icon runtime`);assert.match(html,/css\/spike-icons\.css\?v=semantic-icons-2/,`${page} must load icon CSS`);}
});
test('high-visibility report, block, room, share and call actions have semantic icons',()=>{
 const profile=read('user-profile.html'),room=read('room.html'),feed=read('feed.html'),message=read('message.html'),admin=read('admin.html');
 for(const [source,pattern,label] of [[profile,/data-spike-icon="ban"/,'profile block'],[profile,/data-spike-icon="share"/,'profile share'],[room,/data-spike-icon="flag"/,'room report'],[room,/data-spike-icon="gift"/,'room gift'],[feed,/data-spike-icon="flag"/,'post report'],[message,/data-spike-icon="phone"/,'voice call'],[message,/data-spike-icon="video"/,'video call'],[admin,/data-spike-icon="refresh"/,'admin refresh']])assert.match(source,pattern,`${label} should use a semantic icon`);
});
test('confirmation dialogs infer semantic icons from action intent',()=>{
 const dialog=read('js/spike-dialog.js');
 for(const [term,icon] of [['report','flag'],['delete','trash'],['block','ban'],['archive','archive'],['pin','pin'],['share','share'],['video','video'],['call','phone']])assert.ok(dialog.includes(`'${icon}'`),`${term} should map to ${icon}`);
 assert.match(dialog,/const inferredIcon=opts\.icon/);
});
test('dynamic feed social actions use the shared semantic SVG registry',()=>{
 const source=read('js/spike-social-actions.js');
 for(const name of ['heart','message','pin','share'])assert.ok(source.includes(`actionButton('${name}'`),`${name} action icon is missing`);
 assert.match(source,/window\.SPIKEIcons\?\.svg/);
});
test('empty states use the shared icon vocabulary instead of per-page emoji placeholders',()=>{
 const source=read('js/spike-empty-state.js');
 assert.match(source,/window\.SPIKEIcons\?\.svg/);
 for(const name of ['message','users','bell','sparkle','search'])assert.ok(source.includes(`'${name}'`));
});
test('every static semantic icon hook resolves to a registry icon or alias',()=>{
 const html=fs.readdirSync(root).filter(n=>n.endsWith('.html')).map(read).join('\n');
 const source=read('js/spike-icons.js');
 const hooks=[...html.matchAll(/data-spike-icon="([^"]+)"/g)].map(m=>m[1]);
 for(const name of new Set(hooks))assert.match(source,new RegExp(`\\b${name}\\s*:`),`unregistered semantic icon: ${name}`);
});
test('every used Font Awesome glyph has a semantic replacement mapping',()=>{
 const files=[...fs.readdirSync(root).filter(n=>n.endsWith('.html')).map(read),...fs.readdirSync(path.join(root,'js')).filter(n=>n.endsWith('.js')).map(n=>read(`js/${n}`))].join('\n');
 const registry=read('js/spike-icons.js'); const used=[...new Set(files.match(/\bfa-[a-zA-Z0-9-]+/g)||[])].filter(n=>!['fa-solid','fa-regular','fa-brands','fa-light','fa-duotone'].includes(n));
 for(const name of used)assert.ok(registry.includes(`'${name}'`),`unmapped Font Awesome icon class: ${name}`);
});
