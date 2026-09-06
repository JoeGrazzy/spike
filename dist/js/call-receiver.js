/* SPIKE shared incoming-call receiver.
   Loaded by every authenticated page except message.html, which has its own
   full call controller. It catches realtime INSERTs only and hands them to
   message.html for the real accept/decline/WebRTC UI. */
(function(){
  'use strict';
  if(window.__SPIKE_CALL_RECEIVER__) return;
  window.__SPIKE_CALL_RECEIVER__=true;

  const LOCK='spike-incoming-call-lock';
  const LOCK_MS=15000;
  let client=null, me=null, channel=null, stopped=false, booting=null;

  function claim(callId){
    try{
      const now=Date.now();
      const old=JSON.parse(localStorage.getItem(LOCK)||'null');
      if(old && old.id!==callId && now-old.ts<LOCK_MS) return false;
      localStorage.setItem(LOCK,JSON.stringify({id:String(callId),ts:now}));
      return true;
    }catch(_){ return true; }
  }

  function isMessagePage(){
    return /(?:^|\/)message\.html$/i.test(location.pathname.split('?')[0]);
  }

  function route(c){
    if(stopped || !c || c.status!=='ringing' || String(c.callee_id)!==String(me?.id)) return;
    if(isMessagePage()) return;
    if(!claim(c.id)) return;
    const type=c.call_type==='video'?'video':'audio';
    const next='message.html?private_uid='+encodeURIComponent(c.caller_id)+'&incoming_call='+encodeURIComponent(c.id)+'&call='+type;
    location.assign(next);
  }

  // Intentionally do not scan historical ringing rows here.
  // Incoming calls are delivered by Realtime INSERT events only. This prevents
  // an old/stale call from redirecting a user immediately after login.


  async function stop(){
    stopped=true;
    if(channel && client){ try{ await client.removeChannel(channel); }catch(_){} }
    channel=null;
  }

  async function boot(){
    if(booting) return booting;
    booting=(async()=>{
      if(!window.supabase?.createClient || isMessagePage()) return false;
      stopped=false;
      try{
        // Prefer a page's existing client when available; otherwise create a
        // small receiver client from the same Supabase project credentials.
        client=window.supabaseClient || window.db || window.sb || null;
        if(!client){
          const cfg=window.SPIKE_SUPABASE_CONFIG||window.SPIKE_CONFIG||{};
          let url=window.SUPABASE_URL||cfg.url;
          let key=window.SUPABASE_ANON_KEY||window.SUPABASE_KEY||cfg.key;
          if(!url||!key){
            const scripts=[...document.scripts].map(s=>s.textContent||'').join('\n');
            const m1=scripts.match(/https:\/\/[^'"\s]+\.supabase\.co/);
            const m2=scripts.match(/(?:SUPABASE_(?:ANON_)?KEY|SUPABASE_KEY|publishableKey|anonKey|(?:const|let|var)\s+KEY)\s*=\s*['"]([^'"]+)['"]/i);
            url=m1?.[0]||url; key=m2?.[1]||key;
          }
          if(!url||!key) return false;
          client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
        }
        const {data}=await client.auth.getUser();
        me=data?.user||null;
        if(!me) return false;

        channel=client.channel('spike-call-receiver-'+me.id)
          .on('postgres_changes',{event:'INSERT',schema:'public',table:'private_calls',filter:`callee_id=eq.${me.id}`},p=>route(p.new))
          .subscribe();

        return true;
      }catch(e){ console.warn('[SPIKE call receiver]',e); return false; }
    })().finally(()=>{booting=null;});
    return booting;
  }

  window.SPIKECallReceiver={start:boot,stop};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
  window.addEventListener('pagehide',()=>{stop().catch(()=>{});});
})();
