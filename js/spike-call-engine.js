/* SPIKE one-to-one WebRTC calling. Signaling is private to the two conversation members. */
(() => {
  'use strict';
  if (window.SPIKE_CALLS) return;

  const client = () => window.SPIKE_SUPABASE || window.db;
  const $ = id => document.getElementById(id);
  const state = {
    user: null, callId: null, callType: null, role: null, status: 'idle',
    channel: null, channelReady: false, eventsChannel: null, pc: null, localStream: null,
    remoteStream: null, peer: null, conversationId: null,
    queuedIce: [], callTimer: null, ringTimer: null, heartbeatTimer: null, negotiationTimer: null, startedAt: 0, iceServers: null,
    muted: false, cameraOff: false, pending: null, disposed: false
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
      .spike-call-overlay{position:fixed;inset:0;z-index:30000;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));background:rgba(3,5,12,.82);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
      .spike-call-card{width:min(440px,100%);max-height:92dvh;overflow:auto;border:1px solid var(--spike-line,rgba(180,150,255,.24));border-radius:28px;padding:22px;background:linear-gradient(150deg,var(--spike-surface,#171426),var(--spike-bg,#090d17) 72%);color:var(--spike-text,#f7f5ff);box-shadow:0 28px 100px #000b;text-align:center;font-family:Inter,system-ui,sans-serif}
      .spike-call-kicker{font-size:10px;letter-spacing:.16em;font-weight:900;color:var(--spike-accent,#c4a5fd);text-transform:uppercase}
      .spike-call-avatar{width:86px;height:86px;border-radius:50%;display:grid;place-items:center;margin:18px auto 12px;background:linear-gradient(135deg,var(--spike-action-bg,#6d28d9),var(--spike-accent-2,#be185d));font-size:32px;font-weight:900;overflow:hidden}
      .spike-call-avatar img{width:100%;height:100%;object-fit:cover}
      .spike-call-name{font-size:22px;font-weight:900;letter-spacing:-.04em;margin:0}
      .spike-call-status{font-size:13px;color:var(--spike-muted,#b6b5c8);margin:8px 0 16px;min-height:20px}
      .spike-call-video{display:grid;gap:8px;margin:14px 0}
      .spike-call-video video{width:100%;max-height:38dvh;object-fit:cover;background:#05070d;border-radius:16px}
      .spike-call-video .local{width:34%;justify-self:end;max-height:18dvh;border:1px solid #ffffff30}
      .spike-call-controls{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:18px}
      .spike-call-controls button{min-width:58px;min-height:54px;border:1px solid #ffffff25;border-radius:17px;background:var(--spike-surface-2,#ffffff12);color:var(--spike-text,#fff);font-size:12px;font-weight:800;padding:10px 13px}
      .spike-call-controls button.primary{background:linear-gradient(135deg,var(--spike-action-bg,#7c3aed),var(--spike-accent-2,#a21caf));border:0}
      .spike-call-controls button.danger{background:var(--spike-danger,#be123c);border:0}
      .spike-call-controls button:disabled{opacity:.45}
      .spike-call-foot{font-size:10px;color:var(--spike-muted,#8f91a5);margin-top:16px;line-height:1.5}
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
    const card = document.createElement('section'); card.className = 'spike-call-card';
    const kicker = document.createElement('div'); kicker.className = 'spike-call-kicker'; kicker.textContent = state.callType === 'video' ? 'SPIKE VIDEO CALL' : 'SPIKE VOICE CALL';
    const avatar = document.createElement('div'); avatar.className = 'spike-call-avatar';
    if (state.peer?.avatar_url) { const img=document.createElement('img'); img.src=state.peer.avatar_url; img.alt=''; avatar.append(img); }
    else avatar.textContent=String(state.peer?.display_name||state.peer?.username||'S').trim().slice(0,1).toUpperCase()||'S';
    const name=document.createElement('h2');name.className='spike-call-name';name.textContent=state.peer?.display_name||state.peer?.username||'SPIKE member';
    const status=document.createElement('div');status.className='spike-call-status';status.id='spikeCallStatus';status.textContent=statusText||'';
    card.append(kicker,avatar,name,status);
    if (state.callType === 'video' && kind === 'active') {
      const video=document.createElement('div');video.className='spike-call-video';
      const remote=document.createElement('video');remote.id='spikeCallRemoteVideo';remote.autoplay=true;remote.playsInline=true;
      const local=document.createElement('video');local.id='spikeCallLocalVideo';local.autoplay=true;local.muted=true;local.playsInline=true;local.className='local';
      video.append(remote,local);card.append(video);
    } else if (state.callType === 'voice' && kind === 'active') {
      const audio=document.createElement('audio');audio.id='spikeCallRemoteAudio';audio.autoplay=true;audio.playsInline=true;card.append(audio);
    }
    const controls=document.createElement('div');controls.className='spike-call-controls';
    const add=(id,label,cls,handler)=>{const b=document.createElement('button');b.id=id;b.type='button';b.textContent=label;if(cls)b.className=cls;b.addEventListener('click',handler);controls.append(b);};
    if(kind==='incoming'){
      add('spikeCallAccept','Accept','primary',acceptCall);
      add('spikeCallReject','Decline','danger',()=>rejectCall('rejected'));
    } else if(kind==='outgoing') {
      add('spikeCallHangup','Cancel','danger',endCall);
    } else {
      add('spikeCallMute',state.muted?'Unmute':'Mute','',toggleMute);
      if(state.callType==='video')add('spikeCallCamera',state.cameraOff?'Camera on':'Camera off','',toggleCamera);
      add('spikeCallEnd','End call','danger',endCall);
    }
    card.append(controls);
    const foot=document.createElement('div');foot.className='spike-call-foot';foot.textContent='Calls use encrypted peer-to-peer WebRTC with STUN-assisted connection setup. Some restrictive networks may prevent a connection.';card.append(foot);
    overlay.append(card);
    if(kind==='active')attachMediaElements();
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

  async function subscribeEvents() {
    if(state.eventsChannel || !state.user)return;
    state.eventsChannel=client().channel(`spike-call-events-${state.user.id}`,{config:{private:true}})
      .on('postgres_changes',{event:'*',schema:'public',table:'spike_call_sessions'},handleCallRow)
      .subscribe((status,error)=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')console.warn('[SPIKE calls] call notifications unavailable',error||status);});
    const {data,error}=await client().from('spike_call_sessions')
      .select('id,conversation_id,caller_id,callee_id,call_type,status,created_at,expires_at')
      .eq('callee_id',state.user.id).eq('status','ringing').gt('expires_at',new Date().toISOString())
      .order('created_at',{ascending:false}).limit(3);
    if(error)console.warn('[SPIKE calls] pending call lookup failed',error.message);
    else if(data?.length && state.status==='idle')void incomingCall(data[0]);
  }

  async function handleCallRow(payload) {
    const row=payload?.new||payload?.old;
    if(!row || !state.user)return;
    if(row.callee_id===state.user.id && row.status==='ringing' && state.status==='idle' && new Date(row.expires_at).getTime()>Date.now()){
      void incomingCall(row);return;
    }
    if(row.id===state.callId && ['rejected','ended','missed','failed'].includes(row.status)){
      const message=row.status==='rejected'?'Call declined.':row.status==='missed'?'No answer.':'Call ended.';
      cleanup(message);
    }
  }

  async function incomingCall(row) {
    if(state.status!=='idle' || !state.user || row.callee_id!==state.user.id)return;
    state.callId=row.id;state.callType=row.call_type;state.role='callee';state.status='incoming';state.conversationId=row.conversation_id;
    state.peer=await profileFor(row.caller_id);state.pending=row;
    showUI('incoming',`${state.callType==='video'?'Incoming video call':'Incoming voice call'} · SPIKE`);
    await joinCallChannel();
    const remaining=Math.max(0,new Date(row.expires_at).getTime()-Date.now());
    state.ringTimer=window.setTimeout(()=>{if(state.status==='incoming')void rejectCall('missed');},remaining);
  }

  async function joinCallChannel() {
    if(state.channel || !state.callId)return;
    const topic=`spike-call:${state.callId}`;
    state.channel=client().channel(topic,{config:{private:true,broadcast:{ack:true,self:false}}})
      .on('broadcast',{event:'signal'},payload=>{void handleSignal(payload?.payload||{});})
      .subscribe((status,error)=>{
        if(status==='SUBSCRIBED'){
          state.channelReady=true;
          if(state.status==='joining' && state.role==='callee')void sendSignal('accepted',{});
        } else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
          setStatus('Secure call signaling could not connect. Check your connection and retry.');
          console.warn('[SPIKE calls] private signaling channel failed',status,error||'');
        }
      });
  }

  async function sendSignal(event,payload) {
    if(!state.channel)return;
    try { await state.channel.send({type:'broadcast',event:'signal',payload:{event,from:state.user.id,call_id:state.callId,...payload}}); }
    catch(error){console.warn('[SPIKE calls] signaling event failed',event,error?.message||error);}
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
    state.callType=type;state.role='caller';state.status='creating';state.conversationId=conversationId;
    state.peer=await profileFor(peerId);
    try {
      const {data,error}=await client().rpc('spike_create_call',{p_conversation_id:conversationId,p_call_type:type});
      if(error)throw error;
      if(!data)throw new Error('The call invitation could not be created.');
      state.callId=data;
      await prepareMedia();
      createPeerConnection();
      await joinCallChannel();
      state.status='outgoing';showUI('outgoing','Calling… waiting for the other member.');
      state.ringTimer=window.setTimeout(()=>{if(state.status==='outgoing')void endCall('No answer.');},50000);
    } catch(error) { await endCall().catch(()=>{});throw error; }
  }

  function loadIceServers() {
    // Keep calling self-contained: use public STUN only and do not require a
    // TURN provider account, Worker secret, or external credential endpoint.
    state.iceServers=ICE_SERVERS;
  }

  async function prepareMedia() {
    loadIceServers();
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone and camera access require a supported browser over HTTPS.');
    try {
      state.localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:state.callType==='video'?{facingMode:'user',width:{ideal:1280},height:{ideal:720}}:false});
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
      state.status='joining';await prepareMedia();createPeerConnection();
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

  async function handleSignal(signal) {
    if(!signal || signal.call_id!==state.callId || signal.from===state.user?.id)return;
    try {
      if(signal.event==='accepted' && state.role==='caller' && state.status==='outgoing'){
        startCallHeartbeat();
        if(state.ringTimer)clearTimeout(state.ringTimer);state.ringTimer=null;
        state.status='negotiating';showUI('active','Connecting…');startNegotiationTimeout();
        const offer=await state.pc.createOffer();await state.pc.setLocalDescription(offer);
        await sendSignal('offer',{sdp:state.pc.localDescription});
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
    if(state.ringTimer)clearTimeout(state.ringTimer);state.ringTimer=null;if(state.negotiationTimer)clearTimeout(state.negotiationTimer);state.negotiationTimer=null;
    if(state.callTimer)clearInterval(state.callTimer);state.callTimer=null;if(state.heartbeatTimer)clearInterval(state.heartbeatTimer);state.heartbeatTimer=null;
    try{state.pc?.close();}catch(_){}state.pc=null;
    state.localStream?.getTracks().forEach(track=>track.stop());state.localStream=null;
    state.remoteStream?.getTracks().forEach(track=>track.stop());state.remoteStream=null;
    if(state.channel){client()?.removeChannel(state.channel).catch?.(()=>{});state.channel=null;}state.channelReady=false;
    $('spikeCallOverlay')?.remove();
    state.callId=null;state.callType=null;state.role=null;state.status='idle';state.iceServers=null;state.peer=null;state.conversationId=null;state.queuedIce=[];state.startedAt=0;state.muted=false;state.cameraOff=false;state.pending=null;
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
    try { state.user=await getCurrentUser(); } catch (_) { return; }
    bindCallButtons();
    await subscribeEvents();
    db.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'||!session?.user){void endCall('Call ended because you signed out.');if(state.eventsChannel){db.removeChannel(state.eventsChannel);state.eventsChannel=null;}state.user=null;}
      else if(session.user && state.user?.id!==session.user.id){state.user=session.user;if(state.eventsChannel){db.removeChannel(state.eventsChannel);state.eventsChannel=null;}void subscribeEvents();}
    });
    window.addEventListener('pagehide',()=>{if(state.callId)void endCall('Call ended.');if(state.eventsChannel)db.removeChannel(state.eventsChannel);},{once:true});
  }

  window.SPIKE_CALLS=Object.freeze({start:startCall,end:endCall,getState:()=>({callId:state.callId,status:state.status,callType:state.callType})});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start().catch(error=>console.warn('[SPIKE calls] initialization failed',error)),{once:true});
  else start().catch(error=>console.warn('[SPIKE calls] initialization failed',error));
})();
