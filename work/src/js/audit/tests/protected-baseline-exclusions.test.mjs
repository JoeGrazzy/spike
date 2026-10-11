import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const exclusions = JSON.parse(await readFile(path.join(root, 'js/audit/protected-baseline-exclusions.json'), 'utf8'));
const historical = JSON.parse(await readFile(path.join(root, 'docs/audit-baselines/protected-baseline-original-2026-09-22.json'), 'utf8'));
const current = JSON.parse(await readFile(path.join(root, 'js/audit/protected-baseline.json'), 'utf8'));

test('every excluded path remains traceable to the historical baseline', () => {
  assert.equal(exclusions.schema, 1);
  assert.ok(exclusions.reason.includes('absent from the supplied'));
  assert.ok(exclusions.excluded_files.length > 0);
  for (const rel of exclusions.excluded_files) {
    assert.ok(historical.files[rel], `${rel} is not present in the preserved historical manifest`);
    assert.ok(!current.files[rel], `${rel} must not be in the current archive baseline`);
  }
});

test('excluded paths are explicitly absent rather than silently ignored', async () => {
  for (const rel of exclusions.excluded_files) {
    await assert.rejects(access(path.join(root, rel)), { code: 'ENOENT' }, `${rel} unexpectedly exists; review and restore it before changing the exclusion record`);
  }
});
