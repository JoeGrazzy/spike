/* SPIKE Feed feature wiring. Uses the deployed public.posts/post_media/post_likes/comments schema. */
(() => {
  'use strict';
  if (window.__SPIKE_FEED_FEATURES_V1__) return;
  window.__SPIKE_FEED_FEATURES_V1__ = true;

  const $ = (id) => document.getElementById(id);
  const db = () => window.SPIKE_SUPABASE || window.db;
  const PREF_KEY = 'spike-settings-local-v1';
  const state = { user: null, busy: false, trendMinutes: 60, lastRows: [], nearbyLocation: null };
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const prefs = () => {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); }
    catch (_) { return {}; }
  };
  const savePrefs = (patch) => {
    const next = { ...prefs(), ...patch };
    localStorage.setItem(PREF_KEY, JSON.stringify(next));
    return next;
  };
  const setStatus = (message, bad = false) => {
    const n = $('onlineStatus');
    if (n) { n.textContent = message; n.dataset.state = bad ? 'error' : 'ready'; }
  };
  const safeText = (value) => String(value ?? '');
  const sinceIso = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

  function activatePanel(name) {
    const main = document.querySelector('main.main');
    // The stylesheet intentionally hides the discovery hub on Home. Keep the
    // dedicated discovery-mode class in sync with every panel transition.
    main?.classList.toggle('spike-discover-mode', name !== 'forYou');
    document.querySelectorAll('#feedV2Nav [data-v2]').forEach((button) => {
      button.classList.toggle('active', button.dataset.v2 === name || (name === 'following' && button.dataset.xFollowing));
    });
    document.querySelectorAll('#feedV2Hub [data-v2-panel]').forEach((panel) => {
      panel.classList.toggle('open', panel.dataset.v2Panel === name);
    });
    if (name === 'discover') $('v2DiscoverSearch')?.focus({ preventScroll: true });
  }

  function makePostCard(post, profile = {}, media = []) {
    const card = el('article', 'spike-db-post');
    card.dataset.postId = post.id;
    const head = el('header', 'spike-db-post-head');
    const avatar = el('span', 'spike-db-post-avatar', (profile.display_name || profile.username || 'S').slice(0, 1).toUpperCase());
    if (profile.avatar_path) {
      const img = el('img'); img.src = profile.avatar_path; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; avatar.replaceChildren(img);
    }
    const identity = el('div', 'spike-db-post-identity');
    identity.append(el('strong', '', profile.display_name || profile.username || 'SPIKE member'));
    identity.append(el('small', '', `@${profile.username || 'member'} · ${new Date(post.created_at).toLocaleString()}`));
    head.append(avatar, identity); card.append(head);
    if (post.body) card.append(el('p', 'spike-db-post-body', post.body));
    if (media.length) {
      const gallery = el('div', 'spike-db-post-media');
      media.forEach((item) => {
        if (!item.signedUrl) return;
        if (item.media_type === 'video') {
          const video = el('video'); video.src = item.signedUrl; video.controls = true; video.playsInline = true; video.preload = 'none'; gallery.append(video);
        } else if (item.media_type === 'image') {
          const img = el('img'); img.src = item.signedUrl; img.alt = 'Post image'; img.loading = 'lazy'; img.decoding = 'async'; gallery.append(img);
        }
      });
      if (gallery.childNodes.length) card.append(gallery);
    }
    const footer = el('footer', 'spike-db-post-footer');
    footer.append(el('span', '', post.visibility === 'public' ? '🌐 Public' : post.visibility === 'followers' ? '👥 Followers' : '🔒 Only me'));
    card.append(footer);
    window.SPIKE_SOCIAL_ACTIONS?.attach(card, post, state.user?.id);
    return card;
  }

  async function hydratePosts(rows, mediaMode = 'all') {
    if (!rows.length) return [];
    const ids = [...new Set(rows.map((row) => row.author_id))];
    const postIds = rows.map((row) => row.id);
    const [profilesResult, mediaResult] = await Promise.all([
      db().from('profiles').select('id,username,display_name,avatar_path').in('id', ids),
      db().from('post_media').select('id,post_id,object_path,media_type,position').in('post_id', postIds).order('position')
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (mediaResult.error) throw mediaResult.error;
    let media = mediaResult.data || [];
    if (mediaMode === 'video') media = media.filter((item) => item.media_type === 'video');
    // Batch private-media signing to avoid an N-request burst on discovery surfaces.
    const signedByPath = new Map();
    if (media.length) {
      const paths = [...new Set(media.map((item) => item.object_path).filter(Boolean))];
      const { data: signedRows, error } = await db().storage.from('post-media').createSignedUrls(paths, 300);
      if (error) throw error;
      (signedRows || []).forEach((row) => {
        if (row?.path && row?.signedUrl) signedByPath.set(row.path, row.signedUrl);
      });
    }
    const signed = media.map((item) => {
      const signedUrl = signedByPath.get(item.object_path);
      if (!signedUrl) throw new Error('A secure media link could not be created.');
      return { ...item, signedUrl };
    });
    const people = Object.fromEntries((profilesResult.data || []).map((p) => [p.id, p]));
    const byPost = {};
    signed.forEach((item) => (byPost[item.post_id] ||= []).push(item));
    return rows.map((post) => ({ post, profile: people[post.author_id] || {}, media: byPost[post.id] || [] }));
  }

  function renderCards(target, items, emptyMessage) {
    if (!target) return;
    target.replaceChildren();
    if (!items.length) { target.append(el('div', 'spike-db-feed-empty', emptyMessage)); return; }
    items.forEach(({ post, profile, media }) => target.append(makePostCard(post, profile, media)));
  }

  async function fetchPosts({ search = '', minutes = null, limit = 50, videoOnly = false } = {}) {
    if (!db()) throw new Error('Supabase is not ready. Refresh and try again.');
    let query = db().from('posts')
      .select('id,author_id,body,visibility,comments_enabled,status,created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (minutes !== null) query = query.gte('created_at', sinceIso(minutes));
    if (search) query = query.ilike('body', `%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    let rows = data || [];
    if (videoOnly && rows.length) {
      const ids = rows.map((row) => row.id);
      const { data: videos, error: mediaError } = await db().from('post_media').select('post_id').in('post_id', ids).eq('media_type', 'video');
      if (mediaError) throw mediaError;
      const videoIds = new Set((videos || []).map((item) => item.post_id));
      rows = rows.filter((row) => videoIds.has(row.id));
    }
    return rows;
  }

  async function engagementFor(rows) {
    if (!rows.length) return new Map();
    const ids = rows.map((row) => row.id);
    const [likes, comments] = await Promise.all([
      db().from('post_likes').select('post_id').in('post_id', ids),
      db().from('comments').select('post_id').in('post_id', ids).eq('status', 'published')
    ]);
    if (likes.error) throw likes.error;
    if (comments.error) throw comments.error;
    const score = new Map();
    (likes.data || []).forEach((row) => score.set(row.post_id, (score.get(row.post_id) || 0) + 1));
    (comments.data || []).forEach((row) => score.set(row.post_id, (score.get(row.post_id) || 0) + 2));
    return score;
  }

  async function runSearch() {
    const input = $('v2DiscoverSearch');
    const target = $('v2DiscoverResults');
    const term = input?.value.trim();
    if (!term) { target?.replaceChildren(el('div', 'empty', 'Enter a name, word or hashtag to search SPIKE.')); return; }
    if (target) target.replaceChildren(el('div', 'empty', 'Searching posts and people…'));
    try {
      const safeTerm = term.replace(/[\\%_]/g, ' ').replace(/\s+/g, ' ').trim();
      const [rows, usernames, displayNames] = await Promise.all([
        fetchPosts({ search: term.replace(/^#/, ''), limit: 40 }),
        db().from('profiles').select('id,username,display_name,avatar_path').ilike('username', `%${safeTerm}%`).limit(20),
        db().from('profiles').select('id,username,display_name,avatar_path').ilike('display_name', `%${safeTerm}%`).limit(20)
      ]);
      if (usernames.error) throw usernames.error;
      if (displayNames.error) throw displayNames.error;
      const items = await hydratePosts(rows);
      if (!target) return;
      target.replaceChildren();
      const people = [...new Map([...(usernames.data || []), ...(displayNames.data || [])].map(person => [person.id, person])).values()];
      if (people.length) {
        const heading = el('h3', 'spike-discover-result-heading', 'People'); target.append(heading);
        people.forEach(person => {
          const link = el('a', 'spike-discover-person'); link.href = `user-profile.html?uid=${encodeURIComponent(person.id)}`;
          const avatar = el('span', 'spike-db-post-avatar', (person.display_name || person.username || 'S').slice(0, 1).toUpperCase());
          if (person.avatar_path) { const img = el('img'); img.src = person.avatar_path; img.alt = ''; avatar.replaceChildren(img); }
          const copy = el('span'); copy.append(el('strong', '', person.display_name || person.username || 'SPIKE member'), el('small', '', `@${person.username || 'member'}`)); link.append(avatar, copy); target.append(link);
        });
      }
      if (items.length) { target.append(el('h3', 'spike-discover-result-heading', 'Posts')); items.forEach(item => target.append(makePostCard(item.post, item.profile, item.media))); }
      if (!people.length && !items.length) target.append(el('div', 'spike-db-feed-empty', `No visible people or posts found for “${term}”.`));
    } catch (error) { target?.replaceChildren(el('div', 'spike-db-feed-empty', error.message || 'Search could not be completed.')); }
  }

  async function loadMoments() {
    const target = $('v2MomentsList');
    if (target) target.replaceChildren(el('div', 'empty', 'Finding active topics…'));
    try {
      const rows = await fetchPosts({ minutes: 7 * 24 * 60, limit: 100 });
      const topics = new Map();
      rows.forEach((post) => {
        const tags = safeText(post.body).toLowerCase().match(/#[a-z0-9_]{2,40}/g) || [];
        [...new Set(tags)].forEach((tag) => topics.set(tag, (topics.get(tag) || 0) + 1));
      });
      const ranked = [...topics].sort((a, b) => b[1] - a[1]).slice(0, 15);
      if (!target) return;
      target.replaceChildren();
      if (!ranked.length) { target.append(el('div', 'empty', 'No topic clusters yet. Hashtags in published posts will appear here.')); return; }
      ranked.forEach(([tag, count]) => {
        const button = el('button', 'spike-social-button', `${tag} · ${count} ${count === 1 ? 'post' : 'posts'}`);
        button.type = 'button'; button.addEventListener('click', () => { activatePanel('discover'); $('v2DiscoverSearch').value = tag; runSearch(); }); target.append(button);
      });
    } catch (error) { target?.replaceChildren(el('div', 'spike-db-feed-empty', error.message || 'Moments could not load.')); }
  }

  async function loadTrending() {
    const target = $('v2TrendingList');
    if (target) target.replaceChildren(el('div', 'empty', 'Loading trending posts…'));
    try {
      const rows = await fetchPosts({ minutes: state.trendMinutes, limit: 60 });
      const scores = await engagementFor(rows);
      rows.sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0) || new Date(b.created_at) - new Date(a.created_at));
      const items = await hydratePosts(rows.slice(0, 20));
      renderCards(target, items, `No posts in the last ${state.trendMinutes} minutes yet.`);
    } catch (error) { target?.replaceChildren(el('div', 'spike-db-feed-empty', error.message || 'Trending could not load.')); }
  }

  async function loadReels() {
    const target = $('v2ReelsList');
    if (target) target.replaceChildren(el('div', 'empty', 'Loading video posts…'));
    try {
      const rows = await fetchPosts({ limit: 60, videoOnly: true });
      const items = await hydratePosts(rows, 'video');
      renderCards(target, items, 'No published video posts are available yet. Videos uploaded with a post will appear here.');
    } catch (error) { target?.replaceChildren(el('div', 'spike-db-feed-empty', error.message || 'Reels could not load.')); }
  }

  async function loadTopPicks() {
    const box = $('signalTopPicks');
    const target = $('signalTopPicksList');
    if (!box || !target) return;
    try {
      const rows = await fetchPosts({ minutes: 7 * 24 * 60, limit: 60 });
      const scores = await engagementFor(rows);
      rows.sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0) || new Date(b.created_at) - new Date(a.created_at));
      const items = await hydratePosts(rows.slice(0, 5));
      renderCards(target, items, 'Top Picks will appear when posts start receiving engagement.');
      box.hidden = false;
    } catch (error) { target.replaceChildren(el('div', 'spike-db-feed-empty', error.message || 'Top Picks could not load.')); box.hidden = false; }
  }

  function setupSafetyControls() {
    const p = prefs();
    const following = $('v2FollowingOnly');
    const muted = $('v2MutedKeywords');
    if (following) following.checked = p.feedFollowingOnly === true;
    if (muted) muted.value = safeText(p.feedMutedKeywords);
    ['v2Sensitive', 'v2Spoilers', 'v2Political'].forEach((id) => {
      const input = $(id);
      if (!input) return;
      input.disabled = true;
      input.checked = true;
      const label = input.closest('label');
      if (label) { label.title = 'This content category is not stored on posts yet.'; label.style.opacity = '.55'; }
    });
    $('v2SaveSafety')?.addEventListener('click', () => {
      savePrefs({ feedFollowingOnly: !!following?.checked, feedMutedKeywords: muted?.value || '' });
      setStatus('Feed controls saved on this device.');
      window.SPIKE_FEED?.refresh?.();
    });
  }

  function requestBrowserLocation() {
    if (!navigator.geolocation) return Promise.reject(new Error('This browser does not support location services.'));
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      error => reject(new Error(error.code === 1 ? 'Location permission was denied. Enable it in your browser settings to use Nearby.' : 'Could not determine your location. Check your device location settings and try again.')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    ));
  }

  async function loadNearby() {
    const target = $('v2NearbyList');
    const enable = $('v2NearbyEnable');
    if (!state.user) { target?.replaceChildren(el('div', 'empty', 'Sign in to use Nearby.')); return; }
    if (!state.nearbyLocation) {
      if (target) target.replaceChildren(el('div', 'empty', 'Your location is requested only when you tap Find Nearby. It is used for this search and is not saved to your profile.'));
      return;
    }
    if (enable) { enable.disabled = true; enable.textContent = 'Finding posts…'; }
    if (target) target.replaceChildren(el('div', 'empty', 'Finding public posts within 25 km…'));
    try {
      const { data, error } = await db().rpc('spike_nearby_posts', {
        p_latitude: state.nearbyLocation.latitude,
        p_longitude: state.nearbyLocation.longitude,
        p_radius_meters: 25000,
        p_limit: 50
      });
      if (error) throw error;
      const rows = data || [];
      const items = await hydratePosts(rows);
      if (target) {
        target.replaceChildren();
        if (!items.length) target.append(el('div', 'empty', 'No public posts with shared locations were found within 25 km. Try again later.'));
        items.forEach(item => {
          const card = makePostCard(item.post, item.profile, item.media);
          const distance = Number(item.post.distance_meters);
          if (Number.isFinite(distance)) card.querySelector('.spike-db-post-footer')?.append(el('span', '', distance < 1000 ? `${Math.round(distance)} m away` : `${(distance / 1000).toFixed(1)} km away`));
          target.append(card);
        });
      }
    } catch (error) {
      target?.replaceChildren(el('div', 'spike-db-feed-empty', error.message || 'Nearby search could not be completed.'));
    } finally {
      if (enable) { enable.disabled = false; enable.textContent = '📍 Find Nearby'; }
    }
  }

  function setupNearby() {
    const target = $('v2NearbyList');
    if (target) target.textContent = 'Nearby is opt-in. Your device location is requested only when you choose Find Nearby. Public posts appear only when their authors explicitly attach a location.';
    const enable = $('v2NearbyEnable');
    enable?.addEventListener('click', async () => {
      if (!state.user) { target?.replaceChildren(el('div', 'empty', 'Sign in to use Nearby.')); return; }
      if (enable) enable.disabled = true;
      try { state.nearbyLocation = await requestBrowserLocation(); await loadNearby(); }
      catch (error) { target?.replaceChildren(el('div', 'spike-db-feed-empty', error.message)); if (enable) enable.disabled = false; }
    });
    $('v2NearbyReset')?.addEventListener('click', () => {
      state.nearbyLocation = null;
      if (target) target.replaceChildren(el('div', 'empty', 'Nearby search location cleared from this page. Tap Find Nearby to request location again.'));
    });
    const actions = enable?.parentElement;
    if (actions && !$('v2NearbyDisableSharing')) {
      const disable = el('button', 'tool', 'Turn Off My Post Locations');
      disable.id = 'v2NearbyDisableSharing'; disable.type = 'button';
      disable.title = 'Remove location tags from all of your posts';
      disable.addEventListener('click', async () => {
        if (!state.user) return;
        disable.disabled = true;
        try {
          const { error } = await db().from('post_locations').delete().eq('author_id', state.user.id);
          if (error) throw error;
          if (target) target.replaceChildren(el('div', 'empty', 'Your post location tags have been removed. Nearby search remains off until you tap Find Nearby.'));
        } catch (error) { target?.replaceChildren(el('div', 'spike-db-feed-empty', error.message || 'Could not remove your post locations.')); }
        finally { disable.disabled = false; }
      });
      actions.append(disable);
    }
  }

  function bind() {
    $('feedV2Nav')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-v2]');
      if (!button) return;
      const name = button.dataset.v2;
      activatePanel(name);
      if (name === 'moments') loadMoments();
      if (name === 'trending') loadTrending();
      if (name === 'reels') loadReels();
      if (name === 'discover') $('v2DiscoverSearch')?.focus({ preventScroll: true });
      if (name === 'forYou') window.SPIKE_FEED?.refresh?.();
    });
    $('v2DiscoverGo')?.addEventListener('click', runSearch);
    $('v2DiscoverSearch')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); runSearch(); } });
    $('v2MomentsRefresh')?.addEventListener('click', loadMoments);
    $('signalTopPicksRefresh')?.addEventListener('click', loadTopPicks);
    document.querySelectorAll('[data-trend-window]').forEach((button) => button.addEventListener('click', () => {
      state.trendMinutes = Math.max(1, Number(button.dataset.trendWindow) || 60);
      document.querySelectorAll('[data-trend-window]').forEach((item) => item.classList.toggle('active', item === button));
      loadTrending();
    }));
    $('spikeDiscoverClose')?.addEventListener('click', () => {
      document.querySelector('main.main')?.classList.remove('spike-discover-mode');
      activatePanel('forYou');
      $('feedV2Hub')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    setupSafetyControls();
    setupNearby();
  }

  async function boot() {
    if (!db()) { setStatus('Feed services did not initialize. Refresh the page.', true); return; }
    try {
      const { data, error } = await db().auth.getUser();
      if (error) throw error;
      state.user = data?.user || null;
      bind();
      // Keep the advanced surfaces useful even when the ordinary feed is empty.
      await loadTopPicks();
      setStatus(state.user ? 'Feed services connected' : 'Sign in to interact with posts.');
    } catch (error) {
      console.error('[SPIKE feed features]', error);
      setStatus(error.message || 'Feed features could not initialize.', true);
    }
  }

  window.SPIKE_FEED_FEATURES = Object.freeze({ refreshMoments: loadMoments, refreshTrending: loadTrending, refreshReels: loadReels, search: runSearch });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
