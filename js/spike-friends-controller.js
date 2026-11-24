/* SPIKE Friends & Connections — uses the existing, RLS-protected follows model. */
(() => {
  'use strict';
  if (window.__SPIKE_FRIENDS_CONTROLLER__) return;
  window.__SPIKE_FRIENDS_CONTROLLER__ = true;

  const $ = id => document.getElementById(id);
  const state = {
    db: null, me: null, tab: 'all', friends: [], suggestions: [], recommendations: [],
    verified: new Set(), busy: new Set(), presence: new Map(), blocked: [], activity: [], search: '', discoverOffset: 0, discoverHasMore: true,
    loading: false, refreshPromise: null, poll: null, presenceHandler: null, searchTimer: null, discoverQuery: '', discoverRequest: 0, recommendationRequest: 0
  };
  const escapeText = value => String(value ?? '');
  const profileUrl = id => `user-profile.html?uid=${encodeURIComponent(id)}`;
  const avatarFallback = name => (String(name || 'S').trim()[0] || 'S').toUpperCase();
  const actionIconPaths = {
    follow: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6m-3-3h6"/>',
    block: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 9 6 6m0-6-6 6"/>',
    message: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
    unfollow: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M16 11h6"/>',
    unblock: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    discover: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'
  };
  function actionIcon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false'); svg.classList.add('spike-action-icon');
    svg.innerHTML = actionIconPaths[name] || actionIconPaths.discover;
    return svg;
  }
  function labelAction(button, label, iconName) {
    button.append(actionIcon(iconName), document.createTextNode(label));
    button.classList.add('has-action-icon');
    return button;
  }
  const avatarUrl = value => {
    const raw = String(value || '').trim();
    if (/^https:\/\//i.test(raw)) return raw;
    if (!raw) return '';
    try { return state.db.storage.from('avatars').getPublicUrl(raw).data.publicUrl || ''; } catch { return ''; }
  };
  const setNotice = (message, type = 'info') => {
    const node = $('notice');
    if (!node) return;
    node.textContent = message;
    node.className = `notice ${type === 'error' ? 'error' : ''}`;
    node.hidden = !message;
  };
  const toast = (message, type = 'info') => {
    if (typeof window.spikePremiumToast === 'function') window.spikePremiumToast(message, type, 3500);
    else setNotice(message, type);
  };
  const setCount = (id, count) => { const node = $(id); if (node) node.textContent = Number(count || 0).toLocaleString(); };

  async function getProfiles(ids) {
    const clean = [...new Set((ids || []).map(String).filter(Boolean))];
    if (!clean.length) return [];
    return window.SPIKE.social.getPublicProfiles(state.db, clean);
  }

  async function loadFriends() {
    // Fetch 1,000-row pages in expanding parallel waves. Most accounts finish
    // with one request; large accounts avoid the old 100-request waterfall.
    const rows = [];
    let pageStart = 0, pageCount = 1;
    while (pageStart < 10000) {
      const pageIds = Array.from({ length: pageCount }, (_, i) => pageStart + i);
      const results = await Promise.all(pageIds.map(page =>
        state.db.from('follows').select('following_id,created_at,status')
          .eq('follower_id', state.me.id).eq('status', 'accepted')
          .order('created_at', { ascending: false }).range(page * 1000, page * 1000 + 999)
      ));
      let hasFullPage = false;
      for (const result of results) {
        if (result.error) throw result.error;
        const batch = Array.isArray(result.data) ? result.data : [];
        rows.push(...batch);
        if (batch.length === 1000) hasFullPage = true;
      }
      pageStart += pageCount;
      if (!hasFullPage) break;
      pageCount = Math.min(pageCount * 2, 10 - pageStart);
      if (pageCount <= 0) break;
    }
    const ids = rows.map(row => String(row.following_id));
    const profiles = await getProfiles(ids);
    const map = new Map(profiles.map(person => [String(person.id), person]));
    state.friends = ids.map(id => {
      const person = map.get(id) || {};
      return { id, display_name: person.display_name || person.username || 'SPIKE member',
        username: person.username || '', avatar_url: avatarUrl(person.avatar_path || person.avatar_url),
        verified: person.verified === true };
    });
  }

  async function loadPresence() {
    let data;
    if (window.SPIKE_PRESENCE) { const snapshot=window.SPIKE_PRESENCE.getSnapshot(); data=snapshot.length?snapshot:await window.SPIKE_PRESENCE.refresh(); }
    else { const result=await state.db.rpc('spike_get_friends_presence'); if(result.error)throw result.error; data=result.data; }
    state.presence = new Map((Array.isArray(data) ? data : []).map(row => [String(row.user_id), {
      online: row.is_online === true,
      lastSeenAt: row.last_seen_at || null
    }]));
    state.friends = state.friends.map(person => ({ ...person, presence: state.presence.get(person.id) || null }));
  }

  async function loadBlocked() {
    const { data, error } = await state.db.from('blocks').select('blocked_id,created_at')
      .eq('blocker_id', state.me.id).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    const ids = (data || []).map(row => String(row.blocked_id));
    let profiles = [];
    if (ids.length) {
      const result = await state.db.from('profiles').select('id,username,display_name,avatar_path').in('id', ids);
      if (result.error) throw result.error;
      profiles = (result.data || []).map(person => ({
        id: String(person.id), username: person.username, display_name: person.display_name,
        avatar_url: avatarUrl(person.avatar_path)
      }));
    }
    const map = new Map(profiles.map(person => [String(person.id), person]));
    state.blocked = (data || []).map(row => ({ ...(map.get(String(row.blocked_id)) || {
      id: String(row.blocked_id), display_name: 'Private or unavailable account', username: '', avatar_url: '', profileVisible: false
    }), id: String(row.blocked_id) }));
  }


  async function loadActivity() {
    const { data, error } = await state.db.from('follows')
      .select('follower_id,following_id,status,created_at')
      .or(`follower_id.eq.${state.me.id},following_id.eq.${state.me.id}`)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false }).limit(30);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const actorIds = rows.map(row => row.follower_id === state.me.id ? row.following_id : row.follower_id);
    const profiles = await getProfiles(actorIds);
    const map = new Map(profiles.map(person => [String(person.id), person]));
    state.activity = rows.map(row => {
      const outgoing = row.follower_id === state.me.id;
      const personId = String(outgoing ? row.following_id : row.follower_id);
      const person = map.get(personId);
      const personName = person?.display_name || person?.username || 'SPIKE member';
      const label = outgoing ? `You started following ${personName}` : `${personName} started following you`;
      return { personId, personName, label, createdAt: row.created_at };
    });
  }

  function renderActivity() {
    const host = $('connectionActivityContainer');
    if (!host) return;
    const fragment = document.createDocumentFragment();
    state.activity.forEach(item => {
      const row = document.createElement('article'); row.className = 'connection-activity-row';
      const copy = document.createElement('p'); copy.textContent = item.label;
      const time = document.createElement('time');
      if (item.createdAt) { time.dateTime = item.createdAt; time.textContent = new Date(item.createdAt).toLocaleString(); }
      else time.textContent = 'Time unavailable';
      row.append(copy, time); fragment.append(row);
    });
    if (!state.activity.length) {
      const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Your recent connection activity will appear here.'; fragment.append(empty);
    }
    host.replaceChildren(fragment);
  }

  async function loadSuggestions(reset = true, query = state.discoverQuery) {
    if (reset) {
      state.discoverOffset = 0;
      state.suggestions = [];
      state.discoverHasMore = true;
      state.discoverQuery = String(query || '').trim().slice(0, 80);
    }
    if (!state.discoverHasMore) return;
    const request = ++state.discoverRequest;
    const start = state.discoverOffset;
    const { data, error } = await state.db.rpc('spike_discover_public_members', {
      p_query: state.discoverQuery || null,
      p_limit: 40,
      p_offset: start
    });
    if (error) throw error;
    if (request !== state.discoverRequest) return;
    const rows = Array.isArray(data) ? data : [];
    state.discoverOffset += rows.length;
    state.discoverHasMore = rows.length === 40;
    const excluded = new Set([
      ...state.friends.map(person => person.id),
            ...state.recommendations.map(person => person.id),
      state.me.id
    ]);
    const existing = new Set(state.suggestions.map(person => person.id));
    const normalized = rows.filter(row => !excluded.has(String(row.id)) && !existing.has(String(row.id))).map(row => ({
      id: String(row.id),
      display_name: row.display_name || 'SPIKE member',
      username: row.username || '',
      avatar_url: row.avatar_url || '',
      verified: row.verified === true,
      spike_id: row.spike_id || ''
    }));
    state.suggestions.push(...normalized);
  }

  async function loadRecommendations() {
    const request = ++state.recommendationRequest;
    const { data, error } = await state.db.rpc('spike_get_friend_recommendations', {
      p_limit: 12,
      p_offset: 0
    });
    if (error) throw error;
    if (request !== state.recommendationRequest) return;
    const rows = Array.isArray(data) ? data : [];
    const excluded = new Set([
      ...state.friends.map(person => person.id),
            ...state.suggestions.map(person => person.id),
      state.me.id
    ]);
    state.recommendations = rows.filter(row => !excluded.has(String(row.id))).map(row => ({
      id: String(row.id),
      display_name: row.display_name || 'SPIKE member',
      username: row.username || '',
      avatar_url: row.avatar_url || '',
      verified: row.verified === true,
      spike_id: row.spike_id || '',
      recommendationReason: row.reason_label || `${Number(row.mutual_count || 0)} mutual connections`
    }));
  }

  function makePerson(person, mode) {
    const id = String(person.id || '');
    const name = person.display_name || person.username || 'SPIKE member';
    const article = document.createElement('article');
    article.className = mode === 'suggestion' ? 'suggestion-card network-recommendation-card' : mode === 'blocked' ? 'friend-card blocked-member-card' : 'friend-card';
    article.dataset.personId = id;
    article.dataset.search = `${name} ${person.username || ''}`.toLocaleLowerCase();

    const avatar = document.createElement('a');
    avatar.className = 'friend-avatar friend-profile-link';
    const profileVisible = person.profileVisible !== false;
    if (profileVisible) avatar.href = profileUrl(id);
    else { avatar.removeAttribute('href'); avatar.setAttribute('aria-disabled', 'true'); }
    avatar.setAttribute('aria-label', profileVisible ? `View ${name}'s profile` : 'Profile unavailable');
    if (person.avatar_url) {
      const img = document.createElement('img');
      img.src = person.avatar_url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.onerror = () => { img.remove(); avatar.textContent = avatarFallback(name); };
      avatar.append(img);
    } else avatar.textContent = avatarFallback(name);

    const info = document.createElement('div'); info.className = 'friend-info';
    const title = document.createElement(profileVisible ? 'a' : 'span'); title.className = 'name friend-profile-link';
    if (profileVisible) title.href = profileUrl(id);
    title.textContent = name;
    if (person.verified === true) {
      const badge = document.createElement('span'); badge.className = 'social-verified-badge'; badge.textContent = '✓';
      badge.setAttribute('role', 'img'); badge.setAttribute('aria-label', 'Verified account'); title.append(' ', badge);
    }
    const sub = document.createElement('div'); sub.className = 'sub';
    sub.textContent = person.username ? `@${String(person.username).replace(/^@/, '')}` : 'SPIKE member';
    info.append(title, sub);
    if (mode === 'suggestion' && person.recommendationReason) {
      const reason = document.createElement('div');
      reason.className = 'mutual recommendation-reason';
      reason.append(actionIcon('discover'), document.createTextNode(person.recommendationReason));
      info.append(reason);
    }
    const actions = document.createElement('div'); actions.className = 'friend-action';

    if (mode === 'suggestion') {
      const follow = document.createElement('button'); follow.type = 'button'; follow.className = 'connection-action primary'; labelAction(follow, 'Follow', 'follow');
      follow.dataset.action = 'follow'; follow.dataset.userId = id;
      const block = document.createElement('button'); block.type = 'button'; block.className = 'connection-action secondary'; labelAction(block, 'Block', 'block');
      block.dataset.action = 'block'; block.dataset.userId = id; actions.append(follow, block);
    } else if (mode === 'blocked') {
      const unblock = document.createElement('button'); unblock.type = 'button'; unblock.className = 'connection-action outline'; labelAction(unblock, 'Unblock', 'unblock');
      unblock.dataset.action = 'unblock'; unblock.dataset.userId = id; actions.append(unblock);
    } else {
      const message = document.createElement('a'); message.className = 'connection-action message-link'; message.href = `message.html?user_id=${encodeURIComponent(id)}`; labelAction(message, 'Message', 'message');
      const unfollow = document.createElement('button'); unfollow.type = 'button'; unfollow.className = 'connection-action unfriend-btn'; labelAction(unfollow, 'Unfollow', 'unfollow');
      unfollow.dataset.action = 'unfollow'; unfollow.dataset.userId = id;
      const block = document.createElement('button'); block.type = 'button'; block.className = 'connection-action secondary'; labelAction(block, 'Block', 'block');
      block.dataset.action = 'block'; block.dataset.userId = id;
      actions.append(message, unfollow, block);
      const presence = person.presence;
      const status = document.createElement('div'); status.className = `friend-presence ${presence?.online ? 'is-online' : ''}`;
      status.textContent = presence?.online ? 'Online now' : presence?.lastSeenAt ? `Last seen ${new Date(presence.lastSeenAt).toLocaleString()}` : 'Status unavailable';
      info.append(status);
    }
    article.append(avatar, info, actions);
    return article;
  }

  function renderList(containerId, rows, mode, emptyText) {
    const host = $(containerId); if (!host) return;
    const fragment = document.createDocumentFragment();
    rows.forEach(row => fragment.append(makePerson(row, mode)));
    host.replaceChildren(fragment);
    if (!rows.length) {
      const empty = document.createElement('div'); empty.className = 'empty-state';
      const icon = document.createElement('i'); icon.className = 'fas fa-user-group'; icon.setAttribute('aria-hidden', 'true');
      const text = document.createElement('p'); text.textContent = emptyText;
      empty.append(icon, text); host.append(empty);
    }
  }


  function render() {
    const visibleFriends = state.tab === 'online' ? state.friends.filter(person => person.presence?.online) : state.friends;
    renderList('friendsContainer', visibleFriends, 'friend', state.tab === 'online' ? 'No followed members are online right now.' : 'You are not following anyone yet. Discover people to get started.');
    renderList('networkRecommendationsContainer', state.recommendations, 'suggestion', 'No recommendations yet.');
    renderList('suggestionsContainer', state.suggestions, 'suggestion', 'No new public members match your search.');
    renderList('blockedContainer', state.blocked, 'blocked', 'You have not blocked anyone.');
    renderActivity();
    setCount('allCount', state.friends.length);
    setCount('onlineCount', state.friends.filter(person => person.presence?.online).length);
    setCount('friendsCount', state.friends.length);
    setCount('networkCount', state.recommendations.length);
    setCount('suggestionCount', state.suggestions.length);
    setCount('blockedCount', state.blocked.length);
    setCount('blockedSectionCount', state.blocked.length);
    const more = $('friendsLoadMore');
    if (more) more.hidden = !state.discoverHasMore || state.tab !== 'suggestions';
    applySearch();
  }

  function activateTab(tab) {
    state.tab = tab;
    document.querySelectorAll('#tabs [data-tab]').forEach(button => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    $('friendsSection').hidden = !['all', 'online'].includes(tab);
    $('suggestionsSection').hidden = tab !== 'suggestions';
    $('blockedSection').hidden = tab !== 'blocked';
    $('activitySection').hidden = tab !== 'activity';
    render();
    if (tab === 'suggestions') $('suggestionsSection').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function applySearch() {
    const query = String($('searchInput')?.value || '').trim().toLocaleLowerCase();
    const clear = $('clearSearchButton'); if (clear) clear.hidden = !query;
    document.querySelectorAll('#content [data-search]').forEach(node => { node.hidden = Boolean(query) && !node.dataset.search.includes(query); });
    if (query && state.tab === 'suggestions' && state.suggestions.length === 0) setNotice('No matching people found in the profiles currently visible to your account.');
    else if (!query) setNotice('');
  }

  async function withBusy(key, button, task) {
    if (state.busy.has(key)) return;
    state.busy.add(key); if (button) button.disabled = true;
    try { await task(); }
    catch (error) { console.error('[SPIKE FRIENDS]', error); toast(error?.message || 'This action could not be completed. Please try again.', 'error'); }
    finally { state.busy.delete(key); if (button?.isConnected) button.disabled = false; }
  }

  async function handleAction(button) {
    const action = button.dataset.action;
    const userId = button.dataset.userId;
    const key = `${action}:${userId || ''}`;
    await withBusy(key, button, async () => {
      if (action === 'follow') {
        const existing = await state.db.from('follows').select('status').eq('follower_id', state.me.id).eq('following_id', userId).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data?.status === 'accepted') { toast('You already follow this member.', 'info'); }
        else {
          if (existing.data) { const { error } = await state.db.from('follows').delete().eq('follower_id', state.me.id).eq('following_id', userId); if (error) throw error; }
          const { error } = await state.db.from('follows').insert({ follower_id: state.me.id, following_id: userId, status: 'accepted' });
          if (error) throw new Error('This account cannot be followed directly. No follow request was sent.');
          toast('You are now following this member.', 'success');
        }
      } else if (action === 'unfollow') {
        if (!window.confirm('Unfollow this member?')) return;
        await window.SPIKE.social.setFollow(state.db, userId, false);
        toast('You unfollowed this member.', 'success');
      } else if (action === 'block') {
        if (!window.confirm('Block this member? They will no longer be able to connect with you.')) return;
        const { error } = await state.db.rpc('spike_block_member', { p_target_id: userId });
        if (error) throw error;
        toast('Member blocked.', 'success');
      } else if (action === 'unblock') {
        const { error } = await state.db.rpc('spike_unblock_member', { p_target_id: userId });
        if (error) throw error;
        toast('Member unblocked.', 'success');
      }
      await refresh();
    });
  }

  function refresh() {
    if (state.refreshPromise) return state.refreshPromise;
    state.loading = true;
    setNotice('Updating your connections…');
    state.refreshPromise = (async () => {
      try {
        await Promise.all([loadFriends(), loadBlocked(), loadActivity()]);
        await loadPresence();
        if (state.tab === 'suggestions' || state.suggestions.length) {
          await loadRecommendations();
          await loadSuggestions(true, state.discoverQuery);
        }
        render(); setNotice('');
      } catch (error) {
        console.error('[SPIKE FRIENDS LOAD]', error);
        setNotice(error?.message || 'SPIKE could not load your connections. Check your connection and retry.', 'error');
        ['friendsContainer', 'suggestionsContainer', 'blockedContainer'].forEach(id => {
          const host = $(id); if (host && !host.children.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Unable to load this section. Refresh the page to retry.'; host.append(p); }
        });
      } finally {
        state.loading = false;
        state.refreshPromise = null;
      }
    })();
    return state.refreshPromise;
  }

  async function boot() {
    const deadline = Date.now() + 12000;
    while (!window.SPIKE_SUPABASE_READY && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    state.db = window.SPIKE_SUPABASE || window.db;
    if (!state.db || !window.SPIKE?.social) throw new Error('SPIKE connection services did not start. Reload the page.');
    const { data, error } = await state.db.auth.getUser();
    if (error) throw error;
    if (!data?.user) { location.replace('/?next=friends.html'); return; }
    state.me = data.user;
    await refresh();
    document.addEventListener('click', event => {
      const button = event.target.closest('#content button[data-action]');
      if (button) handleAction(button);
    });
    $('tabs')?.addEventListener('click', event => {
      const button = event.target.closest('[data-tab]'); if (!button) return;
      const tab = button.dataset.tab;
      if (tab === 'suggestions' && (!state.suggestions.length || !state.recommendations.length)) {
        loadRecommendations().then(() => loadSuggestions(true, $('searchInput')?.value?.trim() || ''))
          .then(render).catch(error => setNotice(error.message || 'People discovery could not load. Try again.', 'error'));
      }
      activateTab(tab);
    });
    $('searchButton')?.addEventListener('click', () => $('searchInput')?.focus());
    $('searchInput')?.addEventListener('input', () => {
      applySearch();
      if (state.tab === 'suggestions') {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => loadSuggestions(true, $('searchInput').value.trim()).then(render).catch(error => setNotice(error.message || 'People search failed. Try again.', 'error')), 280);
      }
    });
    $('clearSearchButton')?.addEventListener('click', () => { $('searchInput').value = ''; applySearch(); $('searchInput').focus(); });
    $('friendsLoadMore')?.addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true; button.textContent = 'Loading…';
      try { await loadSuggestions(false); render(); }
      catch (error) { toast(error.message || 'Could not load more people.', 'error'); }
      finally { button.disabled = false; button.textContent = 'Load more people'; }
    });
    // Connection data is mostly static; refresh only presence in the background.
    // Re-fetching follows, blocks, recommendations and activity every 30s caused
    // avoidable database traffic and repeated full-list rendering.
    const refreshPresenceOnly = rows => {
      if (document.hidden || !navigator.onLine || state.refreshPromise) return;
      const data=Array.isArray(rows)?rows:(window.SPIKE_PRESENCE?.getSnapshot?.()||[]);
      state.presence=new Map(data.map(row=>[String(row.user_id),{online:row.is_online===true,lastSeenAt:row.last_seen_at||null}]));
      state.friends=state.friends.map(person=>({...person,presence:state.presence.get(person.id)||null}));
      render();
    };
    if(window.SPIKE_PRESENCE){
      state.presenceHandler=event=>refreshPresenceOnly(event.detail?.rows);
      window.addEventListener('spike:presence-update',state.presenceHandler);
      refreshPresenceOnly();
    } else {
      state.poll=setInterval(async()=>{try{await loadPresence();render();}catch(error){console.info('[SPIKE FRIENDS PRESENCE]',error?.message||error);}},60000);
    }
    window.addEventListener('pagehide',()=>{if(state.poll)clearInterval(state.poll);if(state.presenceHandler)window.removeEventListener('spike:presence-update',state.presenceHandler);},{once:true});
  }

  boot().catch(error => {
    console.error('[SPIKE FRIENDS STARTUP]', error);
    setNotice(error?.message || 'Friends could not start. Please reload.', 'error');
  });
})();
