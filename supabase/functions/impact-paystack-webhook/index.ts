import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
Deno.serve(async req=>{
 if(req.method!=="POST") return json({error:"POST required"},405);
 const secret=Deno.env.get("PAYSTACK_SECRET_KEY"),url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(!secret||!url||!service)return json({error:"Webhook not configured"},503);
 const raw=await req.text(),signature=req.headers.get("x-paystack-signature")||"";
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-512"},false,["sign"]); const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw))); const expected=[...digest].map(b=>b.toString(16).padStart(2,"0")).join("");
 if(!signature||signature.length!==expected.length||![...signature].every((c,i)=>c===expected[i])) return json({error:"Invalid signature"},401);
 let event:any;try{event=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400)}; if(event.event!=="charge.success")return json({received:true,ignored:true});
 const reference=String(event.data?.reference||""); if(!reference.startsWith("SPIKEIMPACT_"))return json({received:true,ignored:true});
 const verify=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{headers:{Authorization:`Bearer ${secret}`} }); let v:any;try{v=await verify.json()}catch{return json({error:"Verification response invalid"},502)};
 if(!verify.ok||!v.status||v.data?.status!=="success"||v.data?.reference!==reference)return json({error:"Transaction not verified"},400);
 const meta=v.data?.metadata||{};if(meta.spike_product!=="impact")return json({error:"Wrong product metadata"},400);
 const db=createClient(url,service);const {data,error}=await db.rpc("spike_impact_payment_confirm",{p_reference:reference,p_verified_amount_kobo:Number(v.data.amount),p_currency:String(v.data.currency||""),p_note:"Verified against Paystack transaction API"});
 if(error)return json({error:"Could not reconcile donation"},500);if(data?.status==="mismatch")return json({error:"Amount or currency mismatch; flagged for review"},400);
 return json({received:true,verified:true,duplicate:data?.duplicate===true});
});
