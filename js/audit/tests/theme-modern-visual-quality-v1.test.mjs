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
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
function declarations(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(`${escaped}\\{([^}]*)\\}`, 'g'))];
  const match = matches.at(-1);
  assert.ok(match, `Expected palette rule ${selector}`);
  return Object.fromEntries([...match[1].matchAll(/(--spike-[\w-]+):([^;]+);/g)].map((m) => [m[1], m[2]]));
}

test('Modern visual finish defines shared, theme-neutral design tokens', () => {
  for (const token of ['--spike-radius-xs: 8px', '--spike-radius-sm: 12px', '--spike-radius-lg: 22px', '--spike-control-height: 44px', '--spike-motion-ease:', '--spike-surface-selected:', '--spike-card-shadow:']) {
    assert.ok(css.includes(token), `Missing modern design token ${token}`);
  }
  assert.match(css, /text-rendering: optimizeLegibility/);
  assert.match(css, /letter-spacing: -.025em/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('Modern finish preserves shared component geometry across all five themes', () => {
  assert.match(css, /--spike-radius:18px/);
  assert.match(css, /--spike-control-radius:12px/);
  assert.match(css, /html\[data-spike-style\] :is\(\.card,\.panel,\.post,\.composer/);
  assert.match(css, /html\[data-spike-style\] :is\(button,\.btn,\.button,\[role="button"\]\):focus-visible/);
  assert.match(css, /html\[data-spike-style\] :is\(input,textarea,select\):focus-visible/);
  assert.match(css, /html\[data-spike-style\] \[hidden\]\{display:none!important;\}/);
});

test('Primary action text reaches WCAG AA contrast at both gradient endpoints', () => {
  const palettes = [
    { name: 'Midnight Luxe', selector: 'html[data-spike-style="1"]' },
    { name: 'Arctic Glass', selector: 'html[data-spike-style="2"]' },
    { name: 'Emerald Obsidian', selector: 'html[data-spike-style="3"]' },
    { name: 'Sandstone Studio', selector: 'html[data-spike-style="4"]' },
    { name: 'Cosmic Pulse', selector: 'html[data-spike-style="5"]' },
  ];
  for (const palette of palettes) {
    const values = declarations(palette.selector);
    for (const token of ['--spike-action-bg', '--spike-action-bg-2']) {
      assert.ok(contrast(values['--spike-action-text'], values[token]) >= 4.5, `${palette.name} ${token} contrast is below 4.5:1`);
    }
  }
});
