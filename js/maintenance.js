/* SPIKE global maintenance gate. Admin remains accessible so operators can disable maintenance. */
(() => {
  if (location.pathname.toLowerCase().endsWith('/admin.html') || location.pathname.toLowerCase().endsWith('admin.html')) return;
  const SUPABASE_URL = 'https://cjqpyndceqyqsijihxbb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw';
  const POLL_MS = 30000;
  const ADMIN_EMAILS = new Set(['eletexjoeytex@gmail.com']);
  let overlay;
  let lastState = null;
  let adminBypass = false;
  let adminCheckDone = false;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'spikeMaintenanceGate';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="spike-maintenance-backdrop" role="dialog" aria-modal="true" aria-labelledby="spikeMaintenanceTitle">
        <div class="spike-maintenance-card">
          <div class="spike-maintenance-icon">🛠️</div>
          <div class="spike-maintenance-kicker">SPIKE MAINTENANCE</div>
          <h1 id="spikeMaintenanceTitle">SPIKE is under maintenance</h1>
          <p id="spikeMaintenanceMessage">We’re making improvements. Please check back shortly.</p>
          <div id="spikeMaintenanceEnds" class="spike-maintenance-ends"></div>
          <button type="button" id="spikeMaintenanceRetry">Check again</button>
        </div>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #spikeMaintenanceGate{position:fixed;inset:0;z-index:2147483646}
      #spikeMaintenanceGate[hidden]{display:none!important}
      .spike-maintenance-backdrop{position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:rgba(5,7,12,.94);backdrop-filter:blur(18px)}
      .spike-maintenance-card{width:min(560px,100%);padding:34px 28px;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:rgba(16,19,28,.96);box-shadow:0 24px 90px rgba(0,0,0,.5);text-align:center;color:#fff}
      .spike-maintenance-icon{font-size:44px;margin-bottom:10px}.spike-maintenance-kicker{font-size:11px;letter-spacing:.16em;opacity:.65;font-weight:800}
      .spike-maintenance-card h1{font-size:28px;margin:10px 0}.spike-maintenance-card p{line-height:1.65;opacity:.78;margin:0 auto;max-width:440px}.spike-maintenance-ends{margin-top:14px;font-size:12px;opacity:.58}
      .spike-maintenance-card button{margin-top:22px;border:0;border-radius:14px;padding:12px 18px;font-weight:800;cursor:pointer;background:#fff;color:#0b0d12}
    `;
    document.head.appendChild(style);
    document.body.appendChild(overlay);
    overlay.querySelector('#spikeMaintenanceRetry').onclick = check;
    return overlay;
  }

  function active(row) {
    if (!row || row.enabled !== true) return false;
    const now = Date.now();
    if (row.starts_at && Number.isFinite(Date.parse(row.starts_at)) && Date.parse(row.starts_at) > now) return false;
    if (row.ends_at && Number.isFinite(Date.parse(row.ends_at)) && Date.parse(row.ends_at) <= now) return false;
    return true;
  }

  function render(row) {
    const on = active(row);
    if (on === lastState && on) return;
    lastState = on;
    const root = ensureOverlay();
    if (!on) { root.hidden = true; return; }
    root.querySelector('#spikeMaintenanceTitle').textContent = row.title || 'SPIKE is under maintenance';
    root.querySelector('#spikeMaintenanceMessage').textContent = row.message || 'We’re making improvements. Please check back shortly.';
    root.querySelector('#spikeMaintenanceEnds').textContent = row.ends_at ? `Expected back: ${new Date(row.ends_at).toLocaleString()}` : 'Please check back shortly.';
    root.hidden = false;
  }

  async function resolveAdminBypass() {
    if (adminCheckDone) return adminBypass;
    adminCheckDone = true;
    try {
      // Prefer the authenticated Supabase session when the page has already loaded the SDK.
      if (window.supabase?.createClient) {
        const client = window.supabaseClient || window.__SPIKE_SUPABASE__ || window.sb || window.db ||
          window.__SPIKE_MAINTENANCE_CLIENT__ || (window.__SPIKE_MAINTENANCE_CLIENT__ = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
          }));
        const { data: { user } = {} } = await client.auth.getUser();
        if (user?.email && ADMIN_EMAILS.has(String(user.email).trim().toLowerCase())) {
          adminBypass = true;
          return true;
        }
        if (user?.id) {
          const { data: isSuper, error } = await client.rpc('is_super_admin', { p_user_id: user.id });
          if (!error && isSuper === true) {
            adminBypass = true;
            return true;
          }
        }
      }
    } catch (e) {
      console.warn('[SPIKE maintenance] admin check failed', e);
    }
    return false;
  }

  async function check() {
    try {
      if (await resolveAdminBypass()) {
        const root = ensureOverlay();
        root.hidden = true;
        return;
      }
      const r = await fetch(`${SUPABASE_URL}/rest/v1/app_maintenance?select=enabled,title,message,starts_at,ends_at&id=eq.true&limit=1`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        cache: 'no-store'
      });
      if (!r.ok) throw new Error(`maintenance ${r.status}`);
      const rows = await r.json();
      render(rows[0] || null);
    } catch (e) {
      console.warn('[SPIKE maintenance] status check failed', e);
      // Never lock users out merely because the maintenance status endpoint is unreachable.
    }
  }

  function boot() {
    if (!document.body) return setTimeout(boot, 0);
    check();
    setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }
  boot();
})();
