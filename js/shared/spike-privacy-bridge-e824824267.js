(function(){
  if(window.__SPIKE_PRIVACY_BRIDGE__) return; window.__SPIKE_PRIVACY_BRIDGE__=true;
  const sb=window.supabase;
  const state={};
  async function call(fn,args){try{if(!sb?.rpc)return null; const r=await sb.rpc(fn,args||{}); if(r.error){console.warn('[SPIKE ACCESS]',fn,r.error.message);return null} return r.data;}catch(e){console.warn('[SPIKE ACCESS]',fn,e);return null}}
  async function viewer(){try{return (await sb?.auth?.getUser())?.data?.user||null}catch(e){return null}}
  window.SPIKE_ACCESS={
    profile:(owner)=>call('can_view_spike_profile',{p_viewer:state.viewerId,p_owner:owner}),
    discover:(owner)=>call('can_discover_spike_profile',{p_viewer:state.viewerId,p_owner:owner}),
    posts:(owner)=>call('can_view_spike_posts',{p_viewer:state.viewerId,p_owner:owner}),
    media:(owner)=>call('can_view_spike_media',{p_viewer:state.viewerId,p_owner:owner}),
    friends:(owner)=>call('can_view_spike_friends',{p_viewer:state.viewerId,p_owner:owner}),
    online:(owner)=>call('can_view_spike_online_status',{p_viewer:state.viewerId,p_owner:owner}),
    message:(owner)=>call('can_message_spike_user',{p_sender:state.viewerId,p_recipient:owner}),
    call:(owner)=>call('can_call_spike_user',{p_caller:state.viewerId,p_callee:owner}),
    ready:null
  };
  state.ready=(async()=>{const u=await viewer(); state.viewerId=u?.id||null; return u})(); window.SPIKE_ACCESS.ready=state.ready;
  // Guard profile/discovery links before navigation; privacy is still enforced server-side.
  document.addEventListener('click',async function(e){
    const a=e.target.closest?.('a[href]'); if(!a) return;
    const href=a.getAttribute('href')||''; if(!/(^|\/)(profile|user-profile)(\.html)?([?#]|$)/i.test(href)) return;
    const u=await state.ready; if(!u) return;
    const m=href.match(/[?&](?:user|user_id|id|uid)=([^&#]+)/i); if(!m) return;
    const owner=decodeURIComponent(m[1]); if(owner===u.id) return;
    const ok=await call('can_discover_spike_profile',{p_viewer:u.id,p_owner:owner});
    if(ok===false){e.preventDefault();e.stopPropagation(); if(typeof window.showToast==='function') window.showToast('This profile is not available to you.'); else void window.SPIKEPremiumDialog.alert('This profile is not available to you.',{title:'Profile unavailable',kicker:'SPIKE NOTICE'});}
  },true);
})();
