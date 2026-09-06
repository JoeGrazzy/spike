import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const pages=(await readdir('.')).filter(x=>x.endsWith('.html')).sort();
const legacyRuntime=/window\.SPIKE_THEME\s*=\s*\{|SPIKETheme\.|(?:const|let|var)\s+KEY\s*=\s*["']spike-feed-style["']/;

test('Every HTML page has one authoritative theme stylesheet, engine and no private theme registry',async()=>{
  for(const p of pages){
    const s=await readFile(p,'utf8');
    assert.equal((s.match(/href="css\/theme\.css"/g)||[]).length,1,p);
    assert.equal((s.match(/src="js\/theme\.js"/g)||[]).length,1,p);
    assert.equal((s.match(/id="spike-theme-bootstrap"/g)||[]).length,1,p);
    assert.doesNotMatch(s,legacyRuntime,`${p} contains a private theme runtime`);
  }
});

test('Theme registry has one definition and exposes both light identities',async()=>{
  const js=await readFile('js/theme.js','utf8');
  assert.equal((js.match(/const THEMES=\[/g)||[]).length,1);
  assert.equal((js.match(/function next\(\)/g)||[]).length,1);
  assert.match(js,/cycle:next/);
  assert.match(js,/\{id:6,name:'Desert Rose',mode:'light'/);
  assert.match(js,/\{id:8,name:'Arctic Platinum',mode:'light'/);
});
