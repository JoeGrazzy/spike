import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../../', import.meta.url).pathname;
const feed = fs.readFileSync(root + 'feed.html', 'utf8');
const rail = fs.readFileSync(root + 'js/feed-runtime-10.js', 'utf8');
const runtime = fs.readFileSync(root + 'js/feed-runtime-04-3.js', 'utf8');

assert.match(feed, /id="storySectionCreate"[^>]*href="#storyOverlay"[^>]*>＋ Create Story/);
assert.match(feed, /id="storiesRow"/);
assert.match(feed, /id="storyBtn"[^>]*href="#storyOverlay"[^>]*>◎ Story/);
assert.match(rail, /if\(a==='story'\)\{document\.getElementById\('storyBtn'\)\?\.click\(\);\}/);
assert.match(runtime, /bindClick\('storySectionCreate', \(\) => openStory\(\)\)/);
assert.match(runtime, /bindClick\('storyBtn', \(\) => openStory\(\)\)/);

assert.match(feed, /#storyOverlay:target\{display:grid!important;\}/);
console.log('story visibility v5: 6/6 passed');
