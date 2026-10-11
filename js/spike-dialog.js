/* SPIKE Premium Dialog System — shared, native-dialog-free interaction layer. */
(function(){
  'use strict';
  if(window.SPIKEPremiumDialog)return;
  let active=null;
  const esc=s=>String(s??'');
  function ensure(){
    let root=document.getElementById('spikePremiumDialogRoot');
    if(root)return root;
    const style=document.createElement('style');
    style.id='spike-premium-dialog-style';
    style.textContent=`
#spikePremiumDialogRoot{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(2,4,10,.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
#spikePremiumDialogRoot.open{display:flex}
.spike-dialog-card{width:min(520px,100%);border:1px solid color-mix(in srgb,var(--spike-accent,#54e6d2) 38%,transparent);border-radius:24px;padding:24px;background:linear-gradient(145deg,color-mix(in srgb,var(--spike-surface,#0d2028) 94%,transparent),color-mix(in srgb,var(--spike-bg,#07131a) 94%,transparent));box-shadow:0 30px 100px rgba(0,0,0,.48),0 0 45px color-mix(in srgb,var(--spike-accent,#54e6d2) 12%,transparent);color:var(--spike-text,#f4fbff)}
.spike-dialog-kicker{font-size:10px;letter-spacing:.22em;font-weight:900;color:var(--spike-accent,#54e6d2);text-transform:uppercase;margin-bottom:8px}.spike-dialog-title{font-size:24px;font-weight:900;line-height:1.1}.spike-dialog-message{margin-top:10px;color:var(--spike-muted,#9cb5bf);white-space:pre-wrap;line-height:1.55}.spike-dialog-input{width:100%;min-height:120px;resize:vertical;margin-top:16px;padding:13px 14px;border-radius:16px;border:1px solid var(--spike-line,rgba(148,230,255,.16));background:color-mix(in srgb,var(--spike-bg,#07131a) 78%,transparent);color:var(--spike-text,#f4fbff);font:inherit;outline:none}.spike-dialog-input:focus{border-color:var(--spike-accent,#54e6d2);box-shadow:0 0 0 3px color-mix(in srgb,var(--spike-accent,#54e6d2) 14%,transparent)}.spike-dialog-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}.spike-dialog-btn{min-width:110px;padding:11px 16px;border-radius:14px;border:1px solid var(--spike-line,rgba(148,230,255,.16));background:color-mix(in srgb,var(--spike-surface-2,#122a34) 85%,transparent);color:var(--spike-text,#f4fbff);font:inherit;font-weight:850;cursor:pointer}.spike-dialog-btn.primary{border-color:color-mix(in srgb,var(--spike-accent,#54e6d2) 48%,transparent);background:linear-gradient(135deg,var(--btn-primary,#54e6d2),var(--btn-primary-2,#7c8cff));color:#fff}.spike-dialog-btn.danger{background:linear-gradient(135deg,var(--btn-danger,#ef4444),#991b1b);color:#fff}.spike-dialog-btn:hover{filter:brightness(1.08);transform:translateY(-1px)}.spike-dialog-btn:active{transform:translateY(0)}
@media(max-width:520px){#spikePremiumDialogRoot{padding:12px}.spike-dialog-card{padding:20px;border-radius:20px}.spike-dialog-actions{flex-direction:column-reverse}.spike-dialog-btn{width:100%}}
`;
    (document.head||document.documentElement).appendChild(style);
    root=document.createElement('div');root.id='spikePremiumDialogRoot';root.setAttribute('aria-hidden','true');
    (document.body||document.documentElement).appendChild(root);return root;
  }
  function close(value){
    if(!active)return;const a=active;active=null;const root=ensure();root.classList.remove('open');root.setAttribute('aria-hidden','true');document.body?.classList.remove('spike-dialog-open');document.removeEventListener('keydown',a.key);if(a.cleanup)a.cleanup();a.resolve(value);
  }
  function open(opts={}){
    if(active)close(null);
    const root=ensure(),type=opts.type||'confirm';
    root.innerHTML='';
    const card=document.createElement('section');card.className='spike-dialog-card';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');
    const kicker=document.createElement('div');kicker.className='spike-dialog-kicker';kicker.textContent=esc(opts.kicker||'SPIKE ACTION');
    const title=document.createElement('div');title.className='spike-dialog-title';title.textContent=esc(opts.title||'SPIKE action');
    const msg=document.createElement('div');msg.className='spike-dialog-message';msg.textContent=esc(opts.message||'');
    card.append(kicker,title,msg);
    let input=null;
    if(type==='input'){input=document.createElement('textarea');input.className='spike-dialog-input';input.maxLength=Number(opts.maxLength)||10000;input.placeholder=esc(opts.placeholder||'Write your response…');input.value=esc(opts.value||'');card.append(input)}
    const actions=document.createElement('div');actions.className='spike-dialog-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='spike-dialog-btn';cancel.textContent=esc(opts.cancelText||'Cancel');
    const primary=document.createElement('button');primary.type='button';primary.className='spike-dialog-btn primary'+(opts.danger?' danger':'');primary.textContent=esc(opts.confirmText||'Continue');
    if(type==='alert'){cancel.style.display='none';primary.textContent=esc(opts.confirmText||'Done')}
    actions.append(cancel,primary);card.append(actions);root.appendChild(card);root.classList.add('open');root.setAttribute('aria-hidden','false');document.body?.classList.add('spike-dialog-open');
    const key=e=>{if(e.key==='Escape'){e.preventDefault();close(type==='input'?null:false)}};
    const backdrop=e=>{if(e.target===root)close(type==='input'?null:false)};
    const promise=new Promise(resolve=>{active={resolve,key,cleanup:()=>root.removeEventListener('click',backdrop)};});
    document.addEventListener('keydown',key);root.addEventListener('click',backdrop);cancel.onclick=()=>close(type==='input'?null:false);primary.onclick=()=>close(type==='input'?(input?.value??''):true);
    requestAnimationFrame(()=>{(type==='input'?input:primary)?.focus()});
    return promise;
  }
  window.SPIKEPremiumDialog=Object.freeze({
    alert(message,opts={}){return open({type:'alert',title:opts.title||'SPIKE notice',message,confirmText:opts.confirmText||'Got it',kicker:opts.kicker||'SPIKE NOTICE'});},
    confirm(opts={}){if(typeof opts==='string')opts={message:opts};return open({type:'confirm',...opts});},
    input(opts={}){if(typeof opts==='string')opts={message:opts};return open({type:'input',...opts});},
    close(){close(null)}
  });
})();
