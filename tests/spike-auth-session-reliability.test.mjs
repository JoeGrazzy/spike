import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('protected-page session checks are bounded and offer retry instead of redirect loops on transient failures', () => {
  const guard = read('../js/spike-supabase-guard.js');
  assert.match(guard, /withTimeout\([\s\S]*?supabase\.auth\.getSession\(\)[\s\S]*?10000/);
  assert.match(guard, /showGuardFailure\(/);
  assert.match(guard, /Try again/);
  assert.match(guard, /profileError\) throw profileError/);
  assert.doesNotMatch(guard, /if \(profileError \|\| !profile[\s\S]*?signOut/);
});

test('only an explicitly inactive or missing profile is signed out by the protected-page guard', () => {
  const guard = read('../js/spike-supabase-guard.js');
  assert.match(guard, /if \(!profile \|\| profile\.account_status !== 'active'\)/);
  assert.match(guard, /profile\.role !== 'admin'[\s\S]*?eletexjoeytex@gmail\.com/i);
});

test('login redirect is single-flight and has a recoverable timeout', () => {
  const auth = read('../js/spike-auth.js');
  assert.match(auth, /let redirectInProgress = false/);
  assert.match(auth, /if \(redirectInProgress\) return/);
  assert.match(auth, /redirectInProgress = false/);
  assert.match(auth, /security check is taking too long/i);
});

test('MFA challenge and recovery verification have bounded waits', () => {
  const mfa = read('../js/spike-mfa-challenge.js');
  assert.match(mfa, /recoveryCodes\.verify[\s\S]*?withTimeout/);
  assert.match(mfa, /mfa\.listFactors\(\),12000/);
  assert.match(mfa, /mfa\.challenge[\s\S]*?12000/);
  assert.match(mfa, /mfa\.verify[\s\S]*?12000/);
});
