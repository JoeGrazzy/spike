/* SPIKE Room Page — Phase 1 foundation.
 * Owns only the individual room route. Uses the shared SPIKE Supabase client,
 * verifies the signed-in user, checks the existing Verified-access RPC,
 * loads one room, joins via the established RPC, and leaves explicitly.
 */
(() => {
  'use strict';
  if (window.__SPIKE_ROOM_PAGE_V1__) return;
  window.__SPIKE_ROOM_PAGE_V1__ = 'starting';

  const $ = (id) => document.getElementById(id);
  const ROOM_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TIMEOUTS = Object.freeze({ session: 12000, user: 12000, verified: 12000, room: 15000, join: 25000, leave: 20000 });
  const state = { client: null, roomId: null, room: null, user: null, joined: false, busy: false, leaving: false, attempt: 0 };

  function setText(id, value) { const node = $(id); if (node) node.textContent = String(value ?? ''); }
  function announce(message) { setText('roomLiveStatus', message); }
  function safeError(error, fallback) {
    const raw = String(error?.message || error?.details || fallback || 'Something went wrong.');
    return raw.replace(/\s+/g, ' ').trim().slice(0, 260);
  }
  function withTimeout(task, ms, label) {
    let timer;
    return Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out. Check your connection and try again.')), ms); })
    ]).finally(() => clearTimeout(timer));
  }
  function setProgress(percent, busy = true) {
    const track = $('progressTrack'), bar = $('progressBar');
    if (!track || !bar) return;
    track.hidden = !busy;
    track.classList.toggle('done', percent >= 100);
    bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
  }
  function setActions({ retry = false, leave = false, wallet = false, rooms = false } = {}) {
    $('retryButton').hidden = !retry;
    $('leaveButton').hidden = !leave;
    $('walletButton').hidden = !wallet;
    $('roomsButton').hidden = !rooms;
  }
  function setPanel(kind, title, message, eyebrow, icon) {
    const iconNode = $('connectionIcon');
    if (iconNode) { iconNode.textContent = icon || (kind === 'success' ? '✓' : kind === 'error' ? '!' : '⌁'); iconNode.className = 'connection-icon' + (kind === 'success' ? ' success' : kind === 'error' ? ' error' : ''); }
    setText('connectionTitle', title);
    setText('connectionMessage', message);
    setText('connectionEyebrow', eyebrow || (kind === 'success' ? 'YOU ARE CONNECTED' : kind === 'error' ? 'CONNECTION NEEDS ATTENTION' : 'GETTING THINGS READY'));
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function formatStart(value) {
    if (!value) return 'Scheduled room';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Scheduled room' : 'Starts ' + date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function renderRoom(room) {
    setText('roomTitle', room.title || 'SPIKE Room');
    setText('roomDescription', room.description || 'Come in and join the conversation.');
    setText('roomCategory', String(room.category || 'General').toUpperCase());
    setText('roomHost', room.host_id === state.user?.id ? 'You are the host' : 'Hosted on SPIKE');
    setText('roomCapacity', 'Up to ' + Number(room.max_participants || 0) + ' people');
    setText('roomAccess', room.visibility === 'private' ? 'Private room' : 'Public room');
    const label = room.status === 'scheduled' ? formatStart(room.scheduled_at) : room.status === 'live' ? 'LIVE NOW' : 'ROOM';
    setText('roomStatusLabel', label);
    $('statusDot')?.classList.toggle('live', room.status === 'live');
    $('statusDot')?.classList.toggle('scheduled', room.status === 'scheduled');
    document.title = (room.title || 'SPIKE Room') + ' — SPIKE';
  }
  function redirectToSignIn() {
    const next = location.pathname + location.search;
    location.replace('index.html?next=' + encodeURIComponent(next));
  }
  async function getClient() {
    const platform = window.SPIKE_PLATFORM;
    const client = platform?.getClient?.() || window.__SPIKE_SUPABASE__ || window.supabaseClient || window.sb || null;
    if (!client?.auth?.getSession || !client?.auth?.getUser || !client?.rpc || !client?.from) {
      throw new Error('SPIKE could not initialize its secure connection. Refresh the page.');
    }
    state.client = client;
    return client;
  }
  async function verifySession() {
    const client = await getClient();
    setPanel('loading', 'Restoring your session', 'Checking your existing SPIKE sign-in. This should only take a moment.', 'SECURE SIGN-IN');
    setProgress(12);
    const sessionResult = await withTimeout(() => client.auth.getSession(), TIMEOUTS.session, 'Session restore');
    if (sessionResult?.error) throw sessionResult.error;
    const session = sessionResult?.data?.session;
    if (!session?.access_token) { redirectToSignIn(); throw new Error('Please sign in to enter this room.'); }
    try { if (client.realtime?.setAuth) await client.realtime.setAuth(session.access_token); } catch (error) { console.info('[SPIKE Room] Realtime auth will be initialized when needed:', error?.message || error); }
    const userResult = await withTimeout(() => client.auth.getUser(), TIMEOUTS.user, 'User verification');
    if (userResult?.error) throw userResult.error;
    const user = userResult?.data?.user;
    if (!user?.id || user.id !== session.user?.id) { redirectToSignIn(); throw new Error('Your sign-in could not be verified. Please sign in again.'); }
    state.user = user;
    announce('Signed-in user verified.');
    return user;
  }
  async function verifyRoomAccess() {
    setPanel('loading', 'Checking room access', 'Confirming that your account currently has SPIKE Verified room access.', 'ACCESS CHECK');
    setProgress(35);
    const result = await withTimeout(() => state.client.rpc('spike_room_user_has_active_verified_subscription', { p_user_id: state.user.id }), TIMEOUTS.verified, 'Verified access check');
    if (result?.error) throw result.error;
    if (result?.data !== true) {
      setPanel('error', 'SPIKE Verified access required', 'An active SPIKE Verified subscription with approved identity is required to enter rooms. Your room has not been joined.', 'ACCESS NOT ACTIVE', '!');
      setProgress(0, false);
      setActions({ wallet: true, rooms: true });
      window.__SPIKE_ROOM_PAGE_V1__ = 'blocked';
      throw Object.assign(new Error('Verified access is required.'), { handled: true });
    }
  }
  async function fetchRoom() {
    setPanel('loading', 'Finding your room', 'Loading the room details and checking whether it is still available.', 'ROOM LOOKUP');
    setProgress(55);
    const columns = 'id,host_id,title,description,category,visibility,status,cover_url,appearance,max_participants,allow_chat,allow_speaker_requests,scheduled_at,started_at,ended_at,created_at,updated_at,active_host_id';
    const result = await withTimeout(() => state.client.from('spike_rooms').select(columns).eq('id', state.roomId).maybeSingle(), TIMEOUTS.room, 'Room lookup');
    if (result?.error) throw result.error;
    if (!result?.data) throw new Error('This room could not be found. It may be private, unavailable, or the link may have expired.');
    if (result.data.status === 'ended') throw new Error('This room has ended. Browse SPIKE Rooms to find another conversation.');
    state.room = result.data;
    renderRoom(state.room);
    // Public host details are optional; never let a profile lookup block room joining.
    try {
      const hostResult = await withTimeout(() => state.client.rpc('get_public_profiles', { p_user_ids: [state.room.host_id] }), 5000, 'Host profile lookup');
      const host = hostResult?.data?.[0];
      if (host) setText('roomHost', state.room.host_id === state.user?.id ? 'You are the host' : (host.display_name || host.username || 'SPIKE member'));
    } catch (error) { console.info('[SPIKE Room] Host profile is temporarily unavailable:', error?.message || error); }
    announce('Room details loaded.');
  }
  async function joinRoom() {
    if (state.busy || state.joined) return;
    state.busy = true;
    state.attempt += 1;
    setActions();
    setPanel('loading', 'Joining ' + (state.room?.title || 'your room'), 'Confirming your membership securely. Keep this page open while SPIKE completes the join.', 'JOINING ROOM');
    setProgress(76);
    announce('Joining room. Attempt ' + state.attempt + '.');
    try {
      const result = await withTimeout(() => state.client.rpc('spike_rooms_join', { p_room_id: state.roomId }), TIMEOUTS.join, 'Room join');
      if (result?.error) throw result.error;
      if (result?.data && result.data.ok === false) throw new Error('SPIKE did not confirm your room membership. Please try again.');
      state.joined = true;
      setProgress(100, false);
      setPanel('success', 'You are in the room', 'Your membership is confirmed. Room chat and the member list are ready below.', 'CONNECTED TO SPIKE', '✓');
      setActions({ leave: true, rooms: true });
      setText('phaseNote', '');
      const note = $('phaseNote');
      if (note) { note.innerHTML = '<span class="note-mark">✦</span><p><strong>Connection confirmed</strong><br>Your room chat and member list are ready below.</p>'; }
      window.__SPIKE_ROOM_PAGE_V1__ = 'ready';
      window.__SPIKE_ROOM_CONTEXT__ = { client: state.client, room: state.room, user: state.user };
      window.dispatchEvent(new CustomEvent('spike:room-ready', { detail: window.__SPIKE_ROOM_CONTEXT__ }));
      announce('Room membership confirmed.');
    } catch (error) {
      console.error('[SPIKE Room] Join failed:', error);
      setProgress(0, false);
      setPanel('error', 'Could not finish joining', safeError(error, 'SPIKE could not confirm your membership.'), 'JOIN FAILED', '!');
      setActions({ retry: true, rooms: true });
      window.__SPIKE_ROOM_PAGE_V1__ = 'failed';
      announce('Room join failed. Retry is available.');
    } finally { state.busy = false; }
  }
  async function leaveRoom(redirectAfter = false) {
    if (!state.joined || state.leaving || state.busy) return;
    const accepted = window.SPIKEPremiumDialog?.confirm ? await window.SPIKEPremiumDialog.confirm({title:'Leave this room?',message:'You will leave the conversation. The room will stay available, and hosting will be handed to an eligible participant when needed.',confirmText:'Leave room',cancelText:'Stay',danger:true,kicker:'SPIKE ROOM'}):false;
    if (!accepted) return;
    state.leaving = true;
    const button = $('leaveButton');
    if (button) { button.disabled = true; button.textContent = 'Leaving…'; }
    setPanel('loading', 'Leaving the room', 'Updating your room membership. Please wait.', 'LEAVING ROOM');
    setProgress(55);
    try {
      const result = await withTimeout(() => state.client.rpc('spike_rooms_leave', { p_room_id: state.roomId }), TIMEOUTS.leave, 'Room leave');
      if (result?.error) throw result.error;
      state.joined = false;
      window.dispatchEvent(new Event('spike:room-left'));
      setProgress(100, false);
      setPanel('success', 'You have left the room', 'Your membership has been updated. You can return to the room list now.', 'LEFT ROOM', '✓');
      setActions({ rooms: true });
      window.__SPIKE_ROOM_PAGE_V1__ = 'left';
      announce('You have left the room.');
      if (redirectAfter) location.assign('rooms.html');
    } catch (error) {
      console.error('[SPIKE Room] Leave failed:', error);
      setProgress(0, false);
      setPanel('error', 'Could not leave the room', safeError(error, 'SPIKE could not update your membership.'), 'LEAVE FAILED', '!');
      setActions({ leave: true, rooms: true });
      if (button) { button.disabled = false; button.textContent = 'Retry leave'; }
    } finally { state.leaving = false; }
  }
  async function start() {
    const params = new URLSearchParams(location.search);
    state.roomId = params.get('id');
    if (!ROOM_ID_RE.test(state.roomId || '')) {
      setPanel('error', 'Invalid room link', 'This link does not contain a valid room ID. Return to Rooms and open a room again.', 'LINK NOT VALID', '!');
      setProgress(0, false);
      setActions({ rooms: true });
      window.__SPIKE_ROOM_PAGE_V1__ = 'invalid';
      return;
    }
    try {
      await verifySession();
      await verifyRoomAccess();
      await fetchRoom();
      await joinRoom();
    } catch (error) {
      if (error?.handled) return;
      console.error('[SPIKE Room] Startup failed:', error);
      setProgress(0, false);
      setPanel('error', 'Room could not load', safeError(error, 'SPIKE could not initialize this room.'), 'CONNECTION ERROR', '!');
      setActions({ retry: true, rooms: true });
      window.__SPIKE_ROOM_PAGE_V1__ = 'failed';
      announce('Room startup failed. Retry is available.');
    }
  }
  async function retry() {
    const retryButton = $('retryButton');
    if (retryButton) retryButton.disabled = true;
    try {
      if (state.joined) return;
      if (!state.client) await getClient();
      if (!state.user) await verifySession();
      if (!state.room) await verifyRoomAccess().then(fetchRoom);
      await joinRoom();
    } catch (error) {
      if (error?.handled) return;
      console.error('[SPIKE Room] Retry failed:', error);
      setPanel('error', 'Still unable to connect', safeError(error, 'Please check your connection and try again.'), 'RETRY FAILED', '!');
      setActions({ retry: true, rooms: true });
      window.__SPIKE_ROOM_PAGE_V1__ = 'failed';
    } finally { if (retryButton) retryButton.disabled = false; }
  }
  function bind() {
    $('retryButton')?.addEventListener('click', retry);
    $('leaveButton')?.addEventListener('click', () => leaveRoom(false));
    document.querySelectorAll?.('a[href="rooms.html"]').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (!state.joined) return;
        event.preventDefault();
        if (state.leaving) return;
        void leaveRoom(true);
      });
    });
  }
  function boot() {
    bind();
    // A hard watchdog is a final safety net, not the primary timeout mechanism.
    const watchdog = setTimeout(() => {
      if (['ready', 'left', 'blocked', 'invalid', 'failed'].includes(window.__SPIKE_ROOM_PAGE_V1__)) return;
      setPanel('error', 'Connection is taking too long', 'The room did not finish initializing. You can retry safely; the join operation is designed to be repeatable.', 'TIMEOUT', '!');
      setProgress(0, false);
      setActions({ retry: true, rooms: true });
      window.__SPIKE_ROOM_PAGE_V1__ = 'failed';
    }, 90000);
    window.addEventListener('pagehide', () => clearTimeout(watchdog), { once: true });
    void start().finally(() => clearTimeout(watchdog));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
