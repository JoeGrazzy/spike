import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

test('Admin approval checks the RPC error and requires server-confirmed approved status', () => {
  const js = read('js/spike-admin-controller.js');
  assert.match(js, /const \{ data, error \} = await supabase\.rpc\('spike_admin_approve_purchase'/);
  assert.match(js, /if \(error\) throw error;/);
  assert.match(js, /data\.ok !== true \|\| data\.status !== 'approved'/);
  assert.match(js, /Payment approved and settlement confirmed by the server/);
});

test('Admin rejection checks the RPC error and requires server-confirmed rejected status', () => {
  const js = read('js/spike-admin-controller.js');
  assert.match(js, /const \{ data, error \} = await supabase\.rpc\('spike_admin_reject_purchase'/);
  assert.match(js, /data\.ok !== true \|\| data\.status !== 'rejected'/);
  assert.match(js, /Purchase request rejected by the server/);
});

test('Customer purchase actions cannot approve or settle a wallet from the browser', () => {
  const js = read('js/spike-purchase-flow.js');
  assert.doesNotMatch(js, /spike_admin_approve_purchase|wallet_accounts.*update|wallet_ledger.*insert/);
  assert.match(js, /spike_report_purchase_payment/);
});
