
(function(){
  function boot(){
    const trigger=document.getElementById('spikeSmartNavBtn');
    const panel=document.getElementById('spikeSmartNav');
    const close=document.getElementById('spikeSmartNavClose');
    const composer=document.getElementById('spikeComposer');
    if(!trigger||!panel)return;
    const setOpen=(open)=>{
      if(composer?.classList.contains('spike-expanded')) open=false;
      panel.hidden=!open; panel.setAttribute('aria-hidden',String(!open)); trigger.setAttribute('aria-expanded',String(open));
    };
    trigger.addEventListener('click',()=>setOpen(panel.hidden));
    close?.addEventListener('click',()=>setOpen(false));
    panel.addEventListener('click',e=>{
      const item=e.target.closest('[data-smart-nav]'); if(!item)return;
      const key=item.getAttribute('data-smart-nav');
      const legacy=document.querySelector(`#spikeBottomNav [data-spike-nav="${CSS.escape(key)}"]`);
      if(legacy){legacy.click();setOpen(false);}
    });
    document.addEventListener('click',e=>{
      if(panel.hidden)return;
      if(!panel.contains(e.target)&&!trigger.contains(e.target))setOpen(false);
    },true);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false);});
    const sync=()=>{if(composer?.classList.contains('spike-expanded'))setOpen(false);};
    composer&&new MutationObserver(sync).observe(composer,{attributes:true,attributeFilter:['class']});
    window.addEventListener('resize',sync,{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
