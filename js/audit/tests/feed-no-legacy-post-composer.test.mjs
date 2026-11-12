import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('../../..',import.meta.url).pathname);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const feed=read('feed.html');
const runtime=[read('js/feed-runtime-04-1.js'),read('js/feed-runtime-04-2.js'),read('js/feed-runtime-04-3.js')].join('\n');
const styles=['css/feed-features.css','css/feed-rebuild-v1.css','css/spike-experience-v2.css','css/spike-beauty-v1.css'].map(read).join('\n');
test('Feed has no legacy post composer, draft/schedule panel, or Start/Create nav entry',()=>{
  for(const id of ['spikeComposer','signalText','releaseSignalBtn','saveDraftBtn','contentCenterBtn','contentCenterOverlay','linkOverlay']) assert.doesNotMatch(feed,new RegExp('id=[\"\\\']'+id+'[\"\\\']','i'));
  assert.doesNotMatch(feed,/data-smart-nav=[\"\\\']create[\"\\\']/i);
  assert.doesNotMatch(runtime,/CONTENT_DRAFTS_KEY|spike-composer-drafts|function releaseSignal|function renderContentCenter|saveCurrentDraft|openContentCenter/);
  assert.doesNotMatch(styles,/spike-signal-composer|signal-writing-surface|signal-release-row|content-center-card|ai-compose-panel|spike-x-composer/);
});
test('Feed reading and interaction surfaces remain present',()=>{
  for(const id of ['posts','spikePostShareOverlay','spikePassOverlay']) assert.match(feed,new RegExp('id=[\"\\\']'+id+'[\"\\\']','i'));
  assert.match(runtime,/function passSignal/);
  assert.match(runtime,/function reportSignal/);
});
