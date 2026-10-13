import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const pages=fs.readdirSync(root).filter(f=>f.endsWith('.html'));
test('every production HTML page loads the shared theme registry and palette authority',()=>{
  for(const page of pages){const html=fs.readFileSync(path.join(root,page),'utf8');assert.match(html,/js\/theme\.js/,`${page} must load theme.js`);assert.match(html,/css\/spike-three-theme-authority\.css/,`${page} must load theme authority`);}
});
test('every production HTML page loads the compatibility runtime token layer',()=>{
  for(const page of pages){const html=fs.readFileSync(path.join(root,page),'utf8');assert.match(html,/css\/spike-theme-runtime-v3\.css/,`${page} must load runtime token aliases`);}
});
test('each theme defines a coherent glow token and shared geometry tokens',()=>{
  const css=fs.readFileSync(path.join(root,'css/spike-three-theme-authority.css'),'utf8');
  for(const id of [1,2,3]){assert.ok(css.includes(`html[data-spike-style="${id}"]{`),`theme ${id} palette exists`);}
  for(const glow of ["rgba(255,128,95,.16)","rgba(8,127,112,.12)","rgba(255,36,79,.24)"]){assert.ok(css.includes(`--spike-glow:${glow}`),`missing theme glow ${glow}`);}
  assert.match(css,/--spike-radius:18px/);assert.match(css,/--spike-control-radius:12px/);assert.match(css,/--spike-blur:0px/);
});
