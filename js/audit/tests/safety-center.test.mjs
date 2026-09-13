import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../..', import.meta.url).pathname;
const js = fs.readFileSync(`${root}/js/spike-safety-center-v5.js`, 'utf8');
const html = fs.readFileSync(`${root}/feed.html`, 'utf8');
const recoverySql = fs.readFileSync(`${root}/supabase/SPIKE_SAFETY_ALL_INSTALL.sql`, 'utf8');
const webauthn = fs.readFileSync(`${root}/supabase/functions/spike-webauthn/index.ts`, 'utf8');
const resetHtml = fs.readFileSync(`${root}/reset-password.html`, 'utf8');

const features = [
  'Safety Activity Timeline',
  'Suspicious Activity Detection',
  'Anti-Scam Protection',
  'Impersonation Protection',
  'Personal Safety Code',
  'Trusted Contacts',
  'Safety Mode',
  'Harassment Protection Mode',
  'Interaction Rate Protection',
  'Suspicious Link Scanner',
  'Sensitive Information Warning',
  'Sensitive Screen Protection',
  'Passkey Protection',
  'Safety Automation Rules',
  'Safety Diagnostics'
];

test('Safety Center is wired into feed without replacing existing routes', () => {
  assert.match(html, /spike-safety-center\.css/);
  assert.match(html, /spike-safety-center-v5\.js/);
  assert.match(js, /window\.openSafetyCenter/);
  assert.match(js, /openPremiumSheet/);
});

test('all 15 new Safety Center features are implemented in the module', () => {
  for (const feature of features) assert.match(js, new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('safety module uses the existing app_documents persistence boundary', () => {
  assert.match(js, /window\.getDoc/);
  assert.match(js, /window\.putDoc/);
  assert.match(js, /safety_center/);
});

test('safety protections include concrete detection hooks', () => {
  assert.match(js, /scanText/);
  assert.match(js, /installLinkScanner/);
  assert.match(js, /installRateProtection/);
  assert.match(js, /installSensitiveWarning/);
  assert.match(js, /installScreenProtection/);
  assert.match(js, /navigator\.credentials\.create/);
});


test('Safety Center never calls native browser dialogs and has a premium UI fallback', () => {
  assert.doesNotMatch(js, /(?:^|[^.\w$])(?:alert|confirm|prompt)\s*\(/);
  assert.doesNotMatch(js, /window\.toast\b/);
  assert.match(js, /function safetyNotify/);
  assert.match(js, /function safetyDialog/);
  assert.match(js, /SPIKEPremiumDialog/);
  assert.match(js, /shared\.confirm/);
  assert.match(js, /function safetyPrompt/);
  assert.match(js, /function safetyConfirm/);
});

test('premium confirmation cancellation is respected', () => {
  assert.match(js, /safetyConfirm[\s\S]*?===true/);
});


test('all Safety Center toggle aliases update their real persisted controls', () => {
  assert.match(js, /harassment:'harassmentProtection'/);
  assert.match(js, /rate:'interactionRateProtection'/);
  assert.match(js, /links:'linkScanner'/);
  assert.match(js, /sensitive:'sensitiveInfoWarning'/);
  assert.match(js, /screen:'screenProtection'/);
});

test('automation rules are triggered by supported risky-link and interaction-burst signals', () => {
  assert.match(js, /applyRules\('risky_link'\)/);
  assert.match(js, /applyRules\('burst'\)/);
});

test('Feed cannot load the obsolete cached Safety Center filename', () => {
  assert.doesNotMatch(html, /js\/spike-safety-center\.js(?:[?"'])/);
});


test('Safety Code server contract is shipped and atomic under concurrent rotations', () => {
  assert.match(recoverySql, /create or replace function public\.spike_register_safety_code\(p_code text\)/);
  assert.match(recoverySql, /code_version=public\.spike_safety_codes\.code_version\+1/);
  assert.match(recoverySql, /grant execute on function public\.spike_register_safety_code\(text\) to authenticated/);
  assert.match(recoverySql, /notify pgrst, 'reload schema'/);
});

test('WebAuthn server rejects unconfigured production origins and rate-limits attempts', () => {
  assert.match(webauthn, /SPIKE_WEBAUTHN_ORIGINS/);
  assert.match(webauthn, /SPIKE_WEBAUTHN_RP_ID/);
  assert.match(webauthn, /WebAuthn origin is not allowed/);
  assert.match(webauthn, /spike_safety_webauthn_attempts/);
  assert.match(webauthn, /Too many passkey verification attempts/);
});

test('Safety recovery reset page does not send a bearer token as a referrer', () => {
  assert.match(resetHtml, /<meta name="referrer" content="no-referrer">/);
});
