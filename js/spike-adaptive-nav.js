/* SPIKE Adaptive Navigation v4 — visible-first, event/poll driven, no self-observing mutations. */
(function(){
  'use strict';
  if(window.__SPIKE_ADAPTIVE_NAV_V4__) return;
  window.__SPIKE_ADAPTIVE_NAV_V4__ = true;

  function boot(){
    const root=document.documentElement;
    const body=document.body;
    if(!body) return;
    const nav=document.querySelector('#spikeBottomNav, .spike-bottom-nav, nav.bottom-nav');
    if(!nav) return;

    const isMobile=()=>window.matchMedia('(max-width:760px)').matches;
    const state={scrollHidden:false,contextHidden:false,keyboard:false,lastScroll:window.scrollY||0,startedAt:Date.now()};
    let lastContext=false;

    function apply(){
      const hidden=isMobile() && (state.scrollHidden || state.contextHidden || state.keyboard);
      nav.dataset.spikeAdaptive='1';
      nav.dataset.spikeNavState=hidden?'hidden':'visible';
      nav.setAttribute('aria-hidden',hidden?'true':'false');
      nav.classList.toggle('spike-nav-auto-hidden',hidden);
      body.classList.toggle('spike-nav-context-hidden',hidden);
      root.style.setProperty('--spike-nav-active-clearance',hidden?'0px':root.style.getPropertyValue('--spike-nav-clearance')||'82px');
    }

    function measure(){
      const h=Math.max(58,Math.ceil(nav.getBoundingClientRect().height||62));
      root.style.setProperty('--spike-nav-height',h+'px');
      root.style.setProperty('--spike-nav-clearance',(h+18)+'px');
      body.classList.toggle('spike-nav-flow-safe',isMobile() && !body.classList.contains('chat-open-mode'));
      apply();
    }

    function contextOpen(){
      return body.classList.contains('chat-open-mode') ||
        !!document.querySelector('.layout.chat-open, .chat-open-mode .chat') ||
        !!document.querySelector('.spike-menu-overlay.open, .spike-menu-overlay[aria-hidden="false"]') ||
        !!document.querySelector('.spike-premium-overlay.open, .spike-premium-overlay[aria-hidden="false"]') ||
        !!document.querySelector('#spikePassOverlay.open, #spikePassOverlay[aria-hidden="false"]') ||
        !!document.querySelector('#logoutConfirmOverlay.show, #logoutConfirmOverlay[aria-hidden="false"]') ||
        !!document.querySelector('#contentCenterOverlay.open, #contentCenterOverlay[aria-hidden="false"]') ||
        !!document.querySelector('#spikeMediaLongpress.open, #spikeMediaLongpress[aria-hidden="false"]') ||
        !!document.querySelector('#spikeProfileSheet.show, #spikeProfileSheet[aria-hidden="false"]') ||
        !!document.querySelector('#feedImageViewer.open, #feedImageViewer[aria-hidden="false"]') ||
        !!document.querySelector('#spikeAiSearchOverlay.open, #spikeAiSearchOverlay[aria-hidden="false"]') ||
        !!document.querySelector('#storyViewer.open, #storyViewer[aria-hidden="false"]');
    }

    function contextCheck(){
      if(state.keyboard) return;
      const open=contextOpen();
      if(open!==lastContext){
        lastContext=open;
        state.contextHidden=open;
        apply();
      }
    }

    function keyboardCheck(){
      if(!window.visualViewport){ state.keyboard=false; return contextCheck(); }
      const vv=window.visualViewport;
      const delta=Math.max(0,window.innerHeight-vv.height);
      const a=document.activeElement;
      const editing=!!a && !!a.matches && a.matches('input,textarea,select,[contenteditable="true"]');
      const next=delta>120 && editing;
      if(next!==state.keyboard){
        state.keyboard=next;
        apply();
      }
      if(!next) contextCheck();
    }

    function onScroll(){
      if(!isMobile() || state.contextHidden || state.keyboard) return;
      const now=Date.now();
      if(now-state.startedAt<1200) return;
      const current=window.scrollY||document.documentElement.scrollTop||body.scrollTop||0;
      const delta=current-state.lastScroll;
      state.lastScroll=current;
      if(Math.abs(delta)<14) return;
      if(current<=20 || delta<0){ state.scrollHidden=false; apply(); return; }
      if(delta>0 && current>80){ state.scrollHidden=true; apply(); }
    }

    function reveal(){ state.scrollHidden=false; if(!state.keyboard && !state.contextHidden) apply(); }

    // Visible-first: never start in a hidden state.
    state.scrollHidden=false;
    state.contextHidden=false;
    state.keyboard=false;
    nav.dataset.spikeAdaptive='1';
    nav.dataset.spikeNavState='visible';
    nav.setAttribute('aria-hidden','false');
    nav.classList.remove('spike-nav-auto-hidden');
    measure();

    window.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('resize',()=>{measure();keyboardCheck();contextCheck();},{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(()=>{reveal();measure();contextCheck();},180),{passive:true});
    document.addEventListener('focusin',()=>setTimeout(keyboardCheck,80),true);
    document.addEventListener('focusout',()=>setTimeout(keyboardCheck,160),true);
    document.addEventListener('click',()=>setTimeout(contextCheck,40),true);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')setTimeout(()=>{reveal();contextCheck();},80)},true);
    document.addEventListener('pointerdown',e=>{if(e.clientY>=window.innerHeight-110 && !state.keyboard && !state.contextHidden)reveal()},{passive:true});
    if(window.visualViewport){
      visualViewport.addEventListener('resize',keyboardCheck,{passive:true});
      visualViewport.addEventListener('scroll',keyboardCheck,{passive:true});
    }

    // Programmatic overlays are checked periodically instead of observing the
    // DOM we mutate. This eliminates mutation feedback loops completely.
    const contextTimer=window.setInterval(contextCheck,750);
    const measureTimer=window.setInterval(measure,2000);
    window.addEventListener('pagehide',()=>{clearInterval(contextTimer);clearInterval(measureTimer)},{once:true});

    setTimeout(()=>{if(!state.contextHidden&&!state.keyboard){state.scrollHidden=false;state.lastScroll=window.scrollY||0;apply()}},1300);
    setTimeout(()=>{contextCheck();measure()},1600);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
