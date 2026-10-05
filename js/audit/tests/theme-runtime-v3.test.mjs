import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter(f => f.endsWith('.html'));

const themed = htmlFiles.filter(f => {
  const s = fs.readFileSync(path.join(root,f),'utf8');
  return s.includes('js/theme.js') && s.includes('css/theme.css');
});

test('every themed page loads runtime v3 after all page styles', () => {
  assert.ok(themed.length > 0);
  for (const file of themed) {
    const s = fs.readFileSync(path.join(root,file),'utf8');
    const runtime = s.lastIndexOf('css/spike-theme-runtime-v3.css');
    const global = s.lastIndexOf('css/spike-global-page-authority-v2.css?v=global-v1');
    const lastStylesheet = Math.max(...[...s.matchAll(/<link[^>]+rel=[\"']stylesheet[\"'][^>]*>/gi)].map(m=>m.index));
    assert.ok(runtime >= 0, `${file}: missing theme runtime v3`);
    if(global >= 0) assert.ok(runtime > global, `${file}: runtime v3 must follow global visual authority`);
    else assert.ok(runtime >= lastStylesheet, `${file}: runtime v3 must be the final local stylesheet`);
    assert.equal(runtime, s.lastIndexOf('css/spike-theme-runtime-v3.css'), `${file}: duplicate runtime v3`);
  }
});

test('runtime v3 defines every legacy palette namespace found in v2', () => {
  const v2 = fs.readFileSync(path.join(root,'css/spike-theme-runtime-v2.css'),'utf8');
  const v3 = fs.readFileSync(path.join(root,'css/spike-theme-runtime-v3.css'),'utf8');
  const vars = [...new Set([...v2.matchAll(/--([a-zA-Z0-9_-]+)\s*:/g)].map(m=>m[1]))];
  const missing = vars.filter(v => !new RegExp(`--${v}\\s*:`).test(v3));
  assert.deepEqual(missing, [], `missing aliases: ${missing.join(', ')}`);
});

test('education compatibility spelling is covered', () => {
  const v3 = fs.readFileSync(path.join(root,'css/spike-theme-runtime-v3.css'),'utf8');
  assert.match(v3, /--edu-surface-2\s*:\s*var\(--spike-surface-2\)/);
  assert.match(v3, /--edu-surface2\s*:\s*var\(--spike-surface-2\)/);
});

test('navigation life token is theme-runtime controlled', () => {
  const v3 = fs.readFileSync(path.join(root,'css/spike-theme-runtime-v3.css'),'utf8');
  assert.match(v3, /--spn-life\s*:/);
});
