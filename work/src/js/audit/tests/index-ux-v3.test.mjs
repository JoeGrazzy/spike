import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/spike-index-authority-v5.css'), 'utf8');
const baseCss = fs.readFileSync(path.join(root, 'css/index.css'), 'utf8');

test('index uses the shared theme authority followed by the final Index authority', () => {
  assert.ok(html.includes('spike-theme-experience-v3.css'));
  assert.ok(html.includes('spike-index-authority-v5.css?v=index-v5'));
  assert.ok(html.indexOf('spike-theme-experience-v3.css') < html.indexOf('spike-index-authority-v5.css?v=index-v5'));
});

test('index has no competing legacy visual authorities', () => {
  for (const legacy of ['spike-unified-v2.css','spike-beauty-v1.css','spike-index-authority-v3.css','spike-native-select.css']) {
    assert.ok(!html.includes(legacy), `legacy Index dependency remains: ${legacy}`);
  }
  assert.ok(!html.includes('spike-native-select.js'));
});

test('index typography uses the bundled SPIKE font and controlled mobile scale', () => {
  assert.match(css, /@font-face\{font-family:'SPIKE Inter'/);
  assert.match(css, /font-family:'SPIKE Inter'[^;]*!important/);
  assert.match(css, /font-weight:800/);
  assert.match(css, /-webkit-font-smoothing:antialiased/);
  assert.match(css, /font-size:clamp\(27px,8\.5vw,34px\)/);
});

test('index enforces border-box and structural overflow protection', () => {
  assert.ok(css.includes('box-sizing:border-box'));
  assert.ok(css.includes('overflow-x:hidden'));
  assert.ok(css.includes('body[data-spike-page="index"] .auth-page'));
  assert.ok(css.includes('body[data-spike-page="index"] .input-wrap'));
  assert.ok(css.includes('width:100%;'));
  assert.ok(css.includes('min-width:0;'));
  assert.ok(css.includes('max-width:100%'));
  assert.ok(baseCss.includes('grid-template-columns:1fr 1fr'));
});

test('index mobile hierarchy removes redundant feature strip and compresses hero', () => {
  assert.ok(baseCss.includes('.feature-strip{display:none}'));
  assert.ok(css.includes('.hero-copy{margin-top:15px}'));
  assert.ok(html.includes('id="loginForm"'));
  assert.ok(html.includes('id="registerForm"'));
  assert.ok(html.includes('id="googleLoginBtn"'));
  assert.ok(html.includes('id="githubLoginBtn"'));
});

test('index keeps long labels and actions inside narrow screens', () => {
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /\.row\{flex-wrap:wrap\}/);
  assert.match(css, /\.oauth-btn\{min-width:0;max-width:100%;overflow:hidden\}/);
  assert.match(css, /@media\(max-width:380px\)/);
  assert.match(css, /\.row\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
});

test('index authentication DOM contracts remain present', () => {
  for (const id of ['loginTab','registerTab','loginForm','registerForm','resetForm','otpForm','googleLoginBtn','githubLoginBtn','forgotBtn']) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
  }
});
