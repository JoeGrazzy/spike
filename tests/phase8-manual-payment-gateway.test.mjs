import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('Customer purchase flow uses server catalogue and server-created order references', () => {
  const js = read('js/spike-purchase-flow.js');
  assert.match(js, /spike_get_purchase_catalog/);
  assert.match(js, /spike_create_purchase_order/);
  assert.match(js, /p_sku: sku/);
  assert.match(js, /order\.order_reference \|\| order\.reference/);
  assert.doesNotMatch(js, /wallet_accounts.*\.(insert|update)|wallet_ledger.*\.(insert|update)/s);
});

test('WhatsApp handoff uses the configured support number and encoded order message', () => {
  const js = read('js/spike-purchase-flow.js');
  assert.match(js, /2349159096952/);
  assert.match(js, /wa\.me\/\$\{WHATSAPP_NUMBER\}/);
  assert.match(js, /encodeURIComponent\(message\)/);
  assert.match(js, /tap Send/);
});

test('Customer payment report is not represented as verified payment or wallet settlement', () => {
  const js = read('js/spike-purchase-flow.js');
  assert.match(js, /spike_report_purchase_payment/);
  assert.match(js, /Payment is activated only after owner verification/);
  assert.doesNotMatch(js, /spike_admin_approve_purchase/);
});

test('Admin approval is RPC-only, requires a bank transaction reference, and is owner-gated', () => {
  const js = read('js/spike-admin-controller.js');
  assert.match(js, /eletexjoeytex@gmail\.com/);
  assert.match(js, /spike_admin_list_purchase_orders/);
  assert.match(js, /spike_admin_approve_purchase/);
  assert.match(js, /p_payment_reference: payment\.value\.trim\(\)/);
  assert.match(js, /spike_admin_reject_purchase/);
});

test('Wallet read-only controller never disables the new purchase request buttons or mutates balances', () => {
  const js = read('js/spike-wallet-readonly.js');
  assert.doesNotMatch(js, /\[data-verified-subscribe\]/);
  assert.doesNotMatch(js, /\.from\(['"]wallet_(?:accounts|ledger)['"]\)\.(?:insert|update|delete)/);
});
