import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'js', 'audit', 'protected-baseline.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const cleanupManifest = JSON.parse(await readFile(path.join(root, 'js', 'audit', 'cleanup-manifest.json'), 'utf8'));
const retiredByPath = new Map(cleanupManifest.retired_files.map(entry => [entry.path, entry]));
const approvalManifest = JSON.parse(await readFile(path.join(root, 'js', 'audit', 'approved-updates-rooms-phase6.json'), 'utf8'));
const approvedUpdates = new Map((approvalManifest.approved_updates || []).map(entry => [entry.path, entry]));

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

test('no protected baseline file was deleted or modified unless explicitly retired with a verified hash', async () => {
  const failures = [];
  for (const [rel, expected] of Object.entries(manifest.files)) {
    try {
      const actual = await digest(rel);
      if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
        const approved = approvedUpdates.get(rel);
        const validApproval = approved && approved.previous_sha256 === expected.sha256 && approved.previous_bytes === expected.bytes && approved.current_sha256 === actual.sha256 && approved.current_bytes === actual.bytes;
        if (!validApproval) failures.push(`${rel}: baseline=${expected.sha256} current=${actual.sha256}`);
      }
    } catch (error) {
      const retired = retiredByPath.get(rel);
      if (error.code === 'ENOENT' && retired && retired.bytes === expected.bytes && retired.sha256 === expected.sha256) continue;
      failures.push(`${rel}: missing/unreadable (${error.code || error.message})`);
    }
  }
  assert.deepEqual(failures, [], `Protected baseline changed:\n${failures.join('\n')}`);
});

test('retired project artifacts are explicitly recorded, absent, and hash-traceable', async () => {
  assert.equal(cleanupManifest.schema, 1);
  assert.ok(cleanupManifest.purpose.includes('Auditable retirement'));
  assert.ok(cleanupManifest.retired_files.length > 0);
  const seen = new Set();
  for (const entry of cleanupManifest.retired_files) {
    assert.ok(!seen.has(entry.path), `Duplicate retired path: ${entry.path}`);
    seen.add(entry.path);
    assert.ok(!manifest.files[entry.path], `${entry.path} must not remain in the active baseline`);
    assert.equal(typeof entry.bytes, 'number');
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    await assert.rejects(readFile(path.join(root, entry.path)), { code: 'ENOENT' }, `${entry.path} unexpectedly exists`);
  }
});

test('existing migration files remain immutable while new migrations may be added', async () => {
  const migrationEntries = Object.keys(manifest.files).filter(x => x.startsWith('supabase/migrations/') && x.endsWith('.sql'));
  assert.ok(migrationEntries.length > 0, 'No migration files were included in the protected baseline');
});
