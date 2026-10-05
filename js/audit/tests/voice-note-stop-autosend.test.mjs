import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function extract(src, startName, endName) {
  const start = src.indexOf(startName);
  assert.ok(start >= 0, `missing ${startName}`);
  const end = src.indexOf(endName, start + startName.length);
  assert.ok(end > start, `missing ${endName}`);
  return src.slice(start, end).trim();
}

for (const file of ['message.html', 'messages.html']) {
  test(`${file}: stopping an active recording requests auto-send`, async () => {
    const html = fs.readFileSync(file, 'utf8');
    const code = extract(html, 'async function toggleRecording()', 'function stopVoiceRecording');
    const calls = [];
    const ctx = {
      active: 'recipient-1',
      recording: { state: 'recording' },
      navigator: { mediaDevices: { getUserMedia: async () => { throw new Error('must not request microphone while already recording'); } } },
      MediaRecorder: function MediaRecorder() {},
      window: { MediaRecorder: function MediaRecorder() {} },
      stopVoiceRecording: (...args) => calls.push(args),
      toast: (...args) => calls.push(['toast', ...args]),
      voiceMime: () => '',
      recordingMime: '', recordingStream: null, recordingChunks: [], recordingStartedAt: 0,
      recordingTimer: null,
      setVoicePanel() {},
      updateVoiceTimer() {},
      $: () => ({})
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx, { timeout: 5000 });
    await ctx.toggleRecording();
    assert.deepEqual(calls[0], [false, true], `${file}: active recording must stop with autoSend=true`);
    assert.equal(calls.length, 1, `${file}: stopping an active recording must not start a second recorder`);
  });

  test(`${file}: finalized auto-send remains wired to the real send path`, () => {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /function stopVoiceRecording\(cancel,autoSend=false\).*?sendVoiceAfterRecording=!!autoSend/s);
    assert.match(html, /if\(autoSend\)void sendVoiceNote\(\);/);
    assert.match(html, /\$\('voiceSend'\)\.onclick=sendVoiceNote/);
    assert.match(html, /\$\('voicePreviewSend'\)\.onclick=sendVoiceNote/);
  });
}
