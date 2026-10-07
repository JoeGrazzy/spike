import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const init = read('supabase/functions/impact-paystack-initialize/index.ts');
const hook = read('supabase/functions/impact-paystack-webhook/index.ts');
const account = read('supabase/functions/impact-payout-account/index.ts');
const payout = read('supabase/functions/impact-payout-request/index.ts');
const sql = read('supabase/migrations/20261006130000_spike_impact_paystack_payouts_v1.sql');
test('Paystack secret is server-side and checkout uses NGN kobo', () => {
  assert.match(init, /PAYSTACK_SECRET_KEY/); assert.match(init, /Math\.round\(amount\*100\)/);
  assert.match(init, /IMPACT_CALLBACK_URL/); assert.doesNotMatch(read('impact.html'), /PAYSTACK_SECRET_KEY|sk_live_/);
});
test('webhook verifies signature and independently verifies transaction with Paystack', () => {
  assert.match(hook, /x-paystack-signature/); assert.match(hook, /SHA-512/);
  assert.match(hook, /transaction\/verify/); assert.match(hook, /spike_impact_payment_confirm/);
});
test('payout bank details stay private and account is resolved with Paystack', () => {
  assert.match(account, /bank\/resolve/); assert.match(account, /transferrecipient/);
  assert.match(sql, /spike_impact_payout_accounts/); assert.match(read('impact.html'), /payoutAccountNumber/);
});
test('payout requests are atomically reserved and fee is 10 percent', () => {
  assert.match(sql, /pg_advisory_xact_lock/); assert.match(sql, /round\(p_amount_gross\*0\.10,2\)/);
  assert.match(payout, /spike_impact_payout_request_create/); assert.match(sql, /spike_impact_payout_review/);
});
test('confirmed donations notify campaign creators and duplicate webhooks do not double count', () => {
  assert.match(sql, /spike_impact_donation_received/); assert.match(sql, /on conflict \(user_id,event_key\)/i);
  assert.match(sql, /d\.payment_status='verified' and d\.status='verified'/);
});

test('saving payout bank details is not blocked by an empty payout amount', () => {
  const page = read('impact.html');
  assert.match(page, /id="payoutAmount" type="number" min="100" step="0\.01" placeholder=/);
  assert.doesNotMatch(page.match(/<input id="payoutAmount"[^>]*>/)?.[0] || '', /required/);
  assert.match(page, /Enter a valid payout amount of at least ₦100/);
});
