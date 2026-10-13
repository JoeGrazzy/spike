import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile('css/spike-three-theme-authority.css', 'utf8');
function luminance(hex) {
  const values = hex.replace('#', '').match(/.{2}/g).map(value => parseInt(value, 16) / 255);
  const [r, g, b] = values.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('Premium Neon Red primary action endpoints meet WCAG AA for white text', () => {
  assert.ok(contrast('#ffffff', '#c20f3b') >= 4.5, 'primary action start must reach 4.5:1');
  assert.ok(contrast('#ffffff', '#d81742') >= 4.5, 'primary action end must reach 4.5:1');
  assert.match(css, /--spike-action-bg-2:#d81742/);
});

test('Premium Neon Red selection and outgoing bubbles use readable foreground colors', () => {
  assert.ok(contrast('#08070b', '#ff244f') >= 4.5, 'selection foreground must reach 4.5:1');
  assert.match(css, /html\[data-spike-style="3"\] ::selection\{background:#ff244f;color:#08070b;\}/);
  assert.match(css, /\.bubble\.mine,.message\.mine,.message-bubble\.mine\)\{background:linear-gradient\(135deg,#c20f3b,#a90e34\)!important;color:#fff!important;/);
  assert.ok(contrast('#ffffff', '#a90e34') >= 4.5, 'outgoing message dark-red endpoint must reach 4.5:1');
});

test('Neon glow remains decorative and focus indicators stay explicit', () => {
  assert.match(css, /--spike-accent:#ff244f/);
  assert.match(css, /--spike-focus:#ff8da8/);
  assert.match(css, /focus-visible\{outline:3px solid var\(--spike-focus\)!important/);
});
