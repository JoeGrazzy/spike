import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const css=await readFile('css/spike-three-theme-authority.css','utf8');const js=await readFile('js/theme.js','utf8');const settings=await readFile('settings.html','utf8');
test('Arctic Glass has a stable light identity and cobalt palette',()=>{assert.match(js,/id:2,name:'Arctic Glass',mode:'light'/);assert.match(settings,/<option value="2">Arctic Glass<\/option>/);assert.match(css,/html\[data-spike-style="2"\]\{color-scheme:light/);assert.match(css,/--spike-bg:#f4f7fc/);assert.match(css,/--spike-accent:#2459d3/);assert.doesNotMatch(settings,/theme2Mode|Modern Mineral/);});
test('All five theme names are represented in the canonical registry',()=>{for(const name of ['Midnight Luxe','Arctic Glass','Emerald Obsidian','Sandstone Studio','Cosmic Pulse'])assert.ok(js.includes(`name:'${name}'`),`missing ${name}`);});
