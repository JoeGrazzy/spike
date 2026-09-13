"use strict";
const SUPABASE_URL = "https://cjqpyndceqyqsijihxbb.supabase.co";
const SUPABASE_KEY = "sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw";
// Auth callbacks must return to the exact origin that started the flow.
const AUTH_REDIRECT_URL = `${window.location.origin.replace(/\/$/, "")}/`;
const PASSWORD_RESET_REDIRECT_URL = `${window.location.origin.replace(/\/$/, "")}/reset-password.html`;
const $ = id => document.getElementById(id);
const REMEMBER_KEY = "spike_remember_me";
function rememberMeEnabled() {
  try { return localStorage.getItem(REMEMBER_KEY) !== "0"; } catch { return true; }
}
function migrateAuthStorage(remember) {
  try {
    const source = remember ? sessionStorage : localStorage;
    const target = remember ? localStorage : sessionStorage;
    for (let i = 0; i < source.length; i++) {
      const key = source.key(i);
      if (key && /^sb-.+-auth-token$/.test(key)) {
        const value = source.getItem(key);
        if (value) target.setItem(key, value);
        source.removeItem(key);
      }
    }
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  } catch (err) { console.debug("[SPIKE STORAGE] migration skipped", err); }
}
const authStorage = {
  getItem(key) {
    try {
      const preferred = rememberMeEnabled() ? localStorage : sessionStorage;
      return preferred.getItem(key);
    } catch { return null; }
  },
  setItem(key, value) {
    try {
      const remember = rememberMeEnabled();
      const preferred = remember ? localStorage : sessionStorage;
      const other = remember ? sessionStorage : localStorage;
      preferred.setItem(key, value);
      other.removeItem(key);
    } catch (err) { console.debug("[SPIKE STORAGE] write failed", err); }
  },
  removeItem(key) {
    try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch {}
  }
};
try { $("remember").checked = rememberMeEnabled(); } catch {}

