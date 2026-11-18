// Issues short-lived Agora RTC publisher tokens only to authenticated call participants.
import { createClient } from "npm:@supabase/supabase-js@2";
import { RtcTokenBuilder, RtcRole } from "npm:agora-token@2.0.7";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
function agoraUid(userId:string){let hash=2166136261;for(let i=0;i<userId.length;i++){hash^=userId.charCodeAt(i);hash=Math.imul(hash,16777619)}return(hash>>>0)||1}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return json({error:"Method not allowed"},405);
 const authorization=req.headers.get("Authorization");if(!authorization?.startsWith("Bearer ")) return json({error:"A signed-in Spike session is required."},401);
 const supabaseUrl=Deno.env.get("SUPABASE_URL"),keysRaw=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");let publishableKey=Deno.env.get("SUPABASE_ANON_KEY");
 if(keysRaw){try{publishableKey=JSON.parse(keysRaw).default}catch{return json({error:"Supabase publishable-key configuration is invalid."},503)}}
 const appId=Deno.env.get("AGORA_APP_ID"),certificate=Deno.env.get("AGORA_APP_CERTIFICATE");
 if(!supabaseUrl||!publishableKey) return json({error:"Supabase function configuration is incomplete."},503);
 if(!appId||!certificate) return json({error:"Agora is not configured. Add AGORA_APP_ID and AGORA_APP_CERTIFICATE to Edge Function secrets."},503);
 let body:{call_id?:unknown};try{body=await req.json()}catch{return json({error:"Request body must be valid JSON."},400)}
 const callId=typeof body.call_id==="string"?body.call_id:"";if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(callId)) return json({error:"A valid call_id is required."},400);
 const supabase=createClient(supabaseUrl,publishableKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:userData,error:userError}=await supabase.auth.getUser(authorization.slice(7));if(userError||!userData.user) return json({error:"Your Spike session is invalid or expired."},401);
 const {data:call,error:callError}=await supabase.from("spike_calls").select("id,caller_id,recipient_id,room_name,call_type,status").eq("id",callId).maybeSingle();
 if(callError||!call) return json({error:"Call not found or you are not a participant."},404);
 if(call.caller_id!==userData.user.id&&call.recipient_id!==userData.user.id) return json({error:"You are not a participant in this call."},403);
 if(!["ringing","accepted","connected"].includes(call.status)) return json({error:"This call is no longer active."},409);
 try{const uid=agoraUid(userData.user.id),ttl=900;const rtcToken=RtcTokenBuilder.buildTokenWithUid(appId,certificate,call.room_name,uid,RtcRole.PUBLISHER,ttl,ttl);return json({app_id:appId,rtc_token:rtcToken,channel_name:call.room_name,uid,call_id:call.id,call_type:call.call_type,expires_in:ttl})}
 catch{return json({error:"Unable to issue an Agora RTC token."},500)}
});
