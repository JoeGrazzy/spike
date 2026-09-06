// @ts-check
/**
 * Unified SPIKE page-back controller.
 * @public
 */
(function(){
  'use strict';
  /** @type {string} */
  const FEED='feed.html';
  /** @type {Set<string>} */
  const ENTRY=new Set(['index.html','feed.html']);

  /** @returns {string} */
  function currentPage(){
    return (location.pathname.split('/').pop()||'index.html').toLowerCase();
  }

  /** @returns {boolean} */
  function safeSameOriginReferrer(){
    try{
      const ref=document.referrer?new URL(document.referrer,location.href):null;
      if(!ref||ref.origin!==location.origin)return false;
      const previous=(ref.pathname.split('/').pop()||'').toLowerCase();
      return Boolean(previous&&previous!==currentPage()&&!ENTRY.has(previous));
    }catch(_){return false}
  }

  /**
   * Navigate to the previous safe SPIKE page.
   * @param {HTMLElement} button
   * @returns {void}
   */
  function goBack(button){
    if(safeSameOriginReferrer()&&history.length>1){history.back();return}
    location.assign(button.dataset.backFallback||FEED);
  }

  /** @returns {void} */
  function bind(){
    const page=currentPage();
    if(ENTRY.has(page)){
      document.querySelectorAll('[data-spike-premium-back]').forEach(el=>el.remove());
      return;
    }
    /** @type {HTMLElement[]} */
    const buttons=[...document.querySelectorAll('[data-spike-premium-back]')].filter(
      (el)=>el instanceof HTMLElement
    );
    buttons.slice(1).forEach(el=>el.remove());
    const button=buttons[0];
    if(!button)return;
    button.dataset.spikeBackBound='1';
    button.type='button';
    button.setAttribute('aria-label',button.getAttribute('aria-label')||'Go back to the previous SPIKE page');
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      goBack(button);
    },{capture:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  window.SPIKEPremiumBack=Object.freeze({goBack});
})();
