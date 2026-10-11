import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const runtime=fs.readFileSync(path.join(root,'css/spike-theme-runtime-v3.css'),'utf8');
const theme=fs.readFileSync(path.join(root,'css/theme.css'),'utf8');
const themeJs=fs.readFileSync(path.join(root,'js/theme.js'),'utf8');
const pages=fs.readdirSync(root).filter(x=>x.endsWith('.html'));
const themed=pages.filter(p=>fs.readFileSync(path.join(root,p),'utf8').includes('js/theme.js'));

test('theme runtime maps legacy component palettes to canonical --spike-* tokens',()=>{
  for(const token of ['--solid: var(--spike-surface)','--panel: var(--spike-surface)','--panel2: var(--spike-surface-2)','--spx-surface:','--g-bg: var(--spike-bg)','--edu-surface: var(--spike-surface)','--live-panel: var(--spike-surface)','--pb-surface: var(--spike-surface)','--chat-incoming: var(--spike-surface-2)','--spn-text: var(--spike-text)','--page-bg: var(--spike-bg)','--border: var(--spike-line)','--success: #22c55e','--purple: var(--spike-accent)','--pink: var(--spike-accent-2)']) assert.match(runtime,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('theme runtime v3 is loaded after the global visual authority on every theme-enabled production page',()=>{
  for(const p of themed){
    const s=fs.readFileSync(path.join(root,p),'utf8');
    assert.match(s,/js\/theme\.js/);
    assert.match(s,/css\/theme\.css/);
    assert.match(s,/css\/spike-theme-runtime-v3\.css/);
    const global=s.indexOf('css/spike-global-page-authority-v2.css?v=global-v1');
    const runtimePos=s.indexOf('css/spike-theme-runtime-v3.css');
    assert.ok(runtimePos>global,`${p}: runtime must follow global visual authority`);
  }
});

test('canonical theme engine exposes ten themes and emits the change contract',()=>{
  assert.match(themeJs,/const THEMES=\[/);
  assert.equal((theme.match(/html\[data-spike-style="\d+"\]/g)||[]).length,10);
  assert.match(themeJs,/spike:theme-change/);
});

test('theme runtime defines every theme-experience variable it consumes',()=>{
  const experience=fs.readFileSync(path.join(root,'css/spike-theme-experience-v3.css'),'utf8');
  for(const name of [...new Set((experience.match(/--theme-[\w-]+/g)||[]))]) assert.match(runtime,new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
