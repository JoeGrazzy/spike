import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const admin=fs.readFileSync(path.join(root,'admin.html'),'utf8');
const reset=fs.readFileSync(path.join(root,'reset-password.html'),'utf8');
const safety=fs.readFileSync(path.join(root,'js/spike-safety-center-v5.js'),'utf8');
const migrations=fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.includes('safety_recovery_hardening'));
const sql=migrations.map(x=>fs.readFileSync(path.join(root,'supabase/migrations',x),'utf8')).join('\n');

test('admin has a dedicated Safety Recovery Center',()=>{
  assert.match(admin,/data-page="safetyRecovery"/);
  assert.match(admin,/id="safetyRecovery"/);
  assert.match(admin,/admin_verify_safety_code/);
  assert.match(admin,/admin_issue_safety_recovery/);
});

test('recovery backend uses hashed Safety Codes and one-time expiring tokens',()=>{
  assert.match(sql,/create table if not exists public\.spike_safety_codes/);
  assert.match(sql,/encode\(extensions\.digest\(v_code,'sha256'\),'hex'\)/);
  assert.match(sql,/expires_at timestamptz not null/);
  assert.match(sql,/used_at timestamptz/);
  assert.match(sql,/gen_random_bytes\(32\)/);
  assert.match(sql,/now\(\)\+interval '15 minutes'/);
});

test('recovery reset page consumes the server-authoritative token path',()=>{
  assert.match(reset,/safety_recovery/);
  assert.match(reset,/spike_consume_safety_recovery/);
  assert.match(reset,/already used/);
});

test('Safety Center registers generated codes with the backend',()=>{
  assert.match(safety,/spike_register_safety_code/);
  assert.match(safety,/PGRST202/);
  assert.match(safety,/generation failed/);
  assert.match(safety,/safetyClient\(\)/);
  assert.match(safety,/window\.sb/);
});
