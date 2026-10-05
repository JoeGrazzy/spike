import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of ['message.html','messages.html']) {
  const html=fs.readFileSync(file,'utf8');
  test(`${file}: received voice notes use a compact custom player`,()=>{
    assert.match(html,/voice-message-card\{[\s\S]*?width:min\(300px,100%\)/,'compact voice card width');
    assert.match(html,/class="voice-play" type="button" aria-label="\$\{unavailable\?'Voice message unavailable':'Play voice message'\}"/,'explicit play control exists');
    assert.match(html,/class="voice-progress"/,'progress track exists');
    assert.match(html,/class="voice-audio" preload="metadata"/,'audio element remains the playback authority');
    assert.match(html,/function bindVoicePlayers\(root=document\)/,'player binding authority exists');
    assert.match(html,/await audio\.play\(\)/,'play button invokes the real audio element');
    assert.match(html,/audio\.addEventListener\('ended'/,'ended state resets');
    assert.match(html,/bindVoicePlayers\(\$\('messages'\)\)/,'rendered received messages bind playback');
    assert.match(html,/bindVoicePlayers\(n\)/,'newly appended messages bind playback');
    assert.match(html,/bindVoicePlayers\(next\)/,'updated messages bind playback');
  });
}
console.log('voice-note-player-ui-v1.test.mjs: 2/2 passed');
