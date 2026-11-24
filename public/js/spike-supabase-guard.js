import { supabase } from './spike-supabase-client.js';

const path = location.pathname.split('/').filter(Boolean).pop() || '' ;
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
    login.href = '/'; login.textContent = 'Return to sign in';
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
    location.replace(`/?next=${encodeURIComponent(path + location.search)}`);
    return;
  }

  // MFA assurance and the account-status lookup are independent once the
  // session is known. Run them together so a protected page does not pay
  // two network round trips before becoming usable.
  const accountChecks = [
    withTimeout(
      supabase.from('profiles').select('role,account_status').eq('id', session.user.id).maybeSingle(),
      10000, 'Your account check timed out. Please try again.'
    ).then(result => {
      if (result.error) throw result.error;
      return { kind: 'profile', data: result.data };
    })
  ];
  if (path !== 'mfa.html') {
    accountChecks.push(
      withTimeout(
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        10000, 'The security check timed out. Please try again.'
      ).then(result => {
        if (result.error) throw result.error;
        return { kind: 'mfa', data: result.data };
      })
    );
  }
  const checked = await Promise.all(accountChecks);
  const profile = checked.find(item => item.kind === 'profile')?.data;
  const aal = checked.find(item => item.kind === 'mfa')?.data;
  if (aal && aal.currentLevel !== aal.nextLevel && aal.nextLevel === 'aal2') {
    location.replace(`mfa.html?next=${encodeURIComponent(path + location.search)}`);
    return;
  }
  if (!profile || profile.account_status !== 'active') {
    await withTimeout(supabase.auth.signOut({ scope: 'local' }), 10000, 'Sign-out could not be completed. Please retry.');
    location.replace('/?reason=account_unavailable');
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

// The confirmation dialog is the only place allowed to execute sign-out.
// In particular, never bind an immediate sign-out handler to #signout: that
// control opens the confirmation dialog on Settings and must not bypass it.
let signOutInProgress = false;
const logoutOverlay = document.getElementById('logoutConfirmOverlay');
const logoutButton = document.getElementById('logoutYes');
const logoutCancel = document.getElementById('logoutCancel');
const closeLogoutDialog = () => {
  logoutOverlay?.classList.remove('show');
  logoutOverlay?.setAttribute('aria-hidden', 'true');
};
logoutCancel?.addEventListener('click', closeLogoutDialog);
logoutOverlay?.addEventListener('click', (event) => {
  if (event.target === logoutOverlay) closeLogoutDialog();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && logoutOverlay?.classList.contains('show')) closeLogoutDialog();
});
logoutButton?.addEventListener('click', async (event) => {
  event.preventDefault();
  if (signOutInProgress) return;
  signOutInProgress = true;
  logoutButton.disabled = true;
  logoutButton.setAttribute('aria-busy', 'true');
  const originalLabel = logoutButton.textContent;
  logoutButton.textContent = 'Signing out…';
  try {
    const { error } = await withTimeout(
      supabase.auth.signOut({ scope: 'local' }),
      10000,
      'Sign-out timed out. Please check your connection and try again.'
    );
    if (error) throw error;
    closeLogoutDialog();
    // A one-time query flag prevents the index page's session auto-redirect
    // from racing the just-completed local sign-out and trapping the loader.
    location.replace(new URL('/?signed_out=1', location.origin).href);
  } catch (error) {
    console.error('[SPIKE sign out]', error);
    let message = logoutOverlay?.querySelector('[data-logout-error]');
    if (!message && logoutOverlay) {
      message = document.createElement('p');
      message.dataset.logoutError = 'true';
      message.setAttribute('role', 'alert');
      message.style.cssText = 'margin:12px 0 0;color:#ff9cae;font-size:12px;line-height:1.45';
      logoutOverlay.querySelector('.logout-card')?.append(message);
    }
    if (message) message.textContent = error?.message || 'SPIKE could not sign you out. Please try again.';
    signOutInProgress = false;
    logoutButton.disabled = false;
    logoutButton.removeAttribute('aria-busy');
    logoutButton.textContent = originalLabel;
  }
});
