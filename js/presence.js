/* SPIKE shared realtime presence — feed, profile, and messages */
(function(){
  'use strict';
  const CHANNEL_NAME='spike-global-presence';
  const HEARTBEAT_MS=30000;
  const MIN_TRACK_GAP_MS=20000;
  const GRACE_MS=10000;
  let sb=null, me=null, channel=null, timer=null, reconnectTimer=null, reconnectAttempts=0, onlineHandler=null, offlineHandler=null, visibilityHandler=null, pagehideHandler=null, lastTrackAt=0;
  let starting=null, publish=true;
  const watched=new Set(), states=new Map(), timers=new Map(), listeners=new Set();

  function presenceTime(value){
    if(!value)return ''; const d=new Date(value); if(!Number.isFinite(d.getTime()))return '';
    const now=Date.now(),delta=Math.max(0,now-d.getTime());
    if(delta<60000)return 'just now'; if(delta<3600000)return Math.floor(delta/60000)+'m ago';
    if(delta<86400000)return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
    return d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  }
  function notify(row){
    if(row.online && !row.last_seen) row.last_seen=new Date().toISOString();
    states.set(String(row.user_id),row);
    listeners.forEach(fn=>{try{fn(row)}catch(e){console.warn('[SPIKE PRESENCE listener]',e)}});
    const raw=String(row.user_id); const esc=window.CSS?.escape ? CSS.escape(raw) : raw.replace(/[^a-zA-Z0-9_-]/g,'\\$&'); const selector=`[data-presence-user="${esc}"]`;
    document.querySelectorAll(selector).forEach(el=>{
      el.dataset.presenceStatus=row.online?'Online':'Offline';
      el.classList.toggle('presence-online',!!row.online);
      el.querySelectorAll('.dot,.status-dot,.presence-dot').forEach(dot=>dot.classList.toggle('online',!!row.online));
      el.querySelectorAll('[data-presence-text]').forEach(label=>{label.textContent=row.online?'Online · '+(presenceTime(row.last_seen)||'now'):(row.last_seen?'Last seen '+presenceTime(row.last_seen):'Offline');});
      el.querySelectorAll('[data-presence-timestamp]').forEach(label=>{label.textContent=row.last_seen?new Date(row.last_seen).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';});
    });
  }
  function clearTimer(id){const t=timers.get(String(id));if(t){clearTimeout(t);timers.delete(String(id));}}
  function markOfflineLater(id){
    id=String(id); clearTimer(id);
    const stamp=Date.now();
    timers.set(id,setTimeout(()=>{
      const current=states.get(id);
      if(current?.online && Date.now()-stamp>=GRACE_MS) notify({user_id:id,online:false,last_seen:new Date(stamp).toISOString()});
    },GRACE_MS));
  }
  function apply(){
    if(!channel)return;
    const state=channel.presenceState?.()||{};
    const online=new Set(Object.keys(state).map(String));
    const onlineMeta=new Map(); Object.entries(state).forEach(([id,metas])=>{const list=Array.isArray(metas)?metas:[];let latest=null;for(const meta of list){const ts=Number(meta?.ts);if(Number.isFinite(ts)&&(!latest||ts>latest.ts))latest={ts,iso:new Date(ts).toISOString()};}if(latest)onlineMeta.set(String(id),latest.iso);});
    watched.forEach(id=>{
      id=String(id);
      if(id===String(me?.id||''))return;
      if(online.has(id)){clearTimer(id);notify({user_id:id,online:true,last_seen:onlineMeta.get(id)||states.get(id)?.last_seen||new Date().toISOString()});}
      else if(states.get(id)?.online) markOfflineLater(id);
      else if(!states.has(id)) notify({user_id:id,online:false,last_seen:null});
    });
  }
  function scheduleReconnect(client){
    if(!client || reconnectTimer || navigator.onLine===false) return;
    const delay=Math.min(30000,1000*Math.pow(2,Math.min(reconnectAttempts,5)));
    reconnectAttempts++;
    reconnectTimer=setTimeout(async()=>{
      reconnectTimer=null;
      const old=channel;
      channel=null;
      if(old && sb){try{await sb.removeChannel(old)}catch(_){}}
      try{
        const ok=await start(client,{publish});
        if(ok && channel){reconnectAttempts=0;return;}
      }catch(e){console.info('[SPIKE PRESENCE] reconnect attempt failed',e?.message||'');}
      scheduleReconnect(client);
    },delay);
  }
  async function track(force=false){
    if(!channel||!me||!publish)return false;
    if(navigator.onLine===false)return false;
    const now=Date.now();
    if(!force && now-lastTrackAt<MIN_TRACK_GAP_MS)return true;
    try{await channel.track({user_id:me.id,online:true,ts:now,updated_at:new Date(now).toISOString()});lastTrackAt=now;window.dispatchEvent(new CustomEvent('spike-presence-status',{detail:{status:'online'}}));return true;}catch(e){window.dispatchEvent(new CustomEvent('spike-presence-status',{detail:{status:'error',error:e}}));console.debug('[SPIKE PRESENCE track]',e);return false;}
  }
  async function start(client,opts={}){
    if(!client)return false;
    if(starting)return starting;
    publish=opts.publish!==false;
    starting=(async()=>{
      if(channel && sb===client && me && channel.state==='joined'){ return true; }
      sb=client;
      const r=await sb.auth.getUser();
      me=r.data?.user||null;
      if(!me)return false;
      // Honor the signed-in user's own privacy choice across every SPIKE page.
      // Do not infer our publishing permission from another member's profile.
      try {
        const privacy=await sb.from('profile_privacy').select('show_online_status').eq('user_id',me.id).maybeSingle();
        if(!privacy.error && privacy.data?.show_online_status===false){ publish=false; await stop(true); return false; }
      } catch(e) { console.info('[SPIKE PRESENCE] Privacy lookup unavailable; using default visibility.',e?.message||''); }
      publish=opts.publish!==false;
      if(channel){try{await sb.removeChannel(channel)}catch(_){} channel=null;}
      channel=sb.channel(CHANNEL_NAME,{config:{private:true,presence:{key:String(me.id)}}});
      channel.on('presence',{event:'sync'},apply);
      channel.on('presence',{event:'join'},apply);
      channel.on('presence',{event:'leave'},payload=>{const id=payload?.key;if(id&&String(id)!==String(me.id)&&watched.has(String(id)))markOfflineLater(id);apply();});
      let subscribed=false;
      try{
        await new Promise((resolve,reject)=>{
          let done=false;
          const sub=channel.subscribe(async status=>{
            window.dispatchEvent(new CustomEvent('spike-presence-status',{detail:{status}}));
            if(status==='SUBSCRIBED'){
              reconnectAttempts=0;
              if(!done){done=true;subscribed=true;await track(true);apply();resolve(true);}
            } else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
              if(!done){done=true;reject(new Error('Presence channel '+status));}
              else scheduleReconnect(client);
            }
          });
          Promise.resolve(sub).catch(reject);
        });
      }catch(e){
        console.warn('[SPIKE PRESENCE subscribe]',e);
        try{await sb.removeChannel(channel)}catch(_){}
        channel=null;
        clearInterval(timer);
        scheduleReconnect(client);
        return false;
      }
      clearInterval(timer);
      if(subscribed){lastTrackAt=Date.now();timer=setInterval(()=>track().catch(()=>{}),HEARTBEAT_MS);}
      if(!onlineHandler){
        onlineHandler=()=>{if(!channel)start(sb,{publish});else track(true);apply();}; window.addEventListener('online',onlineHandler);
        offlineHandler=()=>{watched.forEach(id=>{if(states.get(id)?.online)markOfflineLater(id);});}; window.addEventListener('offline',offlineHandler);
        visibilityHandler=()=>{if(document.visibilityState==='visible'){if(!channel)start(sb,{publish});else track(true);apply();}}; document.addEventListener('visibilitychange',visibilityHandler);
        pagehideHandler=e=>{if(e.persisted)return;stop(true).catch(()=>{});}; window.addEventListener('pagehide',pagehideHandler);
      }
      return true;
    })().finally(()=>{starting=null;});
    return starting;
  }
  async function stop(force=false){
    if(!force && window.__SPIKE_GLOBAL_PRESENCE_REQUIRED__ && sb && me){try{const own=await sb.from('profile_privacy').select('show_online_status').eq('user_id',me.id).maybeSingle();if(!own.error && own.data?.show_online_status!==false)return false;}catch(_){}}
    clearInterval(timer);timer=null;clearTimeout(reconnectTimer);reconnectTimer=null;reconnectAttempts=0;
    if(channel&&sb){try{await sb.removeChannel(channel)}catch(_){} }
    channel=null; states.clear(); timers.forEach(t=>clearTimeout(t));timers.clear(); lastTrackAt=0;
  }
  async function heartbeat(){return track();}
  function watch(ids){(ids||[]).forEach(id=>{if(id&&String(id)!==String(me?.id||''))watched.add(String(id));});apply();}
  function subscribe(fn){if(typeof fn!=='function')return()=>{};listeners.add(fn);return()=>listeners.delete(fn);}
  function isOnline(id){return !!states.get(String(id))?.online;}
  function getState(id){return states.get(String(id))||{user_id:String(id),online:false,last_seen:null};}
  function isPublishing(){return !!(publish&&channel&&me&&navigator.onLine!==false);}
  window.AppPresence={start,stop,heartbeat,watch,subscribe,isOnline,getState,isPublishing};
})();
