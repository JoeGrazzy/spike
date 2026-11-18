/* SPIKE Calling v2 — isolated direct-message voice/video calling.
 * Supabase owns auth, durable call state and signaling; WebRTC owns media transport.
 * No legacy calling module is imported. SPIKE Rooms and voice notes remain independent.
 */
(() => {
  'use strict';
  if (window.SpikeCallingV2) return;

  const TABLE = 'spike_dm_calls_v2';
  const ICE_TABLE = 'spike_dm_call_ice_v2';
  const SUPABASE_URL = 'https://cjqpyndceqyqsijihxbb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw';
  const RING_MS = 45000;
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const $ = id => document.getElementById(id);
  let db = null, me = null, inboxChannel = null, current = null, initialized = false, ringContext = null, ringTimer = null;
  let pagePeer = null, pagePeerName = 'SPIKE member', pagePeerAvatar = '';

  function mount() {
    if ($('spikeCallOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'spikeCallOverlay';
    overlay.className = 'spike-call-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="spike-call-panel" role="dialog" aria-modal="true" aria-labelledby="spikeCallName">
        <div class="spike-call-topline"><span class="spike-call-brand"><i class="fa-solid fa-bolt"></i> SPIKE CALL</span><span id="spikeCallType" class="spike-call-type">VOICE</span></div>
        <div class="spike-call-video-stage" id="spikeCallVideoStage" hidden>
          <video id="spikeCallRemoteVideo" class="spike-call-remote-video" autoplay playsinline></video>
          <video id="spikeCallLocalVideo" class="spike-call-local-video" autoplay muted playsinline></video>
        </div>
        <div class="spike-call-person" id="spikeCallPerson">
          <div class="spike-call-avatar" id="spikeCallAvatar">S</div>
          <h2 id="spikeCallName">SPIKE member</h2>
          <p id="spikeCallStatus" role="status" aria-live="polite">Preparing call…</p>
          <div id="spikeCallTimer" class="spike-call-timer" hidden>00:00</div>
        </div>
        <audio id="spikeCallRemoteAudio" autoplay playsinline></audio>
        <div class="spike-call-actions" id="spikeCallActions"></div>
        <p class="spike-call-footnote" id="spikeCallFootnote">Private call · SPIKE</p>
      </section>`;
    document.body.append(overlay);
  }

  function setStatus(message) { const node = $('spikeCallStatus'); if (node) node.textContent = message; }
  function stopRingtone() {
    if (ringTimer) clearInterval(ringTimer);
    ringTimer = null;
    if (ringContext) { try { ringContext.close(); } catch (_) {} }
    ringContext = null;
    try { navigator.vibrate?.(0); } catch (_) {}
    $('spikeCallOverlay')?.classList.remove('is-ringing');
  }
  function startRingtone() {
    stopRingtone();
    $('spikeCallOverlay')?.classList.add('is-ringing');
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        ringContext = new AudioContextClass();
        const ringOnce = () => {
          if (!ringContext || ringContext.state === 'closed') return;
          if (ringContext.state === 'suspended') ringContext.resume().catch(()=>{});
          const now = ringContext.currentTime;
          [0, .22].forEach(offset => {
            const oscillator = ringContext.createOscillator();
            const gain = ringContext.createGain();
            oscillator.type = 'sine'; oscillator.frequency.value = 480;
            gain.gain.setValueAtTime(.0001, now + offset);
            gain.gain.exponentialRampToValueAtTime(.075, now + offset + .025);
            gain.gain.exponentialRampToValueAtTime(.0001, now + offset + .19);
            oscillator.connect(gain); gain.connect(ringContext.destination);
            oscillator.start(now + offset); oscillator.stop(now + offset + .2);
          });
        };
        ringOnce(); ringTimer = setInterval(ringOnce, 1500);
      }
    } catch (error) { console.info('[SPIKE call v2] ringtone unavailable:', error?.message || error); }
    try { navigator.vibrate?.([220,120,220]); } catch (_) {}
  }
  function showOverlay() { mount(); $('spikeCallOverlay').hidden = false; $('spikeCallOverlay').setAttribute('aria-hidden', 'false'); document.body.classList.add('spike-call-open'); }
  function hideOverlay() { const node = $('spikeCallOverlay'); if (!node) return; node.hidden = true; node.setAttribute('aria-hidden', 'true'); document.body.classList.remove('spike-call-open'); }
  function setPerson(name, avatar) {
    $('spikeCallName').textContent = name || 'SPIKE member';
    const node = $('spikeCallAvatar');
    node.replaceChildren();
    if (avatar) { const img = document.createElement('img'); img.src = avatar; img.alt = ''; img.onerror = () => img.remove(); node.append(img); }
    else node.textContent = (name || 'S').trim().split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase() || 'S';
  }
  function action(label, icon, handler, className = '') {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `spike-call-action ${className}`.trim();
    button.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span>${esc(label)}</span>`;
    button.addEventListener('click', handler); $('spikeCallActions').append(button); return button;
  }
  function renderActions(mode) {
    const root = $('spikeCallActions'); root.replaceChildren();
    if (mode === 'incoming') {
      action('Decline', 'fa-phone-slash', () => finish('rejected'), 'is-decline');
      action('Accept', 'fa-phone', acceptCall, 'is-accept');
    } else if (mode === 'accepting') {
      action('Decline', 'fa-phone-slash', () => finish('rejected'), 'is-decline');
    } else if (mode === 'active') {
      action('Mute', 'fa-microphone-slash', toggleMute, 'is-neutral');
      if (current?.type === 'video') {
        action('Camera off', 'fa-video-slash', toggleCamera, 'is-neutral');
        action('Flip', 'fa-camera-rotate', switchCamera, 'is-neutral');
      }
      action('End', 'fa-phone-slash', () => finish('ended'), 'is-decline');
    } else if (mode === 'outgoing') {
      action('Cancel', 'fa-phone-slash', () => finish('cancelled'), 'is-decline');
    }
  }
  function removeChannel(channel) { if (channel && db) { try { db.removeChannel(channel); } catch (_) {} } }
  function stopMedia() {
    stopRingtone();
    if (!current) return;
    if (current.timer) clearInterval(current.timer);
    if (current.heartbeatTimer) clearInterval(current.heartbeatTimer);
    if (current.connectionTimer) clearTimeout(current.connectionTimer);
    if (current.disconnectTimer) clearTimeout(current.disconnectTimer);
    try { current.notification?.close?.(); } catch (_) {}
    if (current.expiryTimer) clearTimeout(current.expiryTimer);
    if (current.pc) { current.pc.onicecandidate = null; current.pc.ontrack = null; current.pc.onconnectionstatechange = null; try { current.pc.close(); } catch (_) {} }
    for (const stream of [current.localStream, current.remoteStream]) stream?.getTracks?.().forEach(track => { try { track.stop(); } catch (_) {} });
    removeChannel(current.callChannel); removeChannel(current.iceChannel);
    if ($('spikeCallRemoteAudio')) $('spikeCallRemoteAudio').srcObject = null;
    if ($('spikeCallRemoteVideo')) $('spikeCallRemoteVideo').srcObject = null;
    if ($('spikeCallLocalVideo')) $('spikeCallLocalVideo').srcObject = null;
  }
  function cleanup() { stopMedia(); current = null; hideOverlay(); }
  function armConnectionTimeout() {
    if (!current?.pc || current.status !== 'accepted' || current.connectionTimer) return;
    const callId = current.callId;
    current.connectionTimer = setTimeout(() => {
      if (current?.callId === callId && current.pc?.connectionState !== 'connected') {
        void finish('failed', 'The other device did not establish a media connection.');
      }
    }, 35000);
  }
  function startHeartbeat() {
    if (!current?.callId || current.status !== 'accepted' || current.heartbeatTimer) return;
    current.heartbeatTimer = setInterval(async () => {
      const callId = current?.callId;
      if (!callId || current?.status !== 'accepted') return;
      try {
        const heartbeatField = current.role === 'caller' ? 'caller_heartbeat_at' : 'callee_heartbeat_at';
        const { data, error } = await db.from(TABLE).update({ [heartbeatField]:new Date().toISOString() }).eq('id',callId).eq('status','accepted').select('id').maybeSingle();
        if (error) console.warn('[SPIKE call v2] heartbeat delayed:', error.message);
        else if (!data && current?.callId === callId) setStatus('Call session ended on the other device.');
      } catch (error) { console.warn('[SPIKE call v2] heartbeat failed:', error?.message || error); }
    }, 20000);
  }
  function durationStart() {
    if (!current || current.timer) return;
    current.connectedAt = Date.now(); $('spikeCallTimer').hidden = false;
    current.timer = setInterval(() => {
      if (!current) return;
      const seconds = Math.floor((Date.now() - current.connectedAt) / 1000);
      $('spikeCallTimer').textContent = `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    }, 1000);
  }
  async function getPeerProfile(userId) {
    const { data } = await db.from('profiles').select('username,display_name,full_name,avatar_url').eq('id', userId).maybeSingle();
    const name = data?.username ? '@' + String(data.username).replace(/^@/,'') : (data?.display_name || data?.full_name || 'SPIKE member');
    return { name, avatar: data?.avatar_url || '' };
  }
  async function ensureAllowed(peerId) {
    const { data, error } = await db.rpc('can_message_spike_user', { p_sender: me.id, p_recipient: peerId });
    if (error) throw error;
    if (!data) throw new Error('This member is not available for a private call. Check friendship and privacy settings.');
  }
  function showVideoMode(isVideo) {
    $('spikeCallType').textContent = isVideo ? 'VIDEO' : 'VOICE';
    $('spikeCallVideoStage').hidden = !isVideo;
    $('spikeCallPerson').classList.toggle('is-video', isVideo);
  }
  function createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    current.pc = pc; current.remoteCandidates = []; current.seenCandidates = new Set(); current.pendingLocalCandidates = [];
    pc.onicecandidate = event => {
      if (!event.candidate || !current) return;
      const item = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
      if (!current.callId) current.pendingLocalCandidates.push(item);
      else void sendCandidate(item);
    };
    pc.ontrack = event => {
      if (!current) return;
      current.remoteStream = event.streams?.[0] || current.remoteStream || new MediaStream();
      if (!event.streams?.[0]) current.remoteStream.addTrack(event.track);
      if (current.type === 'video') { $('spikeCallRemoteVideo').srcObject = current.remoteStream; $('spikeCallRemoteVideo').play?.().catch(()=>{}); }
      else { $('spikeCallRemoteAudio').srcObject = current.remoteStream; $('spikeCallRemoteAudio').play?.().catch(()=>{}); }
    };
    pc.onconnectionstatechange = () => {
      if (!current) return;
      const state = pc.connectionState;
      if (state === 'connected') {
        if (current.connectionTimer) clearTimeout(current.connectionTimer); current.connectionTimer = null;
        if (current.disconnectTimer) clearTimeout(current.disconnectTimer); current.disconnectTimer = null;
        setStatus('Connected'); durationStart();
      } else if (state === 'connecting') {
        if (current.disconnectTimer) clearTimeout(current.disconnectTimer); current.disconnectTimer = null;
        setStatus('Connecting securely…');
      } else if (state === 'disconnected') {
        setStatus('Connection interrupted. Trying to reconnect…');
        if (!current.disconnectTimer) { const callId = current.callId; current.disconnectTimer = setTimeout(() => { if (current?.callId === callId && current.pc?.connectionState === 'disconnected') void finish('failed','The media connection could not recover.'); }, 15000); }
      }
      else if (state === 'failed') { setStatus('Connection failed. Ending call…'); void finish('failed', 'The media connection failed.'); }
    };
    return pc;
  }
  async function attachLocalMedia(type) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone and camera access require a supported secure browser (HTTPS).');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true }, video: type === 'video' ? { facingMode:'user', width:{ideal:1280}, height:{ideal:720} } : false });
    if (!current) { stream.getTracks().forEach(t=>t.stop()); throw new Error('Call was cancelled.'); }
    current.localStream = stream;
    const pc = current.pc || createPeerConnection();
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    if (type === 'video') { $('spikeCallLocalVideo').srcObject = stream; $('spikeCallLocalVideo').play?.().catch(()=>{}); }
    return stream;
  }
  async function sendCandidate(candidate) {
    if (!current?.callId || !me) return;
    const { error } = await db.from(ICE_TABLE).insert({ call_id: current.callId, sender_id: me.id, candidate });
    if (error) console.warn('[SPIKE call v2] ICE candidate send failed:', error.message);
  }
  async function flushLocalCandidates() {
    if (!current?.callId || !current.pendingLocalCandidates?.length) return;
    const pending = current.pendingLocalCandidates.splice(0);
    for (const candidate of pending) await sendCandidate(candidate);
  }
  async function addRemoteCandidate(row) {
    if (!current?.pc || !row?.candidate || row.sender_id === me.id || current.seenCandidates.has(row.id)) return;
    current.seenCandidates.add(row.id);
    if (!current.pc.remoteDescription) { current.remoteCandidates.push(row.candidate); return; }
    try { await current.pc.addIceCandidate(new RTCIceCandidate(row.candidate)); }
    catch (error) { console.warn('[SPIKE call v2] remote ICE candidate rejected:', error.message); }
  }
  async function flushRemoteCandidates() {
    if (!current?.pc?.remoteDescription || !current.remoteCandidates?.length) return;
    const queued = current.remoteCandidates.splice(0);
    for (const candidate of queued) {
      try { await current.pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (error) { console.warn('[SPIKE call v2] queued ICE candidate rejected:', error.message); }
    }
  }
  async function watchCall(callId) {
    if (!current || current.callId !== callId) return;
    removeChannel(current.callChannel); removeChannel(current.iceChannel);
    current.callChannel = db.channel('spike-dm-call-v2-state-' + callId)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:TABLE, filter:'id=eq.'+callId }, payload => { void onCallUpdate(payload.new); })
      .subscribe(async status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setStatus('Reconnecting to call…');
        if (status === 'SUBSCRIBED' && current?.callId === callId) {
          const { data, error } = await db.from(TABLE).select('*').eq('id',callId).maybeSingle();
          if (!error && data) await onCallUpdate(data);
        }
      });
    current.iceChannel = db.channel('spike-dm-call-v2-ice-' + callId)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:ICE_TABLE, filter:'call_id=eq.'+callId }, payload => { void addRemoteCandidate(payload.new); })
      .subscribe(async status => {
        if (status !== 'SUBSCRIBED' || !current || current.callId !== callId) return;
        const { data, error } = await db.from(ICE_TABLE).select('id,sender_id,candidate').eq('call_id', callId).order('created_at', { ascending:true }).limit(200);
        if (!error) for (const row of data || []) await addRemoteCandidate(row);
      });
  }
  async function onCallUpdate(row) {
    if (!current || !row || row.id !== current.callId) return;
    const previousStatus = current.status;
    current.status = row.status;
    if (['rejected','cancelled','missed','ended','failed'].includes(row.status)) {
      stopRingtone();
      setStatus(row.status === 'rejected' ? 'Call declined' : row.status === 'missed' ? 'Missed call' : row.status === 'failed' ? (row.failure_reason || 'Call failed') : 'Call ended');
      setTimeout(() => { if (current?.callId === row.id) cleanup(); }, 900);
      return;
    }
    if (row.status === 'accepted') {
      stopRingtone();
      if (current.role === 'callee' && (!current.pc || !current.localAnswerSdp || row.answer?.sdp !== current.localAnswerSdp)) {
        setStatus('Answered on another device');
        setTimeout(() => { if (current?.callId === row.id) cleanup(); }, 900);
        return;
      }
      if (previousStatus !== 'accepted') {
        renderActions('active');
        startHeartbeat(); armConnectionTimeout();
        if (current.role === 'callee') setStatus('Connecting securely…');
      }
    }
    if (row.status === 'accepted' && row.answer && current.role === 'caller' && !current.answerApplied && !current.answerApplying) {
      // Realtime UPDATE and the initial SELECT can deliver the same accepted row
      // almost simultaneously. Lock before awaiting setRemoteDescription so the
      // same SDP is never applied twice to one RTCPeerConnection.
      current.answerApplying = true;
      const call = current;
      try {
        await call.pc.setRemoteDescription(new RTCSessionDescription(row.answer));
        if (current !== call) return;
        call.answerApplied = true; await flushRemoteCandidates();
        setStatus('Connecting securely…');
      } catch (error) {
        if (current === call) { console.error('[SPIKE call v2] answer apply failed', error); await finish('failed', 'Could not establish the call.'); }
      } finally {
        call.answerApplying = false;
      }
    }
  }
  async function subscribeInbox() {
    removeChannel(inboxChannel);
    inboxChannel = db.channel('spike-dm-call-v2-inbox-' + me.id)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:TABLE, filter:'callee_id=eq.'+me.id }, payload => { void receiveIncoming(payload.new); })
      .subscribe(status => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('[SPIKE call v2] inbox listener reconnecting:', status); });
    const { data, error } = await db.from(TABLE).select('*').eq('callee_id', me.id).eq('status','ringing').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(1);
    if (!error && data?.[0]) await receiveIncoming(data[0]);
  }
  async function receiveIncoming(row) {
    if (!me || !row || row.callee_id !== me.id || row.status !== 'ringing') return;
    if (current?.callId === row.id) return;
    if (current) {
      await db.from(TABLE).update({ status:'rejected', ended_at:new Date().toISOString() }).eq('id',row.id).eq('status','ringing');
      return;
    }
    // Mount the incoming interface immediately; never wait for a profile lookup before ringing.
    current = { callId:row.id, type:row.call_type, role:'callee', peerId:row.caller_id, peerName:'SPIKE member', peerAvatar:'', status:'ringing', expiresAt:row.expires_at, offer:row.offer, pc:null, remoteCandidates:[], seenCandidates:new Set(), pendingLocalCandidates:[] };
    showOverlay(); setPerson(current.peerName,current.peerAvatar); showVideoMode(row.call_type === 'video');
    setStatus(row.call_type === 'video' ? 'Incoming video call' : 'Incoming voice call');
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      try {
        current.notification = new Notification(row.call_type === 'video' ? 'Incoming SPIKE video call' : 'Incoming SPIKE voice call', { body:'Someone is calling you', tag:'spike-call-'+row.id, requireInteraction:true });
        current.notification.onclick = () => { window.focus(); current?.notification?.close?.(); };
      } catch (_) {}
    }
    startRingtone(); renderActions('incoming'); await watchCall(row.id);
    if (current?.callId !== row.id) return;
    void getPeerProfile(row.caller_id).then(profile => {
      if (current?.callId !== row.id) return;
      current.peerName = profile.name; current.peerAvatar = profile.avatar;
      setPerson(profile.name,profile.avatar);
    }).catch(error => console.info('[SPIKE call v2] caller profile lookup skipped:',error?.message||error));
    if (current.status === 'ringing') {
      const remaining = Math.max(0, new Date(row.expires_at).getTime() - Date.now());
      current.expiryTimer = setTimeout(() => { if (current?.callId === row.id && current.status === 'ringing') void finish('missed'); }, remaining + 300);
    }
  }
  async function acceptCall() {
    if (!current || current.role !== 'callee' || current.status !== 'ringing') return;
    const call = current; renderActions('accepting'); setStatus('Requesting microphone and camera…');
    try {
      await attachLocalMedia(call.type);
      if (current !== call) return;
      await call.pc.setRemoteDescription(new RTCSessionDescription(call.offer));
      await flushRemoteCandidates();
      const answer = await call.pc.createAnswer(); await call.pc.setLocalDescription(answer);
      call.localAnswerSdp = call.pc.localDescription.sdp;
      const { data: acceptedRow, error } = await db.from(TABLE).update({ status:'accepted', answer:call.pc.localDescription.toJSON ? call.pc.localDescription.toJSON() : call.pc.localDescription, answered_at:new Date().toISOString() }).eq('id',call.callId).eq('status','ringing').select('id,status').maybeSingle();
      if (error) throw error;
      if (!acceptedRow) throw new Error('This call was answered or ended on another device.');
      call.status = 'accepted'; stopRingtone(); renderActions('active'); startHeartbeat(); armConnectionTimeout(); setStatus('Connecting securely…'); await flushLocalCandidates();
    } catch (error) {
      console.error('[SPIKE call v2] accept failed:', error);
      if (/answered or ended on another device/i.test(error.message || '')) {
        setStatus('Answered on another device'); cleanup(); return;
      }
      setStatus(error?.name === 'NotAllowedError' ? 'Permission denied. Microphone/camera access is required.' : (error.message || 'Could not accept this call.'));
      await finish('failed', error.message || 'Could not accept the call.');
    }
  }
  async function start(type, peerId, peerName, peerAvatar) {
    if (!initialized || !me || !db) throw new Error('Calling is not ready. Please reload and sign in again.');
    if (!['voice','video'].includes(type)) throw new Error('Unsupported call type.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(peerId || '')) || peerId === me.id) throw new Error('Choose a valid SPIKE member.');
    if (current) throw new Error('Finish your current call before starting another.');
    const call = current = { callId:null, type, role:'caller', peerId, peerName:peerName || 'SPIKE member', peerAvatar:peerAvatar || '', status:'preparing', pc:null, remoteCandidates:[], seenCandidates:new Set(), pendingLocalCandidates:[] };
    showOverlay(); setPerson(call.peerName,call.peerAvatar); showVideoMode(type === 'video'); setStatus('Preparing your call…'); renderActions('outgoing');
    try {
      await ensureAllowed(peerId);
      if (current !== call) return;
      await attachLocalMedia(type);
      if (current !== call) return;
      const offer = await call.pc.createOffer();
      if (current !== call) return;
      await call.pc.setLocalDescription(offer);
      if (current !== call) return;
      const expiry = new Date(Date.now() + RING_MS).toISOString();
      const offerJson = call.pc.localDescription.toJSON ? call.pc.localDescription.toJSON() : call.pc.localDescription;
      const { data, error } = await db.from(TABLE).insert({ caller_id:me.id, callee_id:peerId, call_type:type, status:'ringing', offer:offerJson, expires_at:expiry }).select('*').single();
      if (error) throw error;
      if (current !== call) {
        await db.from(TABLE).update({ status:'cancelled' }).eq('id',data.id).eq('status','ringing');
        return;
      }
      call.callId = data.id; call.status = 'ringing';
      startRingtone(); await watchCall(data.id);
      if (current !== call) return;
      await flushLocalCandidates();
      if (call.status === 'ringing') {
        setStatus(type === 'video' ? 'Calling with video…' : 'Calling…');
        call.expiryTimer = setTimeout(() => { if (current === call && call.status === 'ringing') void finish('cancelled'); }, RING_MS + 1000);
      }
    } catch (error) {
      if (current !== call) return;
      console.error('[SPIKE call v2] outgoing call failed:', error);
      setStatus(error?.name === 'NotAllowedError' ? 'Permission denied. Microphone/camera access is required.' : (error.message || 'Could not start this call.'));
      if (call.callId) await finish('failed', error.message || 'Call setup failed.');
      else setTimeout(() => { if (current === call && !call.callId) cleanup(); }, 1800);
      throw error;
    }
  }
  async function finish(status, reason) {
    if (!current || current.finishing) return;
    const call = current;
    call.finishing = true;
    let finalStatus = status;
    if (status === 'cancelled' && call.role === 'caller' && call.callId) {
      try {
        const { data } = await db.from(TABLE).select('status').eq('id',call.callId).maybeSingle();
        if (data?.status === 'accepted') finalStatus = 'ended';
      } catch (_) {}
    }
    if (current !== call) return;
    if (call.callId && ['ended','rejected','cancelled','missed','failed'].includes(finalStatus)) {
      try {
        const patch = { status:finalStatus };
        if (finalStatus === 'failed') patch.failure_reason = String(reason || 'Call failed').slice(0,240);
        patch.ended_at = new Date().toISOString();
        const allowed = finalStatus === 'ended' ? ['accepted'] : finalStatus === 'cancelled' || finalStatus === 'missed' || finalStatus === 'rejected' ? ['ringing'] : ['ringing','accepted'];
        const { error } = await db.from(TABLE).update(patch).eq('id',call.callId).in('status',allowed);
        if (error && !/no rows|0 rows/i.test(error.message || '')) console.warn('[SPIKE call v2] call finish sync failed:', error.message);
      } catch (error) { console.warn('[SPIKE call v2] call finish sync failed:', error.message); }
    }
    if (current !== call) return;
    setStatus(finalStatus === 'rejected' ? 'Call declined' : finalStatus === 'missed' ? 'Missed call' : finalStatus === 'failed' ? (reason || 'Call failed') : 'Call ended');
    cleanup();
  }
  function toggleMute() {
    if (!current?.localStream) return;
    const track = current.localStream.getAudioTracks()[0]; if (!track) return;
    track.enabled = !track.enabled;
    const button = [...$('spikeCallActions').querySelectorAll('button')].find(node => node.textContent.includes('Mute') || node.textContent.includes('Unmute'));
    if (button) { button.querySelector('span').textContent = track.enabled ? 'Mute' : 'Unmute'; button.querySelector('i').className = 'fa-solid ' + (track.enabled ? 'fa-microphone-slash' : 'fa-microphone'); }
  }
  function toggleCamera() {
    if (!current?.localStream) return;
    const track = current.localStream.getVideoTracks()[0]; if (!track) return;
    track.enabled = !track.enabled;
    const button = [...$('spikeCallActions').querySelectorAll('button')].find(node => node.textContent.includes('Camera'));
    if (button) { button.querySelector('span').textContent = track.enabled ? 'Camera off' : 'Camera on'; button.querySelector('i').className = 'fa-solid ' + (track.enabled ? 'fa-video-slash' : 'fa-video'); }
  }
  async function switchCamera() {
    if (!current?.localStream || current.type !== 'video') return;
    const call = current;
    const oldTrack = call.localStream.getVideoTracks()[0];
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video:{ facingMode: oldTrack?.getSettings?.().facingMode === 'environment' ? 'user' : 'environment' }, audio:false });
      const newTrack = next.getVideoTracks()[0];
      if (current !== call) { next.getTracks().forEach(track => track.stop()); return; }
      const sender = call.pc?.getSenders().find(item => item.track?.kind === 'video');
      if (!newTrack || !sender) throw new Error('Camera switch is not supported on this device.');
      await sender.replaceTrack(newTrack);
      if (current !== call) { newTrack.stop(); return; }
      call.localStream.removeTrack(oldTrack); call.localStream.addTrack(newTrack); oldTrack?.stop(); $('spikeCallLocalVideo').srcObject = call.localStream;
      next.getTracks().filter(track => track !== newTrack).forEach(track => track.stop());
    } catch (error) { if (current === call) setStatus(error.message || 'Could not switch camera.'); }
  }
  async function boot() {
    if (initialized) return;
    db = window.__SPIKE_SUPABASE__ || window.supabaseClient || window.sb || (window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null);
    if (!db?.auth?.getSession) return;
    try {
      const { data, error } = await db.auth.getSession(); if (error) throw error;
      me = data.session?.user; if (!me) return;
      if (data.session?.access_token && db.realtime?.setAuth) await db.realtime.setAuth(data.session.access_token);
      initialized = true; mount(); await subscribeInbox();
      const params = new URLSearchParams(location.search);
      if (document.body?.dataset.spikePage === 'message') {
        pagePeer = params.get('to') || params.get('id');
        const nameNode = $('name'), avatarNode = $('avatar');
        pagePeerName = nameNode?.textContent || 'SPIKE member';
        pagePeerAvatar = avatarNode?.querySelector('img')?.src || '';
        addMessageCallButtons();
      }
    } catch (error) { console.warn('[SPIKE call v2] initialization failed:', error.message); }
  }
  function addMessageCallButtons() {
    const header = document.querySelector('body[data-spike-page="message"] .top');
    if (!header || $('spikeVoiceCallButton') || !pagePeer) return;
    const make = (id, icon, label, type) => {
      const button = document.createElement('button'); button.type = 'button'; button.id = id; button.className = 'iconbtn spike-call-header-btn'; button.setAttribute('aria-label',label); button.title = label; button.innerHTML = `<i class="fa-solid ${icon}"></i>`;
      button.addEventListener('click', async () => {
        pagePeerName = $('name')?.textContent || pagePeerName; pagePeerAvatar = $('avatar')?.querySelector('img')?.src || pagePeerAvatar;
        try { await start(type,pagePeer,pagePeerName,pagePeerAvatar); }
        catch (error) { if (!current) window.SpikeDialog?.alert?.(error.message || 'Could not start call.'); }
      }); return button;
    };
    header.insertBefore(make('spikeVoiceCallButton','fa-phone','Start voice call','voice'), $('refresh'));
    header.insertBefore(make('spikeVideoCallButton','fa-video','Start video call','video'), $('refresh'));
  }
  window.SpikeCallingV2 = { init:boot, start, end:() => finish('ended'), getState:() => current ? { id:current.callId,type:current.type,status:current.status,role:current.role } : null };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else void boot();
  window.addEventListener('pagehide', () => { if (current) { try { current.pc?.close(); } catch (_) {} } removeChannel(inboxChannel); });
})();
