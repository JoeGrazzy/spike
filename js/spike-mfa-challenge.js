import { supabase } from './spike-supabase-client.js';
import { safeAuthDestination } from './spike-mfa.js';
const form=document.getElementById('mfaForm'),code=document.getElementById('code'),button=document.getElementById('verify'),status=document.getElementById('status');
const params=new URLSearchParams(location.search);let next=safeAuthDestination(params.get('next')||'feed.html');let recoveryMode=false;
const withTimeout=(promise,ms,message)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=window.setTimeout(()=>reject(new Error(message)),ms)})]).finally(()=>window.clearTimeout(timer))};
const recoveryToggle=document.getElementById('recoveryMode');recoveryToggle?.addEventListener('click',()=>{recoveryMode=!recoveryMode;code.value='';code.inputMode=recoveryMode?'text':'numeric';code.autocomplete=recoveryMode?'off':'one-time-code';code.removeAttribute('pattern');code.maxLength=recoveryMode?40:6;code.minLength=recoveryMode?8:6;document.querySelector('label[for=code]').textContent=recoveryMode?'Recovery code':'Authenticator code';recoveryToggle.textContent=recoveryMode?'Use authenticator code instead':'Use a recovery code instead';});
if(!/^(feed|profile|friends|followers|following|messages|message|notifications|rooms|room|wallet|referrals|settings|admin|spike-tools|user-profile)\.html(?:\?.*)?$/.test(next)) next='feed.html';
function say(message,error=true){status.textContent=message;status.style.color=error?'#ffb6b6':'#a7f3d0'}
form?.addEventListener('submit',async e=>{e.preventDefault();const value=code.value.trim();if(recoveryMode?!/^[A-Za-z0-9-]{8,40}$/.test(value):!/^\d{6}$/.test(value))return say(recoveryMode?'Enter a valid recovery code.':'Enter the 6-digit code from your authenticator.');button.disabled=true;button.textContent='Verifying…';try{if(recoveryMode){const recovered=await withTimeout(supabase.auth.mfa.recoveryCodes.verify({code:value}),12000,'Recovery-code verification timed out. Check your connection and try again.');if(recovered.error)throw recovered.error;location.replace(next);return;}const {data,error}=await withTimeout(supabase.auth.mfa.listFactors(),12000,'Could not load your authenticator. Check your connection and try again.');if(error)throw error;const factors=(data?.totp||[]).filter(f=>f.status==='verified');if(!factors.length)throw new Error('No verified authenticator factor was found. Contact support before retrying.');let lastError;for(const factor of factors){const challenge=await withTimeout(supabase.auth.mfa.challenge({factorId:factor.id}),12000,'Authenticator challenge timed out. Please try again.');if(challenge.error){lastError=challenge.error;continue}const result=await withTimeout(supabase.auth.mfa.verify({factorId:factor.id,challengeId:challenge.data.id,code:value}),12000,'Authenticator verification timed out. Check your connection and try again.');if(!result.error){location.replace(next);return}lastError=result.error}throw lastError||new Error('The code could not be verified.');}catch(err){say(err.message||'Verification failed. Try again.');button.disabled=false;button.textContent='Verify and continue';}});
document.getElementById('signout')?.addEventListener('click',e=>{
  e.preventDefault();
  let overlay=document.getElementById('logoutConfirmOverlay');
  if(!overlay){
    overlay=document.createElement('div');overlay.id='logoutConfirmOverlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,5,12,.86);backdrop-filter:blur(20px)';
    overlay.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="logoutTitle" style="width:min(370px,100%);padding:26px;border:1px solid #34405c;border-radius:24px;text-align:center;background:linear-gradient(145deg,#171a2b,#090b15);color:#fff;box-shadow:0 30px 100px #0009"><div style="font-size:28px;margin-bottom:12px">↪</div><h2 id="logoutTitle">Leave SPIKE?</h2><p style="color:#b5c0d7;line-height:1.5">Your secure session will end on this device. You can return anytime.</p><div style="display:flex;gap:10px"><button id="logoutCancel" type="button" style="background:#34415f;color:white">Stay</button><button id="logoutYes" type="button">Log out</button></div></section>';
    document.body.append(overlay);
  }
  overlay.classList.add('show');overlay.setAttribute('aria-hidden','false');
  const cancel=overlay.querySelector('#logoutCancel');
  const confirm=overlay.querySelector('#logoutYes');
  cancel?.addEventListener('click',()=>{overlay.remove();});
  confirm?.addEventListener('click',async()=>{
    confirm.disabled=true;confirm.textContent='Signing out…';
    try{const {error}=await withTimeout(supabase.auth.signOut({scope:'local'}),10000,'Sign-out timed out. Check your connection and try again.');if(error)throw error;location.replace(new URL('index.html?signed_out=1',location.href).href);}
    catch(err){say(err.message||'Could not sign out. Please try again.');confirm.disabled=false;confirm.textContent='Log out';}
  },{once:true});
});
