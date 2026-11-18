import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

test('Phase 11 migration publishes exactly six coin products and two Verified plans', () => {
  const sql = read('supabase/migrations/20261118230201_publish_six_affordable_coin_packages_two_verified_plans.sql');
  for (const sku of ['coin_mini','coin_basic','coin_starter','coin_popular','coin_value','coin_premium','verified_monthly','verified_yearly']) {
    assert.match(sql, new RegExp(`'${sku}'`));
  }
  assert.match(sql, /'coin_mini'[\s\S]*?100,\s*20/);
  assert.match(sql, /'coin_basic'[\s\S]*?250,\s*55/);
  assert.match(sql, /'coin_starter'[\s\S]*?500,\s*120/);
  assert.match(sql, /'coin_popular'[\s\S]*?1000,\s*260/);
  assert.match(sql, /'coin_value'[\s\S]*?2000,\s*550/);
  assert.match(sql, /'coin_premium'[\s\S]*?5000,\s*1450/);
  assert.match(sql, /'verified_monthly'[\s\S]*?300, null, 30/);
  assert.match(sql, /'verified_yearly'[\s\S]*?2500, null,365/);
  assert.match(sql, /where sku not in/);
  assert.match(sql, /on conflict \(sku\) do update/);
});

test('Wallet displays live coin package values and marks the Popular tier', () => {
  const js = read('js/spike-purchase-flow.js');
  const html = read('wallet.html');
  assert.match(js, /wallet-coin-package/);
  assert.match(js, /item\.sku === 'coin_popular'/);
  assert.match(js, /wallet-package-price/);
  assert.match(js, /money\(item\.amount_ngn\)/);
  assert.match(js, /coin_amount \|\| item\.coins/);
  assert.match(html, /wallet-package-badge/);
  assert.match(html, /data-verified-subscribe="monthly"/);
  assert.match(html, /data-verified-subscribe="yearly"/);
});
