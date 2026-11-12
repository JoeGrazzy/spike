import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile('admin.html','utf8');
const migration=await readFile('supabase/migrations/20261007100000_admin_control_center_completion_v1.sql','utf8');
const userDirectoryMigration=await readFile('supabase/migrations/20261007170000_admin_control_center_v3.sql','utf8');
const edge=await readFile('supabase/functions/admin-user-ops/index.ts','utf8');
test('Admin Control Center exposes protected user directory, SPID coin grant, scheduled announcements and audit',()=>{
  for(const id of ['users','announcements','notifications','audit'])assert.match(html,new RegExp(`<section id="${id}"`));
  for(const contract of ['admin-user-ops','admin_grant_coins','admin_set_user_activation','admin_announcement_create','admin_process_scheduled_announcements','admin_announcement_cancel','admin_list_audit'])assert.match(html,new RegExp(contract));
  assert.match(html,/SPID/);assert.match(html,/Google/);assert.match(html,/GitHub/);assert.match(html,/publish_at|Publish timestamp/);assert.match(html,/expires_at|Expiration timestamp/);
});
test('Coin grants are transactional, bounded, super-admin-only and audited',()=>{
  assert.match(migration,/create function public\.admin_grant_coins/);assert.match(migration,/is_super_admin/);assert.match(migration,/for update/);assert.match(migration,/coin_ledger/);assert.match(migration,/spike_admin_audit_log/);assert.match(migration,/p_amount > 1000000/);
});
test('Announcement expiry is server-enforced and notifications receive expires_at',()=>{
  assert.match(migration,/p_expires_at is not null and p_expires_at<=coalesce\(p_publish_at,now\(\)/);assert.match(migration,/status='expired'/);assert.match(migration,/notifications\(user_id,type,data,priority,event_key,group_key,expires_at\)/);assert.match(migration,/admin_process_scheduled_announcements/);
});
test('Auth-wide directory uses the guarded server-side Auth.users RPC without service-role leakage',()=>{
  assert.match(userDirectoryMigration,/create or replace function public\.admin_list_users_v2/);
  assert.match(userDirectoryMigration,/from auth\.users u left join public\.profiles/);
  assert.match(userDirectoryMigration,/where public\.admin_guard\(\)/);
  assert.match(edge,/ctx\.supabase\.rpc\("admin_list_users_v2"/);
  assert.match(edge,/providers:Array\.isArray\(u\.providers\)/);
  assert.doesNotMatch(edge,/SUPABASE_SERVICE_ROLE_KEY/);assert.doesNotMatch(html,/SUPABASE_SERVICE_ROLE_KEY|service_role\s*:/i);
});
