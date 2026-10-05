import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html=await readFile('message.html','utf8');

assert.match(html,/let me=.*sendVoiceAfterRecording=false/, 'Voice recording state must track auto-send intent');
assert.match(html,/function stopVoiceRecording\(cancel,autoSend=false\)/, 'Stopping a recording must support send-after-stop');
assert.match(html,/sendVoiceAfterRecording=!!autoSend/, 'Auto-send intent must be captured before MediaRecorder.stop');
assert.match(html,/const autoSend=sendVoiceAfterRecording;sendVoiceAfterRecording=false;/, 'onstop must consume auto-send intent exactly once');
assert.match(html,/if\(autoSend\)void sendVoiceNote\(\);/, 'Completed recording must enter the existing voice upload/send path');
assert.match(html,/if\(recording\)\{sendVoiceAfterRecording=true;\$\('voiceSend'\)\.disabled=true;toast\('Finishing voice note…'\);stopVoiceRecording\(false,true\);return\}/, 'Tapping Send while recording must stop recording and auto-send it');
assert.match(html,/\$\('voicePreviewSend'\)\.onclick=sendVoiceNote/, 'Preview Send must continue using the same send path');
assert.match(html,/const file=new File\(\[voiceBlob\][\s\S]*?uploadToSupabaseDmStorage\(file\)/, 'Voice sending must still upload the recorded blob');
assert.match(html,/private_messages.*message_type:'audio'/, 'Voice sending must still create an audio private message');
console.log('voice-note-send.test.mjs: 9/9 passed');
