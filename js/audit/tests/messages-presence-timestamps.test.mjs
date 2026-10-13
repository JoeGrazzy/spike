import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const messages=fs.readFileSync(path.join(root,'messages.html'),'utf8');
const presence=fs.readFileSync(path.join(root,'js/presence-timestamps.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261013124500_spike_dm_presence_timestamps_v1.sql'),'utf8');
test('messages inbox renders a per-conversation presence label and loads timestamp support after shared presence',()=>{
 assert.match(messages,/data-presence-user=\"\$\{esc\(r\.other\)\}\"/);
 assert.match(messages,/class=\"presence-time-label\" data-presence-text/);
 assert.match(messages,/presenceLabel\(r\.other\)/);
 assert.match(messages,/js\/presence\.js[^<]*<\/script>\s*<script src=\"js\/presence-timestamps\.js/);
});
test('timestamp support persists self activity and hydrates offline last-seen timestamps',()=>{
 assert.match(presence,/spike_touch_user_presence/);
 assert.match(presence,/spike_get_user_presence/);
 assert.match(presence,/setInterval\(refresh,30000\)/);
 assert.match(presence,/Last seen '\+fmtRelative\(lastSeen\)/);
});
test('presence persistence is authenticated and respects each target privacy setting',()=>{
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/revoke all on table public\.user_presence from public, anon, authenticated/i);
 assert.match(migration,/grant execute on function public\.spike_touch_user_presence\(\) to authenticated/i);
 assert.match(migration,/coalesce\(pp\.show_online_status, true\) is not false/i);
 assert.match(migration,/cardinality\(coalesce\(p_user_ids, '\{\}'::uuid\[\]\)\) <= 100/i);
});

test('timestamp helper does not start a second shared presence lifecycle',()=>{
 assert.doesNotMatch(presence,/AppPresence\?\.start\?\.\(db\)/);
 assert.match(presence,/The inbox owns shared AppPresence startup/);
});
