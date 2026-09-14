import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
export default {fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST") return json({error:"POST required"},405);
 const callerId=ctx.userClaims?.sub; if(!callerId)return json({error:"Authentication required"},401);
 const {data:isSuper,error:roleError}=await ctx.supabase.rpc("is_super_admin",{p_user_id:callerId});
 if(roleError||isSuper!==true)return json({error:"Super admin access required"},403);
 let body:Record<string,unknown>; try{body=await req.json()}catch{return json({error:"Invalid JSON body"},400)}
 const email=String(body.email??"").trim().toLowerCase(),password=String(body.password??""),displayName=String(body.display_name??"").trim(),username=String(body.username??"").trim(),autoConfirm=body.auto_confirm===true;
 if(!/^\S+@\S+\.\S+$/.test(email))return json({error:"Enter a valid email address"},400);
 if(password.length<8)return json({error:"Password must be at least 8 characters"},400);
 if(displayName.length>100)return json({error:"Display name is too long"},400);
 if(username&&!/^[a-zA-Z0-9._-]{3,30}$/.test(username))return json({error:"Username must be 3–30 characters using letters, numbers, dot, underscore or hyphen"},400);
 const {data,error}=await ctx.supabaseAdmin.auth.admin.createUser({email,password,email_confirm:autoConfirm,user_metadata:{...(displayName?{display_name:displayName,full_name:displayName}:{}),...(username?{username}:{})}});
 if(error)return json({error:error.message},400); if(!data.user)return json({error:"User creation returned no account"},500);
 const {data:profile}=await ctx.supabaseAdmin.from("profiles").select("id,email,display_name,username,sp_id,activated,role").eq("id",data.user.id).maybeSingle();
 return json({ok:true,user:{id:data.user.id,email:data.user.email,display_name:profile?.display_name??displayName,username:profile?.username??username,sp_id:profile?.sp_id??null,activated:profile?.activated??false,role:profile?.role??"user",email_confirmed:!!data.user.email_confirmed_at}});
})};
