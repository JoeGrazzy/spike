import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Phase 7 documents the exact remote/local migration recovery gap without claiming recovery', () => {
  const doc = read('docs/PHASE7_PAYMENT_AND_MIGRATION_RECOVERY.md');
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql'));
  assert.ok(migrations.length >= 3);
  assert.ok(migrations.includes('20261118211133_spike_single_owner_admin_access.sql'));
  assert.match(doc, /remote migration ledger reports 18 applied versions/);
  assert.match(doc, /full migration recovery is \*\*not complete\*\*/);
  assert.match(doc, /Do not create placeholder files/);
});

test('Phase 7 keeps the WhatsApp contact separate from the bank-transfer destination', () => {
  const doc = read('docs/PHASE7_PAYMENT_AND_MIGRATION_RECOVERY.md');
  assert.match(doc, /09159096952/);
  assert.match(doc, /not\*\* treated as a bank account number or payment destination/i);
  assert.match(doc, /exact bank name, account name, account number/i);
});

test('Phase 7 preserves the single-owner approval requirement and atomic settlement gates', () => {
  const doc = read('docs/PHASE7_PAYMENT_AND_MIGRATION_RECOVERY.md');
  assert.match(doc, /eletexjoeytex@gmail\.com/i);
  assert.match(doc, /Atomic settlement/);
  assert.match(doc, /idempotent/);
  assert.match(doc, /server-side authorization/);
});

test('Phase 7 does not weaken the existing read-only wallet controller', () => {
  const wallet = read('js/spike-wallet-readonly.js');
  assert.match(wallet, /\.from\('wallet_accounts'\)/);
  assert.match(wallet, /\.from\('wallet_ledger'\)/);
  assert.doesNotMatch(wallet, /\.from\(['"]wallet_(?:accounts|ledger)['"]\)\.(?:insert|update|upsert|delete)/);
});
