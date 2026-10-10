import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html=await readFile('admin.html','utf8');
const edge=await readFile('supabase/functions/admin-impact-ops/index.ts','utf8');
const register=await readFile('supabase/functions/admin-register-user/index.ts','utf8');

test('Admin exposes the requested operational workspaces without bypassing server authority',()=>{
  for(const id of ['overview','users','rooms','moderation','safety','platform','announcements','notifications','audit']) assert.match(html,new RegExp(`<section id="${id}"`));
  for(const rpc of ['room_member_set_role','room_moderation_mute','room_moderation_ban','room_moderation_unmute','room_moderation_unban','room_member_history','admin_spike_policy_decide_case','admin_spike_policy_decide_appeal','admin_spike_policy_terms','admin_spike_policy_term_upsert','admin_spike_policy_term_delete','admin_set_maintenance']) assert.match(html,new RegExp(rpc));
  assert.match(html,/admin-register-user/);
  assert.doesNotMatch(html,/admin-impact-ops/i);
  assert.doesNotMatch(html,/SUPABASE_SERVICE_ROLE_KEY|service_role\s*:/i);
});

test('Protected registration endpoint never changes the caller session and requires super-admin authorization',()=>{
  assert.match(register,/is_super_admin/);
  assert.match(register,/ctx\.supabaseAdmin\.auth\.admin\.createUser/);
  assert.doesNotMatch(register,/signInWithPassword|auth\.signUp/);
});

test('Protected Impact operations require super-admin authorization and keep payout review server-side',()=>{
  assert.match(edge,/is_super_admin/);
  assert.match(edge,/ctx\.supabaseAdmin\.from\("spike_impact_payout_requests"\)/);
  assert.match(edge,/spike_impact_payout_review/);
  assert.match(edge,/transferReference/);
  assert.doesNotMatch(edge,/SUPABASE_SERVICE_ROLE_KEY/);
});
