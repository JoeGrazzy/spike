import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const feed=fs.readFileSync(path.join(root,'feed.html'),'utf8');
const runtime=fs.readFileSync(path.join(root,'js/feed-runtime-04-2.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/spike-post-actions-v4.css'),'utf8');
const render=runtime.slice(runtime.indexOf('function signalHTML(p)'),runtime.indexOf('function renderSignalsFromRanked'));
test('feed loads cache-busted post action runtime and final stylesheet',()=>{
  assert.match(feed,/feed-runtime-04-2\.js\?v=reaction-v5/);
  assert.match(feed,/feed-runtime-04-3\.js\?v=post-actions-v5/);
  assert.match(feed,/spike-post-actions-v4\.css\?v=reaction-v5/);
});
test('renderer has exactly four dedicated actions',()=>{
  assert.equal((render.match(/data-like=/g)||[]).length,1);
  assert.equal((render.match(/data-comments=/g)||[]).length,1);
  assert.equal((render.match(/data-share=/g)||[]).length,1);
  assert.equal((render.match(/data-save=/g)||[]).length,1);
  assert.doesNotMatch(render,/data-pass=/);
});
test('renderer contains no duplicate viewer analytics',()=>{
  assert.doesNotMatch(render,/signal-activity-row/);
  assert.doesNotMatch(render,/class="post-stats"/);
  assert.doesNotMatch(render,/Top Pick/);
  assert.doesNotMatch(render,/0\/100/);
});
test('final stylesheet defeats legacy post chrome',()=>{
  assert.match(css,/\.post \.post-stats,[\s\S]*display:none!important/);
  assert.match(css,/\.post \.signal-activity-row/);
  assert.match(css,/\.post > \.post-actions\.spike-post-action-bar/);
});
test('runtime no longer assigns per-post Top Pick rank',()=>{
  assert.doesNotMatch(runtime,/__signalTopRank/);
});
test('owner analytics stay hidden until explicitly opened, and legacy DOM guard removes duplicate metrics',()=>{
  assert.match(feed,/legacyPass\.removeAttribute\('data-pass'\)/);
  assert.match(feed,/legacyPass\.dataset\.share/);
  assert.match(feed,/\.post-stats, \.signal-activity-row/);
  assert.match(css,/\.post \.owner-insights\[hidden\]\{display:none!important\}/);
});
