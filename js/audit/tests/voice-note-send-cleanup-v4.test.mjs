import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of ['message.html','messages.html']) {
  test(`${file}: successful voice send clears preview and has a real thread updater`, async () => {
    const html = fs.readFileSync(file,'utf8');
    assert.match(html, /function updateThread\(message\)\{/,'voice send must have a defined thread-state authority');
    assert.match(html, /const other=message\.sender_id===me\?\.id\?message\.recipient_id:message\.sender_id/,'thread updater must resolve the conversation participant');
    assert.match(html, /cleanupRecording\(true\);\s*try\{\s*upsertMessage\(data\);\s*updateThread\(data\);\s*renderMessages\(\{stickBottom:true\}\);/s,'successful voice send must clear the composer preview before non-critical UI rendering');
    assert.doesNotMatch(html, /data\.media_url=mediaUrl;upsertMessage\(data\);updateThread\(data\);renderMessages\(\{stickBottom:true\}\);toast\('Voice note sent'\);cleanupRecording\(true\)/,'old cleanup-after-render ordering must be gone');
  });
}
