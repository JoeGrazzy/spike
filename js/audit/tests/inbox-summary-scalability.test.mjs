import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const html=fs.readFileSync(path.join(root,'messages.html'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261013140000_spike_inbox_summaries_v1.sql'),'utf8');
test('messages inbox prefers server-side conversation summaries',()=>{
 assert.match(html,/rpc\('spike_get_inbox_summaries'\)/);
 assert.match(html,/rowsFromSummaries\(inbox\.summaries,profiles\)/);
});
test('inbox summary RPC is authenticated and participant-scoped',()=>{
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/pm\.sender_id = me\.user_id or pm\.recipient_id = me\.user_id/);
 assert.match(migration,/grant execute on function public\.spike_get_inbox_summaries\(\) to authenticated/);
 assert.match(migration,/revoke all on function public\.spike_get_inbox_summaries\(\) from public, anon/);
});
test('typing retains the authenticated pair-scoped channel protocol while keeping subscriptions bounded',()=>{
 assert.match(html,/signals\.subscribeTyping\(db,me\.id,id/);
 assert.match(html,/ids\.slice\(0,30\)/);
});
