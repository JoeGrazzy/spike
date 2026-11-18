// Authenticated call lifecycle endpoint. Uses user-scoped RPCs for all state changes
// and a server-only service key to broadcast to the other participant's private inbox.
import { createClient } from "npm:@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS", "Content-Type":"application/json" };
const json = (body:Record<string,unknown>,status=200) => new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return json({error:"Method not allowed"},405);
 const authorization=req.headers.get("Authorization");
 if(!authorization?.startsWith("Bearer ")) return json({error:"Sign in to Spike first."},401);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!serviceKey) return json({error:"Calling service configuration is incomplete."},503);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await userClient.auth.getUser(authorization.slice(7));
 if(authError||!authData.user) return json({error:"Your Spike session is invalid or expired."},401);
 let body:{action?:unknown;callee_id?:unknown;call_id?:unknown;call_type?:unknown};
 try{body=await req.json()}catch{return json({error:"Request body must be valid JSON."},400)}
 const action=typeof body.action==="string"?body.action:"";
 const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 let call:Record<string,unknown>|null=null;
 if(action==="start"){
  if(typeof body.callee_id!=="string"||!/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(body.callee_id)||!["voice","video"].includes(String(body.call_type))) return json({error:"A valid recipient and call type are required."},400);
  const {data,error}=await userClient.rpc("spike_create_call",{p_callee_id:body.callee_id,p_call_type:body.call_type});
  if(error||!data) return json({error:error?.message||"Could not start this call."},400); call=data as Record<string,unknown>;
 }else if(["accept","reject","cancel","end"].includes(action)){
  if(typeof body.call_id!=="string"||!/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(body.call_id)) return json({error:"A valid call_id is required."},400);
  const {data,error}=await userClient.rpc("spike_respond_to_call",{p_call_id:body.call_id,p_action:action});
  if(error||!data) return json({error:error?.message||"Could not update this call."},400); call=data as Record<string,unknown>;
 }else return json({error:"Unsupported call action."},400);
 const callerId=String(call.caller_id||""),calleeId=String(call.recipient_id||"");
 const payload={call_id:call.id,caller_id:callerId,callee_id:calleeId,call_type:call.call_type,status:call.status,ringing_expires_at:call.ringing_expires_at};
 const event=action==="start"?"call_invite":action==="accept"?"call_accepted":action==="reject"?"call_rejected":action==="cancel"?"call_cancelled":"call_ended";
 const other=authData.user.id===callerId?calleeId:callerId;
 if(other){const channel=service.channel(`user:${other}:calls`,{config:{private:true}});const sent=await channel.send({type:"broadcast",event,payload});await service.removeChannel(channel);if(sent!=="ok") console.warn("[spike-call-control] broadcast result:",sent);}
 return json({call:{...call,callee_id:calleeId}});
});
