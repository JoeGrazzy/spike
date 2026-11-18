import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

test('Admin payment centre no longer claims the live payment backend is absent', () => {
  const html = read('admin.html');
  const js = read('js/spike-admin-controller.js');
  assert.match(html, /Owner-only payment review workspace/);
  assert.doesNotMatch(html, /This workspace is intentionally disabled/);
  assert.match(js, /spike_admin_list_purchase_orders/);
  assert.match(js, /spike_admin_approve_purchase/);
  assert.match(js, /spike_admin_reject_purchase/);
  assert.match(html, /option value="pending_payment"/);
});

test('Customer order history is split by product type and uses server catalogue prices', () => {
  const js = read('js/spike-purchase-flow.js');
  const html = read('wallet.html');
  assert.match(js, /renderOrderList\('coinOrders', orders\.filter/);
  assert.match(js, /renderOrderList\('verifiedSubscriptionHistory', orders\.filter/);
  assert.match(js, /renderVerifiedPlans\(\)/);
  assert.match(js, /money\(item\.amount_ngn\)/);
  assert.match(js, /Number\(item\.duration_days/);
  assert.doesNotMatch(js, /set\('verifiedSubscriptionHistory'/);
  assert.doesNotMatch(js, /set\('coinPackages'/);
  assert.doesNotMatch(js, /window\.open/);
  assert.match(js, /Continue on WhatsApp/);
  assert.match(html, /Loading price…/);
  assert.doesNotMatch(html, /<strong class="price">₦(?:500|3,000)<\/strong>/);
});

test('Payment reporting stays distinct from approval and WhatsApp remains support only', () => {
  const js = read('js/spike-purchase-flow.js');
  assert.match(js, /spike_report_purchase_payment/);
  assert.doesNotMatch(js, /spike_admin_approve_purchase/);
  assert.match(js, /2349159096952/);
  assert.match(read('admin.html'), /WhatsApp 09159096952 is support only/);
});
