import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const sql=await readFile('supabase/migrations/20260906164100_harden_leveling_profile_public_execute_v2.sql','utf8');
test('leveling profile RPC cannot be executed by anon',()=>{
  assert.match(sql,/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_spike_leveling_profile\(\)\s+FROM\s+anon/i);
  assert.match(sql,/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_spike_leveling_profile\(\)\s+TO\s+authenticated/i);
});
