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

export function safeAuthDestination(destination = 'feed.html') {
  const fallback = 'feed.html';
  try {
    const url = new URL(String(destination || fallback), location.origin);
    if (url.origin !== location.origin) return fallback;
    const path = url.pathname.replace(/^\/+/, '');
    if (!/^[a-z0-9][a-z0-9._/-]*\.html$/i.test(path) || path.includes('..')) return fallback;
    if (path.toLowerCase() === 'index.html' || path.toLowerCase() === 'mfa.html') return fallback;
    return `${path}${url.search}${url.hash}`;
  } catch (_) {
    return fallback;
  }
}

export async function continueAfterAuth(destination = 'feed.html') {
  const safeDestination = safeAuthDestination(destination);
  if (await needsMfaChallenge()) location.replace(`mfa.html?next=${encodeURIComponent(safeDestination)}`);
  else location.replace(safeDestination);
}
