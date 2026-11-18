import { supabase } from './spike-supabase-client.js';

const path = location.pathname.split('/').pop() || 'index.html';
const protectedPages = new Set([
  'feed.html','profile.html','friends.html','followers.html','following.html','messages.html','message.html',
  'notifications.html','rooms.html','room.html','wallet.html','referrals.html','settings.html','admin.html',
  'spike-tools.html','user-profile.html','mfa.html'
]);
const withTimeout = (promise, ms, message) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), ms); })
  ]).finally(() => window.clearTimeout(timer));
};

function showGuardFailure(message) {
  let panel = document.getElementById('spike-auth-retry');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'spike-auth-retry';
    panel.setAttribute('role', 'alert');
    panel.setAttribute('aria-live', 'assertive');
    panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-content:center;gap:14px;padding:24px;background:#090d18;color:#fff;font:16px/1.5 system-ui,sans-serif;text-align:center';
    const title = document.createElement('h1');
    title.textContent = 'SPIKE could not verify your session';
    title.style.cssText = 'font-size:22px;margin:0';
    const copy = document.createElement('p');
    copy.id = 'spike-auth-retry-message';
    copy.style.cssText = 'max-width:460px;margin:0 auto;color:#cbd5e1';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:center;gap:10px;flex-wrap:wrap';
    const retry = document.createElement('button');
    retry.type = 'button'; retry.textContent = 'Try again';
    retry.style.cssText = 'padding:11px 18px;border:0;border-radius:10px;background:#8b5cf6;color:#fff;font-weight:700';
    retry.addEventListener('click', async () => {
      retry.disabled = true; retry.textContent = 'Checking…';
      panel.remove();
      try { await guard(); }
      catch (error) { showGuardFailure(error?.message || 'Please check your connection and try again.'); }
      finally { if (retry.isConnected) { retry.disabled = false; retry.textContent = 'Try again'; } }
    });
    const login = document.createElement('a');
    login.href = 'index.html'; login.textContent = 'Return to sign in';
    login.style.cssText = 'padding:11px 18px;border:1px solid #64748b;border-radius:10px;color:#fff;text-decoration:none';
    actions.append(retry, login); panel.append(title, copy, actions); document.body.append(panel);
  }
  const copy = panel.querySelector('#spike-auth-retry-message');
  if (copy) copy.textContent = message;
}

async function guard() {
  if (!protectedPages.has(path)) return;
  const { data: sessionData, error: sessionError } = await withTimeout(
    supabase.auth.getSession(), 10000, 'The session check timed out. Check your connection and try again.'
  );
  if (sessionError) throw sessionError;
  const session = sessionData?.session;
  if (!session?.user) {
    location.replace(`index.html?next=${encodeURIComponent(path + location.search)}`);
    return;
  }

  if (path !== 'mfa.html') {
    const { data: aal, error: aalError } = await withTimeout(
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(), 10000, 'The security check timed out. Please try again.'
    );
    if (aalError) throw aalError;
    if (aal?.currentLevel !== aal?.nextLevel && aal?.nextLevel === 'aal2') {
      location.replace(`mfa.html?next=${encodeURIComponent(path + location.search)}`);
      return;
    }
  }

  const { data: profile, error: profileError } = await withTimeout(
    supabase.from('profiles').select('role,account_status').eq('id', session.user.id).maybeSingle(),
    10000, 'Your account check timed out. Please try again.'
  );
  if (profileError) throw profileError;
  if (!profile || profile.account_status !== 'active') {
    await withTimeout(supabase.auth.signOut(), 10000, 'Sign-out could not be completed. Please retry.');
    location.replace('index.html?reason=account_unavailable');
    return;
  }
  if (path === 'admin.html' && (profile.role !== 'admin' || String(session.user.email || '').trim().toLowerCase() !== 'eletexjoeytex@gmail.com')) {
    location.replace('feed.html');
    return;
  }
  document.documentElement.dataset.spikeAuth = 'ready';
  document.getElementById('spike-auth-retry')?.remove();
}

if (protectedPages.has(path)) {
  guard().catch((error) => {
    console.error('[SPIKE auth guard]', error);
    showGuardFailure(error?.message || 'A temporary connection or security error prevented sign-in verification.');
  });
}

const signOut = async () => {
  await withTimeout(supabase.auth.signOut(), 10000, 'Sign-out is taking too long. Check your connection and try again.');
  location.replace('index.html');
};
for (const id of ['signOutBtn','signout','logoutYes']) {
  document.getElementById(id)?.addEventListener('click', (event) => {
    event.preventDefault();
    signOut().catch((error) => showGuardFailure(error?.message || 'Could not sign out. Please try again.'));
  });
}
