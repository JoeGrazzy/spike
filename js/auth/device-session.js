(function(){
  "use strict";
  if (/\/index\.html$/i.test(location.pathname) || /\/reset-password\.html$/i.test(location.pathname)) return;
  const cfg=window.SPIKE_CONFIG||window.SPIKE_SUPABASE_CONFIG||{};
  const URL=cfg.supabaseUrl||cfg.url||"https://cjqpyndceqyqsijihxbb.supabase.co";
  const KEY=cfg.supabaseKey||cfg.anonKey||"sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw";
  if(!window.supabase?.createClient) return;
  let db;
  try{db=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})}catch{return}
  const key="spike_device_id_v1";
  function deviceId(){try{let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id)}return id}catch{return crypto.randomUUID()}}
  let busy=false;
  async function verify(){
    if(busy) return; busy=true;
    try{
      const {data:{session}}=await db.auth.getSession();
      if(!session?.user) return;
      const id=deviceId();
      const {data,error}=await db.rpc("spike_device_session_status",{p_device_id:id});
      if(error) return;
      if(data?.has_other_device){
        await db.auth.signOut({scope:"local"}).catch(()=>{});
        try{sessionStorage.setItem("spike_device_message","Your account was signed in on another device, so this device has been logged out.")}catch{}
        location.replace("index.html?device=revoked");
        return;
      }
      if(data?.same_device){await db.rpc("spike_device_session_heartbeat",{p_device_id:id}).catch(()=>{})}
      else await db.rpc("spike_device_session_claim",{p_device_id:id}).catch(()=>{});
    }finally{busy=false}
  }
  db.auth.onAuthStateChange((event,session)=>{if(session?.user && (event==="SIGNED_IN"||event==="TOKEN_REFRESHED"||event==="INITIAL_SESSION")) queueMicrotask(verify)});
  verify();
  const timer=setInterval(verify,30000);
  addEventListener("pagehide",()=>clearInterval(timer),{once:true});
})();
