/* SPIKE dedicated Followers / Following pages.
 * One tap from a profile count navigates directly to the full list page.
 * List pages are direct destinations, not an intermediate profile surface.
 */
(() => {
  'use strict';

  const CONFIG = {
    url: 'https://cjqpyndceqyqsijihxbb.supabase.co',
    key: 'sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw',
    pageSize: 30
  };
  const params = new URLSearchParams(location.search);
  // One canonical list renderer serves followers, following and mutual connections.
  // Query-string kind wins so legacy routes can forward without duplicating page code.
  const requestedKind = new URLSearchParams(location.search).get('kind');
  const kind = ['followers', 'following', 'mutuals'].includes(requestedKind)
    ? requestedKind
    : document.body.dataset.socialKind;
  const ownerId = params.get('uid') || '';
  const validKinds = new Set(['followers', 'following', 'mutuals']);
  const $ = id => document.getElementById(id);
  const state = {
    db: null, me: null, offset: 0, loading: false, request: 0,
    rows: [], followingIds: new Set(), followingLoaded: false, ownerIsMe: false, hasMore: false,
    pendingReload: false, mutualTotal: null, followStateUnavailable: false, socialChannels: [], realtimeTimer: null, pollTimer: null, searchTimer: null
  };

  const profileUrl = id => `profile.html?uid=${encodeURIComponent(id)}`;
  const avatarFallback = name => (String(name || 'S').trim()[0] || 'S').toUpperCase();

  function setStatus(message, type = 'info') {
    const node = $('socialStatus');
    if (!node) return;
    node.textContent = message;
    node.dataset.type = type;
    node.hidden = !message;
  }

  function toast(message, type = 'info') {
    const node = $('socialToast');
    if (!node) return;
    node.textContent = message;
    node.dataset.type = type;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.hidden = true; }, 3200);
  }

  async function loadMyFollowing() {
    state.followingIds = new Set(await window.SPIKE.social.readFollowingIds(state.db, state.me.id));
    state.followingLoaded = true;
    state.followStateUnavailable = false;
  }

  function buildPersonRow(person) {
    const id = String(person.id || '');
    const name = String(person.display_name || person.username || 'SPIKE member');
    const username = person.username === '__profile_missing__' ? '' : String(person.username || '');
    const avatarUrl = String(person.avatar_url || '');
    const missing = person.username === '__profile_missing__';
    const article = document.createElement('article');
    article.className = 'social-person';
    article.dataset.search = `${name} ${username}`.toLowerCase();

    const link = document.createElement(missing ? 'div' : 'a');
    link.className = 'social-person-main';
    if (!missing) link.href = profileUrl(id);
    if (avatarUrl) {
      const img = document.createElement('img');
      img.className = 'social-avatar';
      img.src = avatarUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => { img.remove(); const fallback = document.createElement('span'); fallback.className = 'social-avatar social-avatar-fallback'; fallback.textContent = avatarFallback(name); link.prepend(fallback); };
      link.append(img);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'social-avatar social-avatar-fallback';
      fallback.textContent = avatarFallback(name);
      link.append(fallback);
    }
    const copy = document.createElement('span');
    copy.className = 'social-person-copy';
    const strong = document.createElement('strong');
    strong.textContent = missing ? 'Unavailable account' : name;
    const small = document.createElement('small');
    small.textContent = missing ? 'Profile details are unavailable' : (username ? `@${username.replace(/^@/, '')}` : 'SPIKE member');
    copy.append(strong, small);
    link.append(copy);
    article.append(link);

    const canRemoveMissingFollow = missing && state.ownerIsMe && kind === 'following';
    if (id !== state.me.id && state.followingLoaded && (!missing || canRemoveMissingFollow)) {
      const actions = document.createElement('div');
      actions.className = 'social-person-actions';
      const following = state.followingIds.has(id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `social-follow-button${following ? ' is-following' : ''}`;
      button.dataset.action = 'follow';
      button.dataset.userId = id;
      button.textContent = canRemoveMissingFollow ? 'Remove' : (following ? (state.ownerIsMe && kind === 'following' ? 'Unfollow' : 'Following') : 'Follow');
      button.setAttribute('aria-label', canRemoveMissingFollow ? 'Remove unavailable account from Following' : (following ? 'Following' : 'Follow'));
      button.setAttribute('aria-pressed', following ? 'true' : 'false');
      button.disabled = false;
      actions.append(button);

      if (state.ownerIsMe && !missing) {
        const report = document.createElement('button');
        report.type = 'button';
        report.className = 'social-secondary-action';
        report.dataset.action = 'report';
        report.dataset.userId = id;
        report.dataset.userName = name;
        report.textContent = 'Report';
        actions.append(report);
        const block = document.createElement('button');
        block.type = 'button';
        block.className = 'social-secondary-action';
        block.dataset.action = 'block';
        block.dataset.userId = id;
        block.dataset.userName = name;
        block.textContent = 'Block';
        actions.append(block);
      }
      article.append(actions);
    }
    return article;
  }

  function applySearch() {
    const query = String($('socialSearch')?.value || '').trim();
    const visible = state.rows.length;
    const empty = $('socialSearchEmpty');
    if (empty) empty.hidden = visible > 0 || state.loading;
    const note = $('searchScope');
    if (note) note.textContent = state.followStateUnavailable ? 'Follow controls are temporarily unavailable. Refresh to retry.' : (query ? 'Searching all connections on SPIKE…' : (kind === 'mutuals' ? 'Search covers all mutual connections.' : 'Search covers the complete connections list.'));
  }

  function queueSocialRefresh() {
    clearTimeout(state.realtimeTimer);
    state.realtimeTimer = setTimeout(async () => {
      if (document.hidden) return;
      if (kind !== 'mutuals') await loadMyFollowing().catch(error => { state.followingLoaded = false; state.followStateUnavailable = true; console.warn('[SPIKE SOCIAL FOLLOW STATE]', error); });
      await Promise.allSettled([refreshConnectionCount(), loadPage(false)]);
    }, 180);
  }

  async function subscribeSocialUpdates(session) {
    try {
      if (session?.access_token) await state.db.realtime.setAuth(session.access_token);
      const topics = [...new Set([ownerId, state.me.id])];
      for (const uid of topics) {
        const channel = state.db.channel(`user:${uid}:social`, { config: { private: true } })
          .on('broadcast', { event: 'social_connection_changed' }, queueSocialRefresh)
          .subscribe(status => {
            if (status === 'SUBSCRIBED') queueSocialRefresh();
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              console.warn('[SPIKE SOCIAL REALTIME]', uid, status);
            }
          });
        state.socialChannels.push(channel);
      }
    } catch (error) {
      console.warn('[SPIKE SOCIAL REALTIME] Subscription unavailable; polling fallback enabled.', error);
    }
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => {
      if (!document.hidden && navigator.onLine) queueSocialRefresh();
    }, 60000);
  }

  async function loadPage(append = false) {
    if (state.loading) {
      if (!append) state.pendingReload = true;
      return;
    }
    state.loading = true;
    const request = ++state.request;
    const list = $('socialList');
    const loadMore = $('loadMore');
    const search = String($('socialSearch')?.value || '').trim();
    if (!append) {
      list.replaceChildren();
      setStatus('Loading connections…');
    } else {
      loadMore.disabled = true;
      loadMore.textContent = 'Loading…';
    }
    try {
      const options = { limit: CONFIG.pageSize, offset: append ? state.offset : 0, search };
      const people = kind === 'mutuals'
        ? await window.SPIKE.social.getMutuals(state.db, ownerId, options)
        : await window.SPIKE.social.getList(state.db, ownerId, kind, options);
      if (request !== state.request) return;
      if (!append) state.rows = [];
      state.rows.push(...people);
      people.forEach(person => list.append(buildPersonRow(person)));
      const mutualLink = $('mutualLink');
      if (mutualLink && !state.ownerIsMe && kind !== 'mutuals') mutualLink.hidden = false;
      state.offset = (append ? state.offset : 0) + people.length;
      state.hasMore = people.length === CONFIG.pageSize;
      loadMore.hidden = !state.hasMore;
      loadMore.disabled = false;
      loadMore.textContent = 'Load more';
      if (kind === 'mutuals' && !search && state.mutualTotal === null) {
        state.mutualTotal = Number(people[0]?.total_count || 0);
        $('connectionCount').textContent = state.mutualTotal.toLocaleString();
      }
      $('socialSearchEmpty').hidden = true;
      setStatus(people.length || state.rows.length ? '' : (search ? 'No matching members found.' : `No ${kind === 'mutuals' ? 'mutual connections' : kind} yet.`));
      applySearch();
    } catch (error) {
      if (request !== state.request) return;
      console.error('[SPIKE SOCIAL CONNECTIONS]', error);
      const isPrivate = /private|permission|chosen to keep/i.test(error?.message || '');
      if (isPrivate) $('connectionCount').textContent = '—';
      setStatus(isPrivate
        ? 'This member has chosen to keep their connections private.'
        : (error?.message || 'Could not load connections. Please try again.'), 'error');
      loadMore.hidden = true;
    } finally {
      if (request === state.request) state.loading = false;
      loadMore.disabled = false;
      if (loadMore.textContent === 'Loading…') loadMore.textContent = 'Load more';
      if (state.pendingReload) {
        state.pendingReload = false;
        queueMicrotask(() => loadPage(false));
      }
    }
  }

  async function refreshConnectionCount() {
    if (kind === 'mutuals') return;
    const counts = await window.SPIKE.social.getCounts(state.db, ownerId);
    $('connectionCount').textContent = Number(kind === 'followers' ? counts.followers : counts.following).toLocaleString();
  }

  async function toggleFollow(button) {
    const id = button.dataset.userId;
    if (!id || id === state.me.id) return;
    const wasFollowing = state.followingIds.has(id);
    button.disabled = true;
    button.textContent = 'Please wait…';
    try {
      const result = await window.SPIKE.social.setFollow(state.db, id, !wasFollowing);
      if (result.following) state.followingIds.add(id); else state.followingIds.delete(id);
      try {
        localStorage.setItem('spike.profile.sync', JSON.stringify({ id, action: 'follow', active: result.following, at: Date.now() }));
      } catch (_) {}
      if (state.ownerIsMe && kind === 'following' && !result.following) {
        button.closest('.social-person')?.remove();
        state.rows = state.rows.filter(person => String(person.id) !== id);
      } else {
        button.textContent = result.following ? 'Following' : 'Follow';
        button.classList.toggle('is-following', result.following);
        button.setAttribute('aria-pressed', result.following ? 'true' : 'false');
        button.disabled = false;
      }
      toast(result.following ? 'You are now following this member.' : 'You unfollowed this member.', 'success');
      await refreshConnectionCount().catch(error => console.warn('[SPIKE SOCIAL COUNT REFRESH]', error));
      applySearch();
    } catch (error) {
      console.error('[SPIKE FOLLOW ACTION]', error);
      button.textContent = wasFollowing ? 'Following' : 'Follow';
      button.disabled = false;
      toast(error?.message || 'Could not update this connection.', 'error');
    }
  }

  async function blockMember(button) {
    const id = button.dataset.userId;
    const name = button.dataset.userName || 'this member';
    if (!await window.SPIKEPremiumDialog.confirm({title:`Block ${name}?`,message:'They will no longer be able to interact with you normally.',confirmText:'Block member',cancelText:'Cancel',danger:true,kicker:'SPIKE CONNECTION'})) return;
    button.disabled = true;
    try {
      const { error } = await state.db.rpc('dm_block_user', { p_other_user_id: id });
      if (error) throw error;
      button.closest('.social-person')?.remove();
      state.rows = state.rows.filter(person => String(person.id) !== id);
      state.followingIds.delete(id);
      try { localStorage.setItem('spike.profile.sync', JSON.stringify({ id, action: 'follow', active: false, at: Date.now() })); } catch (_) {}
      await refreshConnectionCount().catch(error => console.warn('[SPIKE SOCIAL COUNT REFRESH]', error));
      toast('Member blocked.', 'success');
      applySearch();
    } catch (error) {
      toast(error?.message || 'Could not block this member.', 'error');
    } finally { button.disabled = false; }
  }

  async function reportMember(button) {
    const id = button.dataset.userId;
    const name = button.dataset.userName || 'this member';
    const reason = await window.SPIKEPremiumDialog.input({title:`Report ${name}`,message:'Tell us why you are reporting this member.',placeholder:'Describe the issue…',confirmText:'Submit report',cancelText:'Cancel',kicker:'SPIKE SAFETY',maxLength:500});
    if (!reason?.trim()) return;
    button.disabled = true;
    try {
      const { error } = await state.db.from('spike_abuse_cases').insert({
        reporter_id: state.me.id, subject_user_id: id, source: 'profile', source_id: String(id),
        category: 'user_report', details: reason.trim().slice(0, 500), status: 'open', severity: 1
      });
      if (error) throw error;
      toast('Report submitted for review.', 'success');
    } catch (error) {
      toast(error?.message || 'Could not submit report.', 'error');
    } finally { button.disabled = false; }
  }

  async function boot() {
    if (!validKinds.has(kind) || !ownerId) {
      setStatus('This connections link is invalid.', 'error');
      return;
    }
    if (!window.supabase?.createClient) {
      setStatus('SPIKE could not initialize its connection service. Reload and try again.', 'error');
      return;
    }
    state.db = window.supabase.createClient(CONFIG.url, CONFIG.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' }
    });
    const sessionResult = await Promise.race([
      state.db.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Session check timed out.')), 15000))
    ]);
    if (sessionResult.error || !sessionResult.data.session?.user) {
      location.replace('index.html?reauth=1');
      return;
    }
    state.me = sessionResult.data.session.user;
    state.ownerIsMe = state.me.id === ownerId;
    const titles = { followers: 'Followers', following: 'Following', mutuals: 'Mutual connections' };
    $('pageTitle').textContent = titles[kind];
    const description = $('socialDescription');
    if (description && kind === 'mutuals') { description.hidden = false; description.textContent = 'People you and this member both follow.'; }
    $('pageEyebrow').textContent = state.ownerIsMe ? 'YOUR CONNECTIONS' : 'COMMUNITY CONNECTIONS';
    document.title = `${titles[kind]} · SPIKE`;
    const mutualLink = $('mutualLink');
    if (mutualLink && !state.ownerIsMe && kind !== 'mutuals') {
      mutualLink.href = `followers.html?kind=mutuals&uid=${encodeURIComponent(ownerId)}`;
    }
    if (kind === 'mutuals' && state.ownerIsMe) {
      setStatus('Mutual connections are available when viewing another member profile.', 'error');
      return;
    }
    if (kind !== 'mutuals') {
      state.followStateUnavailable = false;
      try {
        await loadMyFollowing();
      } catch (error) {
        console.warn('[SPIKE SOCIAL FOLLOW STATE]', error);
        state.followingLoaded = false;
        state.followStateUnavailable = true;
        $('searchScope').textContent = 'Follow controls are temporarily unavailable. Refresh to retry.';
      }
    }
    if (kind !== 'mutuals') {
      const counts = await window.SPIKE.social.getCounts(state.db, ownerId);
      $('connectionCount').textContent = Number(kind === 'followers' ? counts.followers : counts.following).toLocaleString();
    }
    $('socialSearch').addEventListener('input', () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => loadPage(false), 260);
    });
    $('loadMore').addEventListener('click', () => loadPage(true));
    $('socialList').addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'follow') toggleFollow(button);
      if (button.dataset.action === 'report') reportMember(button);
      if (button.dataset.action === 'block') blockMember(button);
    });
    $('backButton').addEventListener('click', () => {
      if (history.length > 1) history.back(); else location.href = profileUrl(ownerId);
    });
    await loadPage(false);
    await subscribeSocialUpdates(sessionResult.data.session);
  }

  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    clearTimeout(state.searchTimer);
    clearTimeout(state.realtimeTimer);
    clearInterval(state.pollTimer);
    state.socialChannels.forEach(channel => { try { state.db?.removeChannel(channel); } catch (_) {} });
    state.socialChannels = [];
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted || !state.me || !state.db) return;
    state.db.auth.getSession().then(result => subscribeSocialUpdates(result.data?.session)).catch(error => console.warn('[SPIKE SOCIAL REALTIME RESTORE]', error));
  });

  boot().catch(error => {
    console.error('[SPIKE SOCIAL PAGE BOOT]', error);
    setStatus(error?.message || 'Could not open this connections page.', 'error');
  });
})();
