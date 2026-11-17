import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const clean=(v:unknown)=>String(v??"").trim(),reason=(v:unknown)=>clean(v).slice(0,1000);
export default {fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"POST required"},405);
 const actor=ctx.userClaims?.id??ctx.jwtClaims?.sub;if(!actor)return json({error:"Authentication required"},401);
 // Verify the canonical Auth record, not editable user metadata or a browser-supplied email.
 const authRecord=await ctx.supabaseAdmin.auth.admin.getUserById(actor);
 if(authRecord.error||!authRecord.data.user)return json({error:"Authenticated account could not be verified"},401);
 const verifiedEmail=String(authRecord.data.user.email??"").trim().toLowerCase();
 if(verifiedEmail!=="eletexjoeytex@gmail.com")return json({error:"Dedicated Owner access required"},403);
 // The database check also requires this Auth user ID to match the active singleton owner record.
 const owner=await ctx.supabase.rpc("admin_owner_access_check");
 if(owner.error)return json({error:"Owner authorization check failed",detail:owner.error.message},500);
 if(owner.data!==true)return json({error:"Dedicated Owner access required"},403);
 let b:Record<string,unknown>;try{b=await req.json()}catch{return json({error:"Invalid JSON"},400)}const action=clean(b.action);
 async function target(id:string):Promise<any>{const a=await ctx.supabaseAdmin.auth.admin.getUserById(id);if(a.error||!a.data.user)return {error:a.error?.message||"User not found"};const d=await ctx.supabase.rpc("admin_user_management_bundle",{p_user_id:id});if(d.error)return {error:d.error.message};return {auth:a.data.user,bundle:d.data,profile:(d.data as any)?.profile||null};}
 const blocked=(id:string,p:any)=>!id?"User is required":id===actor?"You cannot act on your own account":(p?.role==="admin"||p?.role==="super_admin")?"Administrator accounts are protected":"";
 if(action==="list_users"){
  const q=clean(b.query),filter=clean(b.filter)||"all",n=Math.min(100,Math.max(1,Number(b.per_page)||50)),offset=Math.max(0,Number(b.offset)||0);
  const r=await ctx.supabase.rpc("admin_list_users_v2",{p_search:q,p_limit:n+1,p_offset:offset,p_filter:filter});if(r.error)return json({error:r.error.message},400);
  const rows=r.data||[];return json({ok:true,users:rows.slice(0,n).map((u:any)=>({id:u.user_id,user_id:u.user_id,email:u.email,display_name:u.display_name,username:u.username,sp_id:u.sp_id,coins:u.coins,created_at:u.created_at,is_admin:u.is_admin,status:u.status,banned_until:u.banned_until,banned_at:u.banned_at,ban_reason:u.ban_reason,last_seen_at:u.last_seen_at,providers:u.providers||[],verified:u.verified,activated:u.activated})),has_more:rows.length>n,offset,per_page:n});
 }
 if(action==="user_detail"){
  const id=clean(b.user_id);if(!id)return json({error:"User is required"},400);const t=await target(id);if(t.error)return json({error:t.error},404);
  const notes=await ctx.supabaseAdmin.from("spike_admin_user_notes").select("id,note,created_by,created_at").eq("user_id",id).order("created_at",{ascending:false});if(notes.error)return json({error:notes.error.message},400);
  const u=t.auth as any;return json({ok:true,user:{auth:{id:u.id,email:u.email,phone:u.phone,created_at:u.created_at,last_sign_in_at:u.last_sign_in_at,email_confirmed_at:u.email_confirmed_at,phone_confirmed_at:u.phone_confirmed_at,banned_until:u.banned_until,providers:u.app_metadata?.providers||[]},...t.bundle,notes:notes.data||[]}});
 }
 if(action==="add_note"){
  const id=clean(b.user_id),note=clean(b.note).slice(0,3000);if(!id||!note)return json({error:"User and note are required"},400);const t=await target(id);if(t.error)return json({error:t.error},404);
  const n=await ctx.supabaseAdmin.from("spike_admin_user_notes").insert({user_id:id,created_by:actor,note}).select("id,note,created_by,created_at").single();if(n.error)return json({error:n.error.message},400);
  const audit=await ctx.supabaseAdmin.from("admin_audit").insert({actor_id:actor,action:"user_admin_note_added",target_user_id:null,role:"super_admin",details:{target_user_id:id,note_id:n.data.id}});return json({ok:true,note:n.data,audit_warning:audit.error?.message||null});
 }
 if(action==="restrict_user"){
  const id=clean(b.user_id),days=Number(b.days),why=reason(b.reason);if(!Number.isInteger(days)||days<0||days>3650||!why)return json({error:"Choose a valid duration and provide a reason"},400);const t=await target(id);if(t.error)return json({error:t.error},404);const deny=blocked(id,t.profile);if(deny)return json({error:deny},403);
  const r=await ctx.supabase.rpc("admin_ban_user",{p_user_id:id,p_days:days,p_reason:why});if(r.error)return json({error:r.error.message},400);const so=await ctx.supabaseAdmin.auth.admin.signOut(id,"global");return json({ok:true,result:r.data,session_revocation_warning:so.error?.message||null});
 }
 if(action==="suspend_user"){
  const id=clean(b.user_id),why=reason(b.reason);if(!why)return json({error:"A suspension reason is required"},400);const t=await target(id);if(t.error)return json({error:t.error},404);const deny=blocked(id,t.profile);if(deny)return json({error:deny},403);
  const r=await ctx.supabase.rpc("admin_set_user_activation",{p_user_id:id,p_activated:false,p_reason:why});if(r.error)return json({error:r.error.message},400);const so=await ctx.supabaseAdmin.auth.admin.signOut(id,"global");return json({ok:true,result:r.data,session_revocation_warning:so.error?.message||null});
 }
 if(action==="reactivate_user"){
  const id=clean(b.user_id),t=await target(id);if(t.error)return json({error:t.error},404);const deny=blocked(id,t.profile);if(deny)return json({error:deny},403);
  const un=await ctx.supabase.rpc("admin_unrestrict_user",{p_user_id:id});if(un.error)return json({error:un.error.message},400);const ac=await ctx.supabase.rpc("admin_set_user_activation",{p_user_id:id,p_activated:true,p_reason:reason(b.reason)||"Reactivated by SPIKE owner"});if(ac.error)return json({error:ac.error.message},400);
  const so=await ctx.supabaseAdmin.auth.admin.signOut(id,"global");return json({ok:true,unrestricted:un.data,activation:ac.data,session_revocation_warning:so.error?.message||null});
 }
 if(action==="delete_preflight"){
  const id=clean(b.user_id),t=await target(id);if(t.error)return json({error:t.error},404);const deny=blocked(id,t.profile);if(deny)return json({error:deny},403);const p=await ctx.supabase.rpc("admin_user_delete_preflight",{p_user_id:id});if(p.error)return json({error:p.error.message},400);
  return json({ok:true,preflight:p.data,email:(t.auth as any).email,username:t.profile?.username||null});
 }
 if(action==="delete_user"){
  const id=clean(b.user_id),confirm=clean(b.confirmation),why=reason(b.reason);if(!id||!why)return json({error:"User and deletion reason are required"},400);const t=await target(id);if(t.error)return json({error:t.error},404);const deny=blocked(id,t.profile);if(deny)return json({error:deny},403);
  if(t.profile?.role!=="user")return json({error:"Only ordinary user accounts can be permanently deleted"},403);const email=clean((t.auth as any).email);if(!email||confirm.toLowerCase()!==("DELETE "+email).toLowerCase())return json({error:"Type DELETE followed by the exact account email to confirm"},400);
  const p=await ctx.supabase.rpc("admin_user_delete_preflight",{p_user_id:id});if(p.error)return json({error:p.error.message},400);if(!(p.data as any)?.allowed)return json({error:(p.data as any)?.message||"Deletion preflight did not pass",preflight:p.data},409);
  const audit=await ctx.supabaseAdmin.from("admin_audit").insert({actor_id:actor,action:"user_permanent_deletion_started",target_user_id:null,role:"super_admin",details:{target_user_id:id,target_email:email,reason:why,preflight:p.data,status:"started"}}).select("id").single();if(audit.error)return json({error:"Required audit record failed: "+audit.error.message},500);
  const so=await ctx.supabaseAdmin.auth.admin.signOut(id,"global");if(so.error){await ctx.supabaseAdmin.from("admin_audit").update({details:{target_user_id:id,target_email:email,reason:why,status:"failed_session_revocation",error:so.error.message}}).eq("id",audit.data.id);return json({error:"Sessions could not be revoked; account was not deleted: "+so.error.message},500)}
  const del=await ctx.supabaseAdmin.auth.admin.deleteUser(id);if(del.error){await ctx.supabaseAdmin.from("admin_audit").update({details:{target_user_id:id,target_email:email,reason:why,status:"failed_delete",error:del.error.message,preflight:p.data}}).eq("id",audit.data.id);return json({error:"Supabase did not complete deletion: "+del.error.message,preflight:p.data},409)}
  const upd=await ctx.supabaseAdmin.from("admin_audit").update({action:"user_permanently_deleted",details:{target_user_id:id,target_email:email,reason:why,status:"completed",preflight:p.data}}).eq("id",audit.data.id);return json({ok:true,deleted_user_id:id,audit_warning:upd.error?.message||null});
 }
 if(action==="send_notification"){
  const id=clean(b.user_id),title=clean(b.title).slice(0,160),message=clean(b.message).slice(0,2000);if(!id||!title||!message)return json({error:"User, title and message are required"},400);const t=await target(id);if(t.error)return json({error:t.error},404);
  const n=await ctx.supabaseAdmin.from("notifications").insert({user_id:id,type:"admin_message",data:{title,message,source:"admin_console"},priority:"normal"}).select("id,user_id,created_at").single();if(n.error)return json({error:n.error.message},400);
  const a=await ctx.supabaseAdmin.from("admin_audit").insert({actor_id:actor,action:"admin_notification_sent",target_user_id:id,role:"super_admin",details:{notification_id:n.data.id,title}});if(a.error)return json({error:a.error.message},400);return json({ok:true,notification:n.data});
 }
 if(action==="force_signout"){
  const id=clean(b.user_id);if(!id)return json({error:"User is required"},400);const t=await target(id);if(t.error)return json({error:t.error},404);const deny=blocked(id,t.profile);if(deny)return json({error:deny},403);
  const r=await ctx.supabaseAdmin.auth.admin.signOut(id,"global");if(r.error)return json({error:r.error.message},400);const a=await ctx.supabaseAdmin.from("admin_audit").insert({actor_id:actor,action:"force_signout",target_user_id:id,role:"super_admin",details:{scope:"global",reason:reason(b.reason)||null}});if(a.error)return json({error:a.error.message},400);return json({ok:true,user_id:id});
 }
 return json({error:"Unknown action"},400);
})};
