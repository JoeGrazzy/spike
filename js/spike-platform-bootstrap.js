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

  // SPIKE allows one active Android device per account. Desktop and iOS
  // sessions are intentionally unaffected. A stable origin-local ID keeps
  // multiple tabs on the same Android browser from logging one another out.
  const ANDROID_DEVICE_KEY = 'spike.android.device-id.v1';
  const ANDROID_CHECK_INTERVAL = 20000;
  const isAndroidDevice = /Android/i.test(navigator.userAgent || '');
  let androidDeviceId = null;
  let androidDeviceRegistered = false;
  let androidDeviceCheckTimer = null;
  let androidDeviceCheckBusy = false;
  let androidDeviceLogoutStarted = false;
  const getAndroidDeviceId = () => {
    if (androidDeviceId) return androidDeviceId;
    try {
      androidDeviceId = localStorage.getItem(ANDROID_DEVICE_KEY);
      if (!androidDeviceId) {
        androidDeviceId = (window.crypto?.randomUUID?.() || `spike-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
        localStorage.setItem(ANDROID_DEVICE_KEY, androidDeviceId);
      }
    } catch (error) {
      console.warn('[SPIKE device security] Persistent device storage unavailable:', error?.message || error);
      androidDeviceId = `spike-tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return androidDeviceId;
  };
  const showAndroidDeviceReplacedMessage = () => {
    let panel = document.getElementById('spike-android-device-replaced');
    if (panel) return;
    panel = document.createElement('section');
    panel.id = 'spike-android-device-replaced';
    panel.setAttribute('role', 'alertdialog');
    panel.setAttribute('aria-live', 'assertive');
    panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:22px;background:rgba(5,8,18,.96);color:#f8fafc;font:16px/1.5 system-ui,sans-serif;text-align:center';
    const card = document.createElement('div');
    card.style.cssText = 'width:min(100%,440px);padding:28px 22px;border:1px solid rgba(167,139,250,.42);border-radius:22px;background:#11182b;box-shadow:0 24px 80px rgba(0,0,0,.45)';
    const icon = document.createElement('div'); icon.textContent = '🔐'; icon.style.cssText = 'font-size:34px;margin-bottom:10px';
    const title = document.createElement('h1'); title.textContent = 'SPIKE Security'; title.style.cssText = 'font-size:23px;margin:0 0 12px';
    const copy = document.createElement('p'); copy.textContent = 'Your SPIKE account was opened on another Android device. For your security, only one Android device can use this account at a time. This device has been signed out.'; copy.style.cssText = 'margin:0 0 20px;color:#cbd5e1';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Return to sign in'; button.style.cssText = 'padding:12px 20px;border:0;border-radius:12px;background:#a78bfa;color:#171329;font-weight:800';
    button.addEventListener('click', () => location.replace('/'));
    card.append(icon, title, copy, button); panel.append(card); document.body.append(panel);
  };
  if (new URLSearchParams(location.search).get('reason') === 'android_device_replaced') {
    window.addEventListener('DOMContentLoaded', showAndroidDeviceReplacedMessage, { once: true });
  }
  const stopAndroidDeviceChecks = () => {
    if (androidDeviceCheckTimer !== null) window.clearInterval(androidDeviceCheckTimer);
    androidDeviceCheckTimer = null;
  };
  const signOutReplacedAndroidDevice = async () => {
    if (androidDeviceLogoutStarted) return;
    androidDeviceLogoutStarted = true;
    stopAndroidDeviceChecks();
    try { await window.SPIKE_CALLS?.end('Call ended because this account was opened on another Android device.'); } catch (_) {}
    try { await client.auth.signOut({ scope: 'local' }); }
    catch (error) { console.error('[SPIKE device security] Local sign-out failed:', error); }
    showAndroidDeviceReplacedMessage();
  };
  const checkAndroidDeviceIsCurrent = async () => {
    if (!isAndroidDevice || !androidDeviceRegistered || !currentSession?.user || androidDeviceCheckBusy || document.visibilityState === 'hidden' || !navigator.onLine || androidDeviceLogoutStarted) return;
    androidDeviceCheckBusy = true;
    try {
      const { data, error } = await client.rpc('spike_is_current_android_device', { p_device_id: getAndroidDeviceId() });
      if (error) throw error;
      if (data === false) await signOutReplacedAndroidDevice();
    } catch (error) {
      console.warn('[SPIKE device security] Could not verify active Android device; keeping session during a temporary failure:', error?.message || error);
    } finally { androidDeviceCheckBusy = false; }
  };
  const registerAndroidDevice = async (session) => {
    if (!isAndroidDevice || !session?.user || androidDeviceLogoutStarted) return;
    try {
      const { error } = await client.rpc('spike_register_android_device', {
        p_device_id: getAndroidDeviceId(), p_user_agent: navigator.userAgent || 'Android'
      });
      if (error) throw error;
      androidDeviceRegistered = true;
      if (androidDeviceCheckTimer === null) androidDeviceCheckTimer = window.setInterval(() => { void checkAndroidDeviceIsCurrent(); }, ANDROID_CHECK_INTERVAL);
      window.dispatchEvent(new CustomEvent('spike:android-device-registered'));
    } catch (error) {
      androidDeviceRegistered = false;
      console.error('[SPIKE device security] Could not register this Android device:', error?.message || error);
    }
  };

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
      if (isAndroidDevice && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) window.setTimeout(() => { void registerAndroidDevice(currentSession); }, 0);
      startHeartbeat();
      startPresence();
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        window.setTimeout(() => { void touchSpikeActivity({ force: true }); }, 0);
      }
    } else {
      stopHeartbeat();
      stopPresence();
      stopAndroidDeviceChecks();
      androidDeviceRegistered = false;
      if (event === 'SIGNED_OUT') { lastActivityHeartbeatAt = 0; presenceRows = []; presenceLoaded = true; lastPresenceRefreshAt = 0; window.dispatchEvent(new CustomEvent('spike:presence-update', { detail: { rows: [], at: 0 } })); }
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { stopHeartbeat(); stopPresence(); }
    else { startHeartbeat(); startPresence(); void touchSpikeActivity(); void checkAndroidDeviceIsCurrent(); }
  });
  window.addEventListener('online', () => { startHeartbeat(); startPresence(); void touchSpikeActivity({ force: true }); });
  window.addEventListener('focus', () => { if (!document.hidden) { startHeartbeat(); startPresence(); void touchSpikeActivity({ force: true }); void refreshPresence({ force: true }); void checkAndroidDeviceIsCurrent(); } });
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
        following: mutual,
        friendship: mutual ? 'mutual' : outgoing?.status === 'pending' ? 'outgoing_pending' : incoming?.status === 'pending' ? 'incoming_pending' : 'none',
        request_id: incoming?.id || null
      };
    },
    // Compatibility wrapper: never create one-way accepted follows from a profile CTA.
    async setFollow(db, targetId, shouldFollow) {
      if (shouldFollow) return this.sendFriendRequest(db, targetId);
      return this.unfriend(db, targetId);
    },
    async toggleFollow(db, targetId, shouldFollow) { return this.setFollow(db, targetId, shouldFollow); },

    /** Send a pending friend request (QR / Add friend). */
    async sendFriendRequest(db, targetId) {
      const session = await window.SPIKE_PLATFORM.getSession();
      if (!session?.user) throw new Error('Sign in to send a friend request.');
      if (!targetId || targetId === session.user.id) throw new Error('You cannot send a request to yourself.');
      const { data, error } = await db.rpc('spike_send_friend_request', { p_target_user_id: targetId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        ok: row?.ok !== false,
        state: row?.state || 'pending_out',
        friend_id: String(targetId),
        message: row?.message || 'Friend request sent.'
      };
    },

    /** Alias: QR confirm uses the same request path (not instant friendship). */
    async connectViaQr(db, targetId) {
      return this.sendFriendRequest(db, targetId);
    },

    async acceptFriendRequest(db, fromUserId) {
      const { data, error } = await db.rpc('spike_accept_friend_request', { p_from_user_id: fromUserId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { ok: true, state: 'friends', message: row?.message || 'You are now SPIKE friends.' };
    },

    async declineFriendRequest(db, fromUserId) {
      const { data, error } = await db.rpc('spike_decline_friend_request', { p_from_user_id: fromUserId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { ok: true, state: 'declined', message: row?.message || 'Request declined.' };
    },

    async cancelFriendRequest(db, targetId) {
      const { data, error } = await db.rpc('spike_cancel_friend_request', { p_target_user_id: targetId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { ok: true, state: 'cancelled', message: row?.message || 'Request cancelled.' };
    },

    async listIncomingRequests(db, limit = 100) {
      const { data, error } = await db.rpc('spike_list_incoming_friend_requests', { p_limit: limit });
      if (error) throw error;
      return (data || []).map(r => ({ id: String(r.user_id), created_at: r.created_at }));
    },

    async listOutgoingRequests(db, limit = 100) {
      const { data, error } = await db.rpc('spike_list_outgoing_friend_requests', { p_limit: limit });
      if (error) throw error;
      return (data || []).map(r => ({ id: String(r.user_id), created_at: r.created_at }));
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
        if (del.error) throw del.error;
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
