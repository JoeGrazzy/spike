/* SPIKE Unified Social Relationship Service.
 * All Follow/Unfollow mutations go through the authorized database RPC.
 * Relationship IDs and counts are normalized here so every UI uses one contract.
 */
(() => {
  'use strict';

  const normalizeId = value => {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') {
      return String(value.id || value.user_id || '').trim();
    }
    return '';
  };

  const normalizeIds = values => [...new Set(
    (Array.isArray(values) ? values : []).map(normalizeId).filter(Boolean)
  )];

  function requireClient(db) {
    const client = db || window.sb || window.supabaseClient;
    if (!client?.rpc) throw new Error('SPIKE social service is not ready.');
    return client;
  }

  async function readFollowingIds(db, userId, documentData) {
    const client = requireClient(db);
    if (!userId) throw new Error('A member ID is required to read Following.');
    let data = documentData;
    if (!data) {
      const result = await client.from('app_documents').select('data')
        .eq('path', `users/${userId}`).maybeSingle();
      if (result.error) throw result.error;
      data = result.data?.data || {};
    }
    return normalizeIds(data?.following);
  }

  async function setFollow(db, targetUserId, following) {
    const client = requireClient(db);
    const target = String(targetUserId || '').trim();
    if (!target) throw new Error('A member ID is required.');
    if (typeof following !== 'boolean') throw new Error('A desired follow state is required.');
    const auth = await client.auth.getUser();
    if (auth.error) throw auth.error;
    const actor = auth.data?.user?.id;
    if (!actor) throw new Error('Please sign in to follow members.');
    if (actor === target) throw new Error('You cannot follow yourself.');
    const result = await client.rpc('spike_set_follow_v1', {
      p_target_user_id: target,
      p_following: following
    });
    if (result.error) throw result.error;
    if (typeof result.data?.following !== 'boolean' || typeof result.data?.changed !== 'boolean') {
      throw new Error('The social relationship service returned an invalid response.');
    }
    return { following: result.data.following, changed: result.data.changed, userId: target };
  }

  // Compatibility convenience for older callers: resolve the desired state from
  // the canonical owner document, then use the idempotent setter.
  async function toggleFollow(db, targetUserId) {
    const client = requireClient(db);
    const target = String(targetUserId || '').trim();
    if (!target) throw new Error('A member ID is required.');
    const auth = await client.auth.getUser();
    if (auth.error) throw auth.error;
    const actor = auth.data?.user?.id;
    if (!actor) throw new Error('Please sign in to follow members.');
    if (actor === target) throw new Error('You cannot follow yourself.');
    const current = await readFollowingIds(client, actor);
    return setFollow(client, target, !current.includes(target));
  }

  async function getCounts(db, ownerId) {
    const client = requireClient(db);
    if (!ownerId) throw new Error('A member ID is required to read connection counts.');
    const result = await client.rpc('get_spike_profile_follow_counts', { p_owner: ownerId });
    if (result.error) throw result.error;
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return {
      followers: Math.max(0, Number(row?.followers_count) || 0),
      following: Math.max(0, Number(row?.following_count) || 0)
    };
  }

  async function getRelationship(db, otherUserId) {
    const client = requireClient(db);
    if (!otherUserId) throw new Error('A member ID is required.');
    const result = await client.rpc('get_spike_viewer_relationship', { p_other_user: otherUserId });
    if (result.error) throw result.error;
    return Array.isArray(result.data) ? (result.data[0] || {}) : (result.data || {});
  }

  async function getList(db, ownerId, kind, options = {}) {
    const client = requireClient(db);
    if (!ownerId || !['followers', 'following', 'blocked'].includes(kind)) {
      throw new Error('Invalid social list request.');
    }
    const result = await client.rpc('get_spike_profile_social_list_v2', {
      p_owner: ownerId,
      p_kind: kind,
      p_limit: options.limit ?? 30,
      p_offset: options.offset ?? 0,
      p_search: options.search ?? null
    });
    if (result.error) throw result.error;
    return Array.isArray(result.data) ? result.data : [];
  }

  async function getMutuals(db, otherUserId, options = {}) {
    const client = requireClient(db);
    if (!otherUserId) throw new Error('A member ID is required.');
    const result = await client.rpc('get_spike_mutual_connections', {
      p_other_user_id: otherUserId,
      p_limit: options.limit ?? 30,
      p_offset: options.offset ?? 0,
      p_search: options.search ?? null
    });
    if (result.error) throw result.error;
    return Array.isArray(result.data) ? result.data : [];
  }

  window.SPIKE = window.SPIKE || {};
  window.SPIKE.social = Object.freeze({
    normalizeId,
    normalizeIds,
    readFollowingIds,
    setFollow,
    toggleFollow,
    getCounts,
    getRelationship,
    getList,
    getMutuals
  });
})();
