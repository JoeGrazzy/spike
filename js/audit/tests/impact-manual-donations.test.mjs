import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../../../impact.html', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../../../supabase/migrations/20261006110000_spike_impact_manual_donations_v1.sql', import.meta.url), 'utf8');
const payments = readFileSync(new URL('../../../supabase/migrations/20261006130000_spike_impact_paystack_payouts_v1.sql', import.meta.url), 'utf8');
test('Impact campaign publishing no longer exposes creator bank details publicly', () => {
  assert.doesNotMatch(html, /id="bankName"|id="accountName"|id="accountNumber"/);
  assert.match(html, /private creator dashboard/);
});
test('supporter starts a Paystack checkout instead of submitting a transfer reference', () => {
  assert.match(html, /impact-paystack-initialize/); assert.match(html, /authorization_url/);
  assert.doesNotMatch(html, /p_transfer_reference/);
});
test('only independently verified donations count toward campaign progress', () => {
  assert.match(sql, /d\.status='verified'/); assert.match(html, /verified_amount/);
  assert.match(payments, /spike_impact_payment_confirm/); assert.match(payments, /auth\.role\(\).*service_role/s);
});
test('payout requests apply transparent 10 percent fee and are serialized per creator', () => {
  assert.match(payments, /round\(p_amount_gross\*0\.10,2\)/);
  assert.match(payments, /pg_advisory_xact_lock/);
  assert.match(html, /SPIKE fee \(10%\)/);
});
test('campaign publishing remains restricted to verified profiles', () => {
  assert.match(sql, /Only SPIKE Verified Badge users can publish Impact campaigns/);
});
