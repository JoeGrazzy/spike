import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const pages=(await readdir('.')).filter(x=>x.endsWith('.html')&&!x.endsWith('.pre-rebuild.html'));

test('Final theme authority is loaded after page-local visual layers',async()=>{
  for(const p of pages){
    const s=await readFile(p,'utf8');
    if(!s.includes('css/theme.css')) continue;
    assert.equal((s.match(/css\/spike-theme-final-authority-v1\.css/g)||[]).length,1,p);
    assert.ok(s.indexOf('css/theme.css') < s.indexOf('css/spike-theme-final-authority-v1.css'),p);
  }
});

test('Legacy Beauty palette aliases are redirected to the canonical theme tokens',async()=>{
  const css=await readFile('css/spike-theme-final-authority-v1.css','utf8');
  for(const token of ['--spk-bg:var(--spike-bg)','--spk-surface:var(--spike-surface)','--spk-surface-2:var(--spike-surface-2)','--spk-text:var(--spike-text)','--spk-muted:var(--spike-muted)','--spk-purple:var(--spike-accent)','--spk-pink:var(--spike-accent-2)','--solid:var(--spike-surface)']) assert.match(css,new RegExp(token.replace(/[()]/g,'\\$&')));
});

test('Theme engine updates browser theme-color from canonical theme background',async()=>{
  const js=await readFile('js/theme.js','utf8');
  assert.match(js,/getComputedStyle\(root\)/);
  assert.match(js,/meta\[name=\"theme-color\"\]/);
  assert.match(js,/--spike-bg/);
});

test('There is still exactly one canonical theme registry',async()=>{
  const js=await readFile('js/theme.js','utf8');
  assert.equal((js.match(/const THEMES=\[/g)||[]).length,1);
  assert.equal((js.match(/function next\(\)/g)||[]).length,1);
});
