/* SPIKE site-wide DM calls + presence bootstrap.
 * Incoming call signaling is delivered to spike:call:<recipient UUID>, so the receiver
 * does not need to keep message.html open.
 */
(()=>{'use strict';
if(window.__SPIKE_CALLS_V2__)return;window.__SPIKE_CALLS_V2__=true;
const URL='https://cjqpyndceqyqsijihxbb.supabase.co',KEY='sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),uuidRE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let db=null,me=null,other=params.get('to')||params.get('id')||'',lastCallRecording=null,profileCache=new Map(),callChannel=null,callChannels=[],call=null,callTimer=null,callStarted=0,callTimeout=null,callConnectionTimer=null,callRecoveryTimer=null,settings={incoming:true,outgoing:true},remoteCandidates=[],pendingCandidates=new Map(),peerChannels=new Map(),callUIBound=false,dmEventsBound=false,cleanupBound=false,activeSessionUserId=null,sessionInitPromise=null;
const say=(id,s)=>{const n=$(id);if(n)n.textContent=s||''};
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function ensurePresenceUI(){
 const style=document.getElementById('spike-presence-indicator-style')||document.createElement('style');style.id='spike-presence-indicator-style';style.textContent='.presence-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#777;margin:0 6px 1px 7px;vertical-align:middle}.presence-dot.online{background:#22c55e;box-shadow:0 0 0 3px #22c55e22}.spike-dm-presence{font-size:11px;color:var(--muted,#a8a0bb)}';if(!style.parentNode)document.head.appendChild(style);
 if(location.pathname.endsWith('/message.html')||location.pathname==='message.html'){const sub=$('sub');if(sub){let holder=$('dmPresence');if(!holder){holder=document.createElement('span');holder.id='dmPresence';holder.className='spike-dm-presence';holder.innerHTML='<span class="presence-dot"></span><span data-presence-text>Away</span>';holder.title='Presence timestamp updates in real time';sub.insertAdjacentElement('afterend',holder)}holder.dataset.presenceUser=other;window.AppPresence?.watch?.([other]);}}
 
}
function ensureCallUI(){const existing=$('callShade');if(existing&&(!existing.querySelector('#callCard')||!existing.querySelector('#acceptCall')||!existing.querySelector('#endCall')))existing.remove();if(!$('callShade')){const style=document.createElement('style');style.textContent='.spike-global-call-shade{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:14px;background:rgba(5,4,15,.88);color:#fff;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}.spike-global-call-shade.show{display:flex}.spike-global-call-card{position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;width:min(100%,660px);min-height:min(620px,90dvh);padding:58px 22px 26px;border:1px solid rgba(216,167,255,.32);border-radius:28px;background:radial-gradient(90% 70% at 50% 0,rgba(126,34,206,.24),transparent 70%),linear-gradient(160deg,#1b1229,#090811 78%);box-shadow:0 24px 80px #0009}.spike-global-call-avatar{display:grid;place-items:center;width:112px;height:112px;border-radius:50%;background:#873bd2;font-size:32px;font-weight:900;overflow:hidden;box-shadow:0 0 0 10px rgba(168,85,247,.08)}.spike-global-call-avatar img{width:100%;height:100%;object-fit:cover}.spike-global-call-controls button{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:3px}.spike-global-call-controls button .call-btn-label{font-size:10px;font-weight:800;line-height:1.1}.spike-global-call-controls button.active{outline:2px solid #d8a7ff;outline-offset:2px}.spike-global-call-topname{font-size:11px;letter-spacing:.12em;font-weight:900}.spike-global-call-videos{position:absolute;inset:0;background:#05050a}.spike-global-call-videos video{width:100%;height:100%;object-fit:cover}.spike-global-call-videos .local{position:absolute;right:12px;top:12px;width:100px;height:140px;border-radius:12px}.spike-global-call-name{font-size:24px;font-weight:900;text-align:center}.spike-global-call-state{color:#d9c7e9;text-align:center}.spike-global-call-controls{display:flex;gap:clamp(10px,3vw,18px);flex-wrap:wrap;align-items:center;justify-content:center;margin-top:clamp(22px,6vh,70px);width:100%;max-width:520px;position:relative;z-index:3}.spike-global-call-controls button{appearance:none;-webkit-appearance:none;width:clamp(62px,17vw,78px);height:clamp(62px,17vw,78px);flex:0 0 auto;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:linear-gradient(145deg,#3a2b4c,#21192e);color:#fff;font-size:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;box-shadow:0 8px 24px #0005;transition:transform .16s ease,filter .16s ease,background .16s ease;touch-action:manipulation}.spike-global-call-controls button:active{transform:scale(.94)}.spike-global-call-controls button:focus-visible{outline:3px solid #e9d5ff;outline-offset:3px}.spike-global-call-controls button .call-btn-label{font-size:11px;font-weight:800;line-height:1.1;white-space:nowrap}.spike-global-call-controls .accept{background:linear-gradient(145deg,#20b978,#08794d);border-color:#48e0a0}.spike-global-call-controls .decline,.spike-global-call-controls .end{background:linear-gradient(145deg,#ff526b,#c7193e);border-color:#ff8293}.spike-global-call-controls button.active{background:linear-gradient(145deg,#a855f7,#6d28d9);border-color:#d8b4fe;box-shadow:0 0 0 3px #a855f733,0 8px 24px #0005}.spike-global-call-card.videoActive{justify-content:flex-end;padding-bottom:calc(28px + env(safe-area-inset-bottom))}.spike-global-call-card.videoActive .spike-global-call-videos{z-index:-1}.spike-global-call-card.videoActive .spike-global-call-avatar{display:none}.spike-global-call-card.videoActive .spike-global-call-name,.spike-global-call-card.videoActive #callTypeLabel,.spike-global-call-card.videoActive #callState,.spike-global-call-card.videoActive #callTimer{align-self:flex-start;text-align:left;max-width:80%;padding-left:8px;text-shadow:0 2px 10px #000}.spike-global-call-card.videoActive .spike-global-call-controls{margin-top:16px;padding:14px 10px;border:1px solid #ffffff20;border-radius:28px;background:rgba(10,8,18,.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.spike-global-call-card.videoActive .spike-global-call-hint,.spike-global-call-card.videoActive .spike-global-call-error{align-self:flex-start;text-align:left;padding-left:8px;text-shadow:0 2px 10px #000}.spike-global-call-hint,.spike-global-call-error{max-width:340px;text-align:center;font-size:12px;color:#c9bfd4;line-height:1.5}.spike-recording-panel{position:relative;z-index:4;width:min(100%,440px);padding:12px 14px;border:1px solid #ffffff24;border-radius:16px;background:rgba(14,10,22,.88);text-align:center;font-size:12px;line-height:1.45}.spike-recording-actions{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:9px}.spike-recording-actions button{border:1px solid #ffffff2b;border-radius:12px;padding:10px 13px;background:#342641;color:#fff;font:700 12px system-ui;cursor:pointer;touch-action:manipulation}.spike-recording-actions button.primary{background:#7c3aed;border-color:#c4b5fd}.spike-recording-actions button.danger{background:#9f1239;border-color:#fda4af}.spike-recording-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#fb7185;margin-right:6px;box-shadow:0 0 0 3px #fb718522}#recordingRemoteNotice{display:inline-flex;align-items:center;gap:7px;margin:8px auto 0;padding:5px 9px;border:1px solid #fb718566;border-radius:999px;background:#fb718514;color:#ffdbe2;font-size:11px;font-weight:700;line-height:1.3}#recordingRemoteNotice:not([hidden])::before{content:"";display:inline-block;flex:0 0 7px;width:7px;height:7px;border-radius:50%;background:#fb7185;box-shadow:0 0 0 3px #fb718522}.spike-recording-panel[hidden]{display:none!important}.spike-global-call-error{color:#ff9dad}.spike-global-call-card button[hidden],.spike-global-call-card [hidden]{display:none!important}@media(max-width:520px){.spike-global-call-shade{padding:0}.spike-global-call-card{width:100%;height:100dvh;min-height:0;border-radius:0;border:0;padding:62px 16px calc(22px + env(safe-area-inset-bottom));gap:12px}.spike-global-call-controls{margin-top:clamp(18px,5vh,42px);gap:12px}.spike-global-call-controls button{width:66px;height:66px;border-radius:21px;font-size:23px}.spike-global-call-controls button .call-btn-label{font-size:10px}.spike-global-call-card.videoActive .spike-global-call-controls{gap:8px;padding:12px 6px}.spike-global-call-videos .local{width:86px;height:120px;right:10px;top:10px}}';style.textContent += `
/* SPIKE Connect premium call experience */
.spike-global-call-shade{padding:0;background:radial-gradient(ellipse at 50% 0%,rgba(124,58,237,.20),transparent 42%),rgba(3,4,12,.94);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.spike-global-call-card{width:min(100%,760px);min-height:min(760px,94dvh);border:1px solid rgba(255,255,255,.12);border-radius:34px;background:radial-gradient(ellipse at 50% 8%,rgba(139,92,246,.23),transparent 43%),linear-gradient(155deg,#17152a 0%,#0b0d19 55%,#080912 100%);box-shadow:0 35px 110px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.08);gap:16px}
.spike-global-call-topname{top:22px!important;left:50%;transform:translateX(-50%);padding:9px 15px;border:1px solid rgba(196,181,253,.2);border-radius:999px;background:rgba(255,255,255,.055);color:#e9ddff;font-size:10px;letter-spacing:.18em;white-space:nowrap}
.spike-global-call-avatar{width:124px;height:124px;border:3px solid rgba(216,180,254,.68);background:linear-gradient(145deg,#8b5cf6,#4c1d95);box-shadow:0 0 0 9px rgba(139,92,246,.10),0 0 55px rgba(139,92,246,.25);animation:spikeCallBreath 2.8s ease-in-out infinite}
.spike-global-call-name{font-size:clamp(23px,4vw,31px);letter-spacing:-.04em}
.spike-global-call-state{font-size:14px;color:#c4b5fd}
#callTimer{font-variant-numeric:tabular-nums;font-size:13px;color:#a7f3d0;letter-spacing:.12em}
.spike-global-call-controls{gap:14px;max-width:600px;margin-top:clamp(20px,5vh,52px)}
.spike-global-call-controls button{width:74px;height:74px;border-radius:26px;background:linear-gradient(150deg,rgba(66,62,91,.96),rgba(29,27,48,.98));border:1px solid rgba(255,255,255,.13);box-shadow:0 12px 30px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.09);font-size:25px}
.spike-global-call-controls button .call-btn-label{font-size:10px;letter-spacing:.01em;color:#f3efff}
.spike-global-call-controls button.active{background:linear-gradient(145deg,#a78bfa,#6d28d9);border-color:#ddd6fe;box-shadow:0 0 0 4px rgba(167,139,250,.15),0 12px 30px rgba(0,0,0,.3)}
.spike-global-call-controls .accept{background:linear-gradient(145deg,#34d399,#059669);border-color:#6ee7b7}
.spike-global-call-controls .decline,.spike-global-call-controls .end{background:linear-gradient(145deg,#fb7185,#be123c);border-color:#fda4af}
.spike-global-call-hint{max-width:440px;color:#9ca3af;font-size:12px}
.spike-global-call-error{padding:0 12px;font-size:13px}
.spike-global-call-videos{background:#050711}
.spike-global-call-videos video#remoteVideo{object-fit:cover;background:#050711}
.spike-global-call-videos video.local{width:clamp(104px,19vw,156px);height:clamp(144px,26vw,210px);right:clamp(14px,3vw,28px);top:clamp(62px,9vh,88px);border:2px solid rgba(255,255,255,.72);border-radius:20px;box-shadow:0 12px 36px rgba(0,0,0,.5);background:#17152a}
.spike-global-call-card.videoActive{width:100%;height:100dvh;min-height:0;max-width:none;border:0;border-radius:0;padding:calc(28px + env(safe-area-inset-top)) clamp(16px,4vw,42px) calc(20px + env(safe-area-inset-bottom));background:transparent}
.spike-global-call-card.videoActive .spike-global-call-videos{z-index:-1}
.spike-global-call-card.videoActive .spike-global-call-controls{align-self:center;width:min(100%,680px);margin-top:12px;padding:14px 12px;border:1px solid rgba(255,255,255,.13);border-radius:30px;background:rgba(9,10,20,.70);box-shadow:0 18px 50px rgba(0,0,0,.38);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}
.spike-recording-panel{border-color:rgba(196,181,253,.25);background:rgba(12,12,26,.92);box-shadow:0 14px 40px rgba(0,0,0,.35)}
@keyframes spikeCallBreath{0%,100%{box-shadow:0 0 0 9px rgba(139,92,246,.09),0 0 42px rgba(139,92,246,.20)}50%{box-shadow:0 0 0 15px rgba(139,92,246,.04),0 0 62px rgba(139,92,246,.32)}}
@media(max-width:600px){.spike-global-call-card{width:100%;height:100dvh;min-height:0;border:0;border-radius:0;padding:calc(70px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));gap:13px}.spike-global-call-topname{top:calc(18px + env(safe-area-inset-top))!important}.spike-global-call-avatar{width:112px;height:112px}.spike-global-call-controls{gap:10px;margin-top:clamp(18px,5vh,38px)}.spike-global-call-controls button{width:clamp(60px,17vw,70px);height:clamp(60px,17vw,70px);border-radius:22px}.spike-global-call-card.videoActive{padding:calc(24px + env(safe-area-inset-top)) 12px calc(14px + env(safe-area-inset-bottom))}.spike-global-call-card.videoActive .spike-global-call-controls{gap:7px;padding:11px 5px}.spike-global-call-videos video.local{top:calc(62px + env(safe-area-inset-top));right:12px;width:94px;height:132px;border-radius:16px}}
@media(prefers-reduced-motion:reduce){.spike-global-call-avatar{animation:none}}
`;document.head.appendChild(style);
const wrap=document.createElement('div');wrap.id='callShade';wrap.className='spike-global-call-shade';wrap.setAttribute('aria-hidden','true');wrap.innerHTML='<section id="callCard" class="spike-global-call-card" role="dialog" aria-modal="true" aria-label="SPIKE call"><div class="spike-global-call-topname" style="position:absolute;top:18px">SPIKE CONNECT</div><div id="callVideos" class="spike-global-call-videos" hidden><video id="remoteVideo" autoplay muted playsinline></video><audio id="remoteAudio" autoplay></audio><video id="localVideo" class="local" autoplay muted playsinline></video></div><div id="callAvatar" class="spike-global-call-avatar">S</div><div id="callName" class="spike-global-call-name">SPIKE member</div><div id="callTypeLabel" style="font-size:10px;letter-spacing:.1em">VOICE CALL</div><div id="callState" class="spike-global-call-state">Ready</div><div id="callTimer"></div><div id="recordingSavePanel" class="spike-recording-panel" hidden><div id="recordingSaveStatus">Your call recording is ready.</div><div class="spike-recording-actions"><button id="saveCallRecording" class="primary" type="button">Save to device</button><button id="closeRecordingResult" type="button">Close</button></div></div><div id="recordingPanel" class="spike-recording-panel" hidden><div id="recordingStatus">Choose a recording mode. Recordings that include both participants are disclosed to both participants.</div><div id="recordingRemoteNotice" role="status" aria-live="polite" hidden></div><div id="businessRecordingStatus" role="status" aria-live="polite" hidden></div><div id="businessConsentActions" class="spike-recording-actions" hidden><button id="recordBusinessApprove" class="primary" type="button">Approve business recording</button><button id="recordBusinessDecline" class="danger" type="button">Decline</button></div><div id="recordingDownloadFallbackWrap" class="spike-recording-actions" hidden><button id="downloadFinishedRecording" class="primary" type="button">Download recording</button><span id="recordingDownloadHelp">If the automatic download did not start, tap Download recording.</span></div><div class="spike-recording-actions"><button id="recordVoice" class="primary" type="button">Record Voice</button><button id="recordVideo" class="primary" type="button">Record Video</button><button id="recordBusiness" type="button">Business Meeting Recording</button><button id="recordStop" class="danger" type="button" hidden>Stop recording</button></div></div><div id="callError" class="spike-global-call-error" role="status"></div><div class="spike-global-call-controls"><button type="button" id="acceptCall" class="accept" aria-label="Answer call" title="Answer call" hidden>☎<span class="call-btn-label">Answer</span></button><button type="button" id="declineCall" class="decline" aria-label="Decline call" title="Decline call" hidden>×<span class="call-btn-label">Decline</span></button><button type="button" id="muteCall" aria-label="Mute microphone" title="Mute microphone" hidden>🎙<span class="call-btn-label">Mute</span></button><button type="button" id="cameraCall" aria-label="Turn camera off" title="Turn camera off" hidden>▣<span class="call-btn-label">Camera</span></button><button type="button" id="flipCameraCall" aria-label="Switch to back camera" title="Switch camera" hidden>↻<span class="call-btn-label">Flip camera</span></button><button type="button" id="speakerCall" aria-label="Cycle audio output" title="Cycle audio output" hidden><span class="call-btn-icon" aria-hidden="true">◖))</span><span class="call-btn-label">Audio</span></button><button type="button" id="endCall" class="end" aria-label="End call" title="End call" hidden>×<span class="call-btn-label">End</span></button></div><div id="callHint" class="spike-global-call-hint">Calls are available while you are on SPIKE.</div></section></div>';document.body.appendChild(wrap);}
if(!$('incomingTone')){const a=document.createElement('audio');a.id='incomingTone';a.src='assets/mp3/incoming.mp3';a.preload='auto';a.loop=true;document.body.appendChild(a)}if(!$('outgoingTone')){const a=document.createElement('audio');a.id='outgoingTone';a.src='assets/mp3/outgoing.mp3';a.preload='auto';a.loop=true;document.body.appendChild(a)}}
function showCall(){
 ensureCallUI();
 const shade=$('callShade');
 if(!shade)throw new Error('SPIKE call interface could not be mounted.');
 shade.hidden=false;shade.removeAttribute('hidden');
 shade.classList.add('show');
 shade.style.setProperty('display','flex','important');
 shade.style.setProperty('visibility','visible','important');
 shade.style.setProperty('opacity','1','important');
 shade.style.setProperty('pointer-events','auto','important');
 shade.style.setProperty('z-index','2147483647','important');
 shade.setAttribute('aria-hidden','false');
 resetCallControlUI();if($('recordingSavePanel'))$('recordingSavePanel').hidden=true;['callAvatar','callName','callTypeLabel','callState','callTimer','callError','callHint'].forEach(id=>{if($(id))$(id).hidden=false});const controlsWrap=$('callCard')?.querySelector('.spike-global-call-controls');if(controlsWrap)controlsWrap.hidden=false;$('callShade').classList.add('show');$('callShade').setAttribute('aria-hidden','false');say('callName',call?.peerName||'SPIKE member');say('callTypeLabel',call?.media==='video'?'VIDEO CALL':'VOICE CALL');paintPeerAvatar(call?.peerProfile||null,call?.peerName||'SPIKE member');if(call?.peerId)loadPeerProfile(call.peerId).then(p=>{if(call&&call.peerId===p?.id){call.peerProfile=p;call.peerName=profileLabel(p)||call.peerName;say('callName',call.peerName);paintPeerAvatar(p,call.peerName)}}).catch(()=>{});}
function hideCall(){const s=$('callShade');if(s){s.classList.remove('show');s.style.setProperty('display','none','important');s.style.setProperty('pointer-events','none','important');s.setAttribute('aria-hidden','true')}if($('callVideos'))$('callVideos').hidden=true;if($('callAvatar'))$('callAvatar').hidden=false;['acceptCall','declineCall','muteCall','cameraCall','flipCameraCall','speakerCall','endCall'].forEach(id=>{if($(id))$(id).hidden=true});if($('recordingPanel'))$('recordingPanel').hidden=true;if($('recordingSavePanel'))$('recordingSavePanel').hidden=true;['recordConsent','recordDecline','recordStop'].forEach(id=>{if($(id))$(id).hidden=true});say('callError','');say('callTimer','')}
function showCallFailure(message){showCall();controls('error');['acceptCall','declineCall','muteCall','cameraCall','flipCameraCall','speakerCall'].forEach(id=>{if($(id))$(id).hidden=true});if($('endCall'))$('endCall').hidden=false;say('callState','Call could not start');say('callError',message||'Please check your connection and try again.');say('callHint','Tap ✕ to close this message, then try again.')}
function tone(id,on){const a=$(id);if(!a)return;a.pause();try{a.currentTime=0}catch{}if(on)a.play().catch(()=>{})}
function stopTones(){tone('incomingTone',false);tone('outgoingTone',false)}
function resetCallControlUI(){
 for(const [id,label,aria] of [['muteCall','Mute','Mute microphone'],['cameraCall','Camera','Turn camera off']]){
  const b=$(id);if(!b)continue;b.classList.remove('active');const text=b.querySelector('.call-btn-label');if(text)text.textContent=label;b.setAttribute('aria-label',aria);b.title=aria;
 }
}
function controls(mode){const incoming=mode==='incoming';$('acceptCall').hidden=!incoming;$('declineCall').hidden=!incoming;$('muteCall').hidden=incoming;$('speakerCall').hidden=incoming;$('endCall').hidden=incoming;$('cameraCall').hidden=incoming||call?.media!=='video';const flip=$('flipCameraCall');if(flip)flip.hidden=incoming||!call?.connected||call?.media!=='video'}
function displayMedia(media){$('callVideos').hidden=media!=='video';$('callAvatar').hidden=media==='video';$('callCard')?.classList.toggle('videoActive',media==='video')}
async function loadSettings(){try{const {data,error}=await db.from('user_app_settings').select('incoming_call_tone,outgoing_call_tone').eq('user_id',me.id).maybeSingle();if(!error&&data)settings={incoming:data.incoming_call_tone!==false,outgoing:data.outgoing_call_tone!==false}}catch(_){}}
function profileLabel(p){const u=String(p?.username||'').replace(/^@/,'').trim();return u?'@'+u:(p?.display_name||p?.full_name||p?.name||'SPIKE member')}
function paintPeerAvatar(p,name){const el=$('callAvatar');if(!el)return;const url=p?.avatar_url||p?.avatar||p?.photo_url||p?.profile_picture||p?.picture||p?.image_url||'';el.textContent='';if(url){const img=document.createElement('img');img.alt='';img.src=url;img.referrerPolicy='no-referrer';img.onerror=()=>{el.textContent=String(name||'S').replace(/^@/,'').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'S'};el.appendChild(img)}else el.textContent=String(name||'S').replace(/^@/,'').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'S'}
async function loadPeerProfile(id){const key=String(id||'').toLowerCase();if(profileCache.has(key))return profileCache.get(key);let found=null;try{const {data,error}=await db.rpc('get_public_profiles',{p_user_ids:[id]});if(error)throw error;const rows=Array.isArray(data)?data:[];found=rows.find(x=>String(x.id||x.user_id||x.profile_id||'').toLowerCase()===key)||null}catch(e){console.warn('[SPIKE calls] privacy-aware peer profile lookup failed',e?.message||e)}if(found){profileCache.set(key,found);return found}return {id}}
async function peerName(id){return profileLabel(await loadPeerProfile(id))}
function callTopic(recipient){return 'spike:call:'+String(recipient)}
async function getPeerChannel(id){id=String(id||'');if(!uuidRE.test(id)||!uuidRE.test(String(me?.id||''))||id===me.id)throw Error('Invalid call recipient.');const key=callTopic(id);if(peerChannels.has(key))return peerChannels.get(key);/* Outbound call signals are sent before subscribing, so supabase-js uses the Realtime HTTP Broadcast endpoint. This is intentional: the sender must not join the recipient's private inbox channel, because its SELECT policy is correctly restricted to the recipient. The existing INSERT policy authorizes the sender. */const promise=Promise.resolve(db.channel(key,{config:{private:true,broadcast:{ack:true,self:false}}}));peerChannels.set(key,promise);try{return await promise}catch(e){peerChannels.delete(key);throw e}}
async function sendSignal(to,payload){if(!me||!uuidRE.test(String(to||'')))return;try{const ch=await getPeerChannel(to);const result=await ch.send({type:'broadcast',event:'call_signal',payload:{...payload,from:me.id,to}});if(result!=='ok')throw Error('Supabase Realtime did not accept the call signal ('+String(result)+'). Check call permissions and connectivity.');return result}catch(e){console.warn('[SPIKE calls] signal failed',e?.message||e);if(call)say('callError',e.message||'Call signaling failed.');throw e}}
async function refreshRealtimeAuth(){
 const {data,error}=await db.auth.getSession();
 if(error)throw error;
 const session=data?.session;
 if(!session?.access_token||!session?.user?.id)throw new Error('Your SPIKE sign-in session is missing or expired. Sign in again to receive calls.');
 if(session.user.id!==me?.id)me=session.user;
 if(typeof db.realtime?.setAuth==='function')await db.realtime.setAuth(session.access_token);
 return session;
}
async function subscribeCallTopic(topic,handler,label){
 let lastError;
 for(let attempt=0;attempt<3;attempt++){
  let ch;
  try{
   await refreshRealtimeAuth();
   ch=db.channel(topic,{config:{private:true,broadcast:{ack:true,self:false}}});
   if(handler)ch.on('broadcast',{event:'call_signal'},ev=>{Promise.resolve(handler(ev?.payload)).catch(err=>console.warn('[SPIKE calls] Incoming signal handler failed:',err?.message||err))});
   await new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(!settled){settled=true;reject(new Error(label+' channel subscription timed out. Check Supabase Realtime authorization and network access.'))}},12000);
    ch.subscribe((status,err)=>{
     if(status==='SUBSCRIBED'&&!settled){settled=true;clearTimeout(timer);resolve()}
     else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)&&!settled){settled=true;clearTimeout(timer);const detail=err?.message?' Details: '+err.message:'';reject(new Error(label+' channel failed ('+status+'). Verify the deployed realtime.messages policies, signed-in session, and project URL.'+detail))}
    });
   });
   return ch;
  }catch(e){lastError=e;if(ch)try{await db.removeChannel(ch)}catch(_){}if(attempt<2)await new Promise(r=>setTimeout(r,500*(attempt+1)));}
 }
 throw lastError||new Error(label+' channel could not be initialized.');
}
async function topicForMe(){
 const session=await refreshRealtimeAuth();
 const topic=callTopic(me.id);
 const ch=await subscribeCallTopic(topic,handleSignal,'Incoming-call');
 callChannels=[ch];return callChannels;
}
function isDirectIceCandidate(candidate){
 const value=typeof candidate==='string'?candidate:candidate?.candidate;
 return !/\btyp\s+relay\b/i.test(String(value||''));
}
function directSessionDescription(description){
 if(!description||typeof description.sdp!=='string')return description;
 return {...description,sdp:description.sdp.replace(/^a=candidate:[^\r\n]*\btyp\s+relay\b[^\r\n]*(?:\r?\n)?/gim,'')};
}
function callIceServers(){
 // Fixed public STUN-only configuration. No dynamic relay configuration is accepted.
 return [
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:stun.cloudflare.com:3478'}
 ];
}
function recordingSupported(){return typeof MediaRecorder!=='undefined'&&!!window.MediaRecorder&&typeof MediaStream!=='undefined'}
function recordingModeLabel(mode){return mode==='voice'?'voice':mode==='video'?'video':'business meeting'}
function renderRecordingUI(){
 const c=call,p=$('recordingPanel');if(!p)return;
 if(!c||!c.connected){p.hidden=true;return}
 p.hidden=false;
 const status=$('recordingStatus'),voice=$('recordVoice'),video=$('recordVideo'),business=$('recordBusiness'),stop=$('recordStop'),remoteNotice=$('recordingRemoteNotice'),businessStatus=$('businessRecordingStatus'),consentActions=$('businessConsentActions'),approve=$('recordBusinessApprove'),decline=$('recordBusinessDecline');
 const active=!!c.recordingStarted&&!!c.recorder&&c.recorder.state!=='inactive';
 const starting=!!c.recordingStarting;
 const businessPending=!!c.businessRecording&&c.businessRecording.state==='pending';
 const businessActive=!!c.businessRecording&&c.businessRecording.state==='approved';
 // Keep controls relevant to the active call type. Business recording is a video-call workflow.
 voice.hidden=false;
 video.hidden=c.media!=='video';
 business.hidden=c.media!=='video';
 voice.disabled=active||starting||businessPending||businessActive;
 video.disabled=active||starting||businessPending||businessActive||c.media!=='video';
 business.disabled=active||starting||businessPending||businessActive||c.media!=='video';
 stop.hidden=!(active||businessActive);
 if(businessActive&&!active)stop.textContent='Stop business recording';else stop.textContent='Stop recording';
 if(starting){status.textContent='Starting recording…';}
 else if(active){status.innerHTML='<span class="spike-recording-dot" aria-hidden="true"></span>Recording · <strong id="recordingTimer">00:00</strong>';}
 else if(c.recordingUnavailable){status.textContent='Recording unavailable';}
 else if(businessPending){status.textContent=c.businessRecording.initiator===me?.id?'Business recording request sent':'Business recording request received';}
 else {status.textContent='Recording options';}
 if(remoteNotice){remoteNotice.hidden=!c.remoteRecordingNotice;remoteNotice.textContent=c.remoteRecordingNotice?'Recording in progress':'';}
 if(businessStatus){businessStatus.hidden=!c.businessRecording?.message;businessStatus.textContent=c.businessRecording?.message||'';}
 if(consentActions){consentActions.hidden=!businessPending;}
 if(approve){approve.disabled=!businessPending||c.businessRecording.localConsent===true;approve.textContent=c.businessRecording?.localConsent?'Approved':'Approve';}
 if(decline)decline.disabled=!businessPending;
}
function safeFilePart(s){return String(s||'spike').normalize('NFKD').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,40)||'spike'}
function triggerRecordingDownload(record){if(!record?.blob)return;const url=URL.createObjectURL(record.blob);const a=document.createElement('a');a.href=url;a.download=record.name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);console.info('[SPIKE calls] Recording download requested:',record.name)}
function showRecordingSavePanel(record){if(!record?.blob)return;ensureCallUI();const shade=$('callShade'),card=$('callCard');if(!shade||!card)return;['callAvatar','callName','callTypeLabel','callState','callTimer','callError','callHint','recordingPanel'].forEach(id=>{if($(id))$(id).hidden=true});const controlsWrap=card.querySelector('.spike-global-call-controls');if(controlsWrap)controlsWrap.hidden=true;if($('callVideos'))$('callVideos').hidden=true;$('recordingSavePanel').hidden=false;say('recordingSaveStatus','Your '+recordingModeLabel(record.mode||record.media)+' call recording is ready ('+Math.max(1,Math.round(record.blob.size/1024))+' KB). A download was requested automatically. If it did not save, tap Save to device.');shade.classList.add('show');shade.setAttribute('aria-hidden','false');card.classList.remove('videoActive')}
function downloadCallRecording(blob,c){if(!blob||blob.size<1024)return;const ext=(blob.type||'').includes('mp4')?'mp4':(blob.type||'').includes('ogg')?'ogg':'webm';const stamp=new Date().toISOString().replace(/[:.]/g,'-');const mode=c.recordingMode||c.media;const suffix=safeFilePart(c.recordingSessionId||'session').slice(-8);const name='spike-'+safeFilePart(mode)+'-call-'+stamp+'-'+suffix+'.'+ext;lastCallRecording={blob,name,callId:c.id,media:c.media,mode};triggerRecordingDownload(lastCallRecording);return lastCallRecording}
function recordingSessionId(){return (crypto.randomUUID?.()||('rec-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2))).toString()}
function liveTracks(stream,kind){return stream?.getTracks?.().filter(t=>t.kind===kind&&t.readyState==='live')||[]}
async function buildMixedAudio(c){
 const local=liveTracks(c.local,'audio'),remote=liveTracks(c.remote,'audio');
 if(!local.length||!remote.length)throw Error('Both participants’ live audio tracks must be available before recording can start.');
 const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)throw Error('This browser cannot mix both participants’ audio tracks.');
 const ctx=new AudioCtx();c.recordAudioContext=ctx;
 const dest=ctx.createMediaStreamDestination();
 const localStream=new MediaStream(local),remoteStream=new MediaStream(remote);
 const localSource=ctx.createMediaStreamSource(localStream),remoteSource=ctx.createMediaStreamSource(remoteStream);
 const localGain=ctx.createGain(),remoteGain=ctx.createGain();localGain.gain.value=0.85;remoteGain.gain.value=0.85;
 localSource.connect(localGain);remoteSource.connect(remoteGain);localGain.connect(dest);remoteGain.connect(dest);
 await ctx.resume();
 if(ctx.state!=='running')throw Error('Audio mixing is blocked by this browser. Tap the recording control again after checking browser audio permissions.');
 return {tracks:liveTracks(dest.stream,'audio'),context:ctx,destination:dest.stream};
}
function drawCover(ctx,video,x,y,w,h){
 if(!video||video.readyState<2||!video.videoWidth||!video.videoHeight){ctx.fillStyle='#171322';ctx.fillRect(x,y,w,h);ctx.fillStyle='#f4eaff';ctx.font='16px system-ui';ctx.textAlign='center';ctx.fillText('Video unavailable',x+w/2,y+h/2);return}
 const scale=Math.max(w/video.videoWidth,h/video.videoHeight),sw=w/scale,sh=h/scale,sx=(video.videoWidth-sw)/2,sy=(video.videoHeight-sh)/2;ctx.drawImage(video,sx,sy,sw,sh,x,y,w,h);
}
async function buildRecordingStream(c,mode){
 const mixed=await buildMixedAudio(c);let tracks=[...mixed.tracks],videoStream=null;
 if(mode==='video'||(mode==='business'&&c.media==='video')){
  if(c.media!=='video')throw Error('Record Video requires an active video call.');
  const localVideo=$('localVideo'),remoteVideo=$('remoteVideo');
  if(!localVideo?.srcObject||!remoteVideo?.srcObject||!liveTracks(c.local,'video').length||!liveTracks(c.remote,'video').length){try{await mixed.context.close()}catch(_){}throw Error('Both live camera feeds must be available before video recording can start.');}
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=480;const ctx=canvas.getContext('2d');if(!ctx){try{await mixed.context.close()}catch(_){}throw Error('Canvas video composition is not supported on this device.');}
  c.recordCanvas=canvas;
  const draw=()=>{if(call!==c||!c.recordingStarted||!c.recorder||c.recorder.state==='inactive')return;ctx.fillStyle='#080611';ctx.fillRect(0,0,canvas.width,canvas.height);drawCover(ctx,localVideo,0,0,640,480);drawCover(ctx,remoteVideo,640,0,640,480);ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(0,444,640,36);ctx.fillRect(640,444,640,36);ctx.fillStyle='#fff';ctx.font='bold 16px system-ui';ctx.textAlign='left';ctx.fillText('You',18,468);ctx.fillText(c.peerName||'Other participant',658,468);c.drawFrame=requestAnimationFrame(draw)};
  c.drawRecordingFrame=draw;videoStream=canvas.captureStream(20);c.recordVideoStream=videoStream;tracks=[...liveTracks(videoStream,'video'),...mixed.tracks];
 }
 c.recordAudioContext=mixed.context;
 return {stream:new MediaStream(tracks),videoStream,context:mixed.context};
}
async function notifyPeerOfRecording(c,mode,sessionId){
 c.recordingNoticeAcks=c.recordingNoticeAcks||new Map();const key=sessionId+':start';let resolveAck;const ack=new Promise(resolve=>{resolveAck=resolve;c.recordingNoticeAcks.set(key,resolve)});
 try{await sendSignal(c.peerId,{callId:c.id,type:'recording-notice',action:'start',mode,sessionId});const acknowledged=await Promise.race([ack,new Promise(resolve=>setTimeout(()=>resolve(false),5000))]);if(!acknowledged)throw Error('The other participant did not acknowledge the recording notice. No recording has started.');}
 finally{c.recordingNoticeAcks.delete(key);}
}
async function startCallRecording(mode,opts={}){
 const c=call;if(!c||!c.connected)return false;
 if(c.recordingStarting||c.recordingStarted||c.recorder){return false}
 if(!['voice','video','business'].includes(mode))return false;
 if(mode==='video'&&c.media!=='video'){say('callError','Record Video requires an active video call.');return false}
 if(mode==='business'&&c.businessRecording?.initiator!==me?.id)return false;
 if(!recordingSupported()){c.recordingUnavailable=true;renderRecordingUI();say('callError','Recording is not supported by this browser. You can still continue the call.');return false}
 c.recordingStarting=true;c.recordingUnavailable=false;c.recordingStopped=false;c.recordingMode=mode;c.recordingSessionId=opts.sessionId||recordingSessionId();if($('recordingDownloadFallbackWrap'))$('recordingDownloadFallbackWrap').hidden=true;renderRecordingUI();
 let built=null;
 try{
  if(mode!=='business'){
   // Inform the other participant before capturing their incoming media. This is a visible in-call notice, not an approval popup.
   await notifyPeerOfRecording(c,mode,c.recordingSessionId);
  }
  built=await buildRecordingStream(c,mode);
  if(call!==c)throw Error('The call ended before recording could start.');
  if(mode==='business'&&c.businessRecording?.state!=='approved')throw Error('Business recording consent was withdrawn before capture began.');
  const outputHasVideo=mode==='video'||(mode==='business'&&c.media==='video');const candidates=outputHasVideo?['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4;codecs=avc1.424028,mp4a.40.2','video/mp4']:['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4;codecs=mp4a.40.2','audio/mp4'];
  const mime=candidates.find(t=>MediaRecorder.isTypeSupported?.(t))||'';
  if(!outputHasVideo&&mime.startsWith('video/'))throw Error('This browser cannot record audio in a supported format.');
  if(outputHasVideo&&!mime.startsWith('video/'))throw Error('This browser cannot record video in a supported format.');
  const recorder=new MediaRecorder(built.stream,mime?{mimeType:mime}:undefined);
  c.recordingStarting=false;c.recordingStarted=true;c.recordingStopped=false;c.recordingStartedAt=Date.now();c.recorder=recorder;c.recordChunks=[];c.recordingStream=built.stream;
  recorder.ondataavailable=e=>{if(e.data&&e.data.size)c.recordChunks.push(e.data)};
  recorder.onerror=e=>{console.error('[SPIKE recording] Recorder error:',e.error||e);c.recordingError=true;say('callError','Recording encountered an error. The call can continue.');};
  recorder.onstop=()=>{
   const chunks=c.recordChunks||[];const blob=chunks.length?new Blob(chunks,{type:recorder.mimeType||mime||'application/octet-stream'}):null;c.recordChunks=[];c.recorder=null;c.recordingStarted=false;
   if(c.drawFrame){cancelAnimationFrame(c.drawFrame);c.drawFrame=null;}
   try{c.recordVideoStream?.getTracks().forEach(t=>t.stop())}catch(_){}c.recordVideoStream=null;
   try{c.recordAudioContext?.close?.()}catch(_){}c.recordAudioContext=null;
   try{c.recordingStream?.getTracks().forEach(t=>t.stop())}catch(_){}c.recordingStream=null;
   if(blob&&blob.size>=1024){const saved=downloadCallRecording(blob,c);c.recordingBlobSize=blob.size;if(call===c){if($('recordingDownloadFallbackWrap'))$('recordingDownloadFallbackWrap').hidden=!saved;say('recordingStatus','Recording finished. A download was requested automatically. If it did not save, tap Download recording.');say('callHint','Recording file: '+Math.round(blob.size/1024)+' KB. Check your browser Downloads.')}else if(saved&&!call)showRecordingSavePanel(saved)}else if(call===c){if($('recordingDownloadFallbackWrap'))$('recordingDownloadFallbackWrap').hidden=true;say('recordingStatus','Recording could not be saved because the recording file was empty or too small.');}
   renderRecordingUI();
  };
  recorder.start(1000);if(c.drawRecordingFrame){c.drawRecordingFrame();c.drawRecordingFrame=null}renderRecordingUI();say('callHint',mode==='business'?'Business recording is active after both participants approved.':'Recording has started. A discreet recording indicator is visible to the other participant.');console.info('[SPIKE calls] Recording started:',mode,c.recordingSessionId);return true;
 }catch(e){
  c.recordingStarting=false;c.recordingStarted=false;c.recordingUnavailable=true;
  try{if(c.drawFrame){cancelAnimationFrame(c.drawFrame);c.drawFrame=null}c.drawRecordingFrame=null}catch(_){}try{built?.videoStream?.getTracks?.().forEach(t=>t.stop())}catch(_){}try{built?.stream?.getTracks?.().forEach(t=>t.stop())}catch(_){}try{built?.context?.close?.()}catch(_){}try{if(!built&&c.recordAudioContext)c.recordAudioContext.close?.()}catch(_){}c.recordAudioContext=null;
  if(mode!=='business')try{await sendSignal(c.peerId,{callId:c.id,type:'recording-notice',action:'failed',mode,sessionId:c.recordingSessionId})}catch(_){}
  renderRecordingUI();say('callError',(e?.message||'Could not start recording.')+' The call can continue without recording.');console.warn('[SPIKE recording] Start failed:',e?.message||e);return false;
 }
}
async function requestBusinessRecording(){const c=call;if(!c||c.media!=='video'||!c.connected||c.recordingStarted||c.recordingStarting||c.businessRecording?.state==='pending')return;const sessionId=recordingSessionId();c.businessRecording={sessionId,mode:'business',initiator:me.id,localConsent:false,remoteConsent:false,state:'pending',message:'Business recording requested. Both participants must explicitly approve.'};c.recordingSessionId=sessionId;renderRecordingUI();try{await sendSignal(c.peerId,{callId:c.id,type:'recording-business-request',sessionId,media:c.media,initiator:me.id});say('callHint','Business recording request sent. Approve on this device too; recording starts only after both participants approve.')}catch(e){c.businessRecording=null;renderRecordingUI();say('callError','Could not deliver the business recording request. No recording has started.');}}
async function approveBusinessRecording(){const c=call,b=c?.businessRecording;if(!c||!b||b.state!=='pending'||b.localConsent)return;b.localConsent=true;b.message='You approved business recording. Waiting for the other participant.';renderRecordingUI();try{await sendSignal(c.peerId,{callId:c.id,type:'recording-business-consent',sessionId:b.sessionId,consent:true});await maybeStartBusinessRecording(c)}catch(e){b.localConsent=false;b.message='Approval could not be sent. No business recording has started.';renderRecordingUI();}}
async function declineBusinessRecording(){const c=call,b=c?.businessRecording;if(!c||!b||b.state!=='pending')return;b.state='declined';b.message='Business recording declined. No shared recording has started.';renderRecordingUI();try{await sendSignal(c.peerId,{callId:c.id,type:'recording-business-consent',sessionId:b.sessionId,consent:false})}catch(_){} }
async function maybeStartBusinessRecording(c){const b=c?.businessRecording;if(!c||call!==c||!b||b.state!=='pending'||!b.localConsent||!b.remoteConsent)return;b.state='approved';b.message='Both participants approved. The initiating participant is recording this meeting.';renderRecordingUI();if(b.initiator===me?.id){const ok=await startCallRecording('business',{sessionId:b.sessionId});if(!ok&&b.state==='approved'){b.state='failed';b.message='Both participants approved, but recording could not start on this device.';renderRecordingUI();try{await sendSignal(c.peerId,{callId:c.id,type:'recording-business-stop',sessionId:b.sessionId,reason:'start-failed'})}catch(_){}}}}
async function stopCallRecording(notifyPeer=true){const c=call;if(!c||c.recordingStopping)return;const b=c.businessRecording;if(!c.recorder||c.recorder.state==='inactive'){if(b?.state==='approved'&&b.initiator!==me?.id){c.recordingStopping=true;b.state='stopped';b.message='You withdrew consent. The shared business recording has been stopped.';if(notifyPeer)try{await sendSignal(c.peerId,{callId:c.id,type:'recording-business-stop',sessionId:b.sessionId,reason:'participant-withdrew-consent'})}catch(_){}c.recordingStopping=false;renderRecordingUI();}return;}c.recordingStopping=true;const mode=c.recordingMode,sessionId=c.recordingSessionId;c.recordingStopped=true;if(mode==='business'){if(b)b.state='stopped';if(notifyPeer)try{await sendSignal(c.peerId,{callId:c.id,type:'recording-business-stop',sessionId,reason:'participant-stopped'})}catch(_){}}else if(notifyPeer){try{await sendSignal(c.peerId,{callId:c.id,type:'recording-notice',action:'stop',mode,sessionId})}catch(_){}}
 try{if(c.drawFrame){cancelAnimationFrame(c.drawFrame);c.drawFrame=null}c.recorder.stop()}catch(e){console.warn('[SPIKE recording] Could not finalize recording:',e?.message||e)}finally{c.recordingStopping=false;renderRecordingUI();}}
function handleRecordingSignal(p){const c=call;if(!c||p.callId!==c.id||p.from!==c.peerId)return;
 if(p.type==='recording-notice-ack'){const resolve=c.recordingNoticeAcks?.get(String(p.sessionId)+':'+String(p.action||'start'));if(resolve)resolve(true);return;}
 if(p.type==='recording-notice'){
  if(!['voice','video'].includes(p.mode)||typeof p.sessionId!=='string')return;
  if(p.action==='start'){c.remoteRecordingSessionId=p.sessionId;c.remoteRecordingNotice='Recording in progress';}
  else if(p.sessionId===c.remoteRecordingSessionId&&['stop','failed'].includes(p.action)){c.remoteRecordingSessionId=null;c.remoteRecordingNotice='';}
  renderRecordingUI();if(p.action==='start')sendSignal(c.peerId,{callId:c.id,type:'recording-notice-ack',action:'start',mode:p.mode,sessionId:p.sessionId}).catch(()=>{});return;
 }
 if(p.type==='recording-business-request'){
  if(typeof p.sessionId!=='string'||p.initiator!==p.from||p.media!=='video'||c.media!=='video'){if(typeof p.sessionId==='string')sendSignal(c.peerId,{callId:c.id,type:'recording-business-consent',sessionId:p.sessionId,consent:false}).catch(()=>{});return;}
  if(c.recordingStarted||(c.businessRecording?.state==='pending'&&c.businessRecording.sessionId!==p.sessionId)){sendSignal(c.peerId,{callId:c.id,type:'recording-business-consent',sessionId:p.sessionId,consent:false}).catch(()=>{});return;}
  c.businessRecording={sessionId:p.sessionId,mode:'business',initiator:p.initiator,localConsent:false,remoteConsent:false,state:'pending',message:'Business recording requested. Review and approve or decline. Nothing is recording yet.'};renderRecordingUI();return;
 }
 if(p.type==='recording-business-consent'){
  const b=c.businessRecording;if(!b||b.sessionId!==p.sessionId||b.state!=='pending'||typeof p.consent!=='boolean')return;
  if(!p.consent){b.state='declined';b.message='Business recording was declined. No shared recording has started.';renderRecordingUI();if(c.recorder&&c.recordingMode==='business')stopCallRecording();return;}
  b.remoteConsent=true;b.message=b.localConsent?'Both approvals received. Preparing the business recording.':'The other participant approved. Your approval is still required.';renderRecordingUI();maybeStartBusinessRecording(c).catch(e=>{console.warn('[SPIKE recording] Consent start failed:',e?.message||e)});return;
 }
 if(p.type==='recording-business-stop'){
  const b=c.businessRecording;if(!b||b.sessionId!==p.sessionId)return;
  b.state='stopped';b.message='Business recording stopped. The recording will be finalized.';
  if(c.recorder&&c.recordingMode==='business'&&c.recorder.state!=='inactive')stopCallRecording(false);else renderRecordingUI();
 }
}
async function switchCallCamera(){
 const c=call;if(!c||!c.connected||c.media!=='video'||!c.local||!c.pc)return;
 const oldTrack=c.local.getVideoTracks()[0];if(!oldTrack){say('callError','No active camera track is available.');return;}
 const nextFacing=c.cameraFacingMode==='environment'?'user':'environment';
 const button=$('flipCameraCall');if(button)button.disabled=true;
 let nextStream=null;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera switching is not supported by this browser.');
  try{nextStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{exact:nextFacing},width:{ideal:1280},height:{ideal:720}}});}
  catch(firstError){
   if(!['OverconstrainedError','ConstraintNotSatisfiedError','NotFoundError'].includes(firstError?.name))throw firstError;
   nextStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:nextFacing},width:{ideal:1280},height:{ideal:720}}});
  }
  if(call!==c||!c.pc||c.pc.signalingState==='closed')throw Error('The call ended while switching cameras.');
  const nextTrack=nextStream.getVideoTracks()[0];if(!nextTrack)throw Error('The selected camera is unavailable.');
  const sender=c.pc.getSenders().find(x=>x.track?.kind==='video');if(!sender)throw Error('The video connection cannot switch cameras right now.');
  nextTrack.enabled=oldTrack.enabled;
  await sender.replaceTrack(nextTrack);
  c.local.removeTrack(oldTrack);c.local.addTrack(nextTrack);oldTrack.stop();
  c.cameraFacingMode=nextFacing;
  const localVideo=$('localVideo');if(localVideo)localVideo.srcObject=c.local;
  if(button){button.setAttribute('aria-label',nextFacing==='environment'?'Switch to front camera':'Switch to back camera');button.title=nextFacing==='environment'?'Switch to front camera':'Switch to back camera';}
 }catch(e){try{nextStream?.getTracks?.().forEach(t=>t.stop())}catch(_){}say('callError',e?.name==='OverconstrainedError'||e?.name==='NotFoundError'?'That camera is not available on this device.':(e?.message||'Could not switch cameras. Your call is still active.'));}
 finally{if(button)button.disabled=false;}
}
async function recoverCallConnection(c,pc,reason='network-change'){
 if(!c||call!==c||c.pc!==pc||c.recoveryInProgress||c.recoveryAttempts>=2)return false;
 // Only the original offerer initiates ICE restarts. This avoids offer glare.
 if(c.direction!=='outgoing')return false;
 if(pc.signalingState!=='stable')return false;
 c.recoveryInProgress=true;c.recoveryAttempts=(c.recoveryAttempts||0)+1;
 say('callState','Reconnecting securely…');
 try{
  pc.restartIce?.();
  const offer=await pc.createOffer({iceRestart:true});if(call!==c||c.pc!==pc)return false;
  await pc.setLocalDescription(offer);if(call!==c||c.pc!==pc)return false;
  await sendSignal(c.peerId,{callId:c.id,type:'ice-restart-offer',media:c.media,sdp:pc.localDescription.toJSON(),attempt:c.recoveryAttempts,reason});
  if(callConnectionTimer)clearTimeout(callConnectionTimer);callConnectionTimer=setTimeout(()=>{if(call===c&&c.pc===pc&&['failed','disconnected'].includes(pc.iceConnectionState)){say('callError','The network could not restore the call. Check your connection and try again.');endCall(true,'hangup')}},15000);
  return true;
 }catch(e){console.warn('[SPIKE calls] ICE restart failed:',e?.message||e);say('callError','Reconnection attempt failed. Checking the network…');return false;}
 finally{if(call===c)c.recoveryInProgress=false;}
}
async function setupPeer(){
 const c=call;
 if(!c)throw Error('No active call.');
 if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw Error('Calls need a supported browser and a secure HTTPS page.');
 const iceServers=callIceServers();
 const constraints={
  audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
  video:c.media==='video'?{facingMode:{ideal:'user'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30}}:false
 };
 let local;
 try{local=await navigator.mediaDevices.getUserMedia(constraints)}catch(e){
  if(e?.name==='NotAllowedError'||e?.name==='PermissionDeniedError')throw Error('Allow microphone'+(c.media==='video'?' and camera':'')+' access in your browser settings, then try again.');
  if(e?.name==='NotFoundError'||e?.name==='DevicesNotFoundError')throw Error('No compatible microphone'+(c.media==='video'?' or camera':'')+' was found on this device.');
  if(e?.name==='NotReadableError'||e?.name==='TrackStartError')throw Error('Your microphone or camera is already being used by another app. Close it and try again.');
  throw e;
 }
 // Permission prompts are asynchronous. If the user ended/switched calls meanwhile,
 // never attach a late stream to a different call.
 if(call!==c){local.getTracks().forEach(t=>t.stop());throw Error('This call was ended before media access completed.');}
 if(call!==c){local.getTracks().forEach(t=>t.stop());throw Error('This call was ended while preparing network connectivity.');}
 c.local=local;
 local.getTracks().forEach(track=>{track.addEventListener('ended',()=>{if(call!==c)return;say('callError',track.kind==='audio'?'Your microphone stopped. Check microphone permission or reconnect your headset.':'Your camera stopped. You can continue the call with the camera off.');if(track.kind==='video'&&$('cameraCall'))$('cameraCall').classList.add('active')},{once:true})});
 if(c.media==='video'&&$('localVideo')){$('localVideo').muted=true;$('localVideo').playsInline=true;$('localVideo').srcObject=local;$('localVideo').play?.().catch(()=>{});}
 const pc=new RTCPeerConnection({iceServers,iceTransportPolicy:'all',iceCandidatePoolSize:2,bundlePolicy:'max-bundle',rtcpMuxPolicy:'require'});
 c.pc=pc;
 local.getTracks().forEach(t=>pc.addTrack(t,local));
 pc.ontrack=e=>{
  if(call!==c||c.pc!==pc)return;
  const stream=e.streams?.[0]||(c.remote||new MediaStream());
  if(!e.streams?.[0]&&!stream.getTracks().some(t=>t.id===e.track.id))stream.addTrack(e.track);
  c.remote=stream;
  if(e.track){e.track.addEventListener('ended',()=>{if(call!==c)return;say('callHint',e.track.kind==='audio'?'The other participant audio stream ended. Waiting for it to reconnect…':'The other participant video stream ended. Waiting for it to reconnect…')},{once:true})}
  const audio=$('remoteAudio'),video=$('remoteVideo');
  if(audio){audio.autoplay=true;audio.playsInline=true;audio.srcObject=stream;audio.play?.().catch(()=>say('callHint','Tap the call screen once to enable incoming audio.'));}
  if(c.media==='video'&&video){video.autoplay=true;video.playsInline=true;video.muted=true;video.srcObject=stream;video.play?.().catch(()=>say('callHint','Tap the video preview once to start playback.'));}
  if(c.media==='video'&&$('callVideos'))$('callVideos').hidden=false;
 };
 pc.onicecandidate=e=>{
  if(e.candidate&&isDirectIceCandidate(e.candidate)&&call===c&&c.pc===pc)sendSignal(c.peerId,{callId:c.id,type:'candidate',candidate:e.candidate.toJSON(),media:c.media}).catch(err=>console.warn('[SPIKE calls] ICE candidate signaling failed:',err?.message||err));
 };
 pc.onicecandidateerror=e=>console.warn('[SPIKE calls] ICE candidate error:',e.errorCode||'',e.errorText||'');
 pc.oniceconnectionstatechange=()=>{
  if(call!==c||c.pc!==pc)return;
  const state=pc.iceConnectionState;
  if(state==='checking')say('callState','Finding a secure media route…');
  else if(state==='connected'||state==='completed'){
   c.connected=true;renderRecordingUI();
   if(callConnectionTimer){clearTimeout(callConnectionTimer);callConnectionTimer=null;}if(callRecoveryTimer){clearTimeout(callRecoveryTimer);callRecoveryTimer=null;}
  }else if(state==='disconnected'){
   say('callState','Connection interrupted; trying to recover…');
   if(callConnectionTimer)clearTimeout(callConnectionTimer);
   if(callRecoveryTimer)clearTimeout(callRecoveryTimer);
   callRecoveryTimer=setTimeout(()=>{if(call===c&&c.pc===pc&&pc.iceConnectionState==='disconnected')recoverCallConnection(c,pc,'ice-disconnected')},2500);
   callConnectionTimer=setTimeout(()=>{if(call===c&&c.pc===pc&&pc.iceConnectionState==='disconnected'){say('callError','The network connection could not be restored. Check your connection and try again.');endCall(true,'hangup')}},20000);
  }else if(state==='failed'){
   say('callState','Media route failed; attempting secure reconnection…');
   if(callRecoveryTimer)clearTimeout(callRecoveryTimer);
   recoverCallConnection(c,pc,'ice-failed').then(ok=>{if(!ok&&call===c&&c.pc===pc){if(callConnectionTimer)clearTimeout(callConnectionTimer);callConnectionTimer=setTimeout(()=>{if(call===c&&c.pc===pc&&pc.iceConnectionState==='failed'){say('callError','Could not establish a direct media connection on this network. Check your connection and try again.');endCall(true,'hangup')}},10000)}});
  }
 };
 pc.onconnectionstatechange=()=>{
  if(call!==c||c.pc!==pc)return;
  const state=pc.connectionState;
  if(state==='connected'){
   if(callConnectionTimer){clearTimeout(callConnectionTimer);callConnectionTimer=null;}if(callRecoveryTimer){clearTimeout(callRecoveryTimer);callRecoveryTimer=null;}
   stopTones();say('callState','Connected');c.connected=true;renderRecordingUI();
   if(!callStarted){callStarted=Date.now();callTimer=setInterval(()=>{
    if(call!==c)return;
    say('callTimer',new Date(Date.now()-callStarted).toISOString().slice(11,19));
    if(c.recordingStarted&&c.recordingStartedAt)say('recordingTimer',new Date(Date.now()-c.recordingStartedAt).toISOString().slice(11,19));
   },1000);}
   controls('active');
  }else if(state==='connecting')say('callState','Connecting…');
  else if(state==='disconnected')say('callState','Connection interrupted…');
  else if(state==='failed'&&pc.iceConnectionState!=='failed'){
   say('callState','Connection interrupted; attempting recovery…');
   if(c.direction==='outgoing')recoverCallConnection(c,pc,'peer-connection-failed');
  }
 };
 return pc;
}
async function endCall(notify=false,reason='hangup'){
 const old=call;
 if(!old){stopTones();hideCall();return;}
 // Detach the active call before any awaited network operation so a new call can
 // start immediately and cannot be hidden or torn down by this cleanup.
 call=null;stopTones();
 if(callTimeout)clearTimeout(callTimeout);
 if(callTimer)clearInterval(callTimer);
 if(callConnectionTimer)clearTimeout(callConnectionTimer);if(callRecoveryTimer)clearTimeout(callRecoveryTimer);
 callTimeout=callTimer=callConnectionTimer=callRecoveryTimer=null;callStarted=0;
 if(old.recorder&&old.recorder.state!=='inactive'){
  try{if(old.drawFrame){cancelAnimationFrame(old.drawFrame);old.drawFrame=null;}old.recorder.stop();}
  catch(e){console.warn('[SPIKE recording] Could not stop recorder cleanly:',e?.message||e);}
 }
 try{old.pc?.close();}catch(_){}
 try{old.local?.getTracks().forEach(t=>t.stop());}catch(_){}
 try{old.remote?.getTracks().forEach(t=>t.stop());}catch(_){}
 ['remoteVideo','remoteAudio','localVideo'].forEach(id=>{if($(id))$(id).srcObject=null;});
 remoteCandidates=[];pendingCandidates.delete(old.id);hideCall();
 if(lastCallRecording?.callId===old.id)showRecordingSavePanel(lastCallRecording);
 if(notify){try{await sendSignal(old.peerId,{callId:old.id,type:reason,media:old.media});}
  catch(e){console.warn('[SPIKE calls] Could not send call-end signal:',e?.message||e);}}
}
async function startCall(media,target=other){
 target=String(target||'');if(!uuidRE.test(target)||target===me?.id){say('callError','Open a direct conversation with the person you want to call.');return;}
 if(call)return;
 if(!['voice','video'].includes(media))return;
 const c={id:crypto.randomUUID?.()||('spike-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),peerId:target,peerName:target===other?($('name')?.textContent||'SPIKE member'):'SPIKE member',peerProfile:null,direction:'outgoing',media,pc:null,local:null,remote:null,cameraFacingMode:'user',connected:false,recoveryAttempts:0,recoveryInProgress:false,recordingStarted:false,recordingStopped:false,recordingStarting:false,recordingStopping:false,businessRecording:null,remoteRecordingNotice:''};
 // Render the caller interface immediately. Media permission prompts can be slow
 // or remain pending on mobile; they must not leave the user with a blank screen.
 call=c;say('callError','');showCall();displayMedia(media);controls('outgoing');
 say('callState','Preparing call…');say('callHint','Waiting for microphone'+(media==='video'?' and camera':'')+' permission. The call will ring after setup completes.');
 try{
  const pc=await setupPeer();if(call!==c)return;
  say('callState','Calling…');say('callHint','Microphone'+(media==='video'?' and camera':'')+' permission granted. Connecting securely…');
  const offer=await pc.createOffer();if(call!==c)return;
  await pc.setLocalDescription(offer);if(call!==c)return;
  await sendSignal(c.peerId,{callId:c.id,type:'offer',media,sdp:pc.localDescription.toJSON()});if(call!==c)return;
  tone('outgoingTone',settings.outgoing);
  callTimeout=setTimeout(()=>{if(call===c&&c.direction==='outgoing')endCall(true,'missed');},45000);
 }catch(e){if(call===c){const message=e.message||'Could not start call.';await endCall(false);showCallFailure(message);}}
}
async function receiveOffer(p){
 if(!p?.callId||String(p.callId).length>100||p.to!==me.id||p.from===me.id||!uuidRE.test(String(p.from))||!['voice','video'].includes(p.media)||!p.sdp||typeof p.sdp!=='object')return;
 if(call){
  if(call.id===p.callId)return;
  // Deterministic glare handling for two users who press Call at the same time.
  // The lower UUID keeps its outgoing offer; the higher UUID switches to the offer.
  if(call.direction==='outgoing'&&!call.connected&&call.peerId===p.from&&String(me.id).toLowerCase()>String(p.from).toLowerCase()){
   await endCall(false);
  }else{
   await sendSignal(p.from,{callId:p.callId,type:'busy',media:p.media});return;
  }
 }
 // Render and ring immediately. Profile RPC latency must never delay incoming-call UX.
 const c={id:p.callId,peerId:p.from,peerName:'SPIKE member',peerProfile:null,direction:'incoming',media:p.media,offer:p.sdp,pc:null,local:null,remote:null,cameraFacingMode:'user',connected:false,recordingStarted:false,recordingStopped:false,recordingStarting:false,recordingStopping:false,businessRecording:null,remoteRecordingNotice:'',recoveryAttempts:0};
 call=c;remoteCandidates=pendingCandidates.get(p.callId)||[];pendingCandidates.delete(p.callId);
 showCall();displayMedia(c.media);controls('incoming');say('callState','Incoming '+c.media+' call');say('callHint','Answer only if you recognize and want to speak with this person.');tone('incomingTone',settings.incoming);
 callTimeout=setTimeout(()=>{if(call===c&&c.direction==='incoming')endCall(true,'missed')},45000);
}
async function acceptCall(){
 const c=call;if(!c||c.direction!=='incoming')return;
 tone('incomingTone',false);if(callTimeout)clearTimeout(callTimeout);callTimeout=null;
 controls('active');say('callState','Connecting…');
 try{
  const pc=await setupPeer();if(call!==c)return;
  await pc.setRemoteDescription(new RTCSessionDescription(directSessionDescription(c.offer)));if(call!==c)return;
  await drainCandidates();if(call!==c)return;
  const answer=await pc.createAnswer();if(call!==c)return;
  await pc.setLocalDescription(answer);if(call!==c)return;
  await sendSignal(c.peerId,{callId:c.id,type:'answer',media:c.media,sdp:pc.localDescription.toJSON()});
  say('callHint','Stay on SPIKE while the call is active.');
 }catch(e){if(call===c){const message=e.message||'Could not accept call.';await endCall(true,'decline');showCallFailure(message);}}
}
function candidateMatchesRemoteDescription(pc,candidate){
 const fragment=candidate?.usernameFragment;
 if(!fragment||!pc?.remoteDescription?.sdp)return true;
 const match=pc.remoteDescription.sdp.match(/^a=ice-ufrag:([^\r\n]+)/m);
 return !match||match[1]===fragment;
}
async function drainCandidates(){
 const c=call;if(!c?.pc?.remoteDescription)return;
 const pending=remoteCandidates.splice(0);
 for(const candidate of pending){try{if(isDirectIceCandidate(candidate))await c.pc.addIceCandidate(new RTCIceCandidate(candidate));}catch(e){console.warn('[SPIKE calls] ICE candidate skipped:',e?.message||e);}}
}
async function handleSignal(p){
 if(!p||p.to!==me?.id||!uuidRE.test(String(p.from||''))||typeof p.callId!=='string')return;
 if(['recording-notice','recording-notice-ack','recording-business-request','recording-business-consent','recording-business-stop'].includes(p.type)){
  if(call&&p.callId===call.id&&p.from===call.peerId)handleRecordingSignal(p);
  return;
 }
 if(p.type==='offer'){await receiveOffer(p);return;}
 if(p.type==='candidate'&&p.candidate&&isDirectIceCandidate(p.candidate)&&(!call||p.callId!==call.id)){
  // Candidate events can arrive before the offer; cap memory and reject stale bursts.
  if(pendingCandidates.size>12&&!pendingCandidates.has(p.callId))pendingCandidates.delete(pendingCandidates.keys().next().value);
  const list=pendingCandidates.get(p.callId)||[];
  if(list.length<80)list.push(p.candidate);
  pendingCandidates.set(p.callId,list);
  return;
 }
 if(!call||p.callId!==call.id||p.from!==call.peerId)return;
 try{
  if(p.type==='answer'&&call.direction==='outgoing'&&p.sdp){
   tone('outgoingTone',false);if(callTimeout)clearTimeout(callTimeout);callTimeout=null;
   await call.pc.setRemoteDescription(new RTCSessionDescription(directSessionDescription(p.sdp)));await drainCandidates();say('callState','Connecting…');
  }else if(p.type==='candidate'&&p.candidate&&isDirectIceCandidate(p.candidate)){
   if(call.pc?.remoteDescription&&candidateMatchesRemoteDescription(call.pc,p.candidate))await call.pc.addIceCandidate(new RTCIceCandidate(p.candidate));
   else if(remoteCandidates.length<80)remoteCandidates.push(p.candidate);
  }else if(p.type==='ice-restart-offer'&&call.direction==='incoming'&&p.sdp&&call.pc){
   const c=call,pc=c.pc;
   if(pc.signalingState!=='stable')return;
   await pc.setRemoteDescription(new RTCSessionDescription(directSessionDescription(p.sdp)));if(call!==c)return;
   await drainCandidates();if(call!==c)return;
   const answer=await pc.createAnswer();await pc.setLocalDescription(answer);if(call!==c)return;
   await sendSignal(c.peerId,{callId:c.id,type:'ice-restart-answer',media:c.media,sdp:pc.localDescription.toJSON(),attempt:p.attempt||1});
  }else if(p.type==='ice-restart-answer'&&call.direction==='outgoing'&&p.sdp&&call.pc){
   const c=call,pc=c.pc;if(pc.signalingState!=='have-local-offer')return;
   await pc.setRemoteDescription(new RTCSessionDescription(directSessionDescription(p.sdp)));if(call!==c)return;
   await drainCandidates();say('callState','Reconnecting securely…');
  }else if(p.type==='decline'){say('callState','Call declined');await endCall(false);}
  else if(p.type==='busy'){say('callState','User is busy');await endCall(false);}
  else if(['hangup','missed'].includes(p.type)){say('callState',p.type==='missed'?'Missed call':'Call ended');await endCall(false);}
 }catch(e){say('callError',e.message||'Call connection issue.');console.warn('[SPIKE calls] Signal handling failed:',e?.message||e);}
}
window.startCall=async(recipient,media='audio')=>{
 const normalized=media==='video'?'video':'voice';
 try{
  if(sessionInitPromise)await sessionInitPromise;
  if(!me&&db?.auth?.getSession){const result=await db.auth.getSession();if(result?.data?.session)await activateSession(result.data.session)}
 }catch(e){console.warn('[SPIKE calls] Could not prepare quick-call session:',e?.message||e)}
 if(!me){say('callError','Sign in to SPIKE before starting a call.');return false}
 return startCall(normalized,recipient);
};
async function connectDM(){
 // Keep call controls responsive even when a conversation URL is malformed.
 // startCall performs the authoritative recipient validation and reports the error.
 if(uuidRE.test(other)&&other!==me.id){window.AppPresence?.watch?.([other]);if($('dmPresence'))$('dmPresence').dataset.presenceUser=other;}
 if(!dmEventsBound){dmEventsBound=true;$('voiceCall')?.addEventListener('click',()=>startCall('voice'));$('videoCall')?.addEventListener('click',()=>startCall('video'))}
}
async function unlockCallPlayback(){
 const c=call;if(!c)return;
 const audio=$('remoteAudio'),video=$('remoteVideo');
 try{if(audio&&audio.srcObject){audio.muted=false;await audio.play()}}catch(e){say('callHint','Incoming audio is still blocked by the browser. Check the phone media volume and tap the call screen again.');}
 if(c.media==='video')try{if(video&&video.srcObject)await video.play()}catch(e){say('callHint','Video playback is blocked. Tap the video area again to retry.');}
 if(c.direction==='incoming'&&!c.connected)tone('incomingTone',settings.incoming);
}
function bindCallUI(){if(callUIBound)return;callUIBound=true;ensureCallUI();$('callShade')?.addEventListener('pointerup',()=>{unlockCallPlayback().catch(()=>{})});$('acceptCall')?.addEventListener('click',acceptCall);$('declineCall')?.addEventListener('click',()=>endCall(true,'decline'));$('endCall')?.addEventListener('click',()=>endCall(true,'hangup'));$('recordVoice')?.addEventListener('click',()=>startCallRecording('voice'));$('recordVideo')?.addEventListener('click',()=>startCallRecording('video'));$('recordBusiness')?.addEventListener('click',requestBusinessRecording);$('recordBusinessApprove')?.addEventListener('click',approveBusinessRecording);$('recordBusinessDecline')?.addEventListener('click',declineBusinessRecording);$('recordStop')?.addEventListener('click',stopCallRecording);$('downloadFinishedRecording')?.addEventListener('click',()=>{if(lastCallRecording&&lastCallRecording.callId===call?.id)triggerRecordingDownload(lastCallRecording)});$('saveCallRecording')?.addEventListener('click',()=>triggerRecordingDownload(lastCallRecording));$('closeRecordingResult')?.addEventListener('click',()=>hideCall());$('muteCall')?.addEventListener('click',()=>{const t=call?.local?.getAudioTracks()[0];if(t){t.enabled=!t.enabled;$('muteCall').classList.toggle('active',!t.enabled);$('muteCall').setAttribute('aria-label',t.enabled?'Mute microphone':'Unmute microphone');$('muteCall').title=t.enabled?'Mute microphone':'Unmute microphone';$('muteCall').querySelector('.call-btn-label').textContent=t.enabled?'Mute':'Unmute'}});$('cameraCall')?.addEventListener('click',()=>{const t=call?.local?.getVideoTracks()[0];if(t){t.enabled=!t.enabled;$('cameraCall').classList.toggle('active',!t.enabled);$('cameraCall').setAttribute('aria-label',t.enabled?'Turn camera off':'Turn camera on');$('cameraCall').title=t.enabled?'Turn camera off':'Turn camera on';$('cameraCall').querySelector('.call-btn-label').textContent=t.enabled?'Camera off':'Camera on'}});$('flipCameraCall')?.addEventListener('click',switchCallCamera);$('speakerCall')?.addEventListener('click',async()=>{try{const audio=$('remoteAudio');if(!audio)return;if(typeof audio.setSinkId==='function'){const devices=(await navigator.mediaDevices?.enumerateDevices?.()||[]).filter(d=>d.kind==='audiooutput');if(devices.length>1){const current=devices.findIndex(d=>d.deviceId===audio.sinkId);const next=devices[(current+1+devices.length)%devices.length];await audio.setSinkId(next.deviceId);say('callHint','Audio output: '+(next.label||'selected device'));}else say('callHint','This browser does not expose speakerphone routing. Use your Android call/audio output controls to choose Speaker or Phone.');}else say('callHint','This browser does not expose speakerphone routing. Use your Android call/audio output controls to choose Speaker or Phone.');}catch(e){say('callError',e.message||'Could not change audio output.')}})}
async function startPresence(){if(!window.AppPresence?.start)return;try{await window.AppPresence.start(db)}catch(e){console.warn('[SPIKE presence] Could not initialize global presence:',e?.message||e)}}
async function removePeerChannels(){const peers=[...peerChannels.values()];peerChannels.clear();for(const pending of peers)try{const ch=await pending;await db.removeChannel(ch)}catch(_){}}
async function activateSession(session){if(!session?.user?.id)return;if(sessionInitPromise){await sessionInitPromise;if(activeSessionUserId===session.user.id&&callChannels.length)return}if(activeSessionUserId===session.user.id&&callChannels.length){if(session.access_token&&typeof db.realtime?.setAuth==='function')await db.realtime.setAuth(session.access_token);return}sessionInitPromise=(async()=>{me=session.user;if(session.access_token&&typeof db.realtime?.setAuth==='function')await db.realtime.setAuth(session.access_token);const old=callChannels.slice();callChannels=[];for(const ch of old)try{await db.removeChannel(ch)}catch(_){}await removePeerChannels();if(call)await endCall(false);window.__SPIKE_GLOBAL_PRESENCE_REQUIRED__=true;bindCallUI();await loadSettings();activeSessionUserId=me.id;/* Bind direct-message call buttons before the incoming-call subscription. A Realtime authorization or network failure must never leave the voice/video controls inert. */try{await connectDM()}catch(e){console.warn('[SPIKE calls] Direct-message call controls could not initialize:',e?.message||e)}try{callChannels=await topicForMe()}catch(e){callChannels=[];console.error('[SPIKE calls] Incoming-call subscription unavailable:',e?.message||e);window.__SPIKE_CALL_RECEIVER_ERROR__=e?.message||'Incoming-call subscription unavailable'}await startPresence();ensurePresenceUI();/* Calls must be initiated by an explicit in-page user gesture; URL parameters never auto-start a call. */if(!cleanupBound){cleanupBound=true;window.addEventListener('pagehide',()=>{try{if(callChannel)db.removeChannel(callChannel);callChannels.forEach(ch=>db.removeChannel(ch));peerChannels.forEach(p=>Promise.resolve(p).then(c=>db.removeChannel(c)).catch(()=>{}));if(callConnectionTimer)clearTimeout(callConnectionTimer);if(callRecoveryTimer)clearTimeout(callRecoveryTimer);if(call){try{call.pc?.close();call.local?.getTracks().forEach(t=>t.stop())}catch(_){}}}catch(_){}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&call?.direction==='outgoing')tone('outgoingTone',false)})}})();try{await sessionInitPromise}catch(e){console.error('[SPIKE calls] Could not initialize signed-in call runtime:',e?.message||e);throw e}finally{sessionInitPromise=null}}
async function deactivateSession(){activeSessionUserId=null;if(call)await endCall(false);const old=callChannels.slice();callChannels=[];for(const ch of old)try{await db.removeChannel(ch)}catch(_){}await removePeerChannels();try{await window.AppPresence?.stop?.(true)}catch(_){}me=null}
async function init(){
 // Mount and bind the shared call surface independently of authentication and
 // Realtime startup. Incoming/outgoing rendering must never depend on a later
 // subscription callback having created the DOM.
 try{ensureCallUI();bindCallUI()}catch(e){console.error('[SPIKE calls] Could not mount call interface:',e?.message||e)}
 db=window.SPIKE_PLATFORM?.getClient?.()||window.__SPIKE_SUPABASE__||window.supabaseClient||window.supabase?.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 if(!db){console.warn('[SPIKE calls] Supabase client is not available yet; call receiver was not started.');return;}
 try{const r=await db.auth.getSession();if(r.error)throw r.error;if(r.data.session)await activateSession(r.data.session);else console.info('[SPIKE calls] No active session; call receiver will start automatically after sign-in.')}catch(e){console.warn('[SPIKE calls] Initialization failed:',e?.message||e)}db.auth.onAuthStateChange((event,session)=>{setTimeout(()=>{if(session?.user)activateSession(session).catch(e=>console.error('[SPIKE calls] Call channel reconnect failed:',e?.message||e));else deactivateSession().catch(e=>console.warn('[SPIKE calls] Session cleanup failed:',e?.message||e))},0)})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
