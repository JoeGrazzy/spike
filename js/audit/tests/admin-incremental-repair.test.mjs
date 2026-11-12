import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../../../admin.html', import.meta.url), 'utf8');
test('admin user directory uses offset pagination and a lookahead row', () => {
  assert.match(html, /offset:usersPage\*50,per_page:51/);
  assert.match(html, /usersPrev/); assert.match(html, /usersNext/);
  assert.match(html, /loadUsers\(0\)/);
});
test('maintenance reads saved values before edits and reports read failures', () => {
  assert.match(html, /from\('app_maintenance'\)\.select\('enabled,title,message,starts_at,ends_at,updated_at'\)/);
  assert.match(html, /Could not read saved settings/);
  assert.match(html, /Reload current settings/);
});
test('existing policy terms can be edited through the canonical upsert RPC', () => {
  assert.match(html, /data-term-edit=/);
  assert.match(html, /admin_spike_policy_term_upsert\(v\.term\.trim\(\),v\.policy\.trim\(\).*btn\.dataset\.termEdit\)/);
});
test('admin modal traps keyboard focus and restores the invoking focus', () => {
  assert.match(html, /if\(e\.key==='Tab'\)/);
  assert.match(html, /adminDialogPreviousFocus\.focus\(\)/);
});
test('failed RPC results are not rendered as empty tables', () => {
  assert.match(html, /if\(rows===null\|\|rows===undefined\).*not an empty result/s);
});
