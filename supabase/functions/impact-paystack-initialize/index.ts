import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async req=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return reply({error:"POST required"},405);
 const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), secret=Deno.env.get("PAYSTACK_SECRET_KEY"), callbackUrl=Deno.env.get("IMPACT_CALLBACK_URL");
 if(!url||!anon||!service||!secret||!callbackUrl) return reply({error:"Impact payment service is not configured. No payment was started."},503);
 const auth=req.headers.get("Authorization"); if(!auth) return reply({error:"Sign in to donate"},401);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}}); const {data:{user},error:userErr}=await userClient.auth.getUser(); if(userErr||!user) return reply({error:"Invalid session"},401);
 let body:any; try{body=await req.json()}catch{return reply({error:"Invalid request"},400)}
 const campaignId=String(body.campaign_id||""); const amount=Number(body.amount); if(!/^[0-9a-f-]{36}$/i.test(campaignId)||!Number.isFinite(amount)||amount<100||amount>100000000||Math.round(amount*100)!==amount*100) return reply({error:"Enter a valid campaign and NGN amount (₦100 minimum)"},400);
 const {data:campaign,error:campaignErr}=await userClient.rpc("spike_impact_campaigns_list"); if(campaignErr) return reply({error:"Could not validate campaign"},400); const item=Array.isArray(campaign)?campaign.find((c:any)=>c.id===campaignId):null; if(!item||item.help_type!=="money") return reply({error:"Money campaign is unavailable"},404);
 const {data:profile}=await userClient.from("profiles").select("email,display_name").eq("id",user.id).maybeSingle(); const reference=`SPIKEIMPACT_${crypto.randomUUID().replaceAll("-","")}`;
 const init=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify({email:user.email||profile?.email,amount:Math.round(amount*100),currency:"NGN",reference,callback_url:callbackUrl,metadata:{spike_product:"impact",campaign_id:campaignId,donor_id:user.id,platform_fee_kobo:Math.round(amount*10),custom_fields:[{display_name:"SPIKE Impact campaign",variable_name:"campaign_id",value:campaignId}]}})});
 let payload:any;try{payload=await init.json()}catch{return reply({error:"Payment provider returned an unreadable response"},502)}
 if(!init.ok||!payload.status||!payload.data?.authorization_url||!payload.data?.access_code) return reply({error:payload.message||"Could not initialize payment"},502);
 const {data:prepared,error:prepErr}=await userClient.rpc("spike_impact_payment_prepare",{p_campaign_id:campaignId,p_amount:amount,p_reference:reference,p_access_code:payload.data.access_code});
 if(prepErr||!prepared?.ok) return reply({error:"Could not record donation securely; payment was not opened. Contact support if Paystack created a transaction."},500);
 return reply({ok:true,authorization_url:payload.data.authorization_url,reference,donation_id:prepared.donation_id,fee:Math.round(amount*10)/100,net:Math.round(amount*90)/100});
});
