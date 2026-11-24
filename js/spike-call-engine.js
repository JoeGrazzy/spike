/* SPIKE one-to-one WebRTC calling. Signaling is private to the two conversation members. */
(() => {
  'use strict';
  if (window.SPIKE_CALLS) return;

  const client = () => window.SPIKE_SUPABASE || window.db;
  const $ = id => document.getElementById(id);
  const state = {
    user: null, callId: null, callType: null, role: null, status: 'idle',
    channel: null, channelReady: false, channelRetryTimer: null, channelRetryDelay: 1000, channelGeneration: 0, channelFlushing: false, eventsChannel: null, eventsRetryTimer: null, eventsRetryDelay: 1000, eventsGeneration: 0, eventsSubscribed: false, pendingCallsTimer: null, pendingLookupBusy: false, pc: null, localStream: null,
    remoteStream: null, peer: null, conversationId: null,
    queuedIce: [], callTimer: null, ringTimer: null, heartbeatTimer: null, negotiationTimer: null, startedAt: 0, iceServers: null,
    muted: false, cameraOff: false, pending: null, disposed: false, callAttempt: 0, peerAccepted: false, offerStarted: false, queuedSignals: []
  };

  const ICE_SERVERS = Object.freeze([
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' }
  ]);

  function ensureStyles() {
    if ($('spikeCallStyles')) return;
    const style = document.createElement('style');
    style.id = 'spikeCallStyles';
    style.textContent = `
      .spike-call-overlay{position:fixed;inset:0;z-index:30000;display:grid;place-items:center;padding:0;background:rgba(3,5,12,.88);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;animation:spikeCallFade .22s ease-out}
      .spike-call-card{position:relative;isolation:isolate;display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:16px;width:min(100%,560px);height:min(900px,100dvh);min-height:520px;overflow:hidden;padding:max(26px,env(safe-area-inset-top)) 22px max(24px,env(safe-area-inset-bottom));background:radial-gradient(ellipse at 50% 18%,rgba(125,72,214,.28),transparent 43%),linear-gradient(160deg,#17152b 0%,#0b1020 54%,#080b14 100%);text-align:center}
      .spike-call-card:before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(circle at 12% 72%,rgba(219,39,119,.12),transparent 28%),radial-gradient(circle at 90% 38%,rgba(99,102,241,.13),transparent 30%)}
      .spike-call-top{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#b9b4d2;font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}
      .spike-call-brand{display:flex;align-items:center;gap:8px}.spike-call-brand-mark{display:grid;place-items:center;width:28px;height:28px;border:1px solid #ffffff20;border-radius:10px;background:linear-gradient(135deg,#9b5cff,#e34a9a);font-size:14px;color:white;box-shadow:0 5px 18px #9b5cff35}
      .spike-call-secure{display:flex;align-items:center;gap:6px;color:#9de7c4;letter-spacing:.08em}.spike-call-secure:before{content:"";width:6px;height:6px;border-radius:50%;background:#42d99a;box-shadow:0 0 12px #42d99a}
      .spike-call-person{display:flex;flex:1;min-height:0;width:100%;flex-direction:column;align-items:center;justify-content:center;gap:12px}
      .spike-call-avatar{position:relative;width:clamp(112px,28vw,158px);height:clamp(112px,28vw,158px);flex:0 0 auto;border-radius:50%;display:grid;place-items:center;margin:0 auto 8px;background:linear-gradient(145deg,#9b5cff,#e34a9a);font-size:48px;font-weight:900;overflow:hidden;box-shadow:0 0 0 8px #ffffff08,0 0 0 18px #ffffff05,0 22px 70px #8b5cf655}
      .spike-call-avatar:after{content:"";position:absolute;inset:-10px;border:1px solid #c4a5fd55;border-radius:50%;animation:spikeCallPulse 2.5s ease-out infinite}
      .spike-call-avatar img{width:100%;height:100%;object-fit:cover}
      .spike-call-name{font-size:clamp(24px,6vw,32px);font-weight:850;letter-spacing:-.055em;margin:0;color:#fff;max-width:100%;overflow-wrap:anywhere}
      .spike-call-status{font-size:13px;color:#b9b8cc;margin:0;min-height:20px;line-height:1.5}
      .spike-call-live{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border:1px solid #ffffff13;border-radius:999px;background:#ffffff09;color:#d7d2e8;font-size:10px;font-weight:750;letter-spacing:.04em}
      .spike-call-live:before{content:"";width:6px;height:6px;border-radius:50%;background:#49dfa3;box-shadow:0 0 10px #49dfa3}
      .spike-call-wave{display:flex;align-items:center;justify-content:center;gap:4px;height:34px;margin:10px 0 0}.spike-call-wave i{display:block;width:3px;height:9px;border-radius:5px;background:linear-gradient(#c4a5fd,#e879b9);animation:spikeCallWave .9s ease-in-out infinite alternate}.spike-call-wave i:nth-child(2n){animation-delay:.18s}.spike-call-wave i:nth-child(3n){animation-delay:.35s}.spike-call-wave i:nth-child(4n){animation-delay:.5s}
      .spike-call-video{position:absolute;inset:0;width:100%;height:100%;margin:0;background:#05070d;overflow:hidden}
      .spike-call-video video{display:block;width:100%;height:100%;object-fit:cover;background:#05070d}
      .spike-call-video .remote{position:absolute;inset:0}
      .spike-call-video .local{position:absolute;right:16px;top:max(70px,calc(env(safe-area-inset-top) + 58px));width:clamp(104px,28vw,148px);height:clamp(142px,25vh,190px);border:1px solid #ffffff55;border-radius:20px;object-fit:cover;box-shadow:0 12px 34px #0008;z-index:2}
      .spike-call-card.is-video{background:#05070d;padding:0;justify-content:flex-end}.spike-call-card.is-video:before{z-index:1;background:linear-gradient(180deg,rgba(3,5,12,.56),transparent 24%,transparent 58%,rgba(3,5,12,.88) 100%)}
      .spike-call-card.is-video .spike-call-top{position:absolute;z-index:3;top:max(18px,env(safe-area-inset-top));left:0;padding:0 18px;color:#fff}
      .spike-call-card.is-video .spike-call-person{position:relative;z-index:2;flex:0 0 auto;padding:0 18px 12px;pointer-events:none}
      .spike-call-card.is-video .spike-call-person .spike-call-avatar{display:none}
      .spike-call-card.is-video .spike-call-name{font-size:19px;text-shadow:0 2px 12px #000}
      .spike-call-card.is-video .spike-call-status{color:#e4e1ed;text-shadow:0 2px 10px #000}
      .spike-call-controls{position:relative;z-index:4;display:flex;justify-content:center;align-items:center;gap:12px;flex-wrap:wrap;width:100%;margin:0;padding:16px 12px 6px}
      .spike-call-controls button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-width:68px;min-height:68px;border:1px solid #ffffff20;border-radius:22px;background:rgba(255,255,255,.105);color:#fff;font-size:10px;font-weight:800;padding:10px 12px;cursor:pointer;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);transition:transform .18s ease,background .18s ease,border-color .18s ease}
      .spike-call-controls button:before{font-size:19px;line-height:1}.spike-call-controls button[data-action="mute"]:before{content:"🎙"}.spike-call-controls button[data-action="camera"]:before{content:"▣"}.spike-call-controls button[data-action="accept"]:before{content:"↗"}.spike-call-controls button[data-action="reject"]:before,.spike-call-controls button[data-action="end"]:before,.spike-call-controls button[data-action="cancel"]:before{content:"☎"}
      .spike-call-controls button:active{transform:scale(.95)}.spike-call-controls button.primary{background:linear-gradient(135deg,#8b5cf6,#d946a5);border:0;box-shadow:0 8px 24px #a855f744}.spike-call-controls button.danger{background:linear-gradient(135deg,#f04462,#c51d4a);border:0;box-shadow:0 8px 24px #e11d4840}.spike-call-controls button:disabled{opacity:.45;cursor:wait}
      .spike-call-foot{position:relative;z-index:3;font-size:10px;color:#898aa2;line-height:1.5;max-width:340px;margin:0 auto;text-align:center}
      .spike-call-card.is-video .spike-call-foot{padding:0 20px 8px;color:#b2b0c4}
      @keyframes spikeCallFade{from{opacity:0}to{opacity:1}}@keyframes spikeCallPulse{0%{transform:scale(.94);opacity:.65}100%{transform:scale(1.12);opacity:0}}@keyframes spikeCallWave{from{height:7px;opacity:.55}to{height:27px;opacity:1}}
      @media(min-width:700px){.spike-call-card{height:min(860px,94dvh);border:1px solid #ffffff1a;border-radius:30px;box-shadow:0 35px 120px #000b}.spike-call-card.is-video{width:min(100%,920px);height:min(860px,94dvh)}}
      @media(max-width:380px){.spike-call-controls{gap:8px}.spike-call-controls button{min-width:62px;min-height:62px;border-radius:19px;padding:8px}.spike-call-card:not(.is-video){padding-left:16px;padding-right:16px}}
      @media(prefers-reduced-motion:reduce){.spike-call-overlay *{animation:none!important;transition:none!important}}
    `;
    document.head.append(style);
  }

  function showUI(kind, statusText) {
    ensureStyles();
    let overlay = $('spikeCallOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'spikeCallOverlay';
      overlay.className = 'spike-call-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'SPIKE call');
      document.body.append(overlay);
    }
    overlay.replaceChildren();
    const videoMode = state.callType === 'video' && kind === 'active';
    const card = document.createElement('section');
    card.className = `spike-call-card${videoMode ? ' is-video' : ''}`;
    const top = document.createElement('div'); top.className = 'spike-call-top';
    const brand = document.createElement('div'); brand.className = 'spike-call-brand';
    const mark = document.createElement('span'); mark.className = 'spike-call-brand-mark'; mark.textContent = 'S';
    const brandText = document.createElement('span'); brandText.textContent = state.callType === 'video' ? 'SPIKE VIDEO' : 'SPIKE VOICE';
    brand.append(mark, brandText);
    const secure = document.createElement('span'); secure.className = 'spike-call-secure'; secure.textContent = 'PRIVATE CALL';
    top.append(brand, secure); card.append(top);

    if (videoMode) {
      const video = document.createElement('div'); video.className = 'spike-call-video';
      const remote = document.createElement('video'); remote.id = 'spikeCallRemoteVideo'; remote.className = 'remote'; remote.autoplay = true; remote.playsInline = true;
      const local = document.createElement('video'); local.id = 'spikeCallLocalVideo'; local.autoplay = true; local.muted = true; local.playsInline = true; local.className = 'local';
      video.append(remote, local); card.append(video);
    } else if (state.callType === 'voice' && kind === 'active') {
      const audio = document.createElement('audio'); audio.id = 'spikeCallRemoteAudio'; audio.autoplay = true; audio.playsInline = true; card.append(audio);
    }

    const person = document.createElement('div'); person.className = 'spike-call-person';
    const avatar = document.createElement('div'); avatar.className = 'spike-call-avatar';
    if (state.peer?.avatar_url) { const img = document.createElement('img'); img.src = state.peer.avatar_url; img.alt = ''; avatar.append(img); }
    else avatar.textContent = String(state.peer?.display_name || state.peer?.username || 'S').trim().slice(0, 1).toUpperCase() || 'S';
    const name = document.createElement('h2'); name.className = 'spike-call-name'; name.textContent = state.peer?.display_name || state.peer?.username || 'SPIKE member';
    const status = document.createElement('div'); status.className = 'spike-call-status'; status.id = 'spikeCallStatus'; status.textContent = statusText || '';
    person.append(avatar, name, status);
    if (kind === 'active' && state.callType === 'voice') {
      const live = document.createElement('span'); live.className = 'spike-call-live'; live.textContent = 'VOICE CONNECTED'; person.append(live);
      const wave = document.createElement('div'); wave.className = 'spike-call-wave'; wave.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 13; i++) wave.append(document.createElement('i'));
      person.append(wave);
    }
    card.append(person);

    const controls = document.createElement('div'); controls.className = 'spike-call-controls';
    const add = (id, label, cls, handler, action) => {
      const b = document.createElement('button'); b.id = id; b.type = 'button'; b.textContent = label;
      if (cls) b.className = cls; if (action) b.dataset.action = action;
      b.setAttribute('aria-label', label); b.addEventListener('click', handler); controls.append(b);
    };
    if (kind === 'incoming') {
      add('spikeCallAccept', 'Accept', 'primary', acceptCall, 'accept');
      add('spikeCallReject', 'Decline', 'danger', () => rejectCall('rejected'), 'reject');
    } else if (kind === 'outgoing') {
      add('spikeCallHangup', 'Cancel call', 'danger', endCall, 'cancel');
    } else {
      add('spikeCallMute', state.muted ? 'Unmute' : 'Mute', '', toggleMute, 'mute');
      if (state.callType === 'video') add('spikeCallCamera', state.cameraOff ? 'Camera on' : 'Camera off', '', toggleCamera, 'camera');
      add('spikeCallEnd', 'End call', 'danger', endCall, 'end');
    }
    card.append(controls);
    const foot = document.createElement('div'); foot.className = 'spike-call-foot';
    foot.textContent = 'Peer-to-peer WebRTC · STUN-assisted connection'; card.append(foot);
    overlay.append(card);
    if (kind === 'active') attachMediaElements();
  }

  function setStatus(message) { const node=$('spikeCallStatus');if(node)node.textContent=message; }
  function avatarFor(profile) { return profile?.avatar_url || profile?.avatar_path || profile?.avatar || ''; }

  async function profileFor(userId) {
    try {
      const {data,error}=await client().rpc('get_public_profiles',{p_user_ids:[userId]});
      if(error)throw error;
      const p=(data||[])[0]||{};
      return {display_name:p.display_name||p.username||'SPIKE member',username:p.username||'',avatar_url:avatarFor(p)};
    } catch (_) { return {display_name:'SPIKE member',username:'',avatar_url:''}; }
  }

  async function getCurrentUser() {
    const {data,error}=await client().auth.getUser();
    if(error)throw error;
    if(!data?.user)throw new Error('Sign in to use SPIKE calls.');
    return data.user;
  }

  async function loadPendingCalls() {
    const userId=state.user?.id;
    if(!userId || state.status!=='idle' || state.pendingLookupBusy || document.hidden || !navigator.onLine)return;
    state.pendingLookupBusy=true;
    try {
      const {data,error}=await client().from('spike_call_sessions')
        .select('id,conversation_id,caller_id,callee_id,call_type,status,created_at,expires_at')
        .eq('callee_id',userId).eq('status','ringing').gt('expires_at',new Date().toISOString())
        .order('created_at',{ascending:false}).limit(3);
      if(error)throw error;
      // This database reconciliation is deliberately independent of Realtime.
      // It recovers invitations even when a private channel cannot subscribe.
      if(state.user?.id===userId && state.status==='idle' && data?.length)void incomingCall(data[0]);
    } catch(error) { console.warn('[SPIKE calls] pending call lookup failed',error?.message||error); }
    finally { state.pendingLookupBusy=false; }
  }

  function startPendingCallPolling() {
    if(state.pendingCallsTimer || !state.user)return;
    void loadPendingCalls();
    // Realtime is the low-latency path; this lightweight foreground poll is the
    // independent safety net for missed subscription events and reconnect gaps.
    state.pendingCallsTimer=window.setInterval(()=>{
      if(state.user && state.status==='idle' && !document.hidden && navigator.onLine)void loadPendingCalls();
    },6000);
  }

  function stopPendingCallPolling() {
    if(state.pendingCallsTimer)clearInterval(state.pendingCallsTimer);
    state.pendingCallsTimer=null;
  }

  function scheduleEventsReconnect(generation) {
    if(state.eventsRetryTimer || !state.user || state.disposed)return;
    const delay=state.eventsRetryDelay;
    state.eventsRetryDelay=Math.min(15000,Math.round(delay*1.8));
    state.eventsRetryTimer=window.setTimeout(()=>{
      state.eventsRetryTimer=null;
      if(generation!==state.eventsGeneration || !state.user || state.disposed)return;
      const old=state.eventsChannel;state.eventsChannel=null;state.eventsSubscribed=false;
      if(old)void client().removeChannel(old).catch(()=>{});
      void subscribeEvents();
    },delay);
  }

  async function subscribeEvents() {
    if(state.eventsChannel || !state.user || state.disposed)return;
    if(state.eventsRetryTimer){clearTimeout(state.eventsRetryTimer);state.eventsRetryTimer=null;}
    const generation=++state.eventsGeneration;
    const userId=state.user.id;
    const channel=client().channel(`spike-call-events-${userId}`,{config:{private:true}})
      .on('postgres_changes',{event:'*',schema:'public',table:'spike_call_sessions'},handleCallRow);
    state.eventsChannel=channel;
    channel.subscribe((status,error)=>{
      if(generation!==state.eventsGeneration || state.eventsChannel!==channel)return;
      if(status==='SUBSCRIBED'){
        state.eventsSubscribed=true;state.eventsRetryDelay=1000;
        // Always reconcile after JOIN, including every automatic reconnect.
        // Realtime is the fast path; the query is the loss/reconnect safety net.
        void loadPendingCalls();
      } else if(status==='CHANNEL_ERROR' || status==='TIMED_OUT' || status==='CLOSED'){
        state.eventsSubscribed=false;
        console.warn('[SPIKE calls] call notifications unavailable',error||status);
        scheduleEventsReconnect(generation);
      }
    });
  }

  async function handleCallRow(payload) {
    const row=payload?.new||payload?.old;
    if(!row || !state.user)return;
    if(row.callee_id===state.user.id && row.status==='ringing' && state.status==='idle' && new Date(row.expires_at).getTime()>Date.now()){
      void incomingCall(row);return;
    }
    if(row.id===state.callId && row.status==='accepted' && state.role==='caller') {
      state.peerAccepted=true;
      void beginCallerNegotiation();
      return;
    }
    if(row.id===state.callId && ['rejected','ended','missed','failed'].includes(row.status)){
      const message=row.status==='rejected'?'Call declined.':row.status==='missed'?'No answer.':'Call ended.';
      cleanup(message);
    }
  }

  async function incomingCall(row) {
    if(state.status!=='idle' || !state.user || row.callee_id!==state.user.id)return;
    const attempt=++state.callAttempt;
    state.callId=row.id;state.callType=row.call_type;state.role='callee';state.status='incoming';state.conversationId=row.conversation_id;
    state.peer={display_name:'SPIKE member',username:'',avatar_url:''};state.pending=row;
    const incomingLabel=`${state.callType==='video'?'Incoming video call':'Incoming voice call'} · SPIKE`;
    // Render the incoming screen immediately. Profile lookup must never gate the ringtone UI.
    showUI('incoming',incomingLabel);
    void profileFor(row.caller_id).then(profile=>{
      if(state.callAttempt!==attempt || state.callId!==row.id || state.status!=='incoming')return;
      state.peer=profile;
      showUI('incoming',incomingLabel);
    });
    await joinCallChannel();
    const remaining=Math.max(0,new Date(row.expires_at).getTime()-Date.now());
    state.ringTimer=window.setTimeout(()=>{if(state.callId===row.id && state.status==='incoming')void rejectCall('missed');},remaining);
  }

  function scheduleCallChannelReconnect(generation) {
    if(state.channelRetryTimer || !state.callId || state.status==='idle')return;
    const delay=state.channelRetryDelay;
    state.channelRetryDelay=Math.min(15000,Math.round(delay*1.8));
    state.channelRetryTimer=window.setTimeout(()=>{
      state.channelRetryTimer=null;
      if(generation!==state.channelGeneration || !state.callId || state.status==='idle')return;
      const old=state.channel;state.channel=null;state.channelReady=false;
      if(old)void client()?.removeChannel(old).catch(()=>{});
      void joinCallChannel();
    },delay);
  }

  async function joinCallChannel() {
    if(state.channel || !state.callId || state.status==='idle')return;
    const db=client();if(!db?.channel){scheduleCallChannelReconnect(state.channelGeneration);return;}
    if(state.channelRetryTimer){clearTimeout(state.channelRetryTimer);state.channelRetryTimer=null;}
    const generation=++state.channelGeneration;
    const callId=state.callId;
    const channel=db.channel(`spike-call:${callId}`,{config:{private:true,broadcast:{ack:true,self:false}}})
      .on('broadcast',{event:'signal'},payload=>{
        if(generation!==state.channelGeneration || state.callId!==callId)return;
        void handleSignal(payload?.payload||{});
      });
    state.channel=channel;state.channelReady=false;
    channel.subscribe((status,error)=>{
      if(generation!==state.channelGeneration || state.channel!==channel || state.callId!==callId)return;
      if(status==='SUBSCRIBED'){
        state.channelReady=true;state.channelRetryDelay=1000;
        void flushQueuedSignals();
        if(state.status==='joining' && state.role==='callee')void sendSignal('accepted',{});
      } else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
        state.channelReady=false;
        console.warn('[SPIKE calls] private signaling channel failed',status,error||'');
        if(state.status!=='idle')setStatus('Reconnecting secure call signalling…');
        scheduleCallChannelReconnect(generation);
      }
    });
  }

  async function sendSignal(event,payload) {
    if(!state.channel || !state.callId || !state.user)return false;
    if(!state.channelReady){
      // ICE can be produced before the private topic finishes joining. Keep
      // those candidates instead of silently dropping them.
      state.queuedSignals.push({event,payload});
      return true;
    }
    try {
      const result=await state.channel.send({type:'broadcast',event:'signal',payload:{event,from:state.user.id,call_id:state.callId,...payload}});
      if(result!=='ok')throw new Error(`Realtime broadcast returned ${String(result)}`);
      return true;
    } catch(error){
      console.warn('[SPIKE calls] signaling event failed',event,error?.message||error);
      state.channelReady=false;
      scheduleCallChannelReconnect(state.channelGeneration);
      return false;
    }
  }

  async function flushQueuedSignals() {
    if(!state.channelReady || !state.queuedSignals.length || state.channelFlushing)return;
    state.channelFlushing=true;
    try {
      while(state.channelReady && state.queuedSignals.length){
        const item=state.queuedSignals[0];
        const sent=await sendSignal(item.event,item.payload);
        if(!sent)break;
        state.queuedSignals.shift();
      }
    } finally { state.channelFlushing=false; }
  }

  function startNegotiationTimeout() {
    if(state.negotiationTimer)clearTimeout(state.negotiationTimer);
    state.negotiationTimer=window.setTimeout(()=>{if(state.callId&&state.status!=='active')void endCall('Call could not connect. Check your network and try again.');},30000);
  }

  function startCallHeartbeat() {
    if(state.heartbeatTimer)clearInterval(state.heartbeatTimer);
    state.heartbeatTimer=window.setInterval(async()=>{if(!state.callId||state.status==='idle')return;try{const {data,error}=await client().rpc('spike_touch_call',{p_call_id:state.callId});if(error)throw error;if(data===false)cleanup('Call session expired.');}catch(error){console.info('[SPIKE calls] call heartbeat failed',error?.message||error);}},30000);
  }

  async function startCall(type, context) {
    if(state.status!=='idle')throw new Error('Another call is already active.');
    if(!['voice','video'].includes(type))throw new Error('Choose a voice or video call.');
    const conversationId=context?.conversationId;
    const peerId=context?.peerId;
    if(!conversationId || !peerId || context?.isGroup)throw new Error('Voice and video calls are currently available in one-to-one conversations.');
    state.user=state.user||await getCurrentUser();
    const attempt=++state.callAttempt;
    state.callType=type;state.role='caller';state.status='creating';state.conversationId=conversationId;state.peerAccepted=false;state.offerStarted=false;
    state.peer={display_name:'SPIKE member',username:'',avatar_url:''};
    // Show a real, cancellable call state before any network, profile or device-permission work.
    showUI('outgoing','Starting secure call…');
    void profileFor(peerId).then(profile=>{
      if(state.callAttempt!==attempt || state.status==='idle')return;
      state.peer=profile;
      showUI('outgoing',state.callId?'Preparing microphone and camera…':'Starting secure call…');
    });
    try {
      const {data,error}=await client().rpc('spike_create_call',{p_conversation_id:conversationId,p_call_type:type});
      if(error)throw error;
      if(!data)throw new Error('The call invitation could not be created.');
      if(state.callAttempt!==attempt || state.status==='idle'){
        // The user cancelled while the create RPC was in flight; close the late-created row.
        await client().rpc('spike_end_call',{p_call_id:data});
        return;
      }
      state.callId=data;
      showUI('outgoing','Preparing microphone and camera…');
      const mediaReady=await prepareMedia(attempt);
      if(!mediaReady || state.callAttempt!==attempt || state.status==='idle')return;
      createPeerConnection();
      await joinCallChannel();
      if(state.callAttempt!==attempt || state.status==='idle')return;
      state.status='outgoing';showUI('outgoing','Calling… waiting for the other member.');
      if(state.peerAccepted)void beginCallerNegotiation();
      state.ringTimer=window.setTimeout(()=>{if(state.callId===data && state.status==='outgoing')void endCall('No answer.');},50000);
    } catch(error) {
      if(state.callAttempt===attempt)await endCall().catch(()=>{});
      throw error;
    }
  }

  function loadIceServers() {
    // Keep calling self-contained: use public STUN only and do not require a
    // TURN provider account, Worker secret, or external credential endpoint.
    state.iceServers=ICE_SERVERS;
  }

  async function prepareMedia(attempt=state.callAttempt) {
    loadIceServers();
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone and camera access require a supported browser over HTTPS.');
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:state.callType==='video'?{facingMode:'user',width:{ideal:1280},height:{ideal:720}}:false});
      if(state.callAttempt!==attempt || state.status==='idle'){
        stream.getTracks().forEach(track=>track.stop());
        return false;
      }
      state.localStream=stream;
      return true;
    } catch(error) {
      const message=error?.name==='NotAllowedError'?'Allow microphone and camera permissions to start this call.':error?.name==='NotFoundError'?'This device does not have the required microphone or camera.':error?.message||'Could not access your microphone or camera.';
      throw new Error(message);
    }
  }

  function createPeerConnection() {
    state.pc=new RTCPeerConnection({iceServers:state.iceServers||ICE_SERVERS,iceCandidatePoolSize:2});
    state.remoteStream=new MediaStream();
    state.localStream?.getTracks().forEach(track=>state.pc.addTrack(track,state.localStream));
    state.pc.onicecandidate=event=>{if(event.candidate)void sendSignal('ice',{candidate:event.candidate.toJSON()});};
    state.pc.ontrack=event=>{
      const stream=event.streams?.[0];
      if(stream)stream.getTracks().forEach(track=>{if(!state.remoteStream.getTracks().some(t=>t.id===track.id))state.remoteStream.addTrack(track);});
      else if(event.track && !state.remoteStream.getTracks().some(t=>t.id===event.track.id))state.remoteStream.addTrack(event.track);
      attachMediaElements();
    };
    state.pc.onconnectionstatechange=()=>{
      const connection=state.pc?.connectionState;
      if(connection==='connected'){if(state.negotiationTimer)clearTimeout(state.negotiationTimer);state.negotiationTimer=null;state.status='active';state.startedAt=state.startedAt||Date.now();renderActive();}
      else if(connection==='failed')setStatus('Could not connect directly on this network. Try switching between Wi-Fi and mobile data, then call again.');
      else if(connection==='disconnected')setStatus('Connection interrupted. Trying to reconnect…');
    };
  }

  function attachMediaElements() {
    const local=$('spikeCallLocalVideo'),remote=$('spikeCallRemoteVideo'),audio=$('spikeCallRemoteAudio');
    if(local && state.localStream)local.srcObject=state.localStream;
    if(remote && state.remoteStream)remote.srcObject=state.remoteStream;
    if(audio && state.remoteStream)audio.srcObject=state.remoteStream;
    const play=[local,remote,audio].filter(Boolean);play.forEach(node=>{const p=node.play?.();if(p?.catch)p.catch(()=>{});});
  }

  async function acceptCall() {
    if(state.status!=='incoming')return;
    const accept=$('spikeCallAccept');if(accept)accept.disabled=true;
    try {
      const {error}=await client().rpc('spike_respond_to_call',{p_call_id:state.callId,p_action:'accept'});if(error)throw error;
      if(state.ringTimer)clearTimeout(state.ringTimer);state.ringTimer=null;
      state.status='joining';
      const attempt=state.callAttempt;
      const mediaReady=await prepareMedia(attempt);
      if(!mediaReady || state.callAttempt!==attempt || state.status==='idle')return;
      createPeerConnection();
      showUI('active','Connecting securely…');startNegotiationTimeout();
      if(state.channelReady)void sendSignal('accepted',{});startCallHeartbeat();
    } catch(error) { setStatus(error.message||'Could not accept this call.');if(accept)accept.disabled=false;await rejectCall('failed'); }
  }

  async function rejectCall(reason='rejected') {
    if(state.ringTimer)clearTimeout(state.ringTimer);state.ringTimer=null;
    if(state.callId && state.role==='callee'){
      try { if(reason==='rejected'||reason==='missed')await client().rpc('spike_respond_to_call',{p_call_id:state.callId,p_action:reason==='missed'?'missed':'reject'});else await client().rpc('spike_end_call',{p_call_id:state.callId}); } catch(error){console.info('[SPIKE calls] decline cleanup',error?.message||error);}
      await sendSignal(reason,{});
    }
    cleanup(reason==='missed'?'Missed call.':reason==='failed'?'Call could not start.':'Call declined.');
  }

  async function beginCallerNegotiation() {
    // The durable database status is authoritative. Realtime broadcast is only
    // a low-latency hint and may arrive before local media/peer setup completes.
    if(state.role!=='caller' || !state.peerAccepted || !state.pc || state.status==='idle' || state.offerStarted)return;
    state.offerStarted=true;
    try {
      startCallHeartbeat();
      if(state.ringTimer)clearTimeout(state.ringTimer);state.ringTimer=null;
      state.status='negotiating';showUI('active','Connecting…');startNegotiationTimeout();
      const offer=await state.pc.createOffer();
      await state.pc.setLocalDescription(offer);
      const delivered=await sendSignal('offer',{sdp:state.pc.localDescription});
      if(!delivered)throw new Error('Secure signalling could not deliver the call offer.');
    } catch(error) {
      state.offerStarted=false;
      console.warn('[SPIKE calls] offer creation failed',error?.message||error);
      setStatus('Could not start call negotiation. Please retry.');
      await endCall('Call setup failed.');
    }
  }

  async function handleSignal(signal) {
    if(!signal || signal.call_id!==state.callId || signal.from===state.user?.id)return;
    try {
      if(signal.event==='accepted' && state.role==='caller'){
        state.peerAccepted=true;
        await beginCallerNegotiation();
      } else if(signal.event==='offer' && state.role==='callee' && state.status==='joining'){
        await state.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await flushIce();
        const answer=await state.pc.createAnswer();await state.pc.setLocalDescription(answer);
        await sendSignal('answer',{sdp:state.pc.localDescription});
        state.status='negotiating';
      } else if(signal.event==='answer' && state.role==='caller' && state.pc && !state.pc.currentRemoteDescription){
        await state.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));await flushIce();
      } else if(signal.event==='ice' && signal.candidate && state.pc){
        const candidate=new RTCIceCandidate(signal.candidate);
        if(state.pc.remoteDescription)await state.pc.addIceCandidate(candidate);else state.queuedIce.push(candidate);
      } else if(signal.event==='rejected')cleanup('Call declined.');
      else if(signal.event==='missed')cleanup('No answer.');
      else if(signal.event==='ended')cleanup('Call ended.');
      else if(signal.event==='failed')cleanup('Call could not connect.');
    } catch(error){console.warn('[SPIKE calls] signaling negotiation failed',error);setStatus(error.message||'Call setup failed.');}
  }

  async function flushIce(){if(!state.pc?.remoteDescription)return;for(const candidate of state.queuedIce.splice(0)){try{await state.pc.addIceCandidate(candidate);}catch(error){console.info('[SPIKE calls] queued ICE candidate rejected',error?.message||error);}}}

  function renderActive() {
    if(state.status==='idle')return;
    const elapsed=state.startedAt?Math.max(0,Math.floor((Date.now()-state.startedAt)/1000)):0;
    const mm=String(Math.floor(elapsed/60)).padStart(2,'0'),ss=String(elapsed%60).padStart(2,'0');
    if(!$('spikeCallOverlay'))showUI('active','Connected');
    setStatus(state.pc?.connectionState==='connected'?`Connected · ${mm}:${ss}`:'Connecting…');
    if(!state.callTimer)state.callTimer=window.setInterval(()=>{if(state.status==='active')renderActive();},1000);
    attachMediaElements();
  }

  async function toggleMute(){state.muted=!state.muted;state.localStream?.getAudioTracks().forEach(track=>track.enabled=!state.muted);const b=$('spikeCallMute');if(b)b.textContent=state.muted?'Unmute':'Mute';}
  async function toggleCamera(){state.cameraOff=!state.cameraOff;state.localStream?.getVideoTracks().forEach(track=>track.enabled=!state.cameraOff);const b=$('spikeCallCamera');if(b)b.textContent=state.cameraOff?'Camera on':'Camera off';}

  async function endCall(message='Call ended.') {
    if(state.callId){
      const callerMissed=state.role==='caller' && message==='No answer.';
      const signalEvent=callerMissed?'missed':'ended';
      try{
        await sendSignal(signalEvent,{});
        const {error}=await client().rpc(callerMissed?'spike_mark_call_missed':'spike_end_call',{p_call_id:state.callId});
        if(error)throw error;
      }catch(error){console.info('[SPIKE calls] end call cleanup',error?.message||error);}
    }
    cleanup(message);
  }

  function cleanup(message='') {
    state.callAttempt++;state.channelGeneration++;
    if(state.channelRetryTimer)clearTimeout(state.channelRetryTimer);state.channelRetryTimer=null;state.channelRetryDelay=1000;state.channelFlushing=false;
    if(state.ringTimer)clearTimeout(state.ringTimer);state.ringTimer=null;if(state.negotiationTimer)clearTimeout(state.negotiationTimer);state.negotiationTimer=null;
    if(state.callTimer)clearInterval(state.callTimer);state.callTimer=null;if(state.heartbeatTimer)clearInterval(state.heartbeatTimer);state.heartbeatTimer=null;
    try{state.pc?.close();}catch(_){}state.pc=null;
    state.localStream?.getTracks().forEach(track=>track.stop());state.localStream=null;
    state.remoteStream?.getTracks().forEach(track=>track.stop());state.remoteStream=null;
    if(state.channel){client()?.removeChannel(state.channel).catch?.(()=>{});state.channel=null;}state.channelReady=false;
    $('spikeCallOverlay')?.remove();
    state.callId=null;state.callType=null;state.role=null;state.status='idle';state.iceServers=null;state.peer=null;state.conversationId=null;state.queuedIce=[];state.startedAt=0;state.muted=false;state.cameraOff=false;state.pending=null;state.peerAccepted=false;state.offerStarted=false;state.queuedSignals=[];
    if(message)window.spikePremiumToast?.(message,'info',3000);
  }

  function bindCallButtons() {
    $('voiceCallBtn')?.addEventListener('click',()=>{
      const context=window.SPIKE_MESSAGING?.getCallContext?.();
      startCall('voice',context).catch(error=>window.spikePremiumToast?.(error.message||'Could not start voice call.','error',4500));
    });
    $('videoCallBtn')?.addEventListener('click',()=>{
      const context=window.SPIKE_MESSAGING?.getCallContext?.();
      startCall('video',context).catch(error=>window.spikePremiumToast?.(error.message||'Could not start video call.','error',4500));
    });
  }

  async function start() {
    const db=client();if(!db?.auth)return;
    bindCallButtons();
    // Attach auth handling before reading the stored session. If session restoration
    // is late or getUser() cannot reach Auth, a later INITIAL_SESSION/SIGNED_IN
    // event must still bring the call listener online.
    db.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'||!session?.user){
        if(state.user || state.callId)void endCall('Call ended because you signed out.');
        state.eventsGeneration++;state.eventsSubscribed=false;
        if(state.eventsRetryTimer){clearTimeout(state.eventsRetryTimer);state.eventsRetryTimer=null;}
        if(state.eventsChannel){void db.removeChannel(state.eventsChannel);state.eventsChannel=null;}
        state.user=null;
        stopPendingCallPolling();
      } else if(session.user){
        const changed=state.user?.id!==session.user.id;
        if(changed){
          state.eventsGeneration++;state.eventsSubscribed=false;
          if(state.eventsRetryTimer){clearTimeout(state.eventsRetryTimer);state.eventsRetryTimer=null;}
          if(state.eventsChannel){void db.removeChannel(state.eventsChannel);state.eventsChannel=null;}
          state.user=session.user;
        }
        startPendingCallPolling();
        if(!state.eventsChannel)void subscribeEvents();
      }
    });
    try {
      const {data,error}=await db.auth.getSession();
      if(error)throw error;
      if(data?.session?.user){state.user=data.session.user;startPendingCallPolling();await subscribeEvents();}
    } catch(error) {
      console.warn('[SPIKE calls] session bootstrap deferred; waiting for auth recovery',error?.message||error);
    }
    const resumeEvents=()=>{
      if(document.hidden || !navigator.onLine || !state.user)return;
      startPendingCallPolling();
      void loadPendingCalls();
      if(!state.eventsChannel)void subscribeEvents();
      if(state.callId && !state.channel)void joinCallChannel();
    };
    window.addEventListener('online',resumeEvents);
    window.addEventListener('focus',resumeEvents);
    document.addEventListener('visibilitychange',resumeEvents);
    window.addEventListener('pageshow',()=>{
      state.disposed=false;
      resumeEvents();
    });
    window.addEventListener('pagehide',event=>{
      // A BFCache transition is temporary: preserve the live call and rejoin
      // the user event channel when the page is restored.
      state.disposed=!event.persisted;state.eventsGeneration++;
      if(state.eventsRetryTimer){clearTimeout(state.eventsRetryTimer);state.eventsRetryTimer=null;}
      if(!event.persisted){
        stopPendingCallPolling();
        if(state.callId)void endCall('Call ended.');
      }
      if(state.eventsChannel){db.removeChannel(state.eventsChannel);state.eventsChannel=null;}
      state.eventsSubscribed=false;
    });
  }

  window.SPIKE_CALLS=Object.freeze({start:startCall,end:endCall,getState:()=>({callId:state.callId,status:state.status,callType:state.callType})});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start().catch(error=>console.warn('[SPIKE calls] initialization failed',error)),{once:true});
  else start().catch(error=>console.warn('[SPIKE calls] initialization failed',error));
})();
