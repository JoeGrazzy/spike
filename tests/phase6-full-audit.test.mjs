import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const report = fs.readFileSync(path.join(root, 'docs/PHASE6_FULL_APPLICATION_AUDIT.md'), 'utf8');

test('Phase 6 audit records the live Supabase security baseline and verification boundary', () => {
  assert.match(report, /23 \/ 23/);
  assert.match(report, /91 public policies/);
  assert.match(report, /13/);
  assert.match(report, /No deployed Edge Functions/);
  assert.match(report, /no production database writes/);
  assert.match(report, /browser end-to-end validation remains outstanding/i);
});

test('Phase 6 audit preserves unfinished feature gates and single-owner admin restriction', () => {
  for (const phrase of [
    'eletexjoeytex@gmail.com',
    'Payments and purchases',
    'Creator earnings and withdrawals',
    'Room gifts',
    'Referrals',
    'Voice/video calls and voice recording',
    'Messaging model consolidation',
    'Feed discovery extras',
    'Do not drop or merge either table'
  ]) assert.ok(report.includes(phrase), `Missing audit requirement: ${phrase}`);
});
