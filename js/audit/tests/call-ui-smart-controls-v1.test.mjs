import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const source = fs.readFileSync(path.join(process.cwd(), 'js/spike-dm-realtime-calls-v2.js'), 'utf8');
test('recording options are filtered by active call media', () => {
  assert.match(source, /voice\.hidden=false/);
  assert.match(source, /video\.hidden=c\.media!=='video'/);
  assert.match(source, /business\.hidden=c\.media!=='video'/);
  assert.match(source, /async function requestBusinessRecording\(\)\{const c=call;if\(!c\|\|c\.media!=='video'/);
  assert.match(source, /p\.media!=='video'\|\|c\.media!=='video'/);
});
test('front/back camera control exists only for connected video calls', () => {
  assert.match(source, /id="flipCameraCall"/);
  assert.match(source, /flip\.hidden=incoming\|\|!call\?\.connected\|\|call\?\.media!=='video'/);
  assert.match(source, /async function switchCallCamera\(\)/);
  assert.match(source, /sender\.replaceTrack\(nextTrack\)/);
  assert.match(source, /addEventListener\('click',switchCallCamera\)/);
});
test('recording feedback stays compact while preserving an active recording indicator', () => {
  assert.match(source, /status\.textContent='Recording options'/);
  assert.match(source, /remoteNotice\.textContent=c\.remoteRecordingNotice\?'Recording in progress':''/);
  assert.match(source, /Recording has started\. A discreet recording indicator is visible to the other participant/);
  assert.doesNotMatch(source, /Other participant stopped recording/);
});
