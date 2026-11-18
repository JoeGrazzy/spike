/* SPIKE Calling V1 — isolated one-to-one call UI and Agora RTC client.
 * This module does not touch the existing MediaRecorder voice-note flow.
 */
(() => {
  'use strict';
  if (window.__SPIKE_CALLING_V1__) return;
  window.__SPIKE_CALLING_V1__ = true;

  const db = window.__SPIKE_SUPABASE__ || window.supabaseClient || window.sb || window.db;
  const $ = (id) => document.getElementById(id);
  const ui = {
    voice: $('spikeVoiceCall'), video: $('spikeVideoCall'), shade: $('spikeCallShade'),
    title: $('spikeCallTitle'), subtitle: $('spikeCallSubtitle'), avatar: $('spikeCallAvatar'),
    status: $('spikeCallStatus'), remoteVideo: $('spikeCallRemoteVideo'), localVideo: $('spikeCallLocalVideo'), videoStage: $('spikeCallVideoStage'),
    remoteAudio: $('spikeCallRemoteAudio'), accept: $('spikeCallAccept'), reject: $('spikeCallReject'),
    hangup: $('spikeCallHangup'), mute: $('spikeCallMute'), camera: $('spikeCallCamera'),
  };
  if (!db) return;
  function ensureCallOverlay() {
    if (!ui.shade) {
      const root = document.createElement('div');
      root.innerHTML = `<div id="spikeCallShade" class="spike-call-shade" aria-hidden="true" hidden><section class="spike-call-panel" role="dialog" aria-modal="true" aria-labelledby="spikeCallTitle"><div class="spike-call-person"><div id="spikeCallAvatar" class="spike-call-avatar">S</div><div id="spikeCallTitle" class="spike-call-title">SPIKE member</div><div id="spikeCallSubtitle" class="spike-call-subtitle">Calling</div></div><div id="spikeCallVideoStage" class="spike-call-video-stage"><div id="spikeCallRemoteVideo"></div><div id="spikeCallLocalVideo" hidden></div></div><audio id="spikeCallRemoteAudio" autoplay></audio><button id="spikeCallStatus" class="spike-call-status" type="button" role="status" aria-live="polite">Preparing call…</button><div class="spike-call-controls"><button id="spikeCallAccept" class="spike-call-control accept" type="button" aria-label="Accept call" hidden><i class="fa-solid fa-phone"></i></button><button id="spikeCallReject" class="spike-call-control danger" type="button" aria-label="Decline call" hidden><i class="fa-solid fa-phone-slash"></i></button><button id="spikeCallMute" class="spike-call-control" type="button" aria-label="Mute microphone" hidden><i class="fa-solid fa-microphone"></i></button><button id="spikeCallCamera" class="spike-call-control" type="button" aria-label="Turn camera off" hidden><i class="fa-solid fa-video"></i></button><button id="spikeCallHangup" class="spike-call-control danger" type="button" aria-label="End call"><i class="fa-solid fa-phone-slash"></i></button></div></section></div>`;
      document.body.append(root.firstElementChild);
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'css/spike-calling-v1.css?v=calling-v1-agora-20261118'; document.head.append(link);
    }
    for (const key of ['shade','title','subtitle','avatar','status','remoteVideo','localVideo','videoStage','remoteAudio','accept','reject','hangup','mute','camera']) {
      const ids = { shade:'spikeCallShade', title:'spikeCallTitle', subtitle:'spikeCallSubtitle', avatar:'spikeCallAvatar', status:'spikeCallStatus', remoteVideo:'spikeCallRemoteVideo', localVideo:'spikeCallLocalVideo', videoStage:'spikeCallVideoStage', remoteAudio:'spikeCallRemoteAudio', accept:'spikeCallAccept', reject:'spikeCallReject', hangup:'spikeCallHangup', mute:'spikeCallMute', camera:'spikeCallCamera' };
      ui[key] = $(ids[key]);
    }
  }
  ensureCallOverlay();

  const params = new URLSearchParams(location.search);
  const peerId = params.get('to') || params.get('id') || ''; 
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const CALL_FUNCTION = 'spike-call-control';
  const TOKEN_FUNCTION = 'spike-agora-token';
  const AGORA_SCRIPT = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.24.10.js';
  let me = null, peerName = 'SPIKE member', peerAvatar = '', inbox = null;
  let activeCall = null, rtcClient = null, agoraSdk = null, mode = 'idle';
  let localAudioTrack = null, localVideoTrack = null;
  let micEnabled = true, cameraEnabled = false, remoteTracks = new Set(), remoteAudioTracks = new Set(), callClock = null;
  let callStartedAt = 0, busy = false;

  function setStatus(message) { if (ui.status) ui.status.textContent = message; }
  function show() { ui.shade.hidden = false; ui.shade.classList.add('show'); ui.shade.setAttribute('aria-hidden', 'false'); document.body.classList.add('spike-call-open'); }
  function hide() { ui.shade.classList.remove('show'); ui.shade.setAttribute('aria-hidden', 'true'); ui.shade.hidden = true; document.body.classList.remove('spike-call-open'); }
  function setName(name, avatar) {
    peerName = String(name || 'SPIKE member'); peerAvatar = String(avatar || '');
    ui.title.textContent = peerName;
    ui.avatar.textContent = peerName.replace(/^@/, '').slice(0, 1).toUpperCase() || 'S';
    if (peerAvatar) { try { const url = new URL(peerAvatar, location.href); if (['https:', 'http:'].includes(url.protocol)) { const img = document.createElement('img'); img.src = url.href; img.alt = ''; ui.avatar.replaceChildren(img); } } catch (_) {} }
  }
  function setMode(next) {
    mode = next;
    const voiceNoteButton = $('voiceNote'); if (voiceNoteButton) voiceNoteButton.disabled = !!activeCall;
    const incoming = next === 'incoming';
    const ringing = next === 'outgoing';
    const connecting = next === 'connecting';
    const connected = next === 'connected';
    ui.accept.hidden = !incoming;
    ui.reject.hidden = !incoming;
    ui.hangup.hidden = incoming;
    ui.mute.hidden = !(connecting || connected);
    ui.camera.hidden = !(activeCall?.call_type === 'video' && (connecting || connected));
    ui.videoStage.hidden = activeCall?.call_type !== 'video';
    ui.remoteVideo.hidden = activeCall?.call_type !== 'video';
    ui.localVideo.hidden = activeCall?.call_type !== 'video';
    if (ringing) setStatus('Calling… waiting for an answer');
    if (incoming) setStatus('Incoming ' + (activeCall?.call_type === 'video' ? 'video' : 'voice') + ' call');
    if (connecting) setStatus('Connecting securely…');
    if (connected) setStatus('00:00');
    show();
  }
  function clearClock() { if (callClock) clearInterval(callClock); callClock = null; }
  function startClock() {
    clearClock(); callStartedAt = Date.now();
    callClock = setInterval(() => {
      const seconds = Math.floor((Date.now() - callStartedAt) / 1000);
      setStatus(`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
    }, 1000);
  }
  function clearMediaElements() {
    [ui.remoteVideo, ui.localVideo, ui.remoteAudio].forEach((el) => {
      if (!el) return;
      try { el.pause?.(); } catch (_) {}
      if ('srcObject' in el) el.srcObject = null;
      el.replaceChildren?.();
    });
    remoteTracks.clear(); remoteAudioTracks.clear();
  }
  async function disconnectRoom() {
    const tracks = [localAudioTrack, localVideoTrack].filter(Boolean);
    try { if (rtcClient && tracks.length) await rtcClient.unpublish(tracks); } catch (_) {}
    tracks.forEach((track) => { try { track.stop(); track.close(); } catch (_) {} });
    localAudioTrack = null; localVideoTrack = null;
    if (rtcClient) {
      try { await rtcClient.leave(); } catch (_) {}
      try { rtcClient.removeAllListeners(); } catch (_) {}
      rtcClient = null;
    }
    clearMediaElements();
  }
  let closingCall = false;
  async function closeCall(message = 'Call ended') {
    if (closingCall) return;
    closingCall = true;
    clearClock();
    activeCall = null;
    await disconnectRoom();
    busy = false; micEnabled = true; cameraEnabled = false;
    const voiceNoteButton = $('voiceNote'); if (voiceNoteButton) voiceNoteButton.disabled = false;
    ui.subtitle.textContent = message;
    setStatus(message);
    ui.mute.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    ui.camera.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
    setTimeout(() => { if (!activeCall) hide(); closingCall = false; }, 900);
  }
  async function invokeControl(body) {
    const { data, error } = await db.functions.invoke(CALL_FUNCTION, { body });
    if (error) {
      let message = error.message || 'Calling service is unavailable.';
      try { const context = error.context; if (context?.json) { const payload = await context.json(); message = payload.error || message; } } catch (_) {}
      throw new Error(message);
    }
    if (!data?.call) throw new Error(data?.error || 'Calling request was not confirmed.');
    return data.call;
  }
  async function loadAgora() {
    if (window.AgoraRTC) return window.AgoraRTC;
    if (agoraSdk) return agoraSdk;
    agoraSdk = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = AGORA_SCRIPT; script.async = true; script.crossOrigin = 'anonymous';
      script.onload = () => window.AgoraRTC ? resolve(window.AgoraRTC) : reject(new Error('Agora RTC SDK did not initialize.'));
      script.onerror = () => reject(new Error('Could not load the Agora media client. Check your connection and try again.'));
      document.head.append(script);
    });
    return agoraSdk;
  }
  async function connectMedia(call) {
    if (!activeCall || activeCall.id !== call.id || rtcClient) return;
    setMode('connecting');
    const { data, error } = await db.functions.invoke(TOKEN_FUNCTION, { body: { call_id: call.id } });
    if (error || !data?.app_id || !data?.rtc_token || !data?.channel_name || data?.uid == null) {
      throw new Error(error?.message || data?.error || 'Could not authorize this Agora call.');
    }
    const AgoraRTC = await loadAgora();
    if (!AgoraRTC.checkSystemRequirements()) throw new Error('This browser does not support Agora voice/video calling.');
    AgoraRTC.onAudioAutoplayFailed = () => { ui.status.dataset.enableAudio = '1'; setStatus('Tap here to enable call audio'); };
    rtcClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    rtcClient.on('user-published', async (user, mediaType) => {
      try {
        await rtcClient.subscribe(user, mediaType);
        if (mediaType === 'video' && user.videoTrack) {
          ui.remoteVideo.replaceChildren();
          user.videoTrack.play(ui.remoteVideo);
          remoteTracks.add(user.videoTrack);
        } else if (mediaType === 'audio' && user.audioTrack) {
          user.audioTrack.play();
          remoteTracks.add(user.audioTrack); remoteAudioTracks.add(user.audioTrack);
        }
      } catch (error) { console.warn('[SPIKE calling] remote subscription failed:', error?.message || error); }
    });
    rtcClient.on('user-unpublished', (user, mediaType) => {
      if (mediaType === 'video') { try { user.videoTrack?.stop(); } catch (_) {} ui.remoteVideo.replaceChildren(); }
      if (mediaType === 'audio') { try { user.audioTrack?.stop(); } catch (_) {} remoteAudioTracks.delete(user.audioTrack); remoteTracks.delete(user.audioTrack); }
    });
    rtcClient.on('user-left', () => {
      if (activeCall && mode === 'connected') {
        const callId = activeCall.id;
        void invokeControl({ action: 'end', call_id: callId }).catch(() => {}).finally(() => closeCall('The other person left the call'));
      }
    });
    rtcClient.on('token-privilege-will-expire', async () => {
      try {
        const renewed = await db.functions.invoke(TOKEN_FUNCTION, { body: { call_id: call.id } });
        if (renewed.error || !renewed.data?.rtc_token) throw new Error(renewed.error?.message || renewed.data?.error || 'Token renewal failed');
        await rtcClient?.renewToken(renewed.data.rtc_token);
      } catch (error) { console.warn('[SPIKE calling] Agora token renewal failed:', error?.message || error); }
    });
    await rtcClient.join(data.app_id, data.channel_name, data.rtc_token, data.uid);
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    const publishTracks = [localAudioTrack];
    if (call.call_type === 'video') {
      localVideoTrack = await AgoraRTC.createCameraVideoTrack();
      localVideoTrack.play(ui.localVideo);
      publishTracks.push(localVideoTrack);
      cameraEnabled = true;
    }
    await rtcClient.publish(publishTracks);
    const { error: connectedError } = await db.rpc('spike_mark_call_connected', { p_call_id: call.id });
    if (connectedError) console.warn('[SPIKE calling] connected marker failed:', connectedError.message);
    setMode('connected'); startClock();
  }
  async function startCall(type) {
    if (busy || activeCall || !me || !uuid.test(peerId || '') || peerId === me.id) return;
    if ($('recordingTray') && !$('recordingTray').hidden) { setStatus('Finish or cancel the voice note before starting a call.'); show(); setTimeout(() => { if (!activeCall) hide(); }, 2200); return; }
    busy = true; ui.voice.disabled = ui.video.disabled = true;
    try {
      // Permission prompt is deliberate and happens only after the user taps Call.
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true, ...(type === 'video' ? { video: true } : {}) });
      probe.getTracks().forEach((track) => track.stop());
      const call = await invokeControl({ action: 'start', callee_id: peerId, call_type: type });
      activeCall = call; setName(peerName, peerAvatar); ui.subtitle.textContent = type === 'video' ? 'Video call' : 'Voice call';
      setMode('outgoing');
      ui.subtitle.textContent = 'Calling…';
      const expires = Date.parse(call.ringing_expires_at || '') || Date.now() + 45000;
      setTimeout(() => { if (activeCall?.id === call.id && mode === 'outgoing') { void invokeControl({ action: 'cancel', call_id: call.id }).catch(() => {}).finally(() => closeCall('No answer')); } }, Math.max(0, expires - Date.now()));
    } catch (error) {
      setStatus(error.message || 'Could not start call.'); show(); setTimeout(() => { if (!activeCall) hide(); }, 2400);
    } finally { busy = false; ui.voice.disabled = ui.video.disabled = false; }
  }
  async function acceptCall() {
    if (!activeCall || busy) return;
    busy = true; ui.accept.disabled = true;
    try {
      const call = await invokeControl({ action: 'accept', call_id: activeCall.id });
      activeCall = call;
      await connectMedia(call);
    } catch (error) {
      setStatus(error.message || 'Could not join the call.');
      try { await invokeControl({ action: 'end', call_id: activeCall.id }); } catch (_) {}
      await closeCall('Call could not be connected');
    } finally { busy = false; ui.accept.disabled = false; }
  }
  async function endCall(action = 'end') {
    if (!activeCall || busy) return;
    busy = true; const call = activeCall;
    try { await invokeControl({ action, call_id: call.id }); }
    catch (error) { console.warn('[SPIKE calling] end request failed:', error.message); }
    await closeCall(action === 'reject' ? 'Call declined' : action === 'cancel' ? 'Call cancelled' : 'Call ended');
    busy = false;
  }
  async function handleCallEvent(event, payload) {
    const call = payload?.payload || payload;
    if (!call?.call_id) return;
    if (event === 'call_invite') {
      if (activeCall) {
        try { await invokeControl({ action: 'reject', call_id: call.call_id }); } catch (_) {}
        return;
      }
      if (call.caller_id) {
        try { const { data } = await db.rpc('get_public_profiles', { p_user_ids: [call.caller_id] }); const profile = Array.isArray(data) ? data[0] : null; if (profile) setName(profile.username ? '@' + String(profile.username).replace(/^@/, '') : (profile.display_name || profile.full_name || profile.name || 'SPIKE member'), profile.avatar_url || profile.avatar || profile.photo_url || ''); } catch (_) {}
      }
      activeCall = { id: call.call_id, call_type: call.call_type, caller_id: call.caller_id, callee_id: call.callee_id, ringing_expires_at: call.ringing_expires_at };
      ui.subtitle.textContent = call.call_type === 'video' ? 'Incoming video call' : 'Incoming voice call';
      setMode('incoming');
      const expires = Date.parse(call.ringing_expires_at || '') || Date.now() + 45000;
      setTimeout(() => { if (activeCall?.id === call.call_id && mode === 'incoming') { void invokeControl({ action: 'end', call_id: call.call_id }).catch(() => {}).finally(() => closeCall('Missed call')); } }, Math.max(0, expires - Date.now()));
    } else if (activeCall?.id === call.call_id) {
      if (event === 'call_accepted' && mode === 'outgoing') {
        activeCall = { ...activeCall, ...call };
        try { await connectMedia(activeCall); }
        catch (error) { setStatus(error.message || 'Could not connect.'); await endCall('end'); }
      } else if (['call_rejected', 'call_cancelled', 'call_ended', 'call_updated'].includes(event) && ['ended','rejected','cancelled','missed','failed'].includes(call.status)) {
        await closeCall(call.status === 'rejected' ? 'Call declined' : call.status === 'missed' ? 'Missed call' : 'Call ended');
      }
    }
  }
  async function subscribeInbox() {
    const { data } = await db.auth.getSession();
    const session = data?.session;
    me = session?.user || null;
    if (!me) return;
    if (session.access_token && db.realtime?.setAuth) await db.realtime.setAuth(session.access_token);
    if (inbox) await db.removeChannel(inbox);
    inbox = db.channel(`user:${me.id}:calls`, { config: { private: true } });
    ['call_invite','call_accepted','call_rejected','call_cancelled','call_ended','call_updated'].forEach((event) => {
      inbox.on('broadcast', { event }, (payload) => { void handleCallEvent(event, payload); });
    });
    inbox.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('[SPIKE calling] private call inbox unavailable:', status);
    });
  }

  ui.voice?.addEventListener('click', () => void startCall('voice'));
  ui.video?.addEventListener('click', () => void startCall('video'));
  ui.status.addEventListener('click', () => { if (ui.status.dataset.enableAudio === '1') { remoteAudioTracks.forEach((track) => { try { track.play(); } catch (_) {} }); delete ui.status.dataset.enableAudio; setStatus('Connected'); } });
  ui.accept.addEventListener('click', () => void acceptCall());
  ui.reject.addEventListener('click', () => void endCall('reject'));
  ui.hangup.addEventListener('click', () => void endCall(mode === 'outgoing' ? 'cancel' : 'end'));
  ui.mute.addEventListener('click', async () => {
    if (!localAudioTrack) return;
    try { micEnabled = !micEnabled; await localAudioTrack.setEnabled(micEnabled); ui.mute.innerHTML = micEnabled ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>'; ui.mute.setAttribute('aria-label', micEnabled ? 'Mute microphone' : 'Unmute microphone'); }
    catch (error) { micEnabled = !micEnabled; setStatus('Microphone control failed.'); }
  });
  ui.camera.addEventListener('click', async () => {
    if (!localVideoTrack) return;
    try { cameraEnabled = !cameraEnabled; await localVideoTrack.setEnabled(cameraEnabled); ui.camera.innerHTML = cameraEnabled ? '<i class="fa-solid fa-video"></i>' : '<i class="fa-solid fa-video-slash"></i>'; }
    catch (_) { cameraEnabled = !cameraEnabled; setStatus('Camera control failed.'); }
  });
  window.addEventListener('pagehide', () => {
    clearClock();
    if (activeCall?.id) void invokeControl({ action: 'end', call_id: activeCall.id }).catch(() => {});
    if (rtcClient) void disconnectRoom(); if (inbox) void db.removeChannel(inbox);
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted) subscribeInbox().catch((error) => console.warn('[SPIKE calling] inbox restore failed:', error.message)); });
  db.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setTimeout(() => subscribeInbox().catch((error) => console.warn('[SPIKE calling] inbox refresh failed:', error.message)), 0); });

  const nameEl = $('name'), avatarEl = $('avatar');
  setName(nameEl?.textContent || 'SPIKE member', avatarEl?.querySelector('img')?.src || '');
  async function refreshPeerIdentity() {
    if (!peerId || !uuid.test(peerId)) return;
    try {
      const { data, error } = await db.rpc('get_public_profiles', { p_user_ids: [peerId] });
      if (error || !Array.isArray(data) || !data[0]) return;
      const profile = data[0];
      const display = profile.username ? '@' + String(profile.username).replace(/^@/, '') : (profile.display_name || profile.full_name || profile.name || 'SPIKE member');
      const photo = profile.avatar_url || profile.avatar || profile.photo_url || '';
      setName(display, photo);
    } catch (_) {}
  }
  subscribeInbox().then(refreshPeerIdentity).catch((error) => console.warn('[SPIKE calling] inbox setup failed:', error.message));
})();
