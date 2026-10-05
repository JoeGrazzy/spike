/* SPIKE Message Center v1
 * Header entry point for private messages and unread-message count.
 * Reuses the existing dm_list_conversations RPC and private_messages Realtime table.
 * No schema or message-contract changes.
 */
(()=>{
  'use strict';
  const SUPABASE_URL='https://cjqpyndceqyqsijihxbb.supabase.co';
  const SUPABASE_KEY='sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw';
  let client=null,userId=null,channel=null,started=false,timer=null,lastCount=null;
  const targets=()=>[...document.querySelectorAll('[data-spike-message-badge]')];
  function setCount(value){
    const n=Math.max(0,Number(value)||0);
    const increased=lastCount!==null&&n>lastCount;
    lastCount=n;
    if(increased) window.SPIKENotificationSound?.play();
    targets().forEach(el=>{
      const label=n?`Messages, ${n} unread message${n===1?'':'s'}`:'Messages, no unread messages';
      el.dataset.unreadCount=String(n);
      el.setAttribute('aria-label',label);
      el.classList.toggle('has-unread',n>0);
      const badge=el.querySelector('.spike-message-badge-count');
      if(badge){badge.textContent=n>99?'99+':String(n);badge.hidden=n===0;}
    });
    document.querySelectorAll('[data-spike-message-count]').forEach(el=>{
      el.textContent=n>99?'99+':String(n);
      el.hidden=false;
    });
    window.dispatchEvent(new CustomEvent('spike:message-count',{detail:{unread:n}}));
    return n;
  }
  function normalizeThreads(data){
    const raw=Array.isArray(data)?data:(data?.conversations||[]);
    const byUser=new Map();
    raw.forEach(t=>{
      const id=t?.user_id||t?.other_user_id;
      if(!id||id===userId)return;
      const prev=byUser.get(id);
      const next={...t,user_id:id,other_user_id:id};
      if(!prev||new Date(next.latest?.created_at||0)>new Date(prev.latest?.created_at||0))byUser.set(id,next);
    });
    return [...byUser.values()];
  }
  async function refresh(){
    if(!client||!userId)return 0;
    try{
      const r=await client.rpc('dm_list_conversations',{p_limit:100,p_offset:0});
      if(r.error)throw r.error;
      const threads=normalizeThreads(r.data);
      const count=threads.reduce((sum,t)=>sum+Math.max(0,Number(t.unread)||0),0);
      return setCount(count);
    }catch(e){
      // Fallback keeps the header useful if conversation RPC response shape changes.
      try{
        const r=await client.from('private_messages').select('id',{count:'exact',head:true}).eq('recipient_id',userId).eq('read',false);
        if(r.error)throw r.error;
        return setCount(r.count||0);
      }catch(err){
        console.debug('[SPIKE message center]',err||e);
        return null;
      }
    }
  }
  async function subscribe(){
    if(!client||!userId)return;
    try{
      const session=(await client.auth.getSession()).data?.session;
      if(session?.access_token)await client.realtime.setAuth(session.access_token);
    }catch(e){console.debug('[SPIKE message realtime auth]',e)}
    if(channel){try{await client.removeChannel(channel)}catch(_){} channel=null;}
    channel=client.channel(`user:${userId}:messages-header`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'private_messages',filter:`recipient_id=eq.${userId}`},()=>refresh())
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'private_messages',filter:`recipient_id=eq.${userId}`},()=>refresh())
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
      if(!userId){setCount(0);return;}
      await refresh();
      await subscribe();
      clearInterval(timer);
      timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},30000);
      client.auth.onAuthStateChange((event,next)=>{
        if((event==='SIGNED_IN'||event==='TOKEN_REFRESHED')&&next?.user?.id){userId=next.user.id;refresh();subscribe();}
        if(event==='SIGNED_OUT'){userId=null;lastCount=null;setCount(0);if(channel){client.removeChannel(channel).catch(()=>{});channel=null;}}
      });
    }catch(e){console.debug('[SPIKE message center start]',e)}
  }
  window.SPIKEMessageCenter={start,refresh,setCount,getCount:()=>Number(document.querySelector('[data-spike-message-badge]')?.dataset.unreadCount||0)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.addEventListener('pageshow',()=>refresh());
  window.addEventListener('online',()=>refresh());
  window.addEventListener('beforeunload',()=>{clearInterval(timer);if(channel&&client)client.removeChannel(channel).catch(()=>{})});
})();
