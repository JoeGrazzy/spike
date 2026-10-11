/* Story interaction reliability bridge.
 * Story creation must remain usable even if the authenticated Feed boot is
 * delayed or another Feed runtime fails before bindEvents(). The existing
 * Story publish/upload implementation remains authoritative; this layer only
 * guarantees the user-visible open/close/input tap path.
 */
(function(){
  'use strict';
  if (window.__SPIKE_STORY_INTERACTION_BRIDGE__) return;
  window.__SPIKE_STORY_INTERACTION_BRIDGE__ = true;

  function byId(id){ return document.getElementById(id); }
  function openStory(){
    const overlay=byId('storyOverlay');
    if(!overlay) return false;
    overlay.classList.add('open');
    overlay.removeAttribute('hidden');
    if(location.hash!=='#storyOverlay') history.replaceState(null,'','#storyOverlay');
    overlay.setAttribute('aria-hidden','false');
    const firstAction=byId('storyMediaBtn');
    window.setTimeout(()=>firstAction?.focus({preventScroll:true}),40);
    return true;
  }
  function closeStory(){
    const overlay=byId('storyOverlay');
    if(!overlay) return false;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden','true');
    if(location.hash==='#storyOverlay') history.replaceState(null,'',location.pathname+location.search);
    return true;
  }
  function matches(target, selector){ return target?.closest?.(selector); }

  document.addEventListener('click', function(e){
    const create=matches(e.target, '#storySectionCreate, #storyBtn, .story-create-tile, [data-studio="story"]');
    if(create){
      const opened=openStory();
      if(opened) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if(matches(e.target, '#cancelStory')){
      e.preventDefault();
      e.stopPropagation();
      closeStory();
      return;
    }
    if(matches(e.target, '#storyMediaBtn')){
      e.preventDefault();
      e.stopPropagation();
      byId('storyMediaInput')?.click();
      return;
    }
    if(matches(e.target, '#storyAudioBtn')){
      e.preventDefault();
      e.stopPropagation();
      byId('storyAudioInput')?.click();
      return;
    }
    if(matches(e.target, '#publishStory')){
      e.preventDefault();
      e.stopPropagation();
      if(typeof window.publishStory === 'function') window.publishStory();
      return;
    }
    if(e.target===byId('storyOverlay')){
      closeStory();
    }
  }, true);

  window.addEventListener('hashchange', function(){
    const overlay=byId('storyOverlay');
    if(!overlay) return;
    if(location.hash==='#storyOverlay'){
      overlay.classList.add('open');
      overlay.removeAttribute('hidden');
      overlay.setAttribute('aria-hidden','false');
    } else {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
    }
  });

  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && byId('storyOverlay')?.classList.contains('open')){
      e.preventDefault();
      closeStory();
    }
  }, true);
})();
