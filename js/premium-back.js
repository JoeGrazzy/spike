// @ts-check
/**
 * Unified SPIKE page-back controller.
 * Uses only a verified same-origin referrer; otherwise uses the page's
 * explicit, same-origin fallback. Contextual links (Room -> Rooms, Message
 * -> Inbox, etc.) remain ordinary links and are intentionally untouched.
 */
(function(){
  'use strict';
  const FEED='feed.html';
  const ENTRY=new Set(['index.html']);
  const SELECTOR='[data-spike-premium-back]';

  function currentPage(){
    return (location.pathname.split('/').pop()||'index.html').toLowerCase();
  }

  function safeReferrer(){
    try{
      if(!document.referrer)return null;
      const ref=new URL(document.referrer);
      if(ref.origin!==location.origin)return null;
      const previous=(ref.pathname.split('/').pop()||'').toLowerCase();
      if(!previous||previous===currentPage()||ENTRY.has(previous))return null;
      return ref;
    }catch(_){return null;}
  }

  function safeFallback(button){
    const requested=String(button.dataset.backFallback||FEED).trim()||FEED;
    try{
      const fallback=new URL(requested,location.href);
      if(fallback.origin!==location.origin)return new URL(FEED,location.href);
      const page=(fallback.pathname.split('/').pop()||'').toLowerCase();
      if(!page||page===currentPage())return new URL(FEED,location.href);
      return fallback;
    }catch(_){return new URL(FEED,location.href);}
  }

  function goBack(button){
    if(!button||button.dataset.spikeNavigating==='1')return;
    button.dataset.spikeNavigating='1';
    const ref=safeReferrer();
    if(ref&&history.length>1){history.back();return;}
    location.assign(safeFallback(button).href);
  }

  function bind(){
    const page=currentPage();
    const buttons=[...document.querySelectorAll(SELECTOR)].filter(el=>el instanceof HTMLElement);
    if(ENTRY.has(page)){
      buttons.forEach(el=>el.remove());
      return;
    }
    // A page must expose exactly one global back control. Modal and nested
    // view close/back controls do not use this attribute and remain intact.
    buttons.slice(1).forEach(el=>el.remove());
    const button=buttons[0];
    if(!button||button.dataset.spikeBackBound==='1')return;
    button.dataset.spikeBackBound='1';
    if(button instanceof HTMLButtonElement)button.type='button';
    button.setAttribute('aria-label',button.getAttribute('aria-label')||'Go back to the previous SPIKE page');
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      goBack(button);
    },{capture:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
  window.SPIKEPremiumBack=Object.freeze({goBack});
})();
