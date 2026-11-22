/* User-facing identity and withdrawal intake. All financial state changes are server RPCs. */
import { supabase } from './spike-supabase-client.js';
const $=id=>document.getElementById(id);
const set=(id,msg,error=false)=>{const n=$(id);if(n){n.textContent=msg;n.classList.toggle('error',error);}};
const money=v=>Number(v||0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2});
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
let user=null,available=0;
async function loadStatus(){
 const {data,error}=await supabase.rpc('spike_user_get_request_status');if(error)throw error;
 const host=$('creatorWithdrawalRequestStatus');if(host){host.replaceChildren();const rows=data?.withdrawals||[];host.append(node('strong',rows.length?'Withdrawal history':'No withdrawal requests yet'));rows.forEach(r=>host.append(node('p',`₦${money(r.amount_ngn)} · ${String(r.status).replaceAll('_',' ')} · ${new Date(r.created_at).toLocaleString()}${r.admin_note?' · '+r.admin_note:''}`)));}
 const identity=$('identityVerificationStatus');if(identity){identity.replaceChildren();const rows=data?.identity_verification||[];if(!rows.length)identity.textContent='No identity application submitted yet.';else rows.forEach(r=>identity.append(node('p',`${String(r.document_type).replaceAll('_',' ')} · ${String(r.status).replaceAll('_',' ')} · ${new Date(r.created_at).toLocaleString()}${r.admin_note?' · Reviewer note: '+r.admin_note:''}`)));}
 return data;
}
async function init(){
 const {data,error}=await supabase.auth.getUser();if(error)throw error;if(!data?.user)throw new Error('Sign in to submit identity or withdrawal requests.');user=data.user;
 const earnings=await supabase.rpc('spike_my_creator_earnings');if(earnings.error)throw earnings.error;available=Number(earnings.data?.available_ngn||0);
 const amount=$('creatorWithdrawAmount'),button=$('creatorWithdrawButton');if(amount)amount.value=available.toFixed(2);if(button)button.disabled=available<=0;
 set('creatorWithdrawalQuote',available>0?`Available to request: ₦${money(available)}. SPIKE accepts a withdrawal for the full available amount; it will be reserved until reviewed.`:'No available creator earnings to withdraw right now.');
 const requestData=await loadStatus();const identityRows=requestData?.identity_verification||[];const identityButton=$('identitySubmitButton');const hasPending=identityRows.some(r=>r.status==='pending_review');const isIdentityApproved=identityRows.some(r=>r.status==='approved');if(identityButton)identityButton.disabled=Boolean(isIdentityApproved||hasPending);if(isIdentityApproved)set('identityVerificationStatus','Your identity application has been approved. This is separate from your paid SPIKE Verified subscription.');else if(hasPending)set('identityVerificationStatus','Your identity application is already awaiting SPIKE review.');
}
$('identityVerificationForm')?.addEventListener('submit',async e=>{
 e.preventDefault();const button=$('identitySubmitButton'),file=$('identityDocumentFile')?.files?.[0];if(!file)return;
 if(!['image/jpeg','image/png','application/pdf'].includes(file.type)||file.size>10*1024*1024){set('identityVerificationStatus','Choose a JPG, PNG or PDF file no larger than 10 MB.',true);return;}
 button.disabled=true;set('identityVerificationStatus','Uploading your document securely…');let path=null,submittedOk=false;
 try{const ext=file.type==='application/pdf'?'pdf':file.type==='image/png'?'png':'jpg';path=`${user.id}/${crypto.randomUUID()}.${ext}`;const upload=await supabase.storage.from('identity-documents').upload(path,file,{contentType:file.type,upsert:false});if(upload.error)throw upload.error;
 const submitted=await supabase.rpc('spike_submit_identity_verification',{p_document_type:$('identityDocumentType').value,p_document_storage_path:path,p_applicant_note:$('identityApplicantNote').value.trim()||null});if(submitted.error)throw submitted.error;
 submittedOk=true;$('identityVerificationForm').reset();set('identityVerificationStatus','Application submitted successfully. SPIKE will review your document.');try{await loadStatus();}catch(refreshError){set('identityVerificationStatus',`Application submitted. Status refresh failed: ${refreshError.message||'Please refresh the page.'}`);}
 }catch(err){if(path&&!submittedOk)await supabase.storage.from('identity-documents').remove([path]).catch(()=>{});set('identityVerificationStatus',err.message||'Could not submit identity application.',true);}finally{button.disabled=submittedOk;}
});
$('creatorWithdrawForm')?.addEventListener('submit',async e=>{
 e.preventDefault();const button=$('creatorWithdrawButton');button.disabled=true;set('creatorWithdrawalRequestStatus','Submitting your secure payout request…');
 try{const payout={bank_name:$('withdrawBankName').value.trim(),account_name:$('withdrawAccountName').value.trim(),account_number:$('withdrawAccountNumber').value.trim()};const {error}=await supabase.rpc('spike_submit_withdrawal_request',{p_amount_ngn:available,p_payout_details:payout,p_user_note:$('withdrawUserNote').value.trim()||null});if(error)throw error;set('creatorWithdrawalRequestStatus','Withdrawal request submitted. Your earnings are reserved while SPIKE reviews the payout.');$('creatorWithdrawForm').reset();await init();}
 catch(err){set('creatorWithdrawalRequestStatus',err.message||'Could not submit withdrawal request.',true);button.disabled=available<=0;}
});
init().catch(e=>{set('identityVerificationStatus',e.message||'Identity service unavailable.',true);set('creatorWithdrawalRequestStatus',e.message||'Withdrawal service unavailable.',true);});
