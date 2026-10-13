import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Inbox loads all private-message pages rather than silently stopping at 500 rows', async () => {
  const inbox = await readFile(new URL('../../../messages.html', import.meta.url), 'utf8');
  assert.match(inbox, /async function loadAllInboxMessages\(userId\)/);
  assert.match(inbox, /const pageSize=500/);
  assert.match(inbox, /\.range\(from,from\+pageSize-1\)/);
  assert.match(inbox, /if\(page\.length<pageSize\)break/);
  assert.match(inbox, /from\+=pageSize/);
  assert.equal((inbox.match(/loadAllInboxMessages\(me\.id\)/g) || []).length, 2, 'initial inbox and realtime refresh both use pagination');
  assert.doesNotMatch(inbox, /\.or\(`sender_id\.eq\.\$\{me\.id\},recipient_id\.eq\.\$\{me\.id\}`\)\.order\('created_at',\{ascending:false\}\)\.limit\(500\)/);
});
