import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const css=await readFile('css/spike-three-theme-authority.css','utf8');const js=await readFile('js/theme.js','utf8');const settings=await readFile('settings.html','utf8');
test('Cosmic Pulse is the fifth dark theme with a plum and magenta palette',()=>{assert.match(js,/id:5,name:'Cosmic Pulse',mode:'dark'/);assert.match(css,/html\[data-spike-style="5"\]\{color-scheme:dark/);assert.match(css,/--spike-bg:#110b19/);assert.match(css,/--spike-accent:#e879f9/);assert.match(settings,/<option value="5">Cosmic Pulse<\/option>/);});
test('Every HTML page bootstraps all five theme modes before styles load',async()=>{for(const page of (await readdir('.')).filter(name=>name.endsWith('.html'))){const html=await readFile(page,'utf8');if(html.includes('id="spike-theme-bootstrap"'))assert.match(html,/n<1\|\|n>5/,page);}});
