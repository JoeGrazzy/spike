import { supabase } from './spike-supabase-client.js';
import { continueAfterAuth, safeAuthDestination } from './spike-mfa.js';

const $ = (id) => document.getElementById(id);
const status = $('status');
const setStatus = (message, kind = 'info') => {
  if (!status) return;
  status.textContent = message;
  status.className = `status show ${kind}`;
};
const clearStatus = () => { if (status) { status.textContent = ''; status.className = 'status'; } };
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
const markInvalid = (input, invalid) => { if (!input) return; input.setAttribute('aria-invalid', String(Boolean(invalid))); if (invalid) input.dataset.invalid = 'true'; else delete input.dataset.invalid; };
const focusField = (input) => { input?.focus({ preventScroll: false }); input?.scrollIntoView?.({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
const updatePasswordMeter = () => {
  const input = $('regPassword'); if (!input) return;
  const value = input.value;
  const checks = [value.length >= 8, /[a-z]/.test(value) && /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)];
  checks.forEach((ok, i) => { const item = $(`r${i+1}`); item?.classList.toggle('ok', ok); if (item) item.textContent = `${ok ? '✓' : '○'} ${['8+ characters','Upper & lowercase','Contains a number','Special character'][i]}`; });
  const score = checks.filter(Boolean).length;
  document.querySelectorAll('.strength-bars span').forEach((bar, i) => bar.classList.toggle('on', i < score));
  const label = $('strengthText'); if (label) label.textContent = !value ? 'Use 8+ characters' : ['Needs improvement','Getting stronger','Good password','Strong password'][Math.max(0, score-1)];
};
const withTimeout = (promise, ms, message) => { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), ms); })]).finally(() => window.clearTimeout(timer)); };
const busy = (button, value, label) => {
  if (!button) return;
  button.disabled = value;
  button.setAttribute('aria-busy', String(Boolean(value)));
  button.classList.toggle('loading', Boolean(value));
  if (value) { button.dataset.originalLabel ||= button.textContent; button.textContent = label || 'Please wait…'; }
  else if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
};
const showPanel = (id) => {
  document.querySelectorAll('.panel').forEach((panel) => {
    const active = panel.id === id;
    panel.classList.toggle('active', active);
    panel.setAttribute('aria-hidden', String(!active));
  });
  $('loginTab')?.classList.toggle('active', id === 'loginPanel');
  $('registerTab')?.classList.toggle('active', id === 'registerPanel');
  $('loginTab')?.setAttribute('aria-selected', String(id === 'loginPanel'));
  $('registerTab')?.setAttribute('aria-selected', String(id === 'registerPanel'));
  clearStatus();
};
const friendlyError = (error) => {
  const message = String(error?.message || 'Something went wrong. Please try again.');
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/email not confirmed/i.test(message)) return 'This account is awaiting email confirmation. Contact SPIKE support if you cannot sign in.';
  if (/user already registered/i.test(message)) return 'An account already exists for this email. Try signing in.';
  if (/password should be at least/i.test(message)) return 'Choose a stronger password with at least 8 characters.';
  return message;
};
let redirectInProgress = false;
const postAuthDestination = () => safeAuthDestination(new URLSearchParams(location.search).get('next') || 'feed.html');
const redirectToApp = async () => {
  if (redirectInProgress) return;
  redirectInProgress = true;
  setStatus('Checking your secure sign-in…');
  try {
    await withTimeout(continueAfterAuth(postAuthDestination()), 12000, 'The security check is taking too long. Check your connection and try again.');
  } catch (error) {
    redirectInProgress = false;
    throw error;
  }
};

$('loginTab')?.addEventListener('click', () => showPanel('loginPanel'));
$('registerTab')?.addEventListener('click', () => showPanel('registerPanel'));
$('goCreate')?.addEventListener('click', () => showPanel('registerPanel'));
$('goLogin')?.addEventListener('click', () => showPanel('loginPanel'));
$('forgotBtn')?.addEventListener('click', () => showPanel('forgotPanel'));
$('forgotBackBtn')?.addEventListener('click', () => showPanel('loginPanel'));
$('passwordHelpBtn')?.addEventListener('click', () => { const panel = $('passwordRequirements'); const open = panel?.classList.toggle('open') || false; $('passwordHelpBtn')?.setAttribute('aria-expanded', String(open)); });
$('regPassword')?.addEventListener('input', updatePasswordMeter);
$('regEmail')?.addEventListener('input', (event) => markInvalid(event.currentTarget, event.currentTarget.value && !validEmail(event.currentTarget.value)));
$('loginEmail')?.addEventListener('input', (event) => markInvalid(event.currentTarget, event.currentTarget.value && !validEmail(event.currentTarget.value)));
$('regConfirm')?.addEventListener('input', (event) => markInvalid(event.currentTarget, event.currentTarget.value && event.currentTarget.value !== $('regPassword')?.value));
updatePasswordMeter();
showPanel('loginPanel');

document.querySelectorAll('[data-target]').forEach((button) => button.addEventListener('click', () => {
  const input = $(button.dataset.target);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  button.textContent = input.type === 'password' ? 'Show' : 'Hide';
}));

$('loginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault(); clearStatus();
  const button = $('loginBtn');
  const email = $('loginEmail')?.value.trim();
  const password = $('loginPassword')?.value;
  if (!validEmail(email)) { markInvalid($('loginEmail'), true); setStatus('Enter a valid email address.', 'error'); focusField($('loginEmail')); return; }
  markInvalid($('loginEmail'), false);
  if (!password) { setStatus('Enter your password.', 'error'); focusField($('loginPassword')); return; }
  busy(button, true, 'Signing in…');
  try {
    const { error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }), 15000, 'Sign-in is taking too long. Check your internet connection and try again.');
    if (error) throw error;
    await redirectToApp();
  } catch (error) { setStatus(friendlyError(error), 'error'); }
  finally { busy(button, false); }
});

