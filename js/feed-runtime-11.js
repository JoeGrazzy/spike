
(function(){
  let guardTimer=null;
  let composerObserver=null;
  let bodyObserver=null;

  function get(){
    return {
      composer:document.getElementById('spikeComposer'),
      nav:document.getElementById('spikeBottomNav')
    };
  }

  function sync(){
    const {composer,nav}=get();
    if(!composer) return;
    const active=composer.classList.contains('spike-expanded');
    document.body.classList.toggle('spike-composer-active',active);
    if(nav){
      nav.classList.toggle('spike-composer-nav-hidden',active);
      if(active){
        nav.style.setProperty('display','none','important');
        nav.style.setProperty('visibility','hidden','important');
        nav.style.setProperty('pointer-events','none','important');
      }else{
        nav.style.removeProperty('display');
        nav.style.removeProperty('visibility');
        nav.style.removeProperty('pointer-events');
      }
    }
    if(active && !guardTimer){
      guardTimer=setInterval(()=>{
        const {composer:c,nav:n}=get();
        if(!c || !c.classList.contains('spike-expanded')){
          clearInterval(guardTimer); guardTimer=null; sync(); return;
        }
        if(n){
          n.classList.add('spike-composer-nav-hidden');
          n.style.setProperty('display','none','important');
          n.style.setProperty('visibility','hidden','important');
          n.style.setProperty('pointer-events','none','important');
        }
      },250);
    }
  }

  function boot(){
    const composer=document.getElementById('spikeComposer');
    if(!composer) return;
    sync();
    composerObserver=new MutationObserver(sync);
    composerObserver.observe(composer,{attributes:true,attributeFilter:['class']});
    bodyObserver=new MutationObserver(sync);
    bodyObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['id','class']});
    document.addEventListener('focusin',e=>{ if(e.target.closest('#spikeComposer')) sync(); },true);
    document.addEventListener('focusout',()=>setTimeout(sync,40),true);
    window.addEventListener('resize',sync,{passive:true});
    window.addEventListener('scroll',sync,{passive:true});
    document.addEventListener('visibilitychange',sync);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
