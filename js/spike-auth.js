import { supabase } from './spike-supabase-client.js';
import { continueAfterAuth } from './spike-mfa.js';

const $ = (id) => document.getElementById(id);
const status = $('status');
const setStatus = (message, kind = 'info') => {
  if (!status) return;
  status.textContent = message;
  status.className = `status show ${kind}`;
};
const clearStatus = () => { if (status) { status.textContent = ''; status.className = 'status'; } };
const withTimeout = (promise, ms, message) => { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), ms); })]).finally(() => window.clearTimeout(timer)); };
const busy = (button, value, label) => {
  if (!button) return;
  button.disabled = value;
  if (value) { button.dataset.originalLabel ||= button.textContent; button.textContent = label || 'Please wait…'; }
  else if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
};
const showPanel = (id) => {
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === id));
  $('loginTab')?.classList.toggle('active', id === 'loginPanel');
  $('registerTab')?.classList.toggle('active', id === 'registerPanel');
  $('loginTab')?.setAttribute('aria-selected', String(id === 'loginPanel'));
  $('registerTab')?.setAttribute('aria-selected', String(id === 'registerPanel'));
  clearStatus();
};
const friendlyError = (error) => {
  const message = String(error?.message || 'Something went wrong. Please try again.');
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/email not confirmed/i.test(message)) return 'Please verify your email before signing in.';
  if (/user already registered/i.test(message)) return 'An account already exists for this email. Try signing in.';
  if (/password should be at least/i.test(message)) return 'Choose a stronger password with at least 8 characters.';
  return message;
};
let redirectInProgress = false;
const redirectToApp = async () => {
  if (redirectInProgress) return;
  redirectInProgress = true;
  setStatus('Checking your secure sign-in…');
  try {
    await withTimeout(continueAfterAuth('feed.html'), 12000, 'The security check is taking too long. Check your connection and try again.');
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
$('otpBackBtn')?.addEventListener('click', () => showPanel('registerPanel'));

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
  if (!email || !password) return setStatus('Enter your email and password.', 'error');
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
  if (!name || name.length < 2) return setStatus('Enter your full name.', 'error');
  if (!email) return setStatus('Enter a valid email address.', 'error');
  if (!password || password.length < 8) return setStatus('Your password must contain at least 8 characters.', 'error');
  if (password !== confirm) return setStatus('Your passwords do not match.', 'error');
  if (!$('terms')?.checked) return setStatus('Please accept the Terms and Privacy Policy to continue.', 'error');
  busy(button, true, 'Creating account…');
  try {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { display_name: name }, emailRedirectTo: `${location.origin}/feed.html` }
    });
    if (error) throw error;
    if (data.session) {
      await showWelcome(data.user);
      return;
    }
    $('otpEmail').textContent = email;
    showPanel('otpPanel');
    setStatus('Check your email for the verification code, then enter it below.', 'success');
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

$('otpForm')?.addEventListener('submit', async (event) => {
  event.preventDefault(); clearStatus();
  const button = $('otpVerifyBtn');
  const email = $('otpEmail')?.textContent.trim();
  const token = $('otpInput')?.value.trim();
  if (!/^\d{6}$/.test(token || '')) return setStatus('Enter the 6-digit code from your email.', 'error');
  busy(button, true, 'Verifying…');
  try {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) throw error;
    await showWelcome(data.user);
  } catch (error) { setStatus(friendlyError(error), 'error'); }
  finally { busy(button, false); }
});

$('otpResendBtn')?.addEventListener('click', async () => {
  const email = $('otpEmail')?.textContent.trim();
  const button = $('otpResendBtn');
  busy(button, true, 'Sending…');
  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
    setStatus('A new verification email has been sent.', 'success');
  } catch (error) { setStatus(friendlyError(error), 'error'); }
  finally { busy(button, false); }
});

$('resetForm')?.addEventListener('submit', async (event) => {
  event.preventDefault(); clearStatus();
  const email = $('resetEmail')?.value.trim();
  const button = $('resetBtn');
  if (!email) return setStatus('Enter your account email.', 'error');
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
$('googleLoginBtn')?.addEventListener('click', () => oauth('google'));
$('githubLoginBtn')?.addEventListener('click', () => oauth('github'));
async function oauth(provider) {
  try {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}/feed.html` } });
    if (error) throw error;
  } catch (error) { setStatus(friendlyError(error), 'error'); }
}

withTimeout(supabase.auth.getSession(), 12000, 'Session check timed out. Please try signing in again.')
  .then(({ data, error }) => { if (error) throw error; if (data.session) return redirectToApp(); })
  .catch((error) => { console.warn('[SPIKE sign-in session check]', error); if (status && !status.textContent) setStatus(error?.message || 'Could not check your session. Please try again.', 'error'); });
