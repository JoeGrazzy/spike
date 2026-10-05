/* SPIKE Experience V2
   Safe additive UX layer. No MutationObserver, no feed boot interception,
   no replacement of existing runtime handlers. */
(() => {
  'use strict';
  if (window.__SPIKE_EXPERIENCE_V2__) return;
  window.__SPIKE_EXPERIENCE_V2__ = true;

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  function setupHeader() {
    const header = $('.header');
    const ask = $('#spikeAiSearchBtn');
    if (!header || !ask) return;
    header.classList.add('spike-x-header');
    ask.title = 'Ask SPIKE';
    ask.setAttribute('aria-label', 'Ask SPIKE');
    const label = $('.ask-ai-label', ask);
    if (label) label.textContent = 'Ask SPIKE';
  }

  function setupFeedNavigation() {
    const main = $('.main');
    const hub = $('#feedV2Hub');
    const nav = $('#feedV2Nav');
    const legacy = $('#filters');
    if (!main || !hub || !nav) return;
    main.classList.add('spike-x-home');
    if (legacy) legacy.classList.add('spike-x-legacy-filters');

    const forYou = nav.querySelector('[data-v2="forYou"]');
    const discover = nav.querySelector('[data-v2="discover"]');
    if (forYou) forYou.textContent = 'For You';
    if (discover) discover.textContent = 'Discover';

    let forYouFilter = $('.filter[data-filter="forYou"]');
    if (!forYouFilter && legacy) {
      forYouFilter = document.createElement('button');
      forYouFilter.type = 'button';
      forYouFilter.className = 'filter';
      forYouFilter.dataset.filter = 'forYou';
      forYouFilter.hidden = true;
      legacy.appendChild(forYouFilter);
    }

    let following = nav.querySelector('[data-x-following]');
    if (!following && forYou) {
      following = document.createElement('button');
      following.type = 'button';
      following.dataset.xFollowing = '1';
      following.dataset.v2 = 'forYou';
      following.textContent = 'Following';
      forYou.after(following);
    }
    if (following && !following.dataset.xBound) {
      following.dataset.xBound = '1';
      following.addEventListener('click', () => {
        const filter = $('.filter[data-filter="following"]');
        if (filter) filter.click();
        $$('.feed-v2-panel', hub).forEach(p => p.classList.toggle('open', p.dataset.v2Panel === 'forYou'));
        $$('#feedV2Nav [data-v2]').forEach(b => b.classList.toggle('active', b === following));
      });
    }
    if (forYou && !forYou.dataset.xBound) {
      forYou.dataset.xBound = '1';
      forYou.addEventListener('click', () => {
        const filter = $('.filter[data-filter="latest"]');
        if (filter) filter.click();
        window.state && (window.state.filter = 'forYou');
        if (typeof window.refreshSignalRanking === 'function') window.refreshSignalRanking();
      });
    }
    document.documentElement.dataset.spikeExperience = 'v2';
  }

  function setupComposer() {
    const composer = $('#spikeComposer');
    const text = $('#signalText');
    if (!composer || !text) return;
    composer.classList.add('spike-x-composer');
    const title = $('#spikeComposerTitle');
    if (title) title.textContent = 'Create a post';
    const copy = title?.nextElementSibling;
    if (copy) copy.textContent = 'Every post is a Signal. Share what is happening.';
    text.placeholder = 'What’s happening?';
    text.setAttribute('aria-label', 'What’s happening? Create a post');

    const tools = $('.signal-tools', composer);
    const creator = $('.signal-creator-row', composer);
    if (!tools || !creator || $('.spike-x-more-row', composer)) return;

    const later = $('#scheduleBtn');
    const story = $('#storyBtn');
    const refine = $('#composeAiBtn');
    const saved = $('#saveDraftBtn');
    const more = $('#contentCenterBtn');
    later?.setAttribute('data-x-advanced', '1');

    const row = document.createElement('div');
    row.className = 'spike-x-more-row';
    row.innerHTML = '<button type="button" class="spike-x-more" aria-expanded="false" aria-controls="spikeXAdvanced">More</button><span class="spike-x-more-hint">Link, schedule, refine, drafts</span>';
    composer.appendChild(row);

    const toggle = $('.spike-x-more', row);
    const advanced = row;
    advanced.id = 'spikeXAdvanced';
    toggle.setAttribute('aria-controls', 'spikeXAdvanced');
    toggle.addEventListener('click', () => {
      const open = composer.classList.toggle('spike-x-advanced-open');
      toggle.setAttribute('aria-expanded', String(open));
      advanced.setAttribute('aria-hidden', String(!open));
      toggle.textContent = open ? 'Less' : 'More';
    });

    // Keep a visible, familiar label for the existing content center action.
    if (more) more.textContent = 'Drafts & history';
    if (refine) refine.textContent = '✦ Refine';
    if (saved) saved.textContent = 'Saved automatically';
    const release = $('#releaseSignalBtn');
    if (release) {
      const span = release.querySelector('span');
      const b = release.querySelector('b');
      if (span) span.textContent = 'POST';
      if (b) b.textContent = 'SPIKE';
      release.setAttribute('aria-label', 'Publish your post to SPIKE');
    }
  }

  function setupTopPicks() {
    const box = $('#signalTopPicks');
    if (!box || $('.spike-x-top-picks-note', box)) return;
    const note = document.createElement('div');
    note.className = 'spike-x-top-picks-note';
    note.innerHTML = '<strong>Top Picks for you</strong><span>Ranked by relevance, quality and momentum</span>';
    const head = $('.signal-picks-head', box);
    if (head) head.prepend(note); else box.prepend(note);
  }

  function setupFeatureCenter() {
    const hub = $('#spikeFeatureHub');
    if (!hub) return;
    const title = $('#spikeFeatureTitle');
    if (title) title.textContent = 'Explore SPIKE';
    const sub = $('.spike-feature-head-copy small', hub);
    if (sub) sub.textContent = 'Powerful tools stay one step away until you need them.';
    const labels = { overview: 'Explore', feeds: 'Custom Feeds', polls: 'Polls', series: 'Series', collab: 'Collaborate', creator: 'Create', search: 'Search', reputation: 'Grow', resume: 'Resume', dashboard: 'My Space' };
    $$('.spike-feature-tabs [data-feature-tab]', hub).forEach(btn => {
      const label = labels[btn.dataset.featureTab];
      if (label) btn.textContent = label;
    });
  }

  function setupMenu() {
    const overlay = $('#menuOverlay');
    if (!overlay) return;
    overlay.classList.add('spike-x-menu');
    const title = $('#spikeMenuTitle');
    if (title) title.textContent = 'Your SPIKE';
    const hero = $('.spike-menu-hero p', overlay);
    if (hero) hero.textContent = 'Your space, discovery, creation and account tools.';
    const guide = $('#menuGuide');
    if (guide) {
      guide.querySelector('strong')?.replaceChildren(document.createTextNode('Learn SPIKE'));
      guide.querySelector('small')?.replaceChildren(document.createTextNode('How SPIKE works, in plain language'));
    }
    $('#menuAdmin')?.setAttribute('hidden', '');
  }

  function setupBottomNav() {
    const nav = $('#spikeBottomNav');
    nav?.classList.add('spike-x-bottom');
  }

  function boot() {
    setupHeader();
    setupFeedNavigation();
    setupComposer();
    setupTopPicks();
    setupFeatureCenter();
    setupMenu();
    setupBottomNav();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
