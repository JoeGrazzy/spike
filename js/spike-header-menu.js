/* SPIKE header/menu interaction repair. */
(() => {
  'use strict';
  if (window.__SPIKE_HEADER_MENU_V1__) return;
  window.__SPIKE_HEADER_MENU_V1__ = true;
  const $ = (id) => document.getElementById(id);
  const overlay = $('menuOverlay');
  if (!overlay) return;
  const trigger = $('menuBtn');
  const enterDiscoverMode = () => $('main.main')?.classList.add('spike-discover-mode');
  const close = () => {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    trigger?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('spike-menu-open');
  };
  const open = () => {
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    trigger?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('spike-menu-open');
    $('menuClose')?.focus({ preventScroll: true });
  };
  trigger?.addEventListener('click', () => overlay.classList.contains('open') ? close() : open());
  $('menuClose')?.addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && overlay.classList.contains('open')) { close(); trigger?.focus({ preventScroll: true }); } });

  function showSearch() {
    close();
    const modal = $('spikeAiSearchOverlay');
    if (modal) { modal.setAttribute('aria-hidden', 'false'); modal.classList.add('open'); $('spikeAiInput')?.focus(); }
    else { $('feedV2Hub')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); $('v2DiscoverSearch')?.focus(); }
  }
  $('feedHeaderSearch')?.addEventListener('click', showSearch);
  $('menuAskSpike')?.addEventListener('click', showSearch);
  $('spikeAiClose')?.addEventListener('click', () => { $('spikeAiSearchOverlay')?.classList.remove('open'); $('spikeAiSearchOverlay')?.setAttribute('aria-hidden', 'true'); });
  $('spikeAiGo')?.addEventListener('click', () => {
    const query = $('spikeAiInput')?.value.trim();
    $('spikeAiSearchOverlay')?.classList.remove('open'); $('spikeAiSearchOverlay')?.setAttribute('aria-hidden', 'true');
    if (!query) { $('v2DiscoverSearch')?.focus(); return; }
    const hub = $('feedV2Hub'); hub?.classList.add('open'); enterDiscoverMode();
    document.querySelectorAll('#feedV2Hub [data-v2-panel]').forEach(p => p.classList.toggle('open', p.dataset.v2Panel === 'discover'));
    document.querySelectorAll('#feedV2Nav [data-v2]').forEach(b => b.classList.toggle('active', b.dataset.v2 === 'discover'));
    const input = $('v2DiscoverSearch'); if (input) { input.value = query; $('v2DiscoverGo')?.click(); }
    hub?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('spikeAiInput')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('spikeAiGo')?.click(); } });

  $('menuSafety')?.addEventListener('click', () => {
    close();
    const hub = $('feedV2Hub'); hub?.classList.add('open'); enterDiscoverMode();
    document.querySelectorAll('#feedV2Hub [data-v2-panel]').forEach(p => p.classList.toggle('open', p.dataset.v2Panel === 'safety'));
    document.querySelectorAll('#feedV2Nav [data-v2]').forEach(b => b.classList.remove('active'));
    hub?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('menuTheme')?.addEventListener('click', () => {
    const theme = window.SPIKE_THEME;
    if (theme?.next) { const id = theme.next(); const item = window.SPIKE_THEMES?.find(t => t.id === id); $('toastMessage') && ($('toastMessage').textContent = `Theme changed to ${item?.name || id}`); $('toast')?.classList.add('show'); setTimeout(() => $('toast')?.classList.remove('show'), 2200); }
    else location.href = 'settings.html';
    close();
  });
  const audience = $('menuAudience');
  if (audience) { audience.disabled = true; audience.title = 'Close Friends audiences are not configured in the current database yet.'; audience.setAttribute('aria-disabled', 'true'); const small = audience.querySelector('small'); if (small) small.textContent = 'Not available until private-audience support is added'; }
  $('menuSaved')?.addEventListener('click', async () => {
    close();
    const db = window.SPIKE_SUPABASE || window.db;
    if (!db) { void window.SPIKEPremiumDialog?.alert('SPIKE services are not ready. Please refresh.',{title:'Service unavailable',kind:'error'}); return; }
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth?.user) { void window.SPIKEPremiumDialog?.alert('Please sign in again to view saved posts.',{title:'Sign in required',kind:'warning'}); return; }
    const { data, error } = await db.from('saved_posts').select('post_id,created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(50);
    if (error) { void window.SPIKEPremiumDialog?.alert(error.message || 'Saved posts could not load.',{title:'Could not load saved posts',kind:'error'}); return; }
    const ids = (data || []).map(x => x.post_id);
    const { data: posts, error: postsError } = ids.length ? await db.from('posts').select('id,body,created_at').in('id', ids) : { data: [], error: null };
    if (postsError) { void window.SPIKEPremiumDialog?.alert(postsError.message || 'Saved posts could not load.',{title:'Could not load saved posts',kind:'error'}); return; }
    let panel = $('spikeSavedPanel');
    if (!panel) { panel = document.createElement('section'); panel.id = 'spikeSavedPanel'; panel.className = 'spike-ai-search-overlay open'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.innerHTML = '<div class="spike-ai-search-modal"><div class="spike-ai-head"><strong>🔖 Saved Signals</strong><button type="button" id="spikeSavedClose" aria-label="Close">×</button></div><div id="spikeSavedItems" class="spike-ai-body"></div></div>'; document.body.append(panel); $('spikeSavedClose').addEventListener('click', () => panel.remove()); }
    const list = $('spikeSavedItems'); list.replaceChildren();
    if (!posts?.length) { list.textContent = 'You have no saved posts yet. Save a post using its Save action.'; return; }
    posts.forEach(post => { const article = document.createElement('article'); article.className = 'spike-db-post'; const p = document.createElement('p'); p.textContent = post.body || 'Saved post'; article.append(p); list.append(article); });
  });
  const logoutOverlay = $('logoutConfirmOverlay');
  const openLogout = () => { if (!logoutOverlay) return; logoutOverlay.classList.add('show'); logoutOverlay.setAttribute('aria-hidden','false'); $('logoutYes')?.focus({preventScroll:true}); };
  const closeLogout = () => { logoutOverlay?.classList.remove('show'); logoutOverlay?.setAttribute('aria-hidden','true'); $('menuSignOut')?.focus({preventScroll:true}); };
  $('menuSignOut')?.addEventListener('click', () => { close(); openLogout(); });
  $('logoutCancel')?.addEventListener('click', closeLogout);
  logoutOverlay?.addEventListener('click', event => { if (event.target === logoutOverlay) closeLogout(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && logoutOverlay?.classList.contains('show')) closeLogout(); });
  document.querySelectorAll('[data-spike-nav="discover"]').forEach(button => button.addEventListener('click', () => {
    const hub = $('feedV2Hub'); if (!hub) return;
    hub.classList.add('open'); enterDiscoverMode();
    document.querySelectorAll('#feedV2Hub [data-v2-panel]').forEach(p => p.classList.toggle('open', p.dataset.v2Panel === 'discover'));
    document.querySelectorAll('#feedV2Nav [data-v2]').forEach(b => b.classList.toggle('active', b.dataset.v2 === 'discover'));
    hub.scrollIntoView({ behavior: 'smooth', block: 'start' }); $('v2DiscoverSearch')?.focus({ preventScroll: true });
  }));
  window.SPIKE_HEADER_MENU = Object.freeze({ open, close });
})();
