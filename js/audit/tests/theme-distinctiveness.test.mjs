import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const css=await readFile('css/theme.css','utf8');

test('V18 has exactly 10 beautiful theme identities with one shared product geometry',()=>{
  const blocks=[...css.matchAll(/html\[data-spike-style="(\d+)"\]\{color-scheme:(dark|light);([\s\S]*?)\n\}/g)];
  assert.equal(blocks.length,10);
  assert.deepEqual(blocks.map(m=>Number(m[1])),[1,2,3,4,5,6,7,8,9,10]);
  const values=blocks.map(m=>m[3]);
  assert.equal(new Set(values).size,10,'all 10 themes must have distinct palettes');
  assert.match(css,/--spike-radius:20px/,'card geometry is shared');
  assert.match(css,/--spike-control-radius:12px/,'control geometry is shared');
  assert.match(css,/--spike-font:Inter/,'typography remains recognisably SPIKE');
  assert.doesNotMatch(css,/--spike-radius:38px 14px 38px 14px|--spike-radius:44px 18px 44px 18px|--spike-radius:0px/,'no novelty geometry remains in theme tokens');
  assert.doesNotMatch(css,/Arial Black|Impact|Georgia,"Times New Roman"|Palatino/,'themes do not replace the product typography with novelty fonts');
});

test('Theme backgrounds remain restrained and component geometry is not theme-specific',()=>{
  assert.equal((css.match(/html\[data-spike-style="\d+"\] :where\(\.card/g)||[]).length,0);
  assert.equal((css.match(/html\[data-spike-style="\d+"\] :where\(\.btn/g)||[]).length,0);
  assert.equal((css.match(/html\[data-spike-style="\d+"\] :where\(\.tab/g)||[]).length,0);
  assert.ok((css.match(/--spike-body-image:/g)||[]).length>=11);
});

test('No obsolete embedded theme systems remain in production pages',async()=>{
  const pages=(await readdir('.')).filter(x=>x.endsWith('.html')&&!x.endsWith('.pre-rebuild.html'));
  for(const p of pages){
    const s=await readFile(p,'utf8');
    assert.doesNotMatch(s,/id=["'](?:spike-universal-theme-css|spike-all-pages-theme-layer|spike-style-5-final|spike-final-theme-hardening|spike-friends-theme-fix|spike-rooms-all-themes|spike-theme-safe-ui|message-premium-clean-theme)["']/i,p);
  }
});
