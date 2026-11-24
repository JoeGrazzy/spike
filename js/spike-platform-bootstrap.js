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
  let presenceTimer = null;
  let presenceBusy = false;
  let presenceRefreshPromise = null;
  let presenceRefreshUserId = null;
  let presenceRows = [];
  let presenceLoaded = false;
  let lastPresenceRefreshAt = 0;
  let currentSession = null;
  const HEARTBEAT_INTERVAL = 30000;
  const HEARTBEAT_COOLDOWN = 15000;

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

  const stopPresence = () => {
    if (presenceTimer !== null) window.clearInterval(presenceTimer);
    presenceTimer = null;
  };
  const refreshPresence = async ({ force = false } = {}) => {
    if (!currentSession?.user || document.visibilityState === 'hidden' || !navigator.onLine) return presenceRows;
    const requestingUserId = currentSession.user.id;
    if (presenceRefreshPromise && presenceRefreshUserId === requestingUserId) return presenceRefreshPromise;
    if (!force && Date.now() - lastPresenceRefreshAt < 12000) return presenceRows;
    presenceBusy = true;
    const request = (async () => {
      try {
        const { data, error } = await client.rpc('spike_get_messaging_presence');
        if (error) throw error;
        if (currentSession?.user?.id !== requestingUserId) return presenceRows;
        presenceRows = Array.isArray(data) ? data : [];
        presenceLoaded = true;
        lastPresenceRefreshAt = Date.now();
        window.dispatchEvent(new CustomEvent('spike:presence-update', { detail: { rows: presenceRows, at: lastPresenceRefreshAt } }));
      } catch (error) {
        console.info('[SPIKE presence] Shared presence refresh unavailable:', error?.message || error);
      } finally {
        if (presenceRefreshPromise === request) { presenceBusy = false; presenceRefreshPromise = null; presenceRefreshUserId = null; }
      }
      return presenceRows;
    })();
    presenceRefreshPromise = request;
    presenceRefreshUserId = requestingUserId;
    return request;
  };
  const startPresence = () => {
    if (presenceTimer !== null || !currentSession?.user || document.visibilityState === 'hidden') return;
    void refreshPresence({ force: true });
    presenceTimer = window.setInterval(() => { void refreshPresence(); }, 30000);
  };
  window.SPIKE_PRESENCE = Object.freeze({
    getSnapshot: () => presenceRows.slice(),
    isLoaded: () => presenceLoaded,
    getUser: id => presenceRows.find(row => String(row.user_id) === String(id)) || null,
    refresh: () => refreshPresence({ force: true }),
    subscribe: callback => {
      const handler = event => callback(event.detail?.rows || []);
      window.addEventListener('spike:presence-update', handler);
      return () => window.removeEventListener('spike:presence-update', handler);
    }
  });

  client.auth.onAuthStateChange((event, session) => {
    currentSession = session || null;
    if (currentSession?.user) {
      startHeartbeat();
      startPresence();
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        window.setTimeout(() => { void touchSpikeActivity({ force: true }); }, 0);
      }
    } else {
      stopHeartbeat();
      stopPresence();
      if (event === 'SIGNED_OUT') { lastActivityHeartbeatAt = 0; presenceRows = []; presenceLoaded = true; lastPresenceRefreshAt = 0; window.dispatchEvent(new CustomEvent('spike:presence-update', { detail: { rows: [], at: 0 } })); }
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { stopHeartbeat(); stopPresence(); }
    else { startHeartbeat(); startPresence(); void touchSpikeActivity(); }
  });
  window.addEventListener('online', () => { startHeartbeat(); startPresence(); void touchSpikeActivity({ force: true }); });
  window.addEventListener('focus', () => { if (!document.hidden) { startHeartbeat(); startPresence(); void touchSpikeActivity({ force: true }); void refreshPresence({ force: true }); } });
  window.addEventListener('pageshow', () => { if (!document.hidden) { startHeartbeat(); startPresence(); void touchSpikeActivity({ force: true }); void refreshPresence({ force: true }); } });
  window.addEventListener('pagehide', () => { stopHeartbeat(); stopPresence(); }, { once: true });
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
    signOut: async () => { try { await window.SPIKE_CALLS?.end('Call ended because you signed out.'); } catch (_) {} return client.auth.signOut(); }
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
    async toggleFollow(db, targetId, shouldFollow) { return this.setFollow(db, targetId, shouldFollow); },

    /** QR-first mutual friendship (both directions accepted). */
    async connectViaQr(db, targetId) {
      const session = await window.SPIKE_PLATFORM.getSession();
      if (!session?.user) throw new Error('Sign in to connect on SPIKE.');
      if (!targetId || targetId === session.user.id) throw new Error('You cannot connect with yourself.');
      const { data, error } = await db.rpc('spike_connect_via_qr', { p_target_user_id: targetId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        ok: row?.ok !== false,
        already_friends: row?.already_friends === true,
        friend_id: String(row?.friend_id || targetId),
        message: row?.message || (row?.already_friends ? 'You are already SPIKE friends.' : 'You are now SPIKE friends.')
      };
    },

    /** Remove mutual friendship (both directions). */
    async unfriend(db, targetId) {
      const session = await window.SPIKE_PLATFORM.getSession();
      if (!session?.user) throw new Error('Sign in to manage friends.');
      const { data, error } = await db.rpc('spike_unfriend', { p_target_user_id: targetId });
      if (error) {
        // Fallback if RPC not yet applied: delete both directions client-side
        const me = session.user.id;
        const del = await db.from('follows').delete()
          .or(`and(follower_id.eq.${me},following_id.eq.${targetId}),and(follower_id.eq.${targetId},following_id.eq.${me})`);
        if (del.error) throw error;
        return { ok: true, friend_id: targetId };
      }
      return { ok: true, friend_id: String(data?.friend_id || targetId) };
    },

    /** Mutual friends only (QR friendship system). */
    async listMutualFriends(db, options = {}) {
      const limit = options.limit || 500;
      const offset = options.offset || 0;
      const { data, error } = await db.rpc('spike_list_mutual_friends', { p_limit: limit, p_offset: offset });
      if (!error && Array.isArray(data)) {
        return data.map(row => ({ id: String(row.user_id), created_at: row.created_at }));
      }
      // Fallback: compute mutuals from follows if RPC missing
      const session = await window.SPIKE_PLATFORM.getSession();
      if (!session?.user) throw new Error('Sign in to continue.');
      const me = session.user.id;
      const outgoing = await db.from('follows').select('following_id,created_at')
        .eq('follower_id', me).eq('status', 'accepted').limit(5000);
      if (outgoing.error) throw outgoing.error;
      const ids = (outgoing.data || []).map(r => String(r.following_id));
      if (!ids.length) return [];
      const incoming = await db.from('follows').select('follower_id,created_at')
        .eq('following_id', me).eq('status', 'accepted').in('follower_id', ids);
      if (incoming.error) throw incoming.error;
      const mutualSet = new Set((incoming.data || []).map(r => String(r.follower_id)));
      const created = new Map((outgoing.data || []).map(r => [String(r.following_id), r.created_at]));
      return ids.filter(id => mutualSet.has(id)).map(id => ({ id, created_at: created.get(id) }));
    }
  };
  window.SPIKE = Object.assign(window.SPIKE || {}, { social });
  window.dispatchEvent(new CustomEvent('spike:supabase-ready', { detail: { client } }));
})();
