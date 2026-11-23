/* Classic-script bridge for the original SPIKE controllers and the new Supabase project. */
(() => {
  'use strict';
  const URL = 'https://veagqanfilmbchlvlpcc.supabase.co';
  const KEY = 'sb_publishable_kf1MuQm41BREfWDIKWEXzg_jQlA7_mE';
  const sdk = window.supabase;
  if (!sdk || typeof sdk.createClient !== 'function') {
    console.error('[SPIKE] Supabase SDK did not load. Ensure js/supabase.min.js is present and reachable.');
    return;
  }
  const client = sdk.createClient(URL, KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce', experimental: { recoveryCodes: true } },
    global: { headers: { 'X-Client-Info': 'spike-web/1.0.0' } }
  });
  window.SPIKE_SUPABASE = client;
  // Shared Cloudinary upload service is loaded by the pages that expose media pickers.
  window.db = client;
  window.SPIKE_SUPABASE_READY = true;

  // One shared, throttled heartbeat per authenticated page. The auth listener's
  // INITIAL_SESSION event is the single source of the initial session; do not
  // race it with a second getSession() call during startup.
  let activityHeartbeatBusy = false;
  let lastActivityHeartbeatAt = 0;
  let heartbeatTimer = null;
  let currentSession = null;
  const HEARTBEAT_INTERVAL = 60000;
  const HEARTBEAT_COOLDOWN = 25000;

  const stopHeartbeat = () => {
    if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };
  const startHeartbeat = () => {
    if (heartbeatTimer !== null || !currentSession?.user || document.visibilityState === 'hidden') return;
    heartbeatTimer = window.setInterval(() => { void touchSpikeActivity(); }, HEARTBEAT_INTERVAL);
  };
  const touchSpikeActivity = async ({ force = false } = {}) => {
    if (!currentSession?.user || activityHeartbeatBusy || document.visibilityState === 'hidden' || !navigator.onLine) return;
    if (!force && Date.now() - lastActivityHeartbeatAt < HEARTBEAT_COOLDOWN) return;
    activityHeartbeatBusy = true;
    try {
      const { error } = await client.rpc('spike_touch_activity');
      if (!error) lastActivityHeartbeatAt = Date.now();
      else if (!/function.*not found|schema cache/i.test(error.message || '')) console.warn('[SPIKE activity] Heartbeat was not recorded:', error.message);
    } catch (error) {
      console.warn('[SPIKE activity] Heartbeat unavailable:', error?.message || error);
    } finally {
      activityHeartbeatBusy = false;
    }
  };

  client.auth.onAuthStateChange((event, session) => {
    currentSession = session || null;
    if (currentSession?.user) {
      startHeartbeat();
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        window.setTimeout(() => { void touchSpikeActivity({ force: true }); }, 0);
      }
    } else {
      stopHeartbeat();
      if (event === 'SIGNED_OUT') lastActivityHeartbeatAt = 0;
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopHeartbeat();
    else { startHeartbeat(); void touchSpikeActivity(); }
  });
  window.addEventListener('online', () => { startHeartbeat(); void touchSpikeActivity(); });
  window.addEventListener('pagehide', stopHeartbeat, { once: true });
  window.SPIKE_PLATFORM = Object.freeze({
    getClient: () => client,
    getSession: async () => {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    getUser: async () => {
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      return data.user;
    },
    signOut: () => client.auth.signOut()
  });

  const social = {
    async getPublicProfiles(db, ids) {
      const clean = [...new Set((ids || []).map(String).filter(Boolean))];
      if (!clean.length) return [];
      const { data, error } = await db.rpc('get_public_profiles', { p_user_ids: clean });
      if (error) throw error;
      return data || [];
    },
    async getCounts(db, ownerId) {
      const { data, error } = await db.rpc('get_spike_follow_counts', { p_owner: ownerId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { followers: Number(row?.followers || 0), following: Number(row?.following || 0) };
    },
    async getList(db, ownerId, kind, options = {}) {
      const { data, error } = await db.rpc('get_spike_follow_list', {
        p_owner: ownerId, p_kind: kind, p_limit: options.limit || 30, p_offset: options.offset || 0
      });
      if (error) throw error;
      return data || [];
    },
    async getMutuals(db, ownerId, options = {}) {
      return this.getList(db, ownerId, 'mutuals', options);
    },
    async readFollowingIds(db, userId) {
      const { data, error } = await db.from('follows').select('following_id').eq('follower_id', userId).eq('status', 'accepted').limit(5000);
      if (error) throw error;
      return (data || []).map(row => String(row.following_id));
    },
    async getRelationship(db, targetId) {
      const session = await window.SPIKE_PLATFORM.getSession();
      if (!session?.user) throw new Error('Sign in to continue.');
      const me = session.user.id;
      const filter = `and(follower_id.eq.${me},following_id.eq.${targetId}),and(follower_id.eq.${targetId},following_id.eq.${me})`;
      const { data, error } = await db.from('follows').select('id,follower_id,following_id,status').or(filter);
      if (error) throw error;
      const rows = data || [];
      const outgoing = rows.find(row => row.follower_id === me && row.following_id === targetId);
      const incoming = rows.find(row => row.follower_id === targetId && row.following_id === me);
      const mutual = outgoing?.status === 'accepted' && incoming?.status === 'accepted';
      return {
        following: outgoing?.status === 'accepted',
        friendship: mutual ? 'mutual' : outgoing?.status === 'accepted' ? 'following' : incoming?.status === 'accepted' ? 'follower' : 'none',
        request_id: incoming?.id || null
      };
    },
    async setFollow(db, targetId, shouldFollow) {
      const session = await window.SPIKE_PLATFORM.getSession();
      if (!session?.user) throw new Error('Sign in to continue.');
      const userId = session.user.id;
      if (shouldFollow) {
        if (!targetId || targetId === userId) throw new Error('You cannot follow this account.');
        const { data: target, error: targetError } = await db.from('profiles').select('id,is_private,account_status').eq('id', targetId).maybeSingle();
        if (targetError) throw targetError;
        if (!target || target.account_status !== 'active') throw new Error('This account is unavailable.');
        if (target.is_private) throw new Error('This profile is private. SPIKE currently supports direct follows only; no follow request was sent.');
        const existing = await db.from('follows').select('status').eq('follower_id', userId).eq('following_id', targetId).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data?.status === 'accepted') return { following: true, requested: false };
        if (existing.data) {
          const removed = await db.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId);
          if (removed.error) throw removed.error;
        }
        const { error } = await db.from('follows').insert({ follower_id: userId, following_id: targetId, status: 'accepted' });
        if (error) throw error;
        return { following: true, requested: false };
      }
      const { error } = await db.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId);
      if (error) throw error;
      return { following: false, requested: false };
    },
    async toggleFollow(db, targetId, shouldFollow) { return this.setFollow(db, targetId, shouldFollow); }
  };
  window.SPIKE = Object.assign(window.SPIKE || {}, { social });
  window.dispatchEvent(new CustomEvent('spike:supabase-ready', { detail: { client } }));
})();
