import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const messages=fs.readFileSync(path.join(root,'messages.html'),'utf8');
const presence=fs.readFileSync(path.join(root,'js/presence.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261013124500_spike_dm_presence_timestamps_v1.sql'),'utf8');
test('messages inbox renders per-conversation status through the central runtime',()=>{
 assert.match(messages,/data-presence-user="\$\{esc\(r\.other\)\}"/);
 assert.match(messages,/class="presence-time-label" data-presence-text/);
 assert.match(messages,/presenceLabel\(r\.other\)/);
 assert.match(messages,/js\/presence\.js\?v=presence-v2-global-20261112/);
 assert.doesNotMatch(messages,/presence-timestamps\.js/);
});
test('central presence runtime persists self activity and hydrates offline last-seen timestamps',()=>{
 assert.match(presence,/touch_user_presence/);
 assert.match(presence,/spike_get_user_presence/);
 assert.match(presence,/setInterval\(lookup,LOOKUP\)/);
 assert.match(presence,/Last seen|last_seen/);
});
test('presence persistence is authenticated and respects each target privacy setting',()=>{
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/revoke all on table public\.user_presence from public, anon, authenticated/i);
 assert.match(migration,/grant execute on function public\.touch_user_presence\(uuid,text\) to authenticated/i);
 assert.match(migration,/coalesce\(pp\.show_online_status, true\) is not false/i);
 assert.match(migration,/cardinality\(coalesce\(p_user_ids, '\{\}'::uuid\[\]\)\) <= 100/i);
});
