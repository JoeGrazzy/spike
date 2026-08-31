/* SPIKE shared realtime presence — feed, profile, and messages */
(function(){
  'use strict';
  const CHANNEL_NAME='spike-global-presence';
  const HEARTBEAT_MS=30000;
  const MIN_TRACK_GAP_MS=20000;
  const GRACE_MS=10000;
  let sb=null, me=null, channel=null, timer=null, onlineHandler=null, offlineHandler=null, visibilityHandler=null, pagehideHandler=null, lastTrackAt=0;
  let starting=null, publish=true;
  const watched=new Set(), states=new Map(), timers=new Map(), listeners=new Set();

  function notify(row){
    states.set(String(row.user_id),row);
    listeners.forEach(fn=>{try{fn(row)}catch(e){console.warn('[SPIKE PRESENCE listener]',e)}});
    const raw=String(row.user_id); const esc=window.CSS?.escape ? CSS.escape(raw) : raw.replace(/[^a-zA-Z0-9_-]/g,'\\$&'); const selector=`[data-presence-user="${esc}"]`;
    document.querySelectorAll(selector).forEach(el=>{
      el.dataset.presenceStatus=row.online?'Online':'Offline';
      el.classList.toggle('presence-online',!!row.online);
      el.querySelectorAll('.dot,.status-dot,.presence-dot').forEach(dot=>dot.classList.toggle('online',!!row.online));
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
    watched.forEach(id=>{
      id=String(id);
      if(id===String(me?.id||''))return;
      if(online.has(id)){clearTimer(id);notify({user_id:id,online:true,last_seen:states.get(id)?.last_seen||null});}
      else if(states.get(id)?.online) markOfflineLater(id);
      else if(!states.has(id)) notify({user_id:id,online:false,last_seen:null});
    });
  }
  async function track(force=false){
    if(!channel||!me||!publish)return false;
    if(navigator.onLine===false)return false;
    const now=Date.now();
    if(!force && now-lastTrackAt<MIN_TRACK_GAP_MS)return true;
    try{await channel.track({user_id:me.id,online:true,ts:now});lastTrackAt=now;window.dispatchEvent(new CustomEvent('spike-presence-status',{detail:{status:'online'}}));return true;}catch(e){window.dispatchEvent(new CustomEvent('spike-presence-status',{detail:{status:'error',error:e}}));console.debug('[SPIKE PRESENCE track]',e);return false;}
  }
  async function start(client,opts={}){
    if(!client)return false;
    if(starting)return starting;
    publish=opts.publish!==false;
    starting=(async()=>{
      if(channel && sb===client && me){ return true; }
      sb=client;
      const r=await sb.auth.getUser();
      me=r.data?.user||null;
      if(!me)return false;
      if(channel){try{await sb.removeChannel(channel)}catch(_){} channel=null;}
      channel=sb.channel(CHANNEL_NAME,{config:{presence:{key:String(me.id)}}});
      channel.on('presence',{event:'sync'},apply);
      channel.on('presence',{event:'join'},apply);
      channel.on('presence',{event:'leave'},payload=>{const id=payload?.key;if(id&&String(id)!==String(me.id)&&watched.has(String(id)))markOfflineLater(id);apply();});
      let subscribed=false;
      try{
        await new Promise((resolve,reject)=>{
          let done=false;
          const sub=channel.subscribe(async status=>{
            window.dispatchEvent(new CustomEvent('spike-presence-status',{detail:{status}}));
            if(status==='SUBSCRIBED'&&!done){done=true;subscribed=true;await track();apply();resolve(true);}
            else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){if(!done){done=true;reject(new Error('Presence channel '+status));}}
          });
          Promise.resolve(sub).catch(reject);
        });
      }catch(e){
        console.warn('[SPIKE PRESENCE subscribe]',e);
        try{await sb.removeChannel(channel)}catch(_){}
        channel=null;
        clearInterval(timer);
        return false;
      }
      clearInterval(timer);
      if(subscribed){lastTrackAt=Date.now();timer=setInterval(()=>track().catch(()=>{}),HEARTBEAT_MS);}
      if(!onlineHandler){
        onlineHandler=()=>{track();apply();}; window.addEventListener('online',onlineHandler);
        offlineHandler=()=>{watched.forEach(id=>{if(states.get(id)?.online)markOfflineLater(id);});}; window.addEventListener('offline',offlineHandler);
        visibilityHandler=()=>{if(document.visibilityState==='visible'){track(true);apply();}}; document.addEventListener('visibilitychange',visibilityHandler);
        pagehideHandler=()=>{stop().catch(()=>{});}; window.addEventListener('pagehide',pagehideHandler,{once:true});
      }
      return true;
    })().finally(()=>{starting=null;});
    return starting;
  }
  async function stop(){
    clearInterval(timer);timer=null;
    if(channel&&sb){try{await sb.removeChannel(channel)}catch(_){} }
    channel=null; states.clear(); timers.forEach(t=>clearTimeout(t));timers.clear(); lastTrackAt=0;
  }
  async function heartbeat(){return track();}
  function watch(ids){(ids||[]).forEach(id=>{if(id&&String(id)!==String(me?.id||''))watched.add(String(id));});apply();}
  function subscribe(fn){if(typeof fn!=='function')return()=>{};listeners.add(fn);return()=>listeners.delete(fn);}
  function isOnline(id){return !!states.get(String(id))?.online;}
  function isPublishing(){return !!(publish&&channel&&me&&navigator.onLine!==false);}
  window.AppPresence={start,stop,heartbeat,watch,subscribe,isOnline,isPublishing};
})();
