import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const script = readFileSync(join(root, 'js/spike-onboarding-v1.js'), 'utf8');
const css = readFileSync(join(root, 'css/spike-onboarding-v1.css'), 'utf8');
const placementCss = readFileSync(join(root, 'css/spike-onboarding-help-placement-v2.css'), 'utf8');

test('onboarding no longer creates a floating Help control', () => {
  assert.match(script, /function createHelpEntry\(\)/);
  assert.doesNotMatch(script, /helpButton\s*=\s*document\.createElement/);
  assert.match(css, /\.spike-onboarding-help\s*\{\s*display:\s*none\s*!important\s*\}/);
});

test('Help is placed in navigation or a normal header, never fixed over feed content', () => {
  assert.match(script, /\.menu-reference-support \.spike-command-list/);
  assert.match(script, /\.spike-onboarding-header-help/);
  assert.match(placementCss, /display:inline-flex/);
  assert.doesNotMatch(placementCss, /position:\s*fixed/);
});

test('all onboarding pages load the updated placement stylesheet and script version', () => {
  const pages = readdirSync(root).filter(name => name.endsWith('.html'));
  const onboardingPages = pages.filter(name => readFileSync(join(root, name), 'utf8').includes('js/spike-onboarding-v1.js?v=2'));
  assert.equal(onboardingPages.length, 14);
  for (const name of onboardingPages) {
    const html = readFileSync(join(root, name), 'utf8');
    assert.match(html, /css\/spike-onboarding-help-placement-v2\.css/);
  }
});
