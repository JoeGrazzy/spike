import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('message.html', root), 'utf8');
const css = fs.readFileSync(new URL('css/spike-conversation-refined.css', root), 'utf8');
const baseCss = fs.readFileSync(new URL('css/spike-messages.css', root), 'utf8');

 test('conversation refinement stylesheet is loaded exactly once and after base messaging styles', () => {
  const refs = [...html.matchAll(/<link\b[^>]*href="([^"]*spike-conversation-refined\.css(?:\?[^\"]*)?)"/gi)];
  assert.equal(refs.length, 1, 'conversation refinement stylesheet must not be linked more than once');
  assert.ok(html.indexOf('css/spike-messages.css') < html.indexOf(refs[0][0]), 'page-specific refinement must follow base messaging styles');
});

test('conversation bubbles preserve readable contrast for both message directions', () => {
  assert.match(css, /\.msg-thread-app \.bubble\.mine\s*\{[^}]*color:\s*#10151d/i);
  assert.match(css, /\.msg-thread-app \.bubble:not\(\.mine\)\s*\{[^}]*color:\s*#f2f5f8/i);
  assert.match(css, /\.msg-thread-app \.bubble\.mine time[\s\S]*?color:\s*rgba\(16,\s*21,\s*29,/i);
});

test('conversation controls retain touch sizing, narrow-screen layout and visible keyboard focus', () => {
  assert.match(css, /@media\s*\(max-width:\s*390px\)/i);
  assert.match(css, /\.msg-thread-app \.msg-composer \.msg-icon\s*\{[^}]*width:\s*39px/i);
  assert.match(baseCss, /\.msg-thread-app :where\(button,a,textarea\):focus-visible\s*\{/i);
});

test('message and attachment action sheets use semantic icon styles without changing action hooks', () => {
  for (const action of ['reply', 'copy', 'share', 'like', 'report', 'delete', 'close']) {
    assert.match(html, new RegExp(`data-msg-action="${action}"`));
  }
  for (const kind of ['image', 'video', 'audio', 'pdf', 'archive', 'any']) {
    assert.match(html, new RegExp(`data-media-kind="${kind}"`));
  }
  assert.match(css, /\.msg-sheet button\[data-msg-action\] > i/);
  assert.match(css, /\.msg-sheet button\[data-media-kind\] > i/);
});
