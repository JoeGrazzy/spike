import assert from 'node:assert/strict';
import fs from 'node:fs';
for (const file of ['message.html','messages.html']) {
  const html=fs.readFileSync(file,'utf8');
  assert.match(html,/const rawType=String\(file\?\.type\|\|''\)\.toLowerCase\(\)/,`${file}: MIME parameters normalized`);
  assert.match(html,/const type=rawType\.split\(';',1\)\[0\]\.trim\(\)/,`${file}: codec MIME accepted`);
  assert.match(html,/allowed\.includes\(type\)/,`${file}: normalized MIME validated`);
  assert.match(html,/contentType:type/,`${file}: storage uses normalized MIME`);
  assert.match(html,/audio\/webm;codecs=opus/,`${file}: Opus WebM retained`);
  assert.match(html,/function voiceExt\(mime\)/,`${file}: extension mapping retained`);
}
const message=fs.readFileSync('message.html','utf8');
assert.match(message,/if\(recording\)\{sendVoiceAfterRecording=true;/,'message.html: send finishes recording');
assert.match(message,/if\(autoSend\)void sendVoiceNote\(\);/,'message.html: auto-send after stop');
assert.match(message,/\$\('voicePreviewSend'\)\.onclick=sendVoiceNote/,'message.html: preview Send uses same send path');
const messages=fs.readFileSync('messages.html','utf8');
assert.match(messages,/if\(recording\)\{sendVoiceAfterRecording=true;/,'messages.html: send finishes recording');
assert.match(messages,/if\(autoSend\)void sendVoiceNote\(\);/,'messages.html: auto-send after stop');
assert.match(messages,/id="voicePreviewSend"/,'messages.html: completed recording has a Send control');
assert.match(messages,/\$\('voicePreviewSend'\)\.onclick=sendVoiceNote/,'messages.html: preview Send uses same send path');
console.log('voice-note-send-v2.test.mjs: 15/15 passed');
