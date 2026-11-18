/* SPIKE direct calling v1 — isolated WebRTC client and signaling lifecycle. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
 const peerId=params.get('to')||params.get('id')||'',incomingCallId=params.get('call')||'';
 let activeCallType=params.get('type')==='audio'?'audio':'video';
 const db=window.SPIKE_PLATFORM?.getClient?.()||window.__SPIKE_SUPABASE__||window.supabaseClient||null;
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 let user=null,localStream=null,videoTrack=null,audioTrack=null,pc=null,signalChannel=null,activeCallId=null;
 let isCaller=false,remoteDescriptionReady=false,closing=false,callTimeout=null;
 const queuedIce=[],seenSignals=new Set();
 const STUN=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
 function status(message){$('callStatus').textContent=message}
 function notice(message){$('footerMessage').textContent=message}
 function setActive(button,active){button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))}
 function applyCallMode(){document.body.classList.toggle('vc-audio-mode',activeCallType==='audio');$('modeLabel').textContent=activeCallType==='audio'?'VOICE CALL':'VIDEO CALL';$('cameraToggle').hidden=activeCallType==='audio';$('switchCamera').hidden=activeCallType==='audio';$('selfTile').hidden=activeCallType==='audio'}
 function setPeer(name,avatar){const n=name||'SPIKE member';$('peerName').textContent=n;$('peerAvatar').textContent=avatar||n.trim().charAt(0).toUpperCase()||'S'}
 async function loadPeer(id){try{const {data,error}=await db.from('profiles').select('display_name,full_name,username,avatar_url').eq('id',id).maybeSingle();if(error)throw error;if(data){const name=data.display_name||data.full_name||data.username||'SPIKE member';setPeer(name);if(data.avatar_url){$('peerAvatar').style.backgroundImage=`url("${String(data.avatar_url).replace(/["\\]/g,'')}")`;$('peerAvatar').style.backgroundSize='cover';$('peerAvatar').textContent=''}}}catch(error){console.warn('[SPIKE call] profile lookup failed',error.message)}}
 async function boot(){
  applyCallMode();
  if(!db){status('Secure connection unavailable');notice('SPIKE could not initialize its existing Supabase client. Reload and try again.');$('stageLabel').textContent='OFFLINE';return}
  try{user=window.SPIKE_PLATFORM?.requireUser?await window.SPIKE_PLATFORM.requireUser():(await db.auth.getUser()).data?.user||null;if(!user?.id)throw new Error('Please sign in to use SPIKE calling.')}catch(error){status('Sign-in required');notice(error.message||'Your SPIKE session is not ready.');$('stageLabel').textContent='SIGN IN';return}
  if(incomingCallId){if(!UUID.test(incomingCallId)){status('Invalid call');notice('This incoming call link is not valid.');return}await prepareIncoming();return}
  if(peerId&&!UUID.test(peerId)){status('Invalid contact');notice('The contact link is not valid. Return to Messages and open the conversation again.');return}
  if(peerId===user.id){status('Choose another member');notice('You cannot call your own account.');return}
  if(peerId)await loadPeer(peerId);
  status('Ready when you are');$('stageLabel').textContent='READY';$('heading').textContent=peerId?'Ready to call?':'Connect face to face.';$('subheading').textContent=peerId?'Tap the video button to start a secure call. Your camera and microphone remain off until then.':'Open this screen from a direct conversation to choose who to call.';
  if(!peerId){$('cameraToggle').disabled=true;notice('Open a direct conversation and use its video button to start a call.');}
 }
 async function startPreview(){
  if(localStream)return localStream;
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access requires HTTPS and a supported browser.');
  localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:activeCallType==='video'?{facingMode:'user',width:{ideal:1280},height:{ideal:720}}:false});
  videoTrack=localStream.getVideoTracks()[0]||null;audioTrack=localStream.getAudioTracks()[0]||null;
  if(videoTrack){$('localVideo').srcObject=localStream;$('localVideo').classList.add('active');$('selfPlaceholder').hidden=true}
  $('micToggle').disabled=!audioTrack;$('switchCamera').disabled=!videoTrack;$('speakerToggle').disabled=false;$('cameraToggle').disabled=!videoTrack;
  $('micToggle').innerHTML='<span><i class="fa-solid fa-microphone"></i></span><small>Mic</small>';setActive($('micToggle'),!!audioTrack);setActive($('cameraToggle'),!!videoTrack);
  $('permissionNotice').innerHTML=activeCallType==='audio'?'<i class="fa-solid fa-shield-halved"></i><span>Your microphone is active for this private voice call.</span>':'<i class="fa-solid fa-shield-halved"></i><span>Your camera and microphone are active for this video call.</span>'; 
  return localStream;
 }
 function getIceServers(){const configured=window.SPIKE_TURN_CONFIG?.iceServers;if(Array.isArray(configured)&&configured.length)return configured;return STUN}
 function createPeer(){
  if(pc)return pc;
  pc=new RTCPeerConnection({iceServers:getIceServers(),bundlePolicy:'max-bundle',rtcpMuxPolicy:'require'});
  localStream?.getTracks().forEach(track=>pc.addTrack(track,localStream));
  pc.onicecandidate=event=>{if(event.candidate&&activeCallId)sendSignal('ice',event.candidate.toJSON()).catch(e=>console.warn('[SPIKE call] ICE send failed',e.message))};
  pc.ontrack=event=>{const stream=event.streams?.[0];if(activeCallType==='audio'){if(stream)$('remoteAudio').srcObject=stream;else{let target=$('remoteAudio').srcObject;if(!target){target=new MediaStream();$('remoteAudio').srcObject=target}target.addTrack(event.track)}$('remoteAudio').play?.().catch(()=>{})}else{if(stream)$('remoteVideo').srcObject=stream;else{let target=$('remoteVideo').srcObject;if(!target){target=new MediaStream();$('remoteVideo').srcObject=target}target.addTrack(event.track)}$('remoteVideo').classList.add('active');$('remoteVideo').play?.().catch(()=>{})}status('Connected');$('stageLabel').textContent='LIVE';$('qualityLabel').innerHTML='<i class="fa-solid fa-signal"></i> Connected';$('remoteStage').classList.add('has-video')};
  pc.onconnectionstatechange=()=>{const s=pc?.connectionState;if(s==='connected'){status('Connected');$('stageLabel').textContent='LIVE'}else if(s==='connecting'){status('Connecting…');$('stageLabel').textContent='CONNECTING'}else if(s==='disconnected'){status('Reconnecting…');$('stageLabel').textContent='RECONNECTING'}else if(s==='failed'){status('Connection failed');$('stageLabel').textContent='FAILED';notice('The network could not establish a peer connection. Check connectivity and TURN relay configuration, then try again.')}else if(s==='closed')status('Call ended')};
  return pc;
 }
 async function subscribeCall(){
  if(signalChannel)return;
  signalChannel=db.channel('spike-video-call-'+activeCallId)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'spike_video_calls',filter:'id=eq.'+activeCallId},payload=>handleCallUpdate(payload.new))
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'spike_video_call_signals',filter:'call_id=eq.'+activeCallId},payload=>handleSignal(payload.new).catch(e=>console.warn('[SPIKE call] signal processing failed',e)))
   .subscribe((state,error)=>{if(state==='CHANNEL_ERROR'||state==='TIMED_OUT')notice('Realtime signaling is interrupted. Check your connection.');if(error)console.warn('[SPIKE call] realtime error',error)});
  await new Promise((resolve,reject)=>{let done=false;const poll=setInterval(()=>{if(signalChannel?.state==='joined'&&!done){done=true;clearTimeout(timer);clearInterval(poll);resolve()}},100);const timer=setTimeout(()=>{if(!done){done=true;clearInterval(poll);reject(new Error('Could not connect to the call signaling channel.'))}},10000)});
  const {data,error}=await db.from('spike_video_call_signals').select('id,call_id,sender_id,signal_type,payload,created_at').eq('call_id',activeCallId).order('created_at',{ascending:true}).limit(100);
  if(error)throw error;for(const row of data||[])await handleSignal(row);
 }
 async function sendSignal(type,payload){if(!activeCallId||!user)throw new Error('Call signaling is not ready.');const {error}=await db.from('spike_video_call_signals').insert({call_id:activeCallId,sender_id:user.id,signal_type:type,payload});if(error)throw error}
 async function flushIce(){while(queuedIce.length&&remoteDescriptionReady){const candidate=queuedIce.shift();try{await pc.addIceCandidate(new RTCIceCandidate(candidate))}catch(e){console.warn('[SPIKE call] skipped invalid ICE candidate',e.message)}}}
 async function handleSignal(row){
  if(!row||row.sender_id===user.id||seenSignals.has(row.id))return;seenSignals.add(row.id);
  if(!pc)createPeer();
  if(row.signal_type==='offer'&&!isCaller){await pc.setRemoteDescription(new RTCSessionDescription(row.payload));remoteDescriptionReady=true;await flushIce();const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await sendSignal('answer',pc.localDescription.toJSON());status('Connecting…');$('stageLabel').textContent='CONNECTING'}
  else if(row.signal_type==='answer'&&isCaller&&!pc.currentRemoteDescription){await pc.setRemoteDescription(new RTCSessionDescription(row.payload));remoteDescriptionReady=true;await flushIce();status('Connecting…');$('stageLabel').textContent='CONNECTING'}
  else if(row.signal_type==='ice'){if(remoteDescriptionReady)await pc.addIceCandidate(new RTCIceCandidate(row.payload));else queuedIce.push(row.payload)}
 }
 function handleCallUpdate(call){if(!call||call.id!==activeCallId)return;if(call.status==='accepted'){clearTimeout(callTimeout);status('Call accepted — connecting…');$('stageLabel').textContent='CONNECTING';$('heading').textContent='Connecting your call';}else if(['declined','missed','ended','failed'].includes(call.status)){status(call.status==='declined'?'Call declined':call.status==='missed'?'No answer':'Call ended');$('stageLabel').textContent='ENDED';notice(call.status==='missed'?'The member did not answer.':call.status==='declined'?'The member declined the call.':'This call has ended.');cleanupMedia();clearTimeout(callTimeout)}}
 async function beginOutgoing(){
  if(!peerId||activeCallId)return;
  $('cameraToggle').disabled=true;status('Starting camera…');$('stageLabel').textContent='STARTING';
  try{await startPreview();const {data,error}=await db.rpc('spike_video_call_start',{p_callee_id:peerId,p_call_type:activeCallType});if(error)throw error;activeCallId=data;isCaller=true;$('heading').textContent=(activeCallType==='audio'?'Calling ':'Video calling ')+$('peerName').textContent;$('subheading').textContent='Waiting for the other member to answer.';$('cameraToggle').disabled=false;$('endCall').querySelector('small').textContent='Cancel';status('Calling…');$('stageLabel').textContent='RINGING';notice('Your call invitation has been sent. Keep this screen open while the other member answers.');callTimeout=setTimeout(async()=>{if(activeCallId){try{await db.rpc('spike_video_call_end',{p_call_id:activeCallId})}catch(_){}status('No answer');$('stageLabel').textContent='ENDED';notice('No answer after 45 seconds. You can try again.');cleanupMedia()}},47000);createPeer();await subscribeCall();const offer=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:activeCallType==='video'});await pc.setLocalDescription(offer);await sendSignal('offer',pc.localDescription.toJSON())}
  catch(error){console.error('[SPIKE call] outgoing call failed',error);status('Could not start call');notice(error.message||'Please check your camera permission and network, then try again.');$('cameraToggle').disabled=false;if(activeCallId){try{await db.rpc('spike_video_call_end',{p_call_id:activeCallId})}catch(_){}}cleanupMedia()}
 }
 async function prepareIncoming(){
  const {data,error}=await db.from('spike_video_calls').select('id,caller_id,callee_id,call_type,status,expires_at').eq('id',incomingCallId).maybeSingle();
  if(error||!data){status('Call unavailable');notice('This call invitation has expired or is no longer available.');return}
  if(data.callee_id!==user.id){status('Not your call');notice('This invitation belongs to another SPIKE member.');return}
  if(data.status!=='ringing'||new Date(data.expires_at).getTime()<=Date.now()){status('Call expired');notice('This call invitation has expired.');return}
  activeCallId=data.id;isCaller=false;await loadPeer(data.caller_id);activeCallType=data.call_type||'video';applyCallMode();$('heading').textContent='Incoming '+(activeCallType==='audio'?'voice':'video')+' call';$('subheading').textContent='Answer to connect with '+$('peerName').textContent+'.';status('Incoming call');$('stageLabel').textContent='INCOMING';$('acceptCall').hidden=false;$('cameraToggle').disabled=true;$('endCall').querySelector('small').textContent='Decline';notice('You are receiving a private call. Tap Accept to enable your camera and microphone.');
 }
 async function acceptIncoming(){
  $('acceptCall').disabled=true;try{await startPreview();createPeer();await subscribeCall();const {data,error}=await db.rpc('spike_video_call_respond',{p_call_id:activeCallId,p_action:'accepted'});if(error)throw error;if(data==='missed')throw new Error('This call has already expired.');$('acceptCall').hidden=true;$('endCall').querySelector('small').textContent='Leave';$('heading').textContent='Connected to '+$('peerName').textContent;status('Connecting…');$('stageLabel').textContent='CONNECTING';notice('You joined the call. Establishing the peer-to-peer media connection…')}
  catch(error){console.error('[SPIKE call] answer failed',error);status('Could not answer');notice(error.message||'Could not answer this call. Check camera permission and network.');if(activeCallId){try{await db.rpc('spike_video_call_respond',{p_call_id:activeCallId,p_action:'declined'})}catch(_){}}cleanupMedia()}finally{$('acceptCall').disabled=false}
 }
 function cleanupMedia(){if(pc){try{pc.ontrack=null;pc.onicecandidate=null;pc.close()}catch(_){}pc=null}if(localStream){localStream.getTracks().forEach(t=>{try{t.stop()}catch(_){}})}localStream=null;videoTrack=null;audioTrack=null;$('localVideo').srcObject=null;$('remoteVideo').srcObject=null;$('remoteAudio').srcObject=null;$('localVideo').classList.remove('active');$('remoteVideo').classList.remove('active');$('selfPlaceholder').hidden=false;remoteDescriptionReady=false;queuedIce.length=0;if(signalChannel&&db){db.removeChannel(signalChannel).catch(()=>{});signalChannel=null}}
 async function leaveCall(){if(closing)return;closing=true;clearTimeout(callTimeout);if(activeCallId){try{if(!isCaller&&$('acceptCall').hidden===false)await db.rpc('spike_video_call_respond',{p_call_id:activeCallId,p_action:'declined'});else await db.rpc('spike_video_call_end',{p_call_id:activeCallId})}catch(e){console.warn('[SPIKE call] end request failed',e.message)}}cleanupMedia();location.href=peerId?'message.html?to='+encodeURIComponent(peerId):'messages.html'}
 $('cameraToggle').addEventListener('click',async()=>{if(!activeCallId){await beginOutgoing();return}if(videoTrack){videoTrack.enabled=!videoTrack.enabled;setActive($('cameraToggle'),videoTrack.enabled);$('selfPlaceholder').hidden=videoTrack.enabled;status(videoTrack.enabled?'Camera on':'Camera off')}});
 $('acceptCall').addEventListener('click',acceptIncoming);
 $('micToggle').addEventListener('click',()=>{if(!audioTrack)return;audioTrack.enabled=!audioTrack.enabled;setActive($('micToggle'),audioTrack.enabled);$('micToggle').innerHTML=`<span><i class="fa-solid fa-microphone${audioTrack.enabled?'':'-slash'}"></i></span><small>Mic</small>`});
 $('switchCamera').addEventListener('click',async()=>{if(!localStream||!videoTrack)return;const next=videoTrack.getSettings().facingMode==='environment'?'user':'environment';try{const replacement=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:next}},audio:false});const track=replacement.getVideoTracks()[0];const old=videoTrack;const sender=pc?.getSenders().find(s=>s.track===old);if(sender)await sender.replaceTrack(track);localStream.removeTrack(old);localStream.addTrack(track);videoTrack=track;$('localVideo').srcObject=localStream;old.stop();replacement.getTracks().filter(t=>t!==track).forEach(t=>t.stop())}catch(error){notice('Could not switch cameras on this device: '+(error.message||''))}});
 $('speakerToggle').addEventListener('click',()=>{const v=activeCallType==='audio'?$('remoteAudio'): $('remoteVideo');if(typeof v.setSinkId!=='function'){notice('Audio output selection is not supported by this browser.');return}const muted=!v.muted;v.muted=muted;setActive($('speakerToggle'),!muted)});
 $('endCall').addEventListener('click',leaveCall);
 window.addEventListener('pagehide',()=>{clearTimeout(callTimeout);cleanupMedia()});
 boot().catch(error=>{console.error('[SPIKE call] boot failed',error);status('Call setup failed');notice(error.message||'Could not prepare the call screen.')});
})();
