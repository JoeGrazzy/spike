import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../../../', import.meta.url).pathname;
const feed = fs.readFileSync(root + 'feed.html', 'utf8');
const bridge = fs.readFileSync(root + 'js/feed-runtime-11.js', 'utf8');
const publish = fs.readFileSync(root + 'js/feed-runtime-04-2.js', 'utf8');

assert.match(feed, /id="storySectionCreate"[^>]*href="#storyOverlay"/);
assert.match(feed, /id="storyBtn"[^>]*href="#storyOverlay"/);
assert.match(feed, /id="storyOverlay"/);
assert.match(feed, /id="storyMediaInput"/);
assert.match(feed, /id="storyAudioInput"/);
assert.match(feed, /id="storyMediaBtn"[^>]*for="storyMediaInput"/);
assert.match(feed, /id="storyAudioBtn"[^>]*for="storyAudioInput"/);
assert.match(bridge, /__SPIKE_STORY_INTERACTION_BRIDGE__/);
assert.match(bridge, /#storySectionCreate, #storyBtn, \[data-studio="story"\]/);
assert.match(bridge, /overlay\.classList\.add\('open'\)/);
assert.match(bridge, /overlay\.removeAttribute\('hidden'\)/);
assert.match(bridge, /#storyMediaBtn/);
assert.match(bridge, /#storyAudioBtn/);
assert.match(bridge, /#publishStory/);
assert.match(bridge, /window\.publishStory\(\)/);
assert.match(publish, /async function publishStory\(\)/);
assert.match(publish, /uploadToCloudinary\(mediaFile, 'spike\/stories'/);
assert.match(publish, /putDoc\(`stories\/\$\{id\}`/);
console.log('story interaction bridge: 14/14 passed');

assert.match(feed, /#storyOverlay:target\{display:grid!important;\}/);
