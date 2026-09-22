
(function(){
  function boot(){
    const c=document.getElementById('spikeComposer'), t=document.getElementById('signalText');
    if(!c||!t||c.dataset.studioV5)return; c.dataset.studioV5='1';
    const tools=c.querySelector('.signal-tools'), creators=c.querySelector('.signal-creator-row');
    if(!tools)return;
    const rail=document.createElement('div'); rail.id='spikeSignalStudioRail';
    rail.innerHTML='<button type="button" class="studio-chip" data-studio="add">＋ Add</button><button type="button" class="studio-chip" data-studio="refine">✦ Refine</button><button type="button" class="studio-chip" data-studio="later">◷ Later</button><button type="button" class="studio-chip" data-studio="more">More</button><span class="studio-state">Signal <strong>forming</strong></span>';
    tools.parentNode.insertBefore(rail,tools);
    const more=document.createElement('div'); more.id='spikeSignalStudioMore';
    if(creators){
      const ai=creators.querySelector('#composeAiBtn'), draft=creators.querySelector('#saveDraftBtn'), center=creators.querySelector('#contentCenterBtn');
      if(ai) more.appendChild(ai); if(draft) more.appendChild(draft); if(center) more.appendChild(center);
    }
    const add=tools.querySelector('#imageBtn'), clip=tools.querySelector('#videoBtn'), link=tools.querySelector('#linkBtn'), later=tools.querySelector('#scheduleBtn'), story=tools.querySelector('#storyBtn');
    [add,clip,link,later,story].forEach(x=>{if(x)more.appendChild(x)});
    rail.after(more);
    const state=()=>{
      const hasText=!!t.value.trim(), hasMedia=!!c.querySelector('.media-studio:not([hidden]) img, .media-studio:not([hidden]) video, #mediaPreview img, #mediaPreview video');
      c.dataset.signalState=hasMedia?'media':hasText?'writing':'empty';
      const st=rail.querySelector('.studio-state strong'); if(st)st.textContent=hasMedia?'media attached':hasText?'forming':'forming';
    };
    rail.addEventListener('click',e=>{
      const b=e.target.closest('[data-studio]'); if(!b)return; const a=b.dataset.studio;
      if(a==='add'){more.classList.add('open'); [add,clip,link].forEach(x=>x&&x.classList.remove('is-hidden'));}
      if(a==='refine'){document.getElementById('composeAiBtn')?.click();}
      if(a==='later'){document.getElementById('scheduleBtn')?.click();}
      if(a==='more')more.classList.toggle('open');
    });
    t.addEventListener('input',state); document.addEventListener('click',()=>{setTimeout(state,0)});
    state();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot); else boot();
})();
