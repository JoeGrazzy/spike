import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const clean=(v:unknown)=>String(v??"").trim();
export default {fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"POST required"},405);
  const callerId=ctx.userClaims?.sub;if(!callerId)return json({error:"Authentication required"},401);
  const {data:isSuper,error:roleError}=await ctx.supabase.rpc("admin_is_super_admin_self");
  if(roleError||isSuper!==true)return json({error:"Super admin access required"},403);
  let body:Record<string,unknown>;try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}
  const action=clean(body.action);
  if(action==="list_users"){
    const q=clean(body.query),perPage=Math.min(100,Math.max(1,Number(body.per_page)||100));
    let authPage=1; const authPopulation=await ctx.supabaseAdmin.auth.admin.listUsers({page:authPage,perPage:1000});
    if(authPopulation.error)return json({error:authPopulation.error.message},400);
    const profileProbe=await ctx.supabaseAdmin.from("profiles").select("id").limit(1);
    if(profileProbe.error)return json({error:profileProbe.error.message},400);
    const {data,error}=await ctx.supabase.rpc("admin_list_users_v2",{p_search:q,p_limit:perPage,p_offset:Math.max(0,Number(body.offset)||0),p_filter:clean(body.filter)||"all"});
    if(error)return json({error:error.message},400);
    const authIds=new Set((authPopulation.data.users||[]).map((u:any)=>u.id));
    return json({ok:true,users:(data||[]).filter((u:any)=>authIds.has(u.user_id)).map((u:any)=>({id:u.user_id,email:u.email,display_name:u.display_name,username:u.username,sp_id:u.sp_id,coins:u.coins,created_at:u.created_at,room_count:u.room_count,is_admin:u.is_admin,status:u.status,banned_until:u.banned_until,banned_at:u.banned_at,banned_by:u.banned_by,ban_reason:u.ban_reason,last_seen_at:u.last_seen_at,providers:u.providers||[],verified:u.verified,activated:u.activated}))});
  }
  if(action==="user_detail"){
    const id=clean(body.user_id);if(!id)return json({error:"User is required"},400);
    const ur=await ctx.supabaseAdmin.auth.admin.getUserById(id);if(ur.error||!ur.data.user)return json({error:ur.error?.message||"User not found"},404);
    const {data:profile,error:profileError}=await ctx.supabase.rpc("admin_user_profile",{p_user_id:id});
    if(profileError)return json({error:profileError.message},400);
    const {data:audit,error:auditError}=await ctx.supabase.rpc("admin_list_audit",{p_limit:500});
    if(auditError)return json({error:auditError.message},400);
    const authUser=ur.data.user;
    const wallet=await ctx.supabaseAdmin.from("wallets").select("user_id,balance,updated_at").eq("user_id",id).maybeSingle();
    return json({ok:true,user:{auth:authUser,profile,wallet:wallet.data||{balance:0},audit:(audit||[]).filter((a:any)=>a.target_user_id===id).slice(0,50)}});
  }
  if(action==="force_signout"){
    const id=clean(body.user_id);if(!id)return json({error:"User is required"},400);
    const r=await ctx.supabaseAdmin.auth.admin.signOut(id,"global");if(r.error)return json({error:r.error.message},400);
    const reason=clean(body.reason).slice(0,500);
    const audit=await ctx.supabaseAdmin.from("admin_audit").insert({actor_id:callerId,action:"force_signout",target_user_id:id,role:"super_admin",details:{scope:"global",reason:reason||null}});
    if(audit.error)return json({error:audit.error.message},400);
    return json({ok:true,user_id:id});
  }
  return json({error:"Unknown action"},400);
})};
