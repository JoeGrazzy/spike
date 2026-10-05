import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('css/spike-index-authority-v5.css','utf8');
test('index V5 uses bundled SPIKE Inter with higher cascade specificity',()=>{
  assert.match(html,/spike-index-authority-v5\.css\?v=index-v5/);
  assert.match(css,/html\[data-spike-style\] body\[data-spike-page="index"\][\s\S]*font-family:'SPIKE Inter'/);
  assert.match(css,/html\[data-spike-style\] body\[data-spike-page="index"\] button/);
});
test('index V5 reflows narrow action rows instead of clipping them',()=>{
  assert.match(css,/\.row\{flex-wrap:wrap\}/);
  assert.match(css,/@media\(max-width:380px\)[\s\S]*\.row\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/\.terms \.check\{min-width:0;max-width:100%;overflow-wrap:anywhere\}/);
});
test('index V5 keeps structural width containment',()=>{
  assert.match(css,/box-sizing:border-box/);
  assert.match(css,/\.input-wrap/);
  assert.match(css,/input[\s\S]*width:100%/);
  assert.match(css,/\.oauth-btn\{min-width:0;max-width:100%;overflow:hidden\}/);
});
test('index V5 preserves auth contracts',()=>{
  for(const id of ['loginTab','registerTab','loginForm','registerForm','resetForm','otpForm','googleLoginBtn','githubLoginBtn','forgotBtn']) assert.ok(html.includes(`id="${id}"`));
});
