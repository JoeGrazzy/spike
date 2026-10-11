/* SPIKE Notification Center v1
 * One frontend source for unread notification badges.
 * Uses the existing authenticated notification summary RPC and private Realtime channel.
 * No schema or notification producer changes.
 */
(()=>{
  'use strict';
  const SUPABASE_URL='https://cjqpyndceqyqsijihxbb.supabase.co';
  const SUPABASE_KEY='sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw';
  let client=null, userId=null, channel=null, started=false, timer=null, lastCount=null;
  const targets=()=>[...document.querySelectorAll('[data-spike-notification-badge]')];
  function setCount(value){
    const n=Math.max(0,Number(value)||0);
    const increased=lastCount!==null&&n>lastCount;
    lastCount=n;
    if(increased) window.SPIKENotificationSound?.play();
    targets().forEach(el=>{
      const label=n?`Notifications, ${n} unread alert${n===1?'':'s'}`:'Notifications, no unread alerts';
      el.dataset.unreadCount=String(n);
      el.setAttribute('aria-label',label);
      el.classList.toggle('has-unread',n>0);
      const badge=el.querySelector('.spike-notification-badge-count');
      if(badge){badge.textContent=n>99?'99+':String(n);badge.hidden=n===0;}
    });
    document.querySelectorAll('[data-spike-notification-count]').forEach(el=>{
      el.textContent=n>99?'99+':String(n);
      el.hidden=false;
    });
    window.dispatchEvent(new CustomEvent('spike:notification-count',{detail:{unread:n}}));
    return n;
  }
  async function refresh(){
    if(!client||!userId)return 0;
    try{
      const r=await client.rpc('get_notification_summary');
      if(r.error)throw r.error;
      const count=Number(r.data?.unread||0);
      return setCount(count);
    }catch(e){
      console.debug('[SPIKE notification center]',e);
      return null;
    }
  }
  async function subscribe(){
    if(!client||!userId)return;
    try{
      const session=(await client.auth.getSession()).data?.session;
      if(session?.access_token)await client.realtime.setAuth(session.access_token);
    }catch(e){console.debug('[SPIKE notification realtime auth]',e)}
    if(channel){try{await client.removeChannel(channel)}catch(_){} channel=null;}
    channel=client.channel(`user:${userId}:notifications`,{config:{private:true}})
      .on('broadcast',{event:'notification_created'},()=>refresh())
      .on('broadcast',{event:'notification_updated'},()=>refresh())
      .on('broadcast',{event:'notification_deleted'},()=>refresh())
      .subscribe(()=>{});
  }
  async function start(){
    if(started)return;
    started=true;
    if(!window.supabase?.createClient)return;
    client=window.supabaseClient||window.sb||window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce'}});
    try{
      const session=(await client.auth.getSession()).data?.session;
      userId=session?.user?.id||null;
      if(!userId)return;
      await refresh();
      if(!document.body.hasAttribute('data-spike-notification-page')) await subscribe();
      clearInterval(timer);
      timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},60000);
      client.auth.onAuthStateChange((event,next)=>{
        if(event==='TOKEN_REFRESHED'&&next?.user?.id){userId=next.user.id;subscribe().catch(()=>{});refresh();}
        if(event==='SIGNED_OUT'){lastCount=null;setCount(0);if(channel){client.removeChannel(channel).catch(()=>{});channel=null;}}
      });
    }catch(e){console.debug('[SPIKE notification center start]',e)}
  }
  window.SPIKENotificationCenter={start,refresh,setCount,getCount:()=>Number(document.querySelector('[data-spike-notification-badge]')?.dataset.unreadCount||0)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.addEventListener('pageshow',()=>refresh());
  window.addEventListener('online',()=>refresh());
  window.addEventListener('beforeunload',()=>{clearInterval(timer);if(channel&&client)client.removeChannel(channel).catch(()=>{})});
})();
