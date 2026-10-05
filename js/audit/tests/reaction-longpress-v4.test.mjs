import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const runtime2=fs.readFileSync(path.join(root,'js/feed-runtime-04-2.js'),'utf8');
const runtime3=fs.readFileSync(path.join(root,'js/feed-runtime-04-3.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/spike-post-actions-v4.css'),'utf8');
const feed=fs.readFileSync(path.join(root,'feed.html'),'utf8');

test('reaction tray has capture-first mobile activation and backend handoff',()=>{
  assert.match(runtime2,/function openReactionTray\(id, anchor\)/);
  assert.match(runtime2,/const emoji = button\.getAttribute\('data-spike-reaction'\)/);
  assert.match(runtime2,/await reactToSignal\(id, emoji\)/);
  assert.match(runtime2,/tray\.addEventListener\('pointerup', captureReactionEvent, \{capture:true/);
  assert.match(runtime2,/tray\.addEventListener\('touchend', captureReactionEvent, \{capture:true/);
  assert.match(runtime2,/tray\.addEventListener\('click', captureReactionEvent, \{capture:true\}/);
  assert.match(runtime2,/document\.addEventListener\('pointerup', documentReactionBridge, \{capture:true/);
  assert.match(runtime2,/document\.addEventListener\('touchend', documentReactionBridge, \{capture:true/);
  assert.match(runtime2,/button\.addEventListener\('pointerup'/);
  assert.match(runtime2,/button\.addEventListener\('touchend'/);
  assert.match(runtime2,/button\.addEventListener\('click'/);
});

test('reaction selection cannot silently disappear',()=>{
  assert.match(runtime2,/if \(!p\) throw new Error\('This Signal is no longer available/);
  assert.match(runtime2,/if \(!SPIKE_REACTIONS\.includes\(emoji\)\) throw new Error/);
  assert.match(runtime2,/toast\(err\?\.message \|\| 'Could not save that reaction/);
  assert.match(runtime2,/tray\._spikeReactionCleanup = cleanup/);
});

test('reaction tray is above all normal/overlay surfaces and hit-testable',()=>{
  assert.match(css,/\.spike-reaction-tray\{[\s\S]*z-index:2147483001 !important/);
  assert.match(css,/\.spike-reaction-tray\{[\s\S]*isolation:isolate !important/);
  assert.match(css,/\.spike-reaction-tray button\{[\s\S]*pointer-events:auto !important/);
  assert.match(css,/touch-action:manipulation !important/);
});

test('long press still opens the same tray and suppresses native context menu',()=>{
  assert.match(runtime3,/spikeLikeLongPressPointerId/);
  assert.match(runtime3,/spikeLikeLongPressStartX/);
  assert.match(runtime3,/openReactionTray\(id,b\)/);
  assert.match(runtime3,/addEventListener\('contextmenu'/);
  assert.match(runtime3,/e\.preventDefault\(\)/);
});

test('reaction assets use a fresh cache version',()=>{
  assert.match(feed,/feed-runtime-04-2\.js\?v=reaction-v4/);
  assert.match(feed,/spike-post-actions-v4\.css\?v=reaction-v4/);
});
