import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const activeExtensions = new Set(['.html', '.js', '.mjs', '.css']);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

test('active frontend has no retired live-audio gift table or UI branch', () => {
  const files = walk(root).filter((file) => activeExtensions.has(path.extname(file)) && !file.includes(`${path.sep}tests${path.sep}`));
  const hits = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    if (/spike_live_audio_gift_transactions|gift_context\s*===\s*['"]live_audio['"]|Live audio/i.test(source)) {
      hits.push(path.relative(root, file));
    }
  }
  assert.deepEqual(hits, []);
});

test('wallet retains the active gift history RPCs', () => {
  const wallet = fs.readFileSync(path.join(root, 'wallet.html'), 'utf8');
  assert.match(wallet, /spike_my_received_gifts/);
  assert.match(wallet, /spike_my_gift_wallet_summary/);
  assert.match(wallet, /spike_reconcile_my_gift_earnings/);
});

test('database migration source removes stale gift ledger references', () => {
  const migrations = path.join(root, 'supabase', 'migrations');
  const names = fs.readdirSync(migrations);
  assert.ok(names.includes('20261118094355_spike_remove_orphan_live_audio_gift_rpc_references.sql'));
  assert.ok(names.includes('20261118094429_spike_remove_stale_live_audio_delete_preflight_reference.sql'));
  const rpcFix = fs.readFileSync(path.join(migrations, '20261118094355_spike_remove_orphan_live_audio_gift_rpc_references.sql'), 'utf8');
  assert.match(rpcFix, /CREATE OR REPLACE FUNCTION public\.spike_my_gift_wallet_summary/);
  assert.match(rpcFix, /CREATE OR REPLACE FUNCTION public\.spike_reconcile_my_gift_earnings/);
  assert.doesNotMatch(rpcFix, /spike_live_audio_gift_transactions/);
});
