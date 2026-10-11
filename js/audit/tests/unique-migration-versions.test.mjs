import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');
const archivedDir = path.join(root, 'supabase', 'migrations-archive', 'duplicate-version-cleanup');
const active = fs.readdirSync(migrationsDir).filter(name => name.endsWith('.sql'));
const versions = active.map(name => ({ name, version: name.split('_', 1)[0] }));

test('active Supabase migration version prefixes are unique', () => {
  const seen = new Map();
  const duplicates = [];
  for (const item of versions) {
    if (seen.has(item.version)) duplicates.push(`${item.version}: ${seen.get(item.version)}, ${item.name}`);
    else seen.set(item.version, item.name);
  }
  assert.deepEqual(duplicates, [], `Duplicate migration versions: ${duplicates.join('; ')}`);
});

test('archived duplicate migrations are byte-identical to their active later versions', () => {
  const pairs = [
    ['20260912103000_profile_transaction_and_follow_hardening_v1.sql', '20260912103100_profile_transaction_and_follow_hardening_v1.sql'],
    ['20260922090000_spike_live_complete_v1.sql', '20260922090100_spike_live_complete_v1.sql'],
    ['20261011170000_spike_sitewide_call_presence_v2.sql', '20261011171500_spike_sitewide_call_presence_v2.sql'],
  ];
  for (const [archived, canonical] of pairs) {
    assert.ok(fs.existsSync(path.join(archivedDir, archived)), `Missing archived copy ${archived}`);
    assert.ok(fs.existsSync(path.join(migrationsDir, canonical)), `Missing active canonical copy ${canonical}`);
    assert.deepEqual(fs.readFileSync(path.join(archivedDir, archived)), fs.readFileSync(path.join(migrationsDir, canonical)), `${archived} must remain byte-identical to ${canonical}`);
  }
});