$('registerForm')?.addEventListener('submit', async (event) => {
  event.preventDefault(); clearStatus();
  const button = $('registerBtn');
  const name = $('regName')?.value.trim();
  const email = $('regEmail')?.value.trim();
  const password = $('regPassword')?.value;
  const confirm = $('regConfirm')?.value;
  if (!name || name.length < 2) { setStatus('Enter your full name.', 'error'); focusField($('regName')); return; }
  if (!validEmail(email)) { markInvalid($('regEmail'), true); setStatus('Enter a valid email address.', 'error'); focusField($('regEmail')); return; }
  markInvalid($('regEmail'), false);
  if (!password || password.length < 8) { setStatus('Your password must contain at least 8 characters.', 'error'); focusField($('regPassword')); return; }
  if (password !== confirm) { markInvalid($('regConfirm'), true); setStatus('Your passwords do not match.', 'error'); focusField($('regConfirm')); return; }
  markInvalid($('regConfirm'), false);
  if (!$('terms')?.checked) { setStatus('Please accept the Terms and Privacy Policy to continue.', 'error'); $('terms')?.focus(); return; }
  busy(button, true, 'Creating account…');
  try {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { display_name: name } }
    });
    if (error) throw error;
    if (!data.session || !data.user) {
      throw new Error('SPIKE could not start your session. Email confirmation is still enabled in the Supabase project. Disable Confirm email in Authentication → Sign In / Providers → Email, save, then try again.');
    }
    await showWelcome(data.user);
  } catch (error) { setStatus(friendlyError(error), 'error'); }
  finally { busy(button, false); }
});

async function showWelcome(user) {
  let spikeId = 'Your SPIKE ID is being prepared';
  try {
    const { data } = await supabase.from('profiles').select('spike_id').eq('id', user.id).maybeSingle();
    if (data?.spike_id) spikeId = data.spike_id;
  } catch (_) {}
  $('spidValue').textContent = spikeId;
  $('welcomeIntro').textContent = 'Your account is ready.';
  $('successModal')?.classList.add('show');
}

$('resetForm')?.addEventListener('submit', async (event) => {
  event.preventDefault(); clearStatus();
  const email = $('resetEmail')?.value.trim();
  const button = $('resetBtn');
  if (!validEmail(email)) { setStatus('Enter a valid email address.', 'error'); focusField($('resetEmail')); return; }
  busy(button, true, 'Sending link…');
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password.html` });
    if (error) throw error;
    setStatus('If an account exists for that email, a secure password reset link has been sent.', 'success');
  } catch (error) { setStatus(friendlyError(error), 'error'); }
  finally { busy(button, false); }
});

$('copySpid')?.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('spidValue')?.textContent || ''); setStatus('SPIKE ID copied.', 'success'); }
  catch (_) { setStatus('Select and copy your SPIKE ID.', 'info'); }
});
$('continueBtn')?.addEventListener('click', redirectToApp);
const oauthButtons = {
  google: $('googleLoginBtn'),
  github: $('githubLoginBtn')
};
let oauthInProgress = false;
for (const [provider, button] of Object.entries(oauthButtons)) {
  button?.addEventListener('click', () => oauth(provider, button));
}
async function oauth(provider, button) {
  if (oauthInProgress) return;
  oauthInProgress = true;
  clearStatus();
  Object.values(oauthButtons).forEach((item) => busy(item, true, provider === 'google' ? 'Connecting to Google…' : 'Connecting to GitHub…'));
  try {
    // Return through the login page so Supabase PKCE can restore the session
    // before the same MFA-aware destination logic used by password login runs.
    const callback = new URL('index.html', location.origin);
    callback.searchParams.set('auth_callback', '1');
    callback.searchParams.set('next', postAuthDestination());
    const { error } = await withTimeout(
      supabase.auth.signInWithOAuth({ provider, options: { redirectTo: callback.toString() } }),
      20000,
      `Could not start ${provider === 'google' ? 'Google' : 'GitHub'} sign-in. Check your connection and try again.`
    );
    if (error) throw error;
    // The SDK normally navigates to the provider. Keep the controls locked
    // while that navigation begins; the page unloads on success.
  } catch (error) {
    oauthInProgress = false;
    Object.values(oauthButtons).forEach((item) => busy(item, false));
    setStatus(friendlyError(error), 'error');
  }
}

const searchParams = new URLSearchParams(location.search);
const signedOutLanding = searchParams.get('signed_out') === '1';
const oauthCallback = searchParams.get('auth_callback') === '1';
// The login controls and handlers are now installed; session restoration may continue independently.
window.SPIKE_AUTH_READY = true;
if (!signedOutLanding) {
  withTimeout(supabase.auth.getSession(), 15000, 'Session check timed out. Please try signing in again.')
  .then(({ data, error }) => {
    if (error) throw error;
    if (data.session) return redirectToApp();
    if (oauthCallback) setStatus('Sign-in did not complete. Please try Google or GitHub again.', 'error');
  })
  .catch((error) => { console.warn('[SPIKE sign-in session check]', error); if (status && !status.textContent) setStatus(error?.message || 'Could not check your session. Please try again.', 'error'); });
}
