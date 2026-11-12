import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = process.cwd();
const helper = await readFile(`${root}/js/spike-comment-keyboard-v1.js`, 'utf8');
const html = await readFile(`${root}/feed.html`, 'utf8');

test('Feed loads the keyboard-aware Echo input helper after the comment runtime', () => {
  const runtimeIndex = html.indexOf('js/feed-runtime-04-3.js');
  const helperIndex = html.indexOf('js/spike-comment-keyboard-v1.js');
  assert.ok(runtimeIndex >= 0, 'Feed comment runtime must remain present');
  assert.ok(helperIndex > runtimeIndex, 'Keyboard helper must load after the Feed runtime');
});

test('Echo input is revealed when focus opens the Android keyboard', () => {
  assert.match(helper, /focusin/);
  assert.match(helper, /\.comment-form textarea/);
  assert.match(helper, /scrollIntoView/);
  assert.match(helper, /block:\s*'center'/);
  assert.match(helper, /visualViewport\.addEventListener\('resize'/);
  assert.match(helper, /visualViewport\.addEventListener\('scroll'/);
});

test('Keyboard reveal rechecks delayed viewport animation and respects reduced motion', () => {
  assert.match(helper, /\[80,\s*220,\s*420,\s*700\]/);
  assert.match(helper, /prefers-reduced-motion/);
  assert.match(helper, /document\.activeElement === input/);
});
