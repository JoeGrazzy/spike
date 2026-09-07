/* SPIKE Mobile Safe Area v1
   Classifies top chrome after layout so original sticky/fixed offsets survive
   while Android display-cutout space is added automatically. */
(()=>{
  'use strict';
  const SELECTOR='.header,.top,.topbar,.chathead,.fm-head,.rm-head,.chat-head,.messages-page-header,.rooms-v2-header,.spike-help-header,.tabs,.chatRoomHeader,.channelBar,.room-chat .toolbar,.chat .toolbar';
  const readPx=(v,fallback=0)=>{const n=parseFloat(v);return Number.isFinite(n)?n:fallback};
  const envTop=()=>{
    try{
      const probe=document.createElement('div');
      probe.setAttribute('aria-hidden','true');
      probe.style.cssText='position:absolute;visibility:hidden;pointer-events:none;top:0;left:0;width:0;height:0;padding-top:env(safe-area-inset-top,0px)';
      document.documentElement.appendChild(probe);
      const n=readPx(getComputedStyle(probe).paddingTop,0);
      probe.remove();
      return n;
    }catch(_){return 0;}
  };
  const apply=()=>{
    const root=document.documentElement;
    const native=envTop();
    root.style.setProperty('--spike-native-safe-top',`${native}px`);
    document.querySelectorAll(SELECTOR).forEach(el=>{
      const cs=getComputedStyle(el);
      const pos=cs.position;
      const top=readPx(cs.top,0);
      const padTop=readPx(cs.paddingTop,0);
      el.style.setProperty('--spike-original-top',`${top}px`);
      el.style.setProperty('--spike-original-padding-top',`${padTop}px`);
      el.classList.remove('spike-safe-sticky','spike-safe-flow-header');
      if(pos==='sticky'||pos==='fixed') el.classList.add('spike-safe-sticky');
      else {
        el.style.setProperty('--spike-flow-padding-top',`${padTop}px`);
        el.classList.add('spike-safe-flow-header');
      }
    });
  };
  const run=()=>requestAnimationFrame(()=>requestAnimationFrame(apply));
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run,{once:true}); else run();
  window.addEventListener('resize',run,{passive:true});
  window.visualViewport?.addEventListener('resize',run,{passive:true});
  window.visualViewport?.addEventListener('scroll',run,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(run,80),{passive:true});
  window.SPIKE_MOBILE_SAFE_AREA={refresh:apply};
})();
