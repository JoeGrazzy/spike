/* SPIKE Premium Dialogs — replaces native browser alert/confirm/prompt UI. */
(function(){
  if(window.SPIKE_PREMIUM_DIALOGS) return;
  const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  let root, card, activeResolve, previousOverflow='';
  function ensure(){
    if(root) return;
    root=document.createElement('div'); root.className='spike-dialog-root'; root.setAttribute('aria-hidden','true');
    root.innerHTML='<div class="spike-dialog-backdrop" data-dialog-dismiss></div><section class="spike-dialog-card" role="dialog" aria-modal="true" aria-labelledby="spikeDialogTitle"><button class="spike-dialog-close" type="button" aria-label="Close" data-dialog-cancel>×</button><div id="spikeDialogIcon" class="spike-dialog-icon">✦</div><div class="spike-dialog-kicker">SPIKE PREMIUM</div><h2 id="spikeDialogTitle"></h2><p id="spikeDialogMessage"></p><div id="spikeDialogBody"></div><div class="spike-dialog-actions"><button type="button" class="spike-dialog-btn ghost" data-dialog-cancel>Cancel</button><button type="button" class="spike-dialog-btn primary" data-dialog-ok>Continue</button></div></section>';
    document.body.appendChild(root); card=root.querySelector('.spike-dialog-card');
    root.addEventListener('click',e=>{ if(e.target.matches('[data-dialog-dismiss],[data-dialog-cancel]')) finish(false,null); });
    root.querySelector('[data-dialog-ok]').addEventListener('click',()=>{ const input=root.querySelector('.spike-dialog-input'); finish(true,input?input.value:null); });
    document.addEventListener('keydown',e=>{ if(root.classList.contains('open') && e.key==='Escape') finish(false,null); });
  }
  function open(cfg){
    ensure(); previousOverflow=document.body.style.overflow; document.body.style.overflow='hidden';
    root.classList.add('open'); root.setAttribute('aria-hidden','false');
    root.dataset.danger=cfg.danger?'true':'false';
    root.querySelector('#spikeDialogIcon').textContent=cfg.icon || (cfg.danger?'⚠':'✦');
    root.querySelector('#spikeDialogTitle').textContent=cfg.title || 'Confirm action';
    root.querySelector('#spikeDialogMessage').textContent=cfg.message || cfg.sub || '';
    root.querySelector('#spikeDialogBody').innerHTML=cfg.input ? '<label class="spike-dialog-label">'+esc(cfg.label||'Reason')+'</label><textarea class="spike-dialog-input" maxlength="'+Number(cfg.maxLength||1000)+'" placeholder="'+esc(cfg.placeholder||'Type here…')+'"></textarea>' : '';
    root.querySelector('[data-dialog-ok]').textContent=cfg.okText || cfg.confirmText || 'Continue';
    root.querySelectorAll('[data-dialog-cancel]').forEach(x=>x.textContent=cfg.cancelText||'Cancel');
    requestAnimationFrame(()=>{ const x=root.querySelector('.spike-dialog-input'); if(x)x.focus(); else root.querySelector('[data-dialog-ok]').focus(); });
  }
  function finish(ok,value){ if(!root||!root.classList.contains('open')) return; root.classList.remove('open'); root.setAttribute('aria-hidden','true'); root.removeAttribute('data-danger'); document.body.style.overflow=previousOverflow; const r=activeResolve; activeResolve=null; if(r)r({confirmed:!!ok,value:value}); }
  function confirm(cfg,message,okText){
    if(typeof cfg==='string') cfg={title:cfg,message:message,okText:okText};
    return new Promise(resolve=>{activeResolve=resolve;open(Object.assign({title:'Confirm action',message:'Are you sure?',okText:'Continue',cancelText:'Cancel'},cfg||{}));}).then(r=>r.confirmed);
  }
  function prompt(cfg,defaultValue){
    if(typeof cfg==='string') cfg={title:cfg,message:'',label:'Your response',placeholder:'Type here…',value:defaultValue||''};
    return new Promise(resolve=>{activeResolve=resolve;open(Object.assign({title:'Your input',message:'',label:'Response',okText:'Save',cancelText:'Cancel',input:true},cfg||{}));}).then(r=>r.confirmed?r.value:null);
  }
  function alert(message,cfg){ return new Promise(resolve=>{activeResolve=resolve;open(Object.assign({title:'SPIKE',message:String(message||''),okText:'Got it',cancelText:'Close'},cfg||{}));}).then(()=>undefined); }
  window.SPIKE_PREMIUM_DIALOGS=true;
  window.spikePremiumConfirm=confirm;
  window.spikePremiumPrompt=prompt;
  window.spikePremiumAlert=alert;
  window.premiumConfirm=window.premiumConfirm||confirm;
  window.premiumPrompt=window.premiumPrompt||prompt;
})();
