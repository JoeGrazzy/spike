/* SPIKE Optional Onboarding v1 — reusable, non-blocking, per-user progress. */
(() => {
  'use strict';
  if (window.__SPIKE_ONBOARDING_V1__) return;
  window.__SPIKE_ONBOARDING_V1__ = true;

  const VERSION = 1;
  const LOCAL_KEY = 'spike-onboarding-v1';
  const RESUME_KEY = 'spike-onboarding-auto-resume';
  const PAGE = String(document.body?.dataset?.spikePage || '').toLowerCase();
  const ALLOWED = new Set(['feed','friends','profile','messages','message','rooms','room','room_chat','notifications','settings','help','guide','view_user','live']);
  if (!ALLOWED.has(PAGE)) return;

  const LESSONS = [
    { id:'feed', title:'Explore your Feed', page:'feed.html', label:'Open Feed', description:'Your Feed is where you discover posts, updates, and conversations. Explore the available feed views and use the post actions only when you are ready.' },
    { id:'people', title:'Profiles and connections', page:'friends.html', label:'Open Friends', description:'Find people, review friend requests, explore profiles, and manage connections. You stay in control of who you connect with.' },
    { id:'messages', title:'Messages and conversations', page:'messages.html', label:'Open Messages', description:'Use Messages to find conversations and communicate privately. The tutorial never sends a message or starts a call for you.' },
    { id:'rooms', title:'Join a community Room', page:'rooms.html', label:'Explore Rooms', description:'Rooms bring people together around shared interests. Review a Room and its rules before joining or participating.' },
    { id:'notifications', title:'Stay up to date', page:'notifications.html', label:'View Notifications', description:'Notifications help you keep track of relevant activity. Visit notification settings to tune what you receive.' },
    { id:'safety', title:'Privacy, safety, and help', page:'settings.html', label:'Open Settings', description:'Find account preferences, privacy controls, and safety tools. Use Help for detailed guides, reporting information, and answers to common questions.' }
  ];

  const safeReadLocal = userId => {
    try {
      const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
      return all && typeof all === 'object' ? (all[userId] || null) : null;
    } catch { return null; }
  };
  const safeWriteLocal = (userId, progress) => {
    try {
      const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
      all[userId] = { ...progress, updated_at: new Date().toISOString() };
      localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
    } catch { /* Storage may be unavailable; onboarding remains optional. */ }
  };
  const normalize = raw => ({
    status: ['not_started','in_progress','completed','skipped'].includes(raw?.status) ? raw.status : 'not_started',
    current_step: Math.max(0, Math.min(LESSONS.length - 1, Number.isFinite(Number(raw?.current_step)) ? Number(raw.current_step) : 0)),
    completed_at: raw?.completed_at || null,
    skipped_at: raw?.skipped_at || null,
    updated_at: raw?.updated_at || null
  });

  let db = null;
  let user = null;
  let progress = normalize(null);
  let remoteAvailable = false;
  let root = null;
  let card = null;
  let helpEntry = null;
  let open = false;
  let lastFocused = null;

  function client() {
    return window.__SPIKE_SUPABASE__ || window.supabaseClient || window.sb || window.db || null;
  }
  async function persist(next) {
    progress = normalize({ ...progress, ...next, updated_at: new Date().toISOString() });
    if (user?.id) safeWriteLocal(user.id, progress);
    if (remoteAvailable && db && user?.id) {
      const row = {
        user_id: user.id,
        status: progress.status,
        current_step: progress.current_step,
        completed_at: progress.completed_at,
        skipped_at: progress.skipped_at,
        updated_at: new Date().toISOString()
      };
      try {
        // Local progress updates immediately; remote sync is deliberately non-blocking.
        Promise.resolve(db.from('spike_onboarding_progress').upsert(row, { onConflict: 'user_id' }))
          .then(({ error } = {}) => {
            if (error) {
              remoteAvailable = false;
              console.info('[SPIKE onboarding] Using device-local progress until the onboarding migration is installed.');
            }
          })
          .catch(() => { remoteAvailable = false; });
      } catch { remoteAvailable = false; }
    }
    syncHelpButton();
  }
  async function loadProgress() {
    const local = safeReadLocal(user.id);
    progress = normalize(local);
    db = client();
    if (db?.auth?.getSession && db?.from) {
      try {
        const { data: sessionData, error: sessionError } = await db.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData?.session?.user?.id || sessionData.session.user.id !== user.id) return;
        const { data, error } = await db.from('spike_onboarding_progress').select('user_id,status,current_step,completed_at,skipped_at,updated_at').eq('user_id', user.id).maybeSingle();
        if (!error) {
          remoteAvailable = true;
          if (data) {
            const remoteProgress = normalize(data);
            const localUpdated = Date.parse(local?.updated_at || '') || 0;
            const remoteUpdated = Date.parse(data.updated_at || '') || 0;
            // A just-clicked Next/Skip can navigate before the remote upsert settles.
            // Prefer newer local state so a stale read cannot move the lesson backwards.
            progress = local && localUpdated > remoteUpdated ? normalize(local) : remoteProgress;
            safeWriteLocal(user.id, progress);
            if (local && localUpdated > remoteUpdated) void persist(progress);
          }
        } else {
          // Missing table/migration is an expected rollout state; never block the app.
          remoteAvailable = false;
        }
      } catch {
        remoteAvailable = false;
      }
    }
    syncHelpButton();
  }

  function createUI() {
    if (root) return;
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'css/spike-onboarding-v1.css?v=2';
    document.head.appendChild(style);

    createHelpEntry();

    root = document.createElement('div');
    root.className = 'spike-onboarding-root';
    root.hidden = true;
    root.innerHTML = `
      <div class="spike-onboarding-backdrop" data-onboarding-dismiss="true"></div>
      <section class="spike-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="spikeOnboardingTitle" aria-describedby="spikeOnboardingDescription" tabindex="-1">
        <div class="spike-onboarding-topline"><span class="spike-onboarding-brand"><span class="spike-onboarding-mark" aria-hidden="true">S</span> SPIKE GUIDE</span><button class="spike-onboarding-close" type="button" data-onboarding-action="close" aria-label="Close tutorial">×</button></div>
        <div class="spike-onboarding-progress"><span id="spikeOnboardingProgressLabel">Welcome</span><span id="spikeOnboardingProgressCount"></span></div>
        <div class="spike-onboarding-progress-track" aria-hidden="true"><span id="spikeOnboardingProgressBar"></span></div>
        <div class="spike-onboarding-content"><p class="spike-onboarding-eyebrow" id="spikeOnboardingEyebrow">GETTING STARTED</p><h2 id="spikeOnboardingTitle">Welcome to Spike</h2><p id="spikeOnboardingDescription">A quick tour of the essentials.</p></div>
        <div class="spike-onboarding-actions" id="spikeOnboardingActions"></div>
        <p class="spike-onboarding-footnote">Optional · You can leave at any time and return from Help.</p>
      </section>`;
    document.body.appendChild(root);
    card = root.querySelector('.spike-onboarding-dialog');
    root.addEventListener('click', event => {
      const action = event.target.closest('[data-onboarding-action]')?.dataset.onboardingAction;
      if (action === 'close') closeTutorial();
      if (action === 'skip') skipTutorial();
      if (action === 'start') startTutorial(true);
      if (action === 'next') nextStep();
      if (action === 'back') previousStep();
      if (action === 'review') { renderLesson(); }
      if (action === 'finish') finishTutorial();
      if (action === 'explore') closeTutorial();
      if (event.target.matches('[data-onboarding-dismiss="true"]')) closeTutorial();
    });
    document.addEventListener('keydown', event => {
      if (!open) return;
      if (event.key === 'Escape') { event.preventDefault(); closeTutorial(); }
      if (event.key === 'Tab') trapFocus(event);
    });
  }

  function createHelpEntry() {
    if (helpEntry) return;
    const makeRow = (href, icon, title, description) => {
      const a = document.createElement('a');
      a.className = 'spike-command-row spike-onboarding-menu-entry';
      a.href = href;
      a.innerHTML = `<span class="spike-command-icon" aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${description}</small></span><b aria-hidden="true">›</b>`;
      return a;
    };
    const supportList = document.querySelector('.menu-reference-support .spike-command-list');
    if (supportList) {
      if (!supportList.querySelector('[data-spike-help-center]')) {
        const center = makeRow('help.html', '❔', 'Help Center', 'Guides, answers and support');
        center.dataset.spikeHelpCenter = 'true';
        supportList.appendChild(center);
      }
      if (!supportList.querySelector('[data-spike-replay-tutorial]')) {
        const replay = document.createElement('button');
        replay.type = 'button';
        replay.className = 'spike-command-row spike-onboarding-menu-entry';
        replay.dataset.spikeReplayTutorial = 'true';
        replay.innerHTML = '<span class="spike-command-icon" aria-hidden="true">▶</span><span><strong>Replay Tutorial</strong><small>Take the guided Spike tour again</small></span><b aria-hidden="true">›</b>';
        replay.addEventListener('click', () => {
          document.getElementById('menuClose')?.click();
          startTutorial(false);
        });
        supportList.appendChild(replay);
      }
      helpEntry = supportList;
      return;
    }

    // Pages without the feed's command menu get a normal, in-flow header link—never a floating overlay.
    const headerActions = document.querySelector('.header-actions, .spike-header-actions, header .actions');
    const header = document.querySelector('header.header, .header, header');
    const target = headerActions || header;
    if (!target) return;
    if (PAGE === 'help') {
      const replay = document.createElement('button');
      replay.type = 'button';
      replay.className = 'spike-onboarding-header-help';
      replay.textContent = 'Replay tutorial';
      replay.setAttribute('aria-label', 'Replay the Spike tutorial');
      replay.addEventListener('click', () => startTutorial(false));
      target.appendChild(replay);
      helpEntry = replay;
    } else {
      const link = document.createElement('a');
      link.className = 'spike-onboarding-header-help';
      link.href = 'help.html';
      link.textContent = 'Help';
      link.setAttribute('aria-label', 'Open Spike Help Center');
      link.title = 'Help Center';
      target.appendChild(link);
      helpEntry = link;
    }
  }

  function syncHelpButton() {
    // Help now lives in the app's navigation, not as a floating control over the feed.
    if (!helpEntry) return;
    const replay = helpEntry.matches?.('[data-spike-replay-tutorial], .spike-onboarding-header-help');
    if (replay && helpEntry.tagName === 'BUTTON') {
      helpEntry.setAttribute('aria-label', progress.status === 'in_progress' ? 'Resume tutorial' : 'Replay the Spike tutorial');
    }
  }
  function setContent({ eyebrow, title, description, label, count, percent, actions }) {
    root.querySelector('#spikeOnboardingEyebrow').textContent = eyebrow;
    root.querySelector('#spikeOnboardingTitle').textContent = title;
    root.querySelector('#spikeOnboardingDescription').textContent = description;
    root.querySelector('#spikeOnboardingProgressLabel').textContent = label;
    root.querySelector('#spikeOnboardingProgressCount').textContent = count;
    root.querySelector('#spikeOnboardingProgressBar').style.width = `${percent}%`;
    const actionsEl = root.querySelector('#spikeOnboardingActions');
    actionsEl.replaceChildren();
    for (const item of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `spike-onboarding-action ${item.primary ? 'is-primary' : ''}`;
      button.dataset.onboardingAction = item.action;
      button.textContent = item.text;
      if (item.href) button.dataset.href = item.href;
      actionsEl.appendChild(button);
    }
    actionsEl.querySelectorAll('[data-href]').forEach(button => button.addEventListener('click', () => {
      const href = button.dataset.href;
      if (!href) return;
      try { sessionStorage.setItem(RESUME_KEY, '1'); } catch {}
      window.location.href = href;
    }));
  }
  function show() {
    createUI();
    open = true;
    lastFocused = document.activeElement;
    root.hidden = false;
    document.body.classList.add('spike-onboarding-open');
    requestAnimationFrame(() => card?.focus());
  }
  async function closeTutorial() {
    if (!root || !open) return;
    if (progress.status === 'not_started') await persist({ status: 'skipped', skipped_at: new Date().toISOString() });
    open = false;
    root.hidden = true;
    document.body.classList.remove('spike-onboarding-open');
    if (progress.status === 'in_progress') persist({ status: 'in_progress' });
    try { lastFocused?.focus?.(); } catch {}
  }
  async function skipTutorial() {
    await persist({ status: 'skipped', skipped_at: new Date().toISOString() });
    closeTutorial();
  }
  async function startTutorial(reset) {
    createUI();
    if (reset) await persist({ status: 'in_progress', current_step: 0, completed_at: null, skipped_at: null });
    else if (progress.status !== 'in_progress') await persist({ status: 'in_progress', current_step: 0, completed_at: null, skipped_at: null });
    renderLesson();
    show();
  }
  function renderWelcome() {
    setContent({
      eyebrow: 'YOUR SPIKE JOURNEY', title: 'Welcome to Spike',
      description: 'Get a quick, guided introduction to the Feed, connections, messages, Rooms, notifications, and safety tools. This tour is optional and you can skip it whenever you want.',
      label: 'WELCOME', count: '', percent: 0,
      actions: [{ action:'start', text:'Start Tutorial', primary:true }, { action:'skip', text:'Skip for Now' }, { text:'Browse Help Center', href:'help.html' }]
    });
  }
  function renderLesson() {
    const step = progress.current_step;
    const lesson = LESSONS[step];
    if (!lesson) return renderWelcome();
    setContent({
      eyebrow: `STEP ${step + 1} · GETTING TO KNOW SPIKE`, title: lesson.title, description: lesson.description,
      label: 'YOUR SPIKE TOUR', count: `${step + 1} of ${LESSONS.length}`, percent: Math.round(((step + 1) / LESSONS.length) * 100),
      actions: [
        ...(step > 0 ? [{ action:'back', text:'Back' }] : []),
        { action:'explore', text:'Explore this page' },
        { action:'next', text: step === LESSONS.length - 1 ? 'Review finish' : 'Next', primary:true }
      ]
    });
  }
  async function nextStep() {
    if (progress.current_step >= LESSONS.length - 1) { renderCompletion(); return; }
    const next = progress.current_step + 1;
    await persist({ status: 'in_progress', current_step: next });
    const destination = LESSONS[next].page;
    if (!isCurrentPage(destination)) {
      try { sessionStorage.setItem(RESUME_KEY, '1'); } catch {}
      window.location.href = destination;
      return;
    }
    renderLesson();
  }
  async function previousStep() {
    const previous = Math.max(0, progress.current_step - 1);
    await persist({ status: 'in_progress', current_step: previous });
    const destination = LESSONS[previous].page;
    if (!isCurrentPage(destination)) {
      try { sessionStorage.setItem(RESUME_KEY, '1'); } catch {}
      window.location.href = destination;
      return;
    }
    renderLesson();
  }
  function renderCompletion() {
    setContent({
      eyebrow: 'YOU ARE READY', title: 'You’re ready to explore Spike',
      description: 'You’ve completed the getting-started tour. Explore at your own pace, and remember that the tutorial is always available from Help.',
      label: 'TOUR COMPLETE', count: `${LESSONS.length} of ${LESSONS.length}`, percent: 100,
      actions: [{ action:'finish', text:'Start Exploring', primary:true }, { action:'review', text:'Review last lesson' }]
    });
  }
  async function finishTutorial() {
    await persist({ status: 'completed', current_step: LESSONS.length - 1, completed_at: new Date().toISOString(), skipped_at: null });
    closeTutorial();
  }
  function isCurrentPage(path) {
    return String(window.location.pathname.split('/').pop() || 'index.html').toLowerCase() === path.toLowerCase();
  }
  function trapFocus(event) {
    const focusable = [...card.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async function init() {
    db = client();
    if (!db?.auth?.getSession) return;
    try {
      const { data, error } = await db.auth.getSession();
      if (error || !data?.session?.user?.id) return;
      user = data.session.user;
      createUI();
      await loadProgress();
      const autoResume = (() => { try { const value = sessionStorage.getItem(RESUME_KEY) === '1'; if (value) sessionStorage.removeItem(RESUME_KEY); return value; } catch { return false; } })();
      if (autoResume && progress.status === 'in_progress') {
        renderLesson(); show(); return;
      }
      if (progress.status === 'not_started') {
        const createdAt = Date.parse(user.created_at || '');
        const isNewAccount = Number.isFinite(createdAt) && Date.now() - createdAt < 7 * 24 * 60 * 60 * 1000;
        if (isNewAccount && PAGE === 'feed') { renderWelcome(); show(); }
      }
    } catch {
      // Tutorial failures must never block or interrupt the main SPIKE app.
    }
    syncHelpButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
