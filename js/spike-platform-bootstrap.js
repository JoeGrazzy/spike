/* Classic-script bridge for the original SPIKE controllers and the new Supabase project. */
(() => {
  'use strict';
  const URL = 'https://veagqanfilmbchlvlpcc.supabase.co';
  const KEY = 'sb_publishable_kf1MuQm41BREfWDIKWEXzg_jQlA7_mE';
  const sdk = window.supabase;
  if (!sdk || typeof sdk.createClient !== 'function') {
    console.error('[SPIKE] Supabase SDK did not load. Check the CDN connection and CSP.');
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
        friendship: mutual ? 'friends' : incoming?.status === 'requested' ? 'incoming' : outgoing?.status === 'requested' ? 'outgoing' : 'none',
        request_id: incoming?.id || null
      };
    },
    async setFollow(db, targetId, shouldFollow) {
      const session = await window.SPIKE_PLATFORM.getSession();
      if (!session?.user) throw new Error('Sign in to continue.');
      const userId = session.user.id;
      if (shouldFollow) {
        const existing = await db.from('follows').select('status').eq('follower_id', userId).eq('following_id', targetId).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) return { following: existing.data.status === 'accepted', requested: existing.data.status === 'requested' };
        const { data, error } = await db.from('follows')
          .insert({ follower_id: userId, following_id: targetId, status: 'requested' })
          .select('status').single();
        if (error) throw error;
        return { following: data.status === 'accepted', requested: data.status === 'requested' };
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
