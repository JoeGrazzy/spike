import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const exists = async rel => { try { await stat(path.join(root, rel)); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
const listFiles = async dir => {
  const out = [];
  for (const ent of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await listFiles(rel)); else out.push(rel);
  }
  return out;
};

test('retired Impact page and dedicated Edge Functions stay removed', async () => {
  assert.equal(await exists('impact.html'), false, 'retired page must not return');
  for (const name of ['impact-paystack-initialize','admin-impact-ops','impact-payout-account','impact-payout-request','impact-paystack-webhook']) {
    assert.equal(await exists(`supabase/functions/${name}`), false, `${name} must remain removed`);
  }
});

test('retirement migration remains present and drops the feature database objects', async () => {
  const migration = 'supabase/migrations/20261010192200_spike_remove_impact_feature.sql';
  assert.equal(await exists(migration), true, 'forward retirement migration is required');
  const sql = await readFile(path.join(root, migration), 'utf8');
  assert.match(sql, /drop function if exists/i);
  assert.match(sql, /drop table if exists/i);
  assert.match(sql, /spike_impact_%/i);
});

test('no later migration recreates retired Impact database objects', async () => {
  const dir = path.join(root, 'supabase/migrations');
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  const retirement = '20261010192200_spike_remove_impact_feature.sql';
  const later = files.filter(f => f > retirement);
  const recreate = /create\s+(?:or\s+replace\s+)?(?:function|table|view|trigger)\b[\s\S]{0,500}spike_impact_/i;
  for (const file of later) {
    const sql = await readFile(path.join(dir, file), 'utf8');
    assert.doesNotMatch(sql, recreate, `${file} appears to recreate retired Impact objects`);
  }
});

test('active app and function source contain no Impact feature entry points', async () => {
  const roots = ['*.html', 'js', 'supabase/functions'];
  const files = [];
  for (const item of roots) {
    if (item === '*.html') {
      for (const f of await readdir(root)) if (f.endsWith('.html')) files.push(f);
    } else if (await exists(item)) files.push(...await listFiles(item));
  }
  const forbidden = /impact\.html|impact-paystack-initialize|admin-impact-ops|impact-payout-account|impact-payout-request|impact-paystack-webhook|spike_impact_/i;
  const hits = [];
  for (const rel of files.filter(f => !f.startsWith('js/audit/tests/') && f !== 'js/audit/protected-baseline.json')) {
    const source = await readFile(path.join(root, rel), 'utf8');
    if (forbidden.test(source)) hits.push(rel);
  }
  assert.deepEqual(hits, [], `Remove active Impact references from: ${hits.join(', ')}`);
});
