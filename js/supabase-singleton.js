/* SPIKE Supabase singleton guard.
   Keeps one GoTrueClient per browser page/storage key and reuses it across
   feature modules (maintenance, call receiver, page code, etc.). */
(() => {
  'use strict';
  if (!window.supabase?.createClient || window.__SPIKE_SUPABASE_FACTORY_PATCHED__) return;

  const URL = 'https://cjqpyndceqyqsijihxbb.supabase.co';
  const KEY = 'sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw';
  const original = window.supabase.createClient.bind(window.supabase);
  const normalize = v => String(v || '').replace(/\/$/, '');
  let singleton = window.__SPIKE_SUPABASE__ || window.supabaseClient || window.sb || window.db || null;

  window.supabase.createClient = function (url, key, options) {
    if (normalize(url) !== URL || String(key || '') !== KEY) {
      return original(url, key, options);
    }
    if (!singleton) {
      singleton = original(url, key, options);
      window.__SPIKE_SUPABASE__ = singleton;
    }
    return singleton;
  };

  window.__SPIKE_SUPABASE_FACTORY_PATCHED__ = true;
  if (singleton) window.__SPIKE_SUPABASE__ = singleton;
})();
