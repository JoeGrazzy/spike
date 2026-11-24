import { supabase } from './spike-supabase-client.js';

const $ = (id) => document.getElementById(id);
const status = $('status');
const showStatus = (message, type = 'info') => {
  status.textContent = message;
  status.className = `status show ${type}`;
};
const busy = (value) => { $('saveBtn').disabled = value || !recoveryAuthorized; $('saveBtn').textContent = value ? 'Saving…' : 'Save New Password'; };
let recoveryAuthorized = /(?:^|[&#])type=recovery(?:&|$)/.test(location.hash);
$('saveBtn').disabled = true;
const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryAuthorized = true;
    $('saveBtn').disabled = false;
    showStatus('Recovery link verified. Choose your new password.', 'success');
  }
});
window.addEventListener('pagehide', () => authListener?.subscription?.unsubscribe(), { once: true });

document.querySelectorAll('[data-target]').forEach((button) => button.addEventListener('click', () => {
  const input = $(button.dataset.target);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  button.textContent = input.type === 'password' ? 'Show' : 'Hide';
}));

$('resetForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = $('password').value;
  const confirm = $('confirm').value;
  if (!recoveryAuthorized) return showStatus('This page must be opened from the latest password reset link sent to your email.', 'error');
  if (password.length < 8 || password.length > 128) return showStatus('Use a password between 8 and 128 characters.', 'error');
  if (password !== confirm) return showStatus('The passwords do not match.', 'error');
  busy(true);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('This recovery link is invalid or expired. Request a new password reset email.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    $('formView').hidden = true;
    $('doneView').style.display = 'block';
    showStatus('Your password has been updated.', 'success');
  } catch (error) { showStatus(error.message || 'Unable to update password.', 'error'); }
  finally { busy(false); }
});
$('backBtn')?.addEventListener('click', () => location.replace('/'));
$('continueBtn')?.addEventListener('click', () => location.replace('feed.html'));

supabase.auth.getSession().then(({ data }) => {
  if (!data.session || !recoveryAuthorized) {
    $('saveBtn').disabled = true;
    showStatus('Open this page using the latest password reset link sent to your email. A normal signed-in session is not enough to reset a password here.', 'info');
  }
}).catch(() => { $('saveBtn').disabled = true; showStatus('Unable to verify the recovery link. Request a new one.', 'error'); });
