import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const runtime2=fs.readFileSync(path.join(root,'js/feed-runtime-04-2.js'),'utf8');
const runtime3=fs.readFileSync(path.join(root,'js/feed-runtime-04-3.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/spike-post-actions-v4.css'),'utf8');
const feed=fs.readFileSync(path.join(root,'feed.html'),'utf8');

test('reaction picker is persistent and uses one pointer selection path',()=>{
  assert.match(runtime2,/id='spikeReactionPicker'/);
  assert.match(runtime2,/function ensureReactionTray\(\)/);
  assert.match(runtime2,/tray\.addEventListener\('pointerup'/);
  assert.doesNotMatch(runtime2,/tray\.addEventListener\('touchend'/);
  assert.doesNotMatch(runtime2,/tray\.addEventListener\('mouseup'/);
  assert.doesNotMatch(runtime2,/document\.addEventListener\('pointerup', documentReactionBridge/);
  assert.match(runtime2,/void commitReactionSelection\(button,emoji\)/);
  assert.match(runtime2,/await reactToSignal\(id,emoji\)/);
});

test('reaction summary is rendered and can open the picker',()=>{
  assert.match(runtime2,/class="reaction-summary-row"/);
  assert.match(runtime2,/data-react-menu="\$\{esc\(p\.id\)\}"/);
  assert.match(runtime2,/function syncReactionDom\(id, post\)/);
  assert.match(runtime2,/const summary = article\.querySelector\('\.reaction-summary'\)/);
});

test('long press still opens the picker and suppresses native context menu',()=>{
  assert.match(runtime3,/spikeLikeLongPressPointerId/);
  assert.match(runtime3,/spikeLikeLongPressStartX/);
  assert.match(runtime3,/openReactionTray\(id,b\)/);
  assert.match(runtime3,/addEventListener\('contextmenu'/);
  assert.match(runtime3,/e\.preventDefault\(\)/);
});

test('reaction picker CSS is valid and hidden state wins',()=>{
  assert.match(css,/\.spike-reaction-tray\[hidden\]\{display:none !important;\}/);
  assert.match(css,/\.spike-reaction-tray\{[\s\S]*z-index:2147483001 !important/);
  assert.match(css,/\.spike-reaction-tray\{[\s\S]*pointer-events:auto !important/);
  assert.match(css,/\.spike-reaction-tray button\{[\s\S]*touch-action:none !important/);
});

test('fresh reaction cache version is wired',()=>{
  assert.match(feed,/feed-runtime-04-2\.js\?v=reaction-v5/);
  assert.match(feed,/spike-post-actions-v4\.css\?v=reaction-v5/);
});
