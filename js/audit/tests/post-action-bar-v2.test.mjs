import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const feed = fs.readFileSync(path.join(root, 'feed.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'js/feed-runtime-04-2.js'), 'utf8');
const runtime3 = fs.readFileSync(path.join(root, 'js/feed-runtime-04-3.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/spike-post-actions-v2.css'), 'utf8');

const slice = (s, a, b) => {
  const i = s.indexOf(a);
  assert.notEqual(i, -1, `missing ${a}`);
  const j = s.indexOf(b, i + a.length);
  return s.slice(i, j === -1 ? s.length : j);
};

test('post renderer has exactly four primary actions', () => {
  const render = slice(runtime, 'function signalHTML(p)', 'function renderSignalsFromRanked');
  assert.match(render, /data-like="\$\{esc\(p\.id\)\}"/);
  assert.match(render, /data-comments="\$\{esc\(p\.id\)\}"/);
  assert.match(render, /data-share="\$\{esc\(p\.id\)\}"/);
  assert.match(render, /data-save="\$\{esc\(p\.id\)\}"/);
  assert.equal((render.match(/class="spike-post-action/g) || []).length, 4);
  assert.doesNotMatch(render, /data-pass="/);
  assert.doesNotMatch(render, /class="reaction-picker"/);
  assert.doesNotMatch(render, /class="signal-activity-row"/);
  assert.doesNotMatch(render, /class="signal-featured-badge"/);
  assert.doesNotMatch(render, /class="rank-badge"/);
});

test('like and comment counts live on their dedicated actions', () => {
  const render = slice(runtime, 'function signalHTML(p)', 'function renderSignalsFromRanked');
  assert.match(render, /data-like-count="\$\{esc\(p\.id\)\}"/);
  assert.match(render, /data-comments-count="\$\{esc\(p\.id\)\}"/);
  assert.match(runtime, /data-like-count=.*m\.likes/);
  assert.match(runtime, /data-comments-count/);
  assert.match(runtime, /const comments = Array\.isArray\(post\?\.comments\)/);
});

test('save and like state are synchronized in place', () => {
  assert.match(runtime, /btn\.setAttribute\('aria-label', liked \? 'Unlike Signal' : 'Like Signal'\)/);
  assert.match(runtime, /icon\.textContent = liked \? '♥' : '♡'/);
  assert.match(runtime, /label\.textContent = saved \? 'Saved' : 'Save'/);
});

test('Share action opens a dedicated themed share sheet', () => {
  assert.match(runtime3, /b\.dataset\.share/);
  assert.match(runtime3, /openPostShare\(id\)/);
  assert.match(feed, /id="spikePostShareOverlay"/);
  assert.match(feed, /data-post-share-action="connections"/);
  assert.match(feed, /data-post-share-action="external"/);
  assert.match(feed, /data-post-share-action="copy"/);
  assert.match(runtime, /window\.SPIKEShare\.prepare/);
  assert.match(runtime, /window\.SPIKEShare\.sharePrepared/);
});

test('Pass to connections remains available through Share without being a duplicate primary action', () => {
  assert.match(runtime3, /closePostShare\(\); await passSignal\(id\)/);
  assert.match(runtime, /function passSignal\(id\)/);
  assert.match(feed, /id="spikePassOverlay"/);
});

test('long-pressing Like opens the existing reaction tray without adding a permanent React button', () => {
  assert.match(runtime3, /openReactionTray\(id,b\)/);
  assert.match(runtime3, /b\.dataset\.longpressFired='1'/);
  assert.match(runtime3, /if \(b\.dataset\.longpressFired === '1'\)/);
  assert.doesNotMatch(slice(runtime, 'function signalHTML(p)', 'function renderSignalsFromRanked'), /react-trigger/);
});

test('duplicate viewer-facing metrics are suppressed while creator insights remain available', () => {
  assert.match(css, /\.post > \.post-stats,[\s\S]*?\.post > \.signal-activity-row,[\s\S]*?\.post > \.reaction-picker\{display:none!important\}/);
  assert.match(css, /\.post > \.reaction-picker\{display:none!important\}/);
  const render = slice(runtime, 'function signalHTML(p)', 'function renderSignalsFromRanked');
  assert.match(render, /class="owner-insights"/);
});

test('post action styling uses theme authority instead of fixed palette colors', () => {
  assert.match(css, /var\(--spike-accent\)/);
  assert.match(css, /var\(--spike-accent-2\)/);
  assert.match(css, /var\(--spike-surface-2\)/);
  assert.match(css, /var\(--spike-line\)/);
  assert.doesNotMatch(css, /data-spike-style="[0-9]+"/,'action geometry must not fork per theme');
});

test('the dedicated action stylesheet is loaded after the existing feed polish layers', () => {
  assert.match(feed, /feed-rebuild-v1\.css.*spike-post-actions-v2\.css/);
});