const state = {
client: null,
busy: false,
cooldownUntil: 0,
emailCooldownUntil: Number(sessionStorage.getItem("spike_email_cooldown_until") || 0),
currentUser: null,
profile: null,
completingLogin: false,
redirecting: false,
signupOtpEmail: "",
signupOtpBusy: false,
  authPhase: "BOOTING",
  authListenerReady: false,
  sessionResolutionPromise: null,
  loginPromise: null,
  lastRequestId: null
};
const toastHistory = new Map();
function toast(message, type = "info", ms = 4800) {
const stack = $("toastStack");
if (!stack) return;
const key = type + "|" + String(message).trim().toLowerCase();
const now = Date.now();
if (toastHistory.has(key) && now - toastHistory.get(key) < 2200) return;
toastHistory.set(key, now);
for (const [k,t] of toastHistory) if (now - t > 10000) toastHistory.delete(k);
const item = document.createElement("div");
item.className = "toast " + type;
item.style.setProperty("--toast-life", ms + "ms");
const icon = type === "success" ? "✓" : type === "error" ? "✕" : type === "warning" ? "⚠" : "ℹ";
item.innerHTML =
'<span class="ico">' + icon + '</span><span class="msg"></span><button class="x" type="button" aria-label="Dismiss notification">×</button>';
item.querySelector(".msg").textContent = message;
item.querySelector(".x").onclick = () => item.remove();
stack.appendChild(item);
setTimeout(() => { if (item.isConnected) item.remove(); }, ms);
}
function status(message, type = "info") {
const el = $("status");
if (!el) return;
el.textContent = message;
el.className = "status show " + type;
}
function clearStatus() {
const el = $("status");
if (el) el.className = "status";
}
function setAuthPhase(phase) {
  state.authPhase = phase;
  document.documentElement.dataset.authPhase = phase;
}
function requestId(prefix = "REQ") {
  const id = `${prefix}-${Date.now().toString(36).slice(-6)}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  state.lastRequestId = id;
  return id;
}
function logAuthError(scope, err, id) {
  console.error(`[SPIKE ${scope}]`, {
    requestId: id, status: err?.status, code: err?.code, name: err?.name, message: err?.message
  });
}
async function withAction(button, label, action, prefix = "ACTION") {
  if (state.busy) return false;
  state.busy = true;
  setBusy(button, true, label);
  const id = requestId(prefix);
  try {
    await action(id);
    return true;
  } finally {
    state.busy = false;
    setBusy(button, false, "");
  }
}
function emailCooldownRemaining() {
return Math.max(0, state.emailCooldownUntil - Date.now());
}
function startEmailCooldown(ms = 60000) {
state.emailCooldownUntil = Date.now() + ms;
try { sessionStorage.setItem("spike_email_cooldown_until", String(state.emailCooldownUntil)); } catch {}
}
function formatWait(ms) {
const s = Math.max(1, Math.ceil(ms / 1000));
return s >= 60 ? `${Math.ceil(s / 60)} minute${Math.ceil(s / 60) === 1 ? "" : "s"}` :
`${s} second${s === 1 ? "" : "s"}`;
}
function isEmailRateLimit(err) {
const code = String(err?.code || "").toLowerCase();
const msg = String(err?.message || "").toLowerCase();
return err?.status === 429 || code.includes("rate") || msg.includes("rate limit") || msg.includes(
"too many");
}
function friendlyError(err, context) {
if (context === "oauth") {
const msg = String(err?.message || "").toLowerCase();
if (msg.includes("provider is not enabled") || msg.includes("unsupported provider"))
return "This social login provider is not enabled in Supabase yet.";
if (msg.includes("unable to exchange external code") || msg.includes("exchange external code"))
return "Google reached Supabase, but Supabase could not exchange the Google authorization code. Check the Google Client ID/Secret in Supabase and the exact Supabase callback URI in Google Cloud.";
if (msg.includes("invalid grant") || msg.includes("code verifier") || msg.includes("pkce"))
return "The secure OAuth session could not be completed. Restart the login from SPIKE and make sure cookies/storage are enabled.";
if (msg.includes("redirect"))
return "OAuth redirect URL is not configured correctly in Supabase.";
}
const code = String(err?.code || "").toLowerCase();
const msg = String(err?.message || "").toLowerCase();
if (code === "invalid_credentials") return "We couldn’t sign you in. Check your email and password, then try again.";
if (code === "email_not_confirmed") return "Your email is not confirmed yet. Check your inbox, then try signing in again.";
if (code === "user_not_found" || msg.includes("user not found")) return "We couldn't find that account. Check the email or create a new SPIKE account.";
if (code === "same_password" || msg.includes("same password")) return "Choose a password you haven't used before.";
if (msg.includes("invalid email") || msg.includes("email address")) return "That email address doesn't look right. Check for typos and try again.";
if (msg.includes("signup is disabled")) return "New account creation is temporarily unavailable. Please try again later.";
if (msg.includes("database") || msg.includes("profiles")) return "Your account was created, but SPIKE couldn't finish setting up your profile. Please retry shortly.";
if (msg.includes("captcha")) return "Security verification could not be completed. Refresh the page and try again.";
if (code === "user_already_exists" || msg.includes("already registered") || msg.includes("already exists"))
return "An account with this email already exists. Switch to Sign In instead.";
if (isEmailRateLimit(err)) return `Email delivery is temporarily busy. Please wait ${formatWait(emailCooldownRemaining() || 60000)} before requesting another message.`;
if (err?.status === 500 && /error sending confirmation email|confirmation email/i.test(msg))
  return "Your account could not finish signup because Supabase could not send the confirmation email. Check Authentication → Emails → SMTP Settings in Supabase, then try again. Do not create another account until email delivery is fixed.";
if (msg.includes("failed to fetch") || msg.includes("network")) return "We couldn't reach SPIKE securely. Check your internet connection and try again.";
if (code === "weak_password" || msg.includes("password")) return "Please use a stronger password that meets all requirements.";
if (context === "signup" && err?.status === 400) return "We couldn't create the account. Check your details and try again.";
return err?.message || "Something went wrong. Please try again.";
}
function setBusy(button, busy, label) {
if (!button) return;
button.disabled = busy;
button.classList.toggle("loading", busy);
if (busy) {
button.dataset.original = button.textContent;
button.innerHTML = '<span class="spinner"></span>' + label;
} else {
button.textContent = button.dataset.original || button.textContent;
}
}
let lastFocusedElement = null;
function focusPanel(name) {
 const panel = $(name + "Panel");
 const target = panel?.querySelector("input,button,textarea,select");
 target?.focus({preventScroll:true});
}

function switchPanel(name) {
["login", "register", "forgot", "otp"].forEach(x => {
$(x + "Panel")?.classList.toggle("active", x === name);
});
const isOtp = name === "otp";
$("loginTab")?.classList.toggle("active", name === "login");
$("registerTab")?.classList.toggle("active", name === "register");
$("loginTab")?.setAttribute("aria-selected", String(name === "login"));
$("registerTab")?.setAttribute("aria-selected", String(name === "register"));
$("loginTab")?.setAttribute("aria-hidden", String(isOtp));
$("registerTab")?.setAttribute("aria-hidden", String(isOtp));
$("loginTab")?.closest(".tabs")?.classList.toggle("otp-hidden", isOtp);
requestAnimationFrame(() => focusPanel(name));
clearStatus();
}
function passwordChecks(pw) {
const checks = [
pw.length >= 8,
/[a-z]/.test(pw) && /[A-Z]/.test(pw),
/\d/.test(pw),
/[^A-Za-z0-9]/.test(pw)
];
["r1", "r2", "r3", "r4"].forEach((id, i) => {
const el = $(id);
if (el) {
el.classList.toggle("ok", checks[i]);
el.textContent = (checks[i] ? "✓" : "○") + " " + ["8+ characters", "Upper & lowercase",
"Contains a number", "Special character"
][i];
}
});
["b1", "b2", "b3", "b4"].forEach((id, i) => $(id)?.classList.toggle("on", i < checks.filter(Boolean)
.length));
$("strengthText").textContent = checks.every(Boolean) ? "Strong password" : checks.filter(Boolean)
.length >= 2 ? "Password could be stronger" : "Use 8+ characters";
return checks.every(Boolean);
}
async function ensureClient() {
if (state.client) return state.client;
if (!window.supabase?.createClient) throw new Error("Secure authentication service is unavailable.");
state.client = window.supabase.createClient(SPIKE_CONFIG.supabaseUrl, SPIKE_CONFIG.supabaseKey, {
auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storage: authStorage }
});
window.sb = state.client;
window.supabaseClient = state.client;
window.AppPresence?.start(state.client);
setAuthPhase("CLIENT_READY");
return state.client;
}
async function ensureProfile(user) {
const db = await ensureClient();
const { data, error } = await db.from("profiles").select("id,full_name,display_name,activated,coins,updated_at,sp_id,sp_id_welcome_seen").eq("id", user.id).maybeSingle();
if (error) throw error;
if (data) return data;
// fallback: create profile shell if auth trigger hasn't fired yet
const row = {
id: user.id,
full_name: user.user_metadata?.full_name || "",
display_name: user.user_metadata?.display_name || user.email?.split("@")[0] || ""
};
const result = await db.from("profiles").upsert(row, { onConflict: "id" }).select("id,full_name,display_name,activated,coins,updated_at,sp_id,sp_id_welcome_seen").single();
if (result.error) throw result.error;
return result.data;
}
async function getVerifiedProfile(user) {
const db = await ensureClient();
for (let attempt = 0; attempt < 6; attempt++) {
const { data, error } = await db.from("profiles").select("id,full_name,display_name,activated,coins,updated_at,sp_id,sp_id_welcome_seen").eq("id", user.id).maybeSingle();
if (error) throw error;
if (data?.sp_id) return data;
await new Promise(resolve => setTimeout(resolve, 300));
}
return ensureProfile(user);
}
async function completeLogin(user) {
  if (!user?.id) return false;
  if (state.redirecting) return true;
  if (state.loginPromise) return state.loginPromise;
  const id = requestId("LOGIN");
  state.loginPromise = (async () => {
    state.completingLogin = true;
    state.currentUser = user;
    try {
      const verified = !!user.email_confirmed_at;
      setAuthPhase(verified ? "PROFILE_LOADING" : "UNVERIFIED");
      state.profile = verified ? await getVerifiedProfile(user) : await ensureProfile(user);
      if (verified && state.profile.sp_id) {
        const db = await ensureClient();
        const { data: welcomeClaim, error: welcomeClaimError } = await db.rpc("claim_sp_id_welcome");
        if (welcomeClaimError) throw welcomeClaimError;
        const claimedSpId = Array.isArray(welcomeClaim) ? welcomeClaim[0]?.sp_id : welcomeClaim?.sp_id;
        if (claimedSpId) {
          state.profile.sp_id_welcome_seen = true;
          const name = (state.profile.display_name || state.profile.full_name || user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "there").trim();
          $("welcomeTitle").textContent = `Welcome to SPIKE, ${name}! 🎉`;
          $("welcomeIntro").textContent = "Your email is verified and your permanent SPIKE identity is now ready.";
          $("spidValue").textContent = state.profile.sp_id;
          $("welcomeDetails").textContent = "Your SP ID is your unique SPIKE account identification number. You can use it to help others find you and, as SPIKE grows, to receive gifts, coins, XP, rewards and other features connected to your account.";
          $("welcomeNote").textContent = "Keep it handy: your SP ID stays connected to your SPIKE account for its lifetime.";
          lastFocusedElement = document.activeElement;
          $("successModal").classList.add("show");
          setAuthPhase("WELCOME");
          requestAnimationFrame(() => $("continueBtn")?.focus());
          return true;
        }
      }
      if (!verified) {
        const pendingEmail = state.signupOtpEmail || user.email || "";
        if (pendingEmail) showOtpScreen(pendingEmail);
        return false;
      }
      state.redirecting = true;
      setAuthPhase("REDIRECTING");
      location.replace("feed.html");
      return true;
    } catch (err) {
      logAuthError("PROFILE", err, id);
      toast(friendlyError(err, "profile"), "error");
      setAuthPhase("ERROR");
      return false;
    } finally {
      state.completingLogin = false;
      state.loginPromise = null;
    }
  })();
  return state.loginPromise;
}

async function resolveSession(session, source = "session") {
  if (state.redirecting) return true;
  if (!session?.user) {
    state.currentUser = null;
    if (source === "boot") setAuthPhase("LOGIN");
    return false;
  }
  const user = session.user;
  if (!user.email_confirmed_at) {
    state.currentUser = user;
    const pendingEmail = state.signupOtpEmail || user.email || "";
    if (pendingEmail) {
      state.signupOtpEmail = pendingEmail;
      try { sessionStorage.setItem("spike_signup_otp_email", pendingEmail); } catch {}
      setAuthPhase("UNVERIFIED");
      showOtpScreen(pendingEmail);
    }
    return false;
  }
  return completeLogin(user);
}

async function resolveSessionOnce(session, source = "session") {
  if (state.sessionResolutionPromise) return state.sessionResolutionPromise;
  state.sessionResolutionPromise = resolveSession(session, source).finally(() => { state.sessionResolutionPromise = null; });
  return state.sessionResolutionPromise;
}
// ─── sign in with email/password ───
async function signIn(e) {
e.preventDefault();
if (state.busy) return;
const email = $("loginEmail").value.trim(), password = $("loginPassword").value;
if (!explainValidation(e.currentTarget)) return;
if (!email || !password) { toast("Enter your email and password.", "warning"); return; }
const btn = $("loginBtn");
state.busy = true; clearStatus(); setBusy(btn, true, "Signing in…");
const id = requestId("LOGIN");
try {
const db = await ensureClient();
const { data, error } = await db.auth.signInWithPassword({ email, password });
if (error) throw error;
if (!data.user) throw new Error("Sign in did not return an account session.");
const completed = await resolveSessionOnce(data.session || { user: data.user }, "signin");
if (completed) toast("Signed in successfully.", "success", 2500);
} catch (err) {
logAuthError("LOGIN", err, id);
const friendly = friendlyError(err, "login");
status(friendly, "error"); toast(friendly, "error");
} finally { state.busy = false; setBusy(btn, false, ""); }
}
// ─── sign up ───
async function signUp(e) {
e.preventDefault();
if (state.busy) return;
const name = $("regName").value.trim(),
email = $("regEmail").value.trim(),
pw = $("regPassword").value,
confirm = $("regConfirm").value;
if (!explainValidation(e.currentTarget)) return;
if (!name || !email || !pw || !confirm) { toast("Complete all required fields.", "warning"); return; }
if (!passwordChecks(pw)) { toast("Please meet all password requirements.", "warning"); return; }
if (pw !== confirm) { toast("Passwords do not match.", "warning"); return; }
if (!$("terms").checked) { toast("Please agree to the Terms and Privacy Policy.", "warning"); return; }
const signupWait = emailCooldownRemaining();
if (signupWait > 0) {
const message =
`Please wait ${formatWait(signupWait)} before requesting another verification email.`;
toast(message, "warning");
status(message, "info");
return;
}
state.busy = true;
const btn = $("registerBtn");
setBusy(btn, true, "Creating account…");
clearStatus();
try {
const db = await ensureClient();
const { data, error } = await db.auth.signUp({
email,
password: pw,
options: { data: { full_name: name, display_name: name }, emailRedirectTo: AUTH_REDIRECT_URL }
});
if (error) {
if (isEmailRateLimit(error)) { startEmailCooldown(90000);
}
throw error;
}
if (data.user) {
  // Email confirmation is the signup gate. Show the OTP screen whenever the
  // returned user is not confirmed, even if Supabase also returned a session.
  // Some Auth configurations issue a temporary session before confirmation.
  const confirmed = !!data.user.email_confirmed_at;
  if (!confirmed) {
    state.signupOtpEmail = email;
    try { sessionStorage.setItem("spike_signup_otp_email", email); } catch {}
    startOtpCooldown(60000);
    showOtpScreen(email);
    toast("Verification code sent to your email.", "success");
  } else {
    await completeLogin(data.user);
    toast("Account created successfully.", "success");
  }
} else {
  throw new Error("Account creation did not return a user.");
}
} catch (err) {
console.error("[SPIKE SIGNUP]", {
  status: err?.status,
  code: err?.code,
  message: err?.message,
  name: err?.name
});
const friendly = friendlyError(err, "signup");
status(friendly, "error");
toast(friendly, "error");
} finally {
state.busy = false;
setBusy(btn, false, "");
}
}
// ─── email OTP confirmation (single-file screen) ───
let otpCooldownTimer = null;
function otpCooldownRemaining() { return Math.max(0, state.emailCooldownUntil - Date.now()); }
function updateOtpCooldown() { const btn=$("otpResendBtn"), label=$("otpCountdown"), r=otpCooldownRemaining(); if(btn) btn.disabled=r>0||state.signupOtpBusy; if(label) label.textContent=r>0?`You can request a new code in ${formatWait(r)}.`:"Didn't receive it? Request a new code."; if(r<=0&&otpCooldownTimer){clearInterval(otpCooldownTimer);otpCooldownTimer=null;} }
function startOtpCooldown(ms=60000){ startEmailCooldown(ms); if(otpCooldownTimer) clearInterval(otpCooldownTimer); otpCooldownTimer=setInterval(updateOtpCooldown,1000); updateOtpCooldown(); }
function showOtpScreen(email){ state.signupOtpEmail=String(email||"").trim(); if(!state.signupOtpEmail)return switchPanel("register"); $("otpEmail").textContent=state.signupOtpEmail; $("otpInput").value=""; switchPanel("otp"); updateOtpCooldown(); requestAnimationFrame(()=>$("otpInput")?.focus()); }
function leaveOtpScreen(){ try{sessionStorage.removeItem("spike_signup_otp_email");}catch{} state.signupOtpEmail=""; switchPanel("register"); }
async function verifySignupOtp(e){ e.preventDefault(); if(state.signupOtpBusy)return; const email=state.signupOtpEmail||sessionStorage.getItem("spike_signup_otp_email")||""; const token=$("otpInput")?.value.replace(/\D/g,"").slice(0,6)||""; if(!email){status("Your verification session is missing. Create the account again.","error");return;} if(!/^\d{6}$/.test(token)){toast("Enter the 6-digit code from your email.","warning");$("otpInput")?.focus();return;} state.signupOtpBusy=true; const btn=$("otpVerifyBtn"); setBusy(btn,true,"Confirming…"); clearStatus(); try{const db=await ensureClient(); const {data,error}=await db.auth.verifyOtp({email,token,type:"signup"}); if(error)throw error; if(!data?.user)throw new Error("Email confirmation did not return an account."); try{sessionStorage.removeItem("spike_signup_otp_email");}catch{} state.signupOtpEmail=""; toast("Email confirmed successfully.","success"); await completeLogin(data.user);}catch(err){console.error("[SPIKE SIGNUP OTP]",{status:err?.status,code:err?.code,message:err?.message}); const msg=String(err?.message||"").toLowerCase(); const friendly=/expired|invalid|token|otp/.test(msg)?"That code is invalid or expired. Check the newest SPIKE email, then enter its 6-digit code.":isEmailRateLimit(err)?"Too many verification attempts. Please wait a little before trying again.":friendlyError(err,"signup"); status(friendly,"error"); toast(friendly,"error");}finally{state.signupOtpBusy=false;setBusy(btn,false,"");updateOtpCooldown();} }
async function resendSignupOtp(){ if(state.signupOtpBusy||otpCooldownRemaining()>0)return; const email=state.signupOtpEmail||sessionStorage.getItem("spike_signup_otp_email")||""; if(!email)return status("Your verification session is missing. Create the account again.","error"); state.signupOtpBusy=true; const btn=$("otpResendBtn"); if(btn)btn.disabled=true; try{const db=await ensureClient(); const {error}=await db.auth.resend({type:"signup",email}); if(error)throw error; startOtpCooldown(60000); status("A new 6-digit verification code has been sent.","success"); toast("New verification code sent.","success");}catch(err){if(isEmailRateLimit(err))startOtpCooldown(90000); const friendly=friendlyError(err,"signup"); status(friendly,"error"); toast(friendly,"error");}finally{state.signupOtpBusy=false;updateOtpCooldown();} }

// ─── reset password ───
async function resetPassword(e) {
e.preventDefault();
if (state.busy) return;
const email = $("resetEmail").value.trim();
if (!explainValidation(e.currentTarget)) return;
if (!email) { toast("Enter your email.", "warning"); return; }
const emailWait = emailCooldownRemaining();
if (emailWait > 0) {
const message = `Please wait ${formatWait(emailWait)} before requesting another email.`;
toast(message, "warning");
status(message, "info");
return;
}
state.busy = true;
const btn = $("resetBtn");
setBusy(btn, true, "Sending…");
try {
const db = await ensureClient();
const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: PASSWORD_RESET_REDIRECT_URL });
if (error) throw error;
try { sessionStorage.setItem("spike_password_reset_pending", String(Date.now())); } catch {}
startEmailCooldown(60000);
toast("If an account exists, a secure reset link has been sent.", "success");
status("Check your email for the password reset link.", "success");
} catch (err) {
const friendly = friendlyError(err, "reset");
toast(friendly, "error");
status(friendly, "error");
} finally {
state.busy = false;
setBusy(btn, false, "");
}
}
// ─── OAuth ───
async function signInWithProvider(provider) {
if (state.busy || state.redirecting || state.completingLogin) return;
const oauthLockKey = "spike_oauth_in_progress";
const now = Date.now();
try {
const existing = Number(sessionStorage.getItem(oauthLockKey) || 0);
if (existing && now - existing < 120000) {
status("A secure sign-in is already in progress. Please finish it or wait a moment.", "info");
return;
}
sessionStorage.setItem(oauthLockKey, String(now));
} catch {}
state.busy = true;
const googleBtn = $("googleLoginBtn"),
githubBtn = $("githubLoginBtn");
const buttons = [googleBtn, githubBtn];
buttons.forEach(b => { if (b) b.disabled = true; });
const button = provider === "google" ? googleBtn : githubBtn;
if (button) {
button.dataset.original = button.innerHTML;
button.innerHTML =
`<span class="oauth-loading" aria-hidden="true"></span><span>Connecting…</span>`;
}
clearStatus();
try {
const db = await ensureClient();
const { data, error } = await db.auth.signInWithOAuth({
provider,
options: {
redirectTo: AUTH_REDIRECT_URL,
skipBrowserRedirect: true,
queryParams: provider === "google" ? { access_type: "offline", prompt: "select_account" } : undefined
}
});
if (error) throw error;
if (!data?.url || data.url === "null" || data.url === "undefined") {
throw new Error("Supabase did not return a valid OAuth authorization URL. Check that the provider is enabled and configured in Supabase.");
}
window.location.replace(data.url);
} catch (err) {
try { sessionStorage.removeItem("spike_oauth_in_progress"); } catch {}
console.error("[SPIKE OAUTH]", provider, err);
const friendly = friendlyError(err, "oauth");
status(friendly, "error");
toast(friendly, "error");
state.busy = false;
buttons.forEach(b => {
if (b) { b.disabled = false; if (b.dataset.original) b.innerHTML = b.dataset.original; }
});
}
}
// ─── Auth callback / redirect handling ───
function getAuthCallback() {
  const url = new URL(window.location.href);
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const get = key => query.get(key) || hash.get(key);
  return {
    code: query.get("code"),
    type: get("type"),
    error: get("error"),
    errorCode: get("error_code"),
    description: get("error_description"),
    hasAccessToken: !!(hash.get("access_token") || hash.get("refresh_token"))
  };
}

function cleanAuthUrl() {
  try {
    const u = new URL(window.location.href);
    ["code","error","error_code","error_description","access_token","refresh_token","token_type","type","sb"].forEach(k => u.searchParams.delete(k));
    u.hash = "";
    window.history.replaceState({}, document.title, u.pathname + (u.search ? u.search : ""));
  } catch (_) {}
}

function isRecoveryFlow(callback = getAuthCallback()) {
  return callback.type === "recovery";
}

function handleAuthCallback() {
  const callback = getAuthCallback();
  if (callback.code || callback.error || callback.hasAccessToken || callback.type) {
    try { sessionStorage.removeItem("spike_oauth_in_progress"); } catch {}
  }
  if (callback.error) {
    const msg = callback.errorCode === "otp_expired" || /invalid or has expired/i.test(callback.description || "")
      ? "This email link is invalid or has expired. Request a new verification or password-reset email, then use the newest link."
      : callback.description || "Authentication could not be completed. Please try again.";
    setTimeout(() => { status(msg, "error"); toast(msg, "error"); }, 0);
    cleanAuthUrl();
    return callback;
  }
  return callback;
}

function smartField(input){
 if(!input)return true;
 const value=input.value.trim(), field=input.closest(".field");
 if(!field)return true;
 let ok=input.validity.valid && !!value;
 if(input.type==="email") ok=ok && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
 field.classList.toggle("valid",ok);field.classList.toggle("invalid",!ok);
 return ok;
}
function explainValidation(form){
 const bad=[...form.querySelectorAll("input")].find(x=>x.required&&!smartField(x));
 if(!bad)return true;
 const label=form.querySelector(`label[for="${bad.id}"] span`)?.textContent||"field";
 const msg=bad.type==="email"?`Enter a valid email address for ${label.toLowerCase()}.`:bad.id==="terms"?"Please accept the Terms and Privacy Policy to continue.":`Please check your ${label.toLowerCase()}.`;
 status(msg,"warning");toast(msg,"warning");bad.focus();return false;
}
function otpAutoAdvance(){
 const input=$("otpInput"); if(!input)return;
 input.addEventListener("paste",e=>{const text=(e.clipboardData?.getData("text")||"").replace(/\D/g,"").slice(0,6);if(text){e.preventDefault();input.value=text;input.classList.toggle("otp-complete",text.length===6);if(text.length===6)requestAnimationFrame(()=>$("otpVerifyBtn")?.focus());}});
 input.addEventListener("input",()=>{input.classList.toggle("otp-complete",input.value.length===6);if(input.value.length===6){status("Code ready. Confirm your email to continue.","success");}});
}
function improveErrors(){
 const emailInputs=[$("loginEmail"),$("regEmail"),$("resetEmail")].filter(Boolean);
 emailInputs.forEach(input=>input.addEventListener("input",()=>{if(input.value)smartField(input);}));
 $("regName")?.addEventListener("input",e=>{if(e.target.value)smartField(e.target);});
}
improveErrors();otpAutoAdvance();

// ─── boot: restore session / dedicated password-recovery routing ───
function routeRecoveryCallbackToDedicatedPage(callback) {
  // Supabase can return a recovery callback to the Site URL when the redirect
  // URL is not selected/allowed correctly. Never leave a password-reset
  // session on the normal login screen. Preserve the callback intact so the
  // dedicated page can consume the recovery session.
  if (!callback?.type || callback.type !== "recovery") return false;
  if (/\/reset-password\.html$/i.test(window.location.pathname)) return false;
  try {
    const target = `${window.location.origin.replace(/\/$/, "")}/reset-password.html${window.location.search}${window.location.hash}`;
    window.location.replace(target);
    return true;
  } catch (err) {
    console.error("[SPIKE RECOVERY ROUTE]", err);
    return false;
  }
}

async function boot() {
  setAuthPhase("BOOTING");
  try {
    const callback = handleAuthCallback();
    if (routeRecoveryCallbackToDedicatedPage(callback)) return;
    const db = await ensureClient();
    setAuthPhase("CHECKING_SESSION");
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    const pendingOtp = (()=>{try{return sessionStorage.getItem("spike_signup_otp_email")||""}catch{return ""}})();
    if (pendingOtp && !callback.error && !data.session?.user) showOtpScreen(pendingOtp);
    if (callback.code || callback.hasAccessToken || callback.type || callback.error) cleanAuthUrl();
    if (data.session?.user && !isRecoveryFlow(callback) && !callback.error) await resolveSessionOnce(data.session, "boot");
    else if (!data.session?.user) setAuthPhase(pendingOtp ? "UNVERIFIED" : "LOGIN");
  } catch (err) {
    logAuthError("BOOT", err, requestId("BOOT"));
    setAuthPhase("ERROR");
    toast(friendlyError(err, "boot"), "warning");
  } finally {
    window.SPIKE_HIDE_BOOT_LOADER?.();
  }
  try {
    const db = await ensureClient();
    db.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        state.currentUser = null;
        state.profile = null;
        setAuthPhase("LOGIN");
        return;
      }
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") && session?.user) {
        queueMicrotask(() => resolveSessionOnce(session, event.toLowerCase()).catch(err => {
          logAuthError("AUTH COMPLETE", err, requestId("AUTH"));
        }));
      }
    });
    state.authListenerReady = true;
  } catch (err) { logAuthError("AUTH LISTENER", err, requestId("LISTENER")); }
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || state.redirecting) return;
    try {
      const { data } = await db.auth.getSession();
      if (data?.session?.user) await resolveSessionOnce(data.session, "visibility");
    } catch (e) { console.debug("[SPIKE SESSION REFRESH]", e); }
  });
}
// Accessible keyboard behavior
document.addEventListener("keydown", e => {
 const modal = $("successModal");
 if (modal?.classList.contains("show")) {
   if (e.key === "Escape") {
     e.preventDefault();
     modal.classList.remove("show");
     lastFocusedElement?.focus?.();
     return;
   }
   if (e.key === "Tab") {
     const focusables = [...modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled);
     if (focusables.length) {
       const first = focusables[0], last = focusables[focusables.length - 1];
       if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
       else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
     }
   }
 }
 if (e.target.matches("[role=tab]") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.target.click(); }
 if (e.target.matches("[role=tab]") && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
   const tabs = [$('loginTab'), $('registerTab')].filter(Boolean);
   const next = e.key === "ArrowRight" ? 1 : -1;
   const idx = tabs.indexOf(e.target);
   if (idx >= 0) { e.preventDefault(); tabs[(idx + next + tabs.length) % tabs.length].focus(); }
 }
});

// ─── DOM events ───
// password toggle
document.addEventListener("click", e => {
const b = e.target.closest(".password-toggle");
if (!b) return;
const input = $(b.dataset.target);
if (!input) return;
input.type = input.type === "password" ? "text" : "password";
b.textContent = input.type === "password" ? "Show" : "Hide";
 b.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
 b.setAttribute("aria-pressed", input.type !== "password");
});
// tab switching
$("loginTab").onclick = () => switchPanel("login");
$("registerTab").onclick = () => switchPanel("register");
$("goCreate").onclick = () => switchPanel("register");
$("goLogin").onclick = () => switchPanel("login");
$("forgotBtn").onclick = () => { $("resetEmail").value = $("loginEmail").value.trim();
switchPanel("forgot"); };
$("forgotBackBtn")?.addEventListener("click", () => switchPanel("login"));

// Remember-me is real session persistence, not just a visual preference.
$("remember")?.addEventListener("change", e => {
  const enabled = !!e.target.checked;
  migrateAuthStorage(enabled);
  toast(enabled ? "This device will remember your SPIKE session." : "SPIKE will keep this session only until you leave this browser session.", "info", 3200);
});

// OAuth buttons
$("googleLoginBtn").onclick = () => signInWithProvider("google");
$("githubLoginBtn").onclick = () => signInWithProvider("github");
// email OTP confirmation
// forms
$("loginForm").addEventListener("submit", signIn);
$("registerForm").addEventListener("submit", signUp);
$("resetForm").addEventListener("submit", resetPassword);
$("otpForm")?.addEventListener("submit", verifySignupOtp);
$("otpResendBtn")?.addEventListener("click", resendSignupOtp);
$("otpBackBtn")?.addEventListener("click", leaveOtpScreen);
$("otpInput")?.addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); });
// password strength
$("regPassword").addEventListener("input", e => passwordChecks(e.target.value));
// confirm password validation
$("regConfirm")?.addEventListener("input", () => {
const ok = $("regConfirm").value.length > 0 && $("regConfirm").value === $("regPassword").value;
const field = $("regConfirm")?.closest(".field");
if (field) {
field.classList.toggle("valid", !!ok);
field.classList.toggle("invalid", ok === false);
}
});
// field validation on blur
["loginEmail", "regEmail", "resetEmail"].forEach(id => {
const el = $(id);
el?.addEventListener("blur", () => {
if (!el.value.trim()) { markField(el, false); return; }
markField(el, el.validity.valid);
});
});
function markField(input, valid) {
const field = input?.closest(".field");
if (!field) return;
field.classList.toggle("valid", !!valid);
field.classList.toggle("invalid", valid === false);
}
// modal: copy & continue
$("copySpid").onclick = async () => {
const v = $("spidValue").textContent;
try {
await navigator.clipboard.writeText(v);
toast("SP ID copied.", "success");
} catch { toast("Your SP ID is " + v, "info"); }
};
$("continueBtn").onclick = async () => {
$("successModal").classList.remove("show");
lastFocusedElement?.focus?.();
setAuthPhase("REDIRECTING");
location.replace("feed.html");
};
// expose safe helpers
window.SPIKE = {
version: "2026.09.06-smart",
supabase: () => state.client,
signIn,
signUp,
switchPanel,
toast
};
boot();

(function(){
 const b=document.getElementById('passwordHelpBtn'), r=document.getElementById('passwordRequirements'), p=document.getElementById('regPassword');
 if(!b||!r)return;
 b.addEventListener('click',()=>{const open=r.classList.toggle('open');b.textContent=open?'Hide password requirements':'Password requirements';});
 p?.addEventListener('focus',()=>{if(window.innerHeight>=650){r.classList.add('open');b.textContent='Hide password requirements';}});
})();

(()=>{let last=0;const isNet=e=>{const m=String(e?.message||e?.reason?.message||e||'').toLowerCase();return !navigator.onLine||/failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out/.test(m)};const notice=(msg)=>{const now=Date.now();if(now-last<5000)return;last=now;try{if(typeof window.spikePremiumToast==='function')window.spikePremiumToast(msg,'warning',4500);else console.warn('[SPIKE network]',msg)}catch{console.warn('[SPIKE network]',msg)}};window.addEventListener('offline',()=>notice('You are offline. Actions will resume when your connection returns.'));window.addEventListener('online',()=>notice('Connection restored. Retry the last action if needed.'));window.addEventListener('unhandledrejection',e=>{if(isNet(e)){e.preventDefault();notice(navigator.onLine?'SPIKE could not complete a network request. Please retry.':'You are offline. Please reconnect and retry.')}})})();
