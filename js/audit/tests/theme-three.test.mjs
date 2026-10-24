import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const js=await readFile('js/theme.js','utf8');const css=await readFile('css/spike-three-theme-authority.css','utf8');const settings=await readFile('settings.html','utf8');
const expected=[[1,'Midnight Luxe','dark'],[2,'Arctic Glass','light'],[3,'Emerald Obsidian','dark'],[4,'Sandstone Studio','light'],[5,'Cosmic Pulse','dark']];
test('Exactly five requested theme identities are registered',()=>{const actual=[...js.matchAll(/id:(\d+),name:'([^']+)',mode:'([^']+)'/g)].map(m=>[+m[1],m[2],m[3]]);assert.deepEqual(actual,expected);assert.match(js,/of \$\{THEMES.length\}/);});
test('Palette authority defines exactly five theme IDs',()=>{for(const id of [1,2,3,4,5])assert.match(css,new RegExp('html\\[data-spike-style="'+id+'"\\]\\{'));assert.doesNotMatch(css,/data-spike-style="(?:[6-9]|10)"/);});
test('Settings offers exactly five themes and preserves account persistence',()=>{const options=[...settings.matchAll(/<option value="(\d+)">([^<]+)/g)].filter(m=>+m[1]>=1&&+m[1]<=5);assert.deepEqual(options.map(m=>[+m[1],m[2]]),expected.map(([id,name])=>[id,name]));assert.match(settings,/theme_style:Number\(\$\('theme'\)\.value\)/);assert.doesNotMatch(settings,/theme2Mode|themeModeRow/);});
test('Every HTML page loads the canonical palette authority',async()=>{for(const p of (await readdir('.')).filter(x=>x.endsWith('.html'))){const s=await readFile(p,'utf8');assert.match(s,/css\/spike-three-theme-authority\.css/,p);assert.match(s,/n<1\|\|n>5/ ,p);}});
