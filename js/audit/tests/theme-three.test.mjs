import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const js=await readFile('js/theme.js','utf8');const css=await readFile('css/spike-three-theme-authority.css','utf8');const settings=await readFile('settings.html','utf8');
test('Exactly three neutral theme slots are registered',()=>{assert.match(js,/name:'Theme 1'/);assert.match(js,/name:'Theme 2'/);assert.match(js,/name:'Premium Neon Red'/);assert.match(js,/id:3,name:'Premium Neon Red',mode:'dark'/);assert.doesNotMatch(js,/Cinder|Tidal|Lumen|Pearl Luxe|Arctic Blue|Sage Serenity|Rose Champagne|Solar Gold|Midnight Amethyst|Cyber Ice|Emerald Elite|Ruby Noir|Titanium Pro/);assert.match(js,/of 3/);});
test('Palette authority defines exactly three IDs',()=>{for(const id of [1,2,3])assert.match(css,new RegExp('html\\[data-spike-style="'+id+'"\\]'));assert.doesNotMatch(css,/data-spike-style="(?:[4-9]|10)"/);});
test('Settings offers only three themes and uses new DB encoding',()=>{const options=[...settings.matchAll(/<option value="(\d+)">([^<]+)/g)];assert.deepEqual(options.slice(0,3).map(m=>[+m[1],m[2].split(' — ')[0]]),[[1,'Theme 1'],[2,'Theme 2'],[3,'Premium Neon Red']]);assert.match(settings,/theme_style:Number\(\$\('theme'\)\.value\)/);});
test('All HTML pages load the new palette authority',async()=>{for(const p of (await readdir('.')).filter(x=>x.endsWith('.html'))){const s=await readFile(p,'utf8');assert.match(s,/css\/spike-three-theme-authority\.css/,p);}});
