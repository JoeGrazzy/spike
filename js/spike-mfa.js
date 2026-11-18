import { supabase } from './spike-supabase-client.js';

export async function getMfaState() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return data;
}

export async function needsMfaChallenge() {
  const state = await getMfaState();
  return state.currentLevel !== state.nextLevel && state.nextLevel === 'aal2';
}

export async function continueAfterAuth(destination = 'feed.html') {
  if (await needsMfaChallenge()) location.replace(`mfa.html?next=${encodeURIComponent(destination)}`);
  else location.replace(destination);
}
