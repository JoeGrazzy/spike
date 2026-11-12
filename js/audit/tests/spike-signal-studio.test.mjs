import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('../../..',import.meta.url).pathname);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('feed.html'), runtime=read('js/spike-signal-studio.js'), css=read('css/spike-signal-studio.css');
test('Signal Studio is wired as a new publishing surface without reviving retired composer nodes',()=>{
  assert.match(html,/css\/spike-signal-studio\.css\?v=signal-studio-v32-theme-smart-errors/);
  assert.match(html,/js\/spike-signal-studio\.js\?v=signal-studio-v32-theme-smart-errors/);
  assert.match(runtime,/Signal Studio/);
  assert.match(runtime,/id="spikeStudioLaunch"/);
  for(const legacy of ['spikeComposer','signalText','releaseSignalBtn','saveDraftBtn','contentCenterOverlay','linkOverlay'])assert.doesNotMatch(runtime,new RegExp(`id=["']${legacy}["']`));
});
test('Signal Studio validates content and media, publishes to the canonical posts collection, and updates the feed',()=>{
  assert.match(runtime,/if\(!content&&!selectedFile\)/);
  assert.match(runtime,/MAX_TEXT=5000/);
  assert.match(runtime,/MAX_IMAGE=10\*1024\*1024/);
  assert.match(runtime,/MAX_VIDEO=100\*1024\*1024/);
  assert.match(runtime,/collection_name:'posts'/);
  assert.match(runtime,/state\.posts\.unshift\(post\)/);
  assert.match(runtime,/window\.renderSignals\(\)/);
  assert.match(runtime,/onProgress:/);
});
test('Signal Studio has responsive, reduced-motion-aware presentation and media accessibility support',()=>{
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(runtime,/Describe this visual/);
  assert.match(runtime,/aria-modal="true"/);
  assert.match(runtime,/aria-live="polite"/);
});

test('opening Signal Studio does not autofocus the text field or trigger a mobile keyboard',()=>{
  assert.doesNotMatch(runtime,/function open\(\)[^}]*spikeStudioText[^}]*\.focus\(\)/);
  assert.match(runtime,/Deliberately do not focus the textarea/);
  assert.match(runtime,/id="spikeStudioText" maxlength=/);
});
test('Signal Studio inherits SPIKE theme tokens instead of hard-coding a single pink palette',()=>{
  for(const token of ['--spike-bg','--spike-surface','--spike-surface-2','--spike-text','--spike-muted','--spike-line','--spike-accent','--spike-accent-2','--spike-action-bg','--spike-action-bg-2','--spike-glow'])assert.ok(css.includes(token),`missing theme token ${token}`);
  assert.match(runtime,/spike:theme-change/);
});
test('publishing has graceful network, authentication, permission, and upload failure handling',()=>{
  for(const phrase of ['offline','sign-in may have expired','access rule','Connection trouble interrupted publishing','upload did not finish'])assert.ok(runtime.toLowerCase().includes(phrase.toLowerCase()),`missing helpful error: ${phrase}`);
  assert.match(runtime,/typeof window\.SPIKEUploadToCloudinary!=='function'/);
  assert.match(runtime,/Media upload returned no usable URL/);
  assert.match(runtime,/Your draft is still here/);
});
