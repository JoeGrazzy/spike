/* SPIKE Platform Core v1
 * Shared, deliberately small service contract over the existing Supabase singleton.
 * This module does not create a second auth client, change database permissions,
 * or make client-side authorization decisions.
 */
(() => {
  'use strict';
  if (window.SPIKE_PLATFORM?.version === 1) return;

  const CONFIG = Object.freeze({
    url: 'https://cjqpyndceqyqsijihxbb.supabase.co',
    key: 'sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw'
  });
  let authSubscription = null;
  const authListeners = new Set();
  let lastAuthState = { event: 'INITIAL', session: null, user: null };

  function getClient() {
    let client = window.__SPIKE_SUPABASE__ || window.supabaseClient || window.sb || window.db || null;
    if (!client && window.supabase?.createClient) {
      client = window.supabase.createClient(CONFIG.url, CONFIG.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' }
      });
    }
    if (client) {
      window.__SPIKE_SUPABASE__ = client;
      window.supabaseClient = client;
    }
    return client;
  }

  function emitAuth(event, session) {
    lastAuthState = { event: String(event || 'UNKNOWN'), session: session || null, user: session?.user || null };
    for (const listener of [...authListeners]) {
      try { listener(lastAuthState); }
      catch (error) { console.error('[SPIKE Platform] Auth listener failed:', error?.message || error); }
    }
    try {
      window.dispatchEvent(new CustomEvent('spike:auth-state', { detail: lastAuthState }));
    } catch (_) {}
  }

  function ensureAuthBridge(client) {
    if (authSubscription || !client?.auth?.onAuthStateChange) return;
    const result = client.auth.onAuthStateChange((event, session) => emitAuth(event, session));
    authSubscription = result?.data?.subscription || result?.subscription || null;
  }

  async function getSession() {
    const client = getClient();
    if (!client?.auth?.getSession) throw new Error('SPIKE authentication service is unavailable.');
    const result = await client.auth.getSession();
    if (result?.error) throw result.error;
    return result?.data?.session || null;
  }

  async function getUser() {
    const client = getClient();
    if (!client?.auth?.getUser) throw new Error('SPIKE authentication service is unavailable.');
    const result = await client.auth.getUser();
    if (result?.error) throw result.error;
    return result?.data?.user || null;
  }

  async function requireUser() {
    const user = await getUser();
    if (!user?.id) throw new Error('Please sign in to continue.');
    return user;
  }

  function onAuthChange(callback, options = {}) {
    if (typeof callback !== 'function') throw new TypeError('Auth listener must be a function.');
    const client = getClient();
    if (!client) throw new Error('SPIKE connection is unavailable.');
    ensureAuthBridge(client);
    authListeners.add(callback);
    if (options.emitCurrent) {
      Promise.resolve().then(async () => {
        try {
          const session = await getSession();
          callback({ event: 'INITIAL_SESSION', session, user: session?.user || null });
        } catch (error) {
          callback({ event: 'INITIAL_ERROR', session: null, user: null, error });
        }
      });
    }
    let active = true;
    return () => { if (active) { active = false; authListeners.delete(callback); } };
  }

  async function rpc(name, args = {}) {
    const client = getClient();
    if (!client?.rpc) throw new Error('SPIKE database connection is unavailable.');
    if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name)) throw new TypeError('Invalid RPC name.');
    const result = await client.rpc(name, args);
    if (result?.error) throw result.error;
    return result?.data;
  }

  const api = Object.freeze({
    version: 1,
    config: Object.freeze({ url: CONFIG.url }),
    getClient,
    getSession,
    getUser,
    requireUser,
    onAuthChange,
    rpc,
    getAuthState: () => lastAuthState
  });
  window.SPIKE_PLATFORM = api;

  // Bridge auth changes once for the entire page, only when a consumer subscribes.
  window.addEventListener?.('pagehide', () => {
    if (authSubscription && authListeners.size === 0) {
      try { authSubscription.unsubscribe?.(); } catch (_) {}
      authSubscription = null;
    }
  }, { once: true });
})();
