import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Phase 9 documents the live migration ledger and incomplete local migration source', () => {
  const doc = read('docs/PHASE9_LIVE_BACKEND_RECOVERY.md');
  const sql = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql'));
  assert.ok(sql.length >= 4);
  assert.ok(sql.includes('20261118230201_publish_six_affordable_coin_packages_two_verified_plans.sql'));
  assert.match(doc, /Remote migration ledger contains \*\*19 applied versions\*\*/);
  assert.match(doc, /migration SQL files/);
  assert.match(doc, /Do not fabricate the missing migration body/);
});

test('Phase 9 records the real owner-only payment and financial safety boundary', () => {
  const doc = read('docs/PHASE9_LIVE_BACKEND_RECOVERY.md');
  assert.match(doc, /private\.is_admin\(\)/);
  assert.match(doc, /transactional settlement/);
  assert.match(doc, /WhatsApp `09159096952` is the support contact only/);
  assert.match(doc, /No payout, creator earnings conversion, or room-gifting settlement/);
});
