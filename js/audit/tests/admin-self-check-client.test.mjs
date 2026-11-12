import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('browser admin checks use the authenticated self-only role RPC', async () => {
  const profile = await readFile(new URL('../../profile-page.js', import.meta.url), 'utf8');
  const maintenance = await readFile(new URL('../../maintenance.js', import.meta.url), 'utf8');
  assert.match(profile, /rpc\(['"]admin_is_super_admin_self['"]\)/);
  assert.match(maintenance, /rpc\(['"]admin_is_super_admin_self['"]\)/);
  assert.doesNotMatch(profile, /rpc\(['"]is_super_admin['"]/);
  assert.doesNotMatch(maintenance, /rpc\(['"]is_super_admin['"]/);
});
