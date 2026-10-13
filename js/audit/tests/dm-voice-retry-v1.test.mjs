import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dm = await readFile('message.html', 'utf8');

test('Voice-note send failures preserve the recording and expose a retry action', () => {
  assert.match(dm, /recordingBlob&&!voiceSendBusy\)sendRecordedBlob\(recordingBlob\)/);
  assert.match(dm, /Voice note not sent\. Your recording is still here; retry or cancel\./);
  assert.match(dm, /\$\('sendRecording'\)\.textContent='Retry voice note'/);
  assert.match(dm, /recordingBlob=null;recordingMessageId=null;\$\('recordingTray'\)\.hidden=true/);
});

test('Voice-note retries reuse a stable client-generated message ID to avoid duplicate inserts', () => {
  assert.match(dm, /if\(!recordingMessageId\)recordingMessageId=crypto\.randomUUID\(\)/);
  assert.match(dm, /const payload=\{id:recordingMessageId,sender_id:me\.id,recipient_id:other,body:reader,message_type:'voice'\}/);
  assert.match(dm, /\.eq\('id',recordingMessageId\)\.eq\('sender_id',me\.id\)\.eq\('recipient_id',other\)\.eq\('message_type','voice'\)\.maybeSingle\(\)/);
  assert.match(dm, /if\(!items\.some\(m=>String\(m\.id\)===String\(data\.id\)\)\)/);
});
