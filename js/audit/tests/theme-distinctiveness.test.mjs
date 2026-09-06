import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css=await readFile('css/theme.css','utf8');

test('V17 has exactly 10 canonical theme identities with deliberately distinct geometry/materials',()=>{
  const blocks=[...css.matchAll(/html\[data-spike-style="(\d+)"\]\{color-scheme:(dark|light);\n\s*--spike-bg:([^;]+);--spike-surface:([^;]+);--spike-surface-2:([^;]+);--spike-surface-3:([^;]+);\n\s*--spike-text:([^;]+);--spike-muted:([^;]+);--spike-line:([^;]+);--spike-accent:([^;]+);--spike-accent-2:([^;]+);--spike-glow:([^;]+);\n\s*--spike-shadow:([^;]+);--spike-radius:([^;]+);--spike-control-radius:([^;]+);--spike-blur:([^;]+);--spike-font:([^;]+);\n\}/g)];
  assert.equal(blocks.length,10);
  assert.deepEqual(blocks.map(m=>Number(m[1])),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(new Set(blocks.map(m=>m[14])).size,10,'all 10 card silhouettes must differ');
  assert.ok(new Set(blocks.map(m=>m[15])).size>=8,'control families must have meaningful variation');
  assert.ok(blocks.filter(m=>m[16].includes('0px')).length>=5,'at least five themes must intentionally avoid glass blur');
  assert.ok(blocks.filter(m=>parseInt(m[16],10)>=14).length>=3,'at least three themes must use material blur');
  assert.equal(new Set(blocks.map(m=>m[17])).size,6,'typography families must be intentionally varied');
});

test('No obsolete embedded theme systems remain in production pages',async()=>{
  const {readdir,readFile}=await import('node:fs/promises');
  const pages=(await readdir('.')).filter(x=>x.endsWith('.html'));
  for(const p of pages){
    const s=await readFile(p,'utf8');
    assert.doesNotMatch(s,/id=["'](?:spike-universal-theme-css|spike-all-pages-theme-layer|spike-style-5-final|spike-final-theme-hardening|spike-friends-theme-fix|spike-rooms-all-themes|spike-theme-safe-ui|message-premium-clean-theme)["']/i,p);
  }
});
