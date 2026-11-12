import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const registryPath = path.join(root, 'js', 'audit', 'rooms-protected-migrations.json');
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const baseline = JSON.parse(await readFile(path.join(root, 'js', 'audit', 'protected-baseline.json'), 'utf8'));

test('SPIKE Rooms protected migration registry contains exactly seven unique immutable references', () => {
  assert.equal(registry.schema, 1);
  assert.equal(registry.protected_files.length, 7);
  assert.equal(new Set(registry.protected_files.map(x => x.path)).size, 7);
  for (const entry of registry.protected_files) {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(entry.role && entry.role.length > 20);
    assert.ok(baseline.files[entry.path], `${entry.path} must remain in the existing project protected baseline`);
    assert.equal(baseline.files[entry.path].sha256, entry.sha256, `${entry.path} registry hash must match original protected baseline`);
    assert.equal(baseline.files[entry.path].bytes, entry.bytes, `${entry.path} byte count must match original protected baseline`);
  }
});

test('all seven protected migrations exist and remain byte-for-byte unchanged', async () => {
  const failures = [];
  for (const entry of registry.protected_files) {
    const abs = path.join(root, entry.path);
    try {
      const data = await readFile(abs);
      const info = await stat(abs);
      const sha256 = createHash('sha256').update(data).digest('hex');
      if (info.size !== entry.bytes || sha256 !== entry.sha256) failures.push(`${entry.path}: expected ${entry.sha256}/${entry.bytes}, got ${sha256}/${info.size}`);
    } catch (error) {
      failures.push(`${entry.path}: missing/unreadable (${error.code || error.message})`);
    }
  }
  assert.deepEqual(failures, [], `Protected Room migration files changed:\n${failures.join('\n')}`);
});
