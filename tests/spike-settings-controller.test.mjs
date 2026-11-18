import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../settings.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../js/spike-settings-controller.js',import.meta.url),'utf8');
const feed=readFileSync(new URL('../js/spike-feed-supabase.js',import.meta.url),'utf8');
const notifications=readFileSync(new URL('../js/spike-notifications.js',import.meta.url),'utf8');
test('Settings loads its account controller after Supabase platform bootstrap',()=>{
  assert.ok(html.indexOf('js/spike-platform-bootstrap.js')<html.indexOf('js/spike-settings-controller.js'));
  assert.match(html,/js\/spike-settings-controller\.js/);
});
test('Settings persists only supported privacy fields to the signed-in profile',()=>{
  assert.match(js,/presence_visible/);assert.match(js,/message_privacy/);assert.match(js,/is_private/);
  assert.match(js,/\.eq\('id',session\.user\.id\)/);
  assert.doesNotMatch(js,/service_role|serviceRole|wallet_ledger/);
});
test('Unsupported profile visibility controls are disabled instead of pretending to save',()=>{
  assert.match(js,/markUnsupported/);for(const id of ['posts','media','friends'])assert.ok(js.includes(`'${id}'`));
});
test('Device-only preferences and notification permission are handled explicitly',()=>{
  assert.match(js,/localStorage\.setItem\(PREF_KEY/);assert.match(js,/Notification\.requestPermission/);
});
test('Sign out revokes only the current local session',()=>assert.match(js,/signOut\(\{scope:'local'\}\)/));

test('Saved local feed preferences affect Following and muted-keyword filtering',()=>{assert.match(feed,/feedFollowingOnly===true/);assert.match(feed,/feedMutedKeywords/);});
test('Notification preferences filter matching event types and message tone respects its toggle',()=>{assert.match(notifications,/preferenceKey/);assert.match(notifications,/prefs\[pref\]!==false/);assert.match(notifications,/key==='np_messages'/);});

test('Security settings include current-password verification before password updates',()=>{
  assert.match(html,/spikePasswordChangeForm/);
  assert.match(html,/securityCurrentPassword/);
  assert.match(js,/updateUser\(\{password:newPassword,currentPassword\}\)/);
  assert.match(js,/newPassword===currentPassword/);
});

test('Password recovery requires a recovery event rather than any existing session',()=>{
  const reset=readFileSync(new URL('../js/spike-password-reset.js',import.meta.url),'utf8');
  assert.match(reset,/PASSWORD_RECOVERY/);
  assert.match(reset,/if \(!recoveryAuthorized\)/);
  assert.match(reset,/saveBtn'\)\.disabled = true/);
});


test('TOTP setup uses Supabase enroll, challenge and verify APIs and offers backup-factor guidance',()=>{
  const mfa=readFileSync(new URL('../js/spike-mfa-settings.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../mfa.html',import.meta.url),'utf8');
  assert.match(mfa,/factorType:'totp'/);assert.match(mfa,/auth\.mfa\.challenge/);assert.match(mfa,/auth\.mfa\.verify/);
  assert.match(mfa,/factors\.length<=1/);assert.match(mfa,/unenroll\(\{factorId:factors\[0\]\.id\}\)/);
  assert.match(html,/spike-mfa-challenge\.js/);
});
test('MFA challenge is checked after authentication and on protected-page navigation',()=>{
  const auth=readFileSync(new URL('../js/spike-auth.js',import.meta.url),'utf8');
  const guard=readFileSync(new URL('../js/spike-supabase-guard.js',import.meta.url),'utf8');
  assert.match(auth,/continueAfterAuth\('feed\.html'\)/);
  assert.match(guard,/getAuthenticatorAssuranceLevel/);assert.match(guard,/mfa\.html\?next=/);
});

test('MFA recovery codes are enabled in the client and can be generated, regenerated and verified',()=>{
  const bootstrap=readFileSync(new URL('../js/spike-platform-bootstrap.js',import.meta.url),'utf8');
  const settings=readFileSync(new URL('../js/spike-mfa-settings.js',import.meta.url),'utf8');
  const challenge=readFileSync(new URL('../js/spike-mfa-challenge.js',import.meta.url),'utf8');
  assert.match(bootstrap,/experimental:\s*\{ recoveryCodes: true \}/);
  assert.match(settings,/recoveryCodes\.generate/);assert.match(settings,/recoveryCodes\.regenerate/);assert.match(settings,/recoveryCodes\.getStatus/);
  assert.match(challenge,/recoveryCodes\.verify/);assert.match(challenge,/recoveryMode/);
});
