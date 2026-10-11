import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'js', 'audit', 'protected-baseline.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const digest = async rel => {
  const abs = path.join(root, rel);
  const data = await readFile(abs);
  const s = await stat(abs);
  return { bytes: s.size, sha256: createHash('sha256').update(data).digest('hex') };
};

test('protected baseline manifest is internally consistent', () => {
  assert.equal(manifest.schema, 1);
  assert.equal(typeof manifest.file_count, 'number');
  assert.equal(Object.keys(manifest.files).length, manifest.file_count);
});

test('no protected baseline file was deleted or modified', async () => {
  const failures = [];
  for (const [rel, expected] of Object.entries(manifest.files)) {
    try {
      const actual = await digest(rel);
      if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
        failures.push(`${rel}: baseline=${expected.sha256} current=${actual.sha256}`);
      }
    } catch (error) {
      failures.push(`${rel}: missing/unreadable (${error.code || error.message})`);
    }
  }
  assert.deepEqual(failures, [], `Protected baseline changed:\n${failures.join('\n')}`);
});

test('existing migration files remain immutable while new migrations may be added', async () => {
  const migrationEntries = Object.keys(manifest.files).filter(x => x.startsWith('supabase/migrations/') && x.endsWith('.sql'));
  assert.ok(migrationEntries.length > 0, 'No migration files were included in the protected baseline');
});
