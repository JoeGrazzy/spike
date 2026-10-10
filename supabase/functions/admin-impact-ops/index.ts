import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});

export default { fetch: withSupabase({auth:"user"}, async (req,ctx)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({error:"POST required"},405);
  const callerId=ctx.userClaims?.sub;
  if(!callerId) return json({error:"Authentication required"},401);
  const {data:isSuper,error:roleError}=await ctx.supabase.rpc("is_super_admin",{p_user_id:callerId});
  if(roleError||isSuper!==true) return json({error:"Super admin access required"},403);
  let body:Record<string,unknown>; try{body=await req.json()}catch{return json({error:"Invalid JSON body"},400)}
  const action=String(body.action||"list_payouts");
  if(action==="list_payouts"){
    const status=String(body.status||"pending");
    const {data,error}=await ctx.supabaseAdmin.from("spike_impact_payout_requests").select("id,creator_id,amount_gross,platform_fee,payout_amount,currency,status,requested_at,processed_at,transfer_reference,review_note").eq("status",status).order("requested_at",{ascending:false}).limit(100);
    if(error)return json({error:error.message},400);
    const ids=(data||[]).map((x:any)=>x.creator_id).filter(Boolean);
    let profiles:any[]=[];
    if(ids.length){const r=await ctx.supabaseAdmin.from("profiles").select("id,display_name,username,sp_id,avatar_url").in("id",ids);profiles=r.data||[]}
    const byId=new Map(profiles.map((p:any)=>[p.id,p]));
    return json({ok:true,payouts:(data||[]).map((p:any)=>({...p,creator:byId.get(p.creator_id)||null}))});
  }
  if(action==="review_payout"){
    const id=String(body.payout_id||"").trim(),status=String(body.status||"").trim();
    const transferReference=String(body.transfer_reference||"").trim()||null;
    const note=String(body.note||"").trim()||null;
    if(!id||!status)return json({error:"Payout and status are required"},400);
    if(status==="paid"&&!transferReference)return json({error:"Transfer reference is required for paid payouts"},400);
    const {data,error}=await ctx.supabaseAdmin.rpc("spike_impact_payout_review",{p_payout_id:id,p_status:status,p_transfer_reference:transferReference,p_note:note});
    if(error)return json({error:error.message},400);
    return json({ok:true,result:data});
  }
  return json({error:"Unknown action"},400);
})};
