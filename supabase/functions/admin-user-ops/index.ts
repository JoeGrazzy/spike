import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const clean=(v:unknown)=>String(v??"").trim();
export default {fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"POST required"},405);
  const callerId=ctx.userClaims?.id??ctx.jwtClaims?.sub;if(!callerId)return json({error:"Authentication required"},401);
  const {data:isSuper,error:roleError}=await ctx.supabase.rpc("admin_is_super_admin_self");
  if(roleError||isSuper!==true)return json({error:"Super admin access required"},403);
  let body:Record<string,unknown>;try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}
  const action=clean(body.action);
  if(action==="list_users"){
    const q=clean(body.query),perPage=Math.min(100,Math.max(1,Number(body.per_page)||100));
    const offset=Math.max(0,Number(body.offset)||0);
    const {data,error}=await ctx.supabase.rpc("admin_list_users_v2",{p_search:q,p_limit:perPage,p_offset:offset,p_filter:clean(body.filter)||"all"});
    if(error)return json({error:error.message,code:error.code||null,details:error.details||null,hint:error.hint||null},400);
    if(!Array.isArray(data))return json({error:"The admin_list_users_v2 RPC returned an unexpected response."},502);
    return json({ok:true,users:data.map((u:any)=>({id:u.user_id,user_id:u.user_id,email:u.email,display_name:u.display_name,username:u.username,sp_id:u.sp_id,coins:u.coins,created_at:u.created_at,room_count:u.room_count,is_admin:u.is_admin,status:u.status,banned_until:u.banned_until,banned_at:u.banned_at,banned_by:u.banned_by,ban_reason:u.ban_reason,last_seen_at:u.last_seen_at,providers:Array.isArray(u.providers)?u.providers:[],verified:u.verified===true,activated:u.activated!==false}))});
  }
  if(action==="user_detail"){
    const id=clean(body.user_id);if(!id)return json({error:"User is required"},400);
    const ur=await ctx.supabaseAdmin.auth.admin.getUserById(id);if(ur.error||!ur.data.user)return json({error:ur.error?.message||"User not found"},404);
    const {data:profile,error:profileError}=await ctx.supabase.rpc("admin_user_profile",{p_user_id:id});
    if(profileError)return json({error:profileError.message},400);
    const wallet=await ctx.supabaseAdmin.from("wallets").select("user_id,balance,updated_at").eq("user_id",id).maybeSingle();
    return json({ok:true,user:{auth:ur.data.user,profile,wallet:wallet.data||{balance:0},audit:Array.isArray((profile as any)?.activity)?(profile as any).activity:[]}});
  }
  if(action==="send_notification"){
    const id=clean(body.user_id),title=clean(body.title).slice(0,160),message=clean(body.message).slice(0,2000);
    if(!id||!title||!message)return json({error:"User, title and message are required"},400);
    const target=await ctx.supabaseAdmin.auth.admin.getUserById(id);
    if(target.error||!target.data.user)return json({error:"Target user not found"},404);
    const {data:notification,error}=await ctx.supabaseAdmin.from("notifications").insert({user_id:id,type:"admin_message",data:{title,message,source:"admin_console"},priority:"normal"}).select("id,user_id,created_at").single();
    if(error)return json({error:error.message},400);
    const audit=await ctx.supabaseAdmin.from("admin_audit").insert({actor_id:callerId,action:"admin_notification_sent",target_user_id:id,role:"super_admin",details:{notification_id:notification.id,title}});
    if(audit.error)return json({error:audit.error.message},400);
    return json({ok:true,notification});
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
