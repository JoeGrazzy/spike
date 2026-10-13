import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile('css/spike-three-theme-authority.css', 'utf8');
const themeJs = await readFile('js/theme.js', 'utf8');
const settings = await readFile('settings.html', 'utf8');

function luminance(hex) {
  const channels = hex.replace('#', '').match(/.{2}/g).map(v => parseInt(v, 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test('Theme 2 is identified as Modern Mineral with a stable ID and selectable light/dark mode', () => {
  assert.match(themeJs, /id:2,name:'Theme 2',mode:'light',signature:'Modern Mineral/);
  assert.match(settings, /<option value="2">Theme 2 — Modern Mineral<\/option>/);
  assert.match(settings, /2:'Modern Mineral'/);
});

test('Modern Mineral uses a fresh mineral-white and jade palette plus a dark variant', () => {
  assert.match(css, /html\[data-spike-style="2"\]\{color-scheme:light/);
  assert.match(css, /--spike-bg:#f4f7f5/);
  assert.match(css, /--spike-surface:#ffffff/);
  assert.match(css, /--spike-text:#172a26/);
  assert.match(css, /--spike-accent:#087f70/);
  assert.match(css, /Theme 2 — Modern Mineral/);
  assert.match(css, /html\[data-spike-style="2"\].*\.bubble\.mine/s);
  assert.match(css, /data-spike-theme-mode="dark"/);
  assert.match(themeJs, /spike-theme-2-mode/);
  assert.match(settings, /id="theme2Mode"/);
});

test('Modern Mineral text and primary actions meet WCAG AA contrast on light and dark surfaces', () => {
  assert.ok(contrast('#172a26', '#ffffff') >= 7, 'light primary text should exceed 7:1 contrast');
  assert.ok(contrast('#526761', '#ffffff') >= 4.5, 'light muted text should meet 4.5:1 contrast');
  assert.ok(contrast('#08695e', '#ffffff') >= 4.5, 'light primary action should meet 4.5:1 contrast');
  assert.ok(contrast('#eff8f4', '#172321') >= 7, 'dark primary text should exceed 7:1 contrast');
  assert.ok(contrast('#b4c9c0', '#172321') >= 4.5, 'dark muted text should meet 4.5:1 contrast');
});
