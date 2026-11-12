import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile('admin.html','utf8');
const migration=await readFile('supabase/migrations/20261007110000_admin_control_center_operations_v2.sql','utf8');
const edge=await readFile('supabase/functions/admin-user-ops/index.ts','utf8');
test('Admin v2 closes privileged operation gaps without browser table bypasses',()=>{
  for(const contract of ['admin_set_user_verified','admin_set_user_role','admin_announcement_list','admin_announcement_update']) assert.match(migration,new RegExp(contract));
  for(const contract of ['admin_set_user_role','force_signout','admin_announcement_list','admin_announcement_update']) assert.match(html,new RegExp(contract));
  assert.doesNotMatch(html,/from\(['"]spike_admin_announcements/);
  assert.match(edge,/auth\.admin\.signOut/);
});
test('Admin v2 announcement editing preserves lifecycle safety',()=>{
  assert.match(migration,/Completed, cancelled or expired announcements cannot be edited/);
  assert.match(migration,/p_expires_at is not null and p_expires_at<=now\(\).*'expired'/s);
  assert.match(migration,/spike_admin_audit_log/);
});
