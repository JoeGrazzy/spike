(function(){
  'use strict';
  if(window.SPIKE_SURFACE_CONTROLS) return;

  var active = null;
  var root = null;
  var serial = 0;

  function esc(s){return String(s ?? '').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function ensureRoot(){
    if(root) return root;
    root=document.createElement('div');
    root.className='spike-surface-overlay';
    root.id='spike-surface-selection';
    root.setAttribute('aria-hidden','true');
    root.innerHTML='<div class="spike-surface-sheet" role="dialog" aria-modal="true" aria-label="SPIKE selection"><div class="spike-surface-grip"></div><div class="spike-surface-head"><div class="spike-surface-icon">✦</div><div class="spike-surface-title"><div class="spike-surface-kicker">SPIKE CHOICE</div><strong class="spike-surface-heading">Choose an option</strong></div><button class="spike-surface-close" type="button" aria-label="Close">×</button></div><div class="spike-surface-search"><input type="search" autocomplete="off" placeholder="Find an option…" aria-label="Find an option"></div><div class="spike-surface-list"></div><div class="spike-surface-actions" hidden><button class="spike-surface-action" type="button" data-surface-cancel>Cancel</button><button class="spike-surface-action primary" type="button" data-surface-apply>Apply</button></div></div>';
    document.body.appendChild(root);
    root.addEventListener('click',function(e){
      if(e.target===root) close();
      var btn=e.target.closest && e.target.closest('.spike-surface-option');
      if(btn && active) choose(btn.getAttribute('data-index'));
      if(e.target.closest && e.target.closest('.spike-surface-close')) close();
      if(e.target.closest && e.target.closest('[data-surface-cancel]')) close();
      if(e.target.closest && e.target.closest('[data-surface-apply]')) applyMulti();
    });
    var search=root.querySelector('.spike-surface-search input');
    search.addEventListener('input',function(){filterOptions(search.value)});
    return root;
  }
  function optionsFor(select){return Array.from(select.options||[]).map(function(o,i){return {index:i,value:o.value,label:o.textContent.trim()||o.value,disabled:o.disabled,selected:o.selected}})}
  function close(){
    if(!active || !root) return;
    var a=active; active=null;
    root.classList.remove('open'); root.setAttribute('aria-hidden','true');
    document.body.classList.remove('spike-surface-open');
    if(a.trigger) a.trigger.setAttribute('aria-expanded','false');
    document.removeEventListener('keydown',a.keyHandler,true);
    if(a.restoreFocus && document.contains(a.restoreFocus)) a.restoreFocus.focus({preventScroll:true});
  }
  function choose(index){
    if(!active) return;
    var a=active, i=Number(index); if(!Number.isInteger(i) || !a.options[i] || a.options[i].disabled) return;
    if(a.select.multiple){
      a.select.options[i].selected=!a.select.options[i].selected;
      render(a);
      return;
    }
    a.select.selectedIndex=i;
    a.select.dispatchEvent(new Event('input',{bubbles:true}));
    a.select.dispatchEvent(new Event('change',{bubbles:true}));
    close();
    updateTrigger(a.select);
  }
  function applyMulti(){
    if(!active) return;
    active.select.dispatchEvent(new Event('input',{bubbles:true}));
    active.select.dispatchEvent(new Event('change',{bubbles:true}));
    var select=active.select; close(); updateTrigger(select);
  }
  function filterOptions(query){
    if(!active) return;
    var q=String(query||'').trim().toLowerCase();
    root.querySelectorAll('.spike-surface-option').forEach(function(btn){
      var o=active.options[Number(btn.getAttribute('data-index'))];
      btn.hidden=!!q && !((o.label+' '+o.value).toLowerCase().includes(q));
    });
  }
  function render(a){
    var list=root.querySelector('.spike-surface-list');
    list.innerHTML='';
    var selectedCount=0;
    a.options.forEach(function(o){
      if(o.disabled) return;
      if(a.select.multiple && a.select.options[o.index].selected) selectedCount++;
      var btn=document.createElement('button');
      btn.type='button'; btn.className='spike-surface-option'+((a.select.multiple?a.select.options[o.index].selected:o.index===a.select.selectedIndex)?' active':'');
      btn.setAttribute('data-index',String(o.index));
      btn.innerHTML='<span class="spike-surface-radio" aria-hidden="true"></span><span class="spike-surface-option-main"><span class="spike-surface-option-label">'+esc(o.label)+'</span>'+((o.value && o.value!==o.label)?'<span class="spike-surface-option-value">'+esc(o.value)+'</span>':'')+'</span>';
      list.appendChild(btn);
    });
    if(!list.children.length) list.innerHTML='<div class="spike-surface-empty">No matching options.</div>';
    var actions=root.querySelector('.spike-surface-actions'); actions.hidden=!a.select.multiple;
    var search=root.querySelector('.spike-surface-search'); search.classList.toggle('visible',a.options.filter(function(o){return !o.disabled}).length>6);
    if(a.select.multiple){var apply=root.querySelector('[data-surface-apply]');apply.textContent='Apply'+(selectedCount?' · '+selectedCount:'');}
  }
  function open(select){
    if(!select || select.disabled || select.hidden || select.multiple && select.size>1) return;
    var r=ensureRoot();
    if(active) close();
    var trigger=select.nextElementSibling && select.nextElementSibling.classList.contains('spike-control-select-trigger') ? select.nextElementSibling : null;
    var a=active={select:select,trigger:trigger,options:optionsFor(select),restoreFocus:trigger||select};
    r.querySelector('.spike-surface-heading').textContent=select.getAttribute('data-spike-title')||select.closest('.field,.spike-gf-field,.translator-toolbar')?.querySelector('label')?.textContent?.trim()||'Choose an option';
    r.querySelector('.spike-surface-search input').value='';
    render(a); r.classList.add('open'); r.setAttribute('aria-hidden','false'); document.body.classList.add('spike-surface-open');
    if(trigger) trigger.setAttribute('aria-expanded','true');
    a.keyHandler=function(e){if(e.key==='Escape'){e.preventDefault();close()}else if(e.key==='Tab' && e.shiftKey===false && e.target===root.querySelector('.spike-surface-close')){/* normal tab */}};
    document.addEventListener('keydown',a.keyHandler,true);
    var s=r.querySelector('.spike-surface-search'); if(s.classList.contains('visible')) setTimeout(function(){s.querySelector('input').focus()},30); else setTimeout(function(){r.querySelector('.spike-surface-option.active')?.scrollIntoView({block:'nearest'})},20);
  }
  function labelFor(select){
    if(select.multiple){return Array.from(select.selectedOptions||[]).map(function(o){return o.textContent.trim()}).filter(Boolean).join(', ')||'Choose options';}
    return select.selectedOptions && select.selectedOptions[0] ? select.selectedOptions[0].textContent.trim() : 'Choose an option';
  }
  function updateTrigger(select){
    if(!select) return;
    var t=select.nextElementSibling && select.nextElementSibling.classList.contains('spike-control-select-trigger') ? select.nextElementSibling : null;
    if(!t) return;
    var label=t.querySelector('.spike-select-label'); if(label) label.textContent=labelFor(select);
    t.setAttribute('aria-label',labelFor(select));
  }
  function enhance(select){
    if(!(select instanceof HTMLSelectElement) || select.dataset.spikeSurfaceReady==='1' || select.multiple && select.size>1) return;
    select.dataset.spikeSurfaceReady='1';
    if(select.hasAttribute('tabindex')) select.dataset.spikeOriginalTabindex=select.getAttribute('tabindex');
    select.setAttribute('tabindex','-1');
    select.classList.add('spike-control-select-native');
    if(!select.id) select.id='spike-select-'+(++serial);
    var trigger=document.createElement('button'); trigger.type='button'; trigger.className='spike-control-select-trigger'; trigger.setAttribute('aria-haspopup','dialog'); trigger.setAttribute('aria-expanded','false'); trigger.setAttribute('aria-controls','spike-surface-selection');
    trigger.innerHTML='<span class="spike-select-label"></span><span class="spike-select-chevron" aria-hidden="true">⌄</span>';
    select.insertAdjacentElement('afterend',trigger); updateTrigger(select);
    trigger.addEventListener('click',function(e){e.preventDefault();open(select)});
    trigger.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '||e.key==='ArrowDown'){e.preventDefault();open(select)}});
    select.addEventListener('change',function(){updateTrigger(select)});
  }
  function enhanceAll(rootNode){
    (rootNode.querySelectorAll?rootNode.querySelectorAll('select'):[]).forEach(enhance);
    if(rootNode.matches && rootNode.matches('select')) enhance(rootNode);
  }
  var observer=null, observing=false;
  document.addEventListener('click',function(e){
    var label=e.target.closest && e.target.closest('label[for]');
    if(!label) return;
    var select=document.getElementById(label.htmlFor);
    if(select && select.dataset.spikeSurfaceReady==='1'){e.preventDefault(); open(select);}
  },true);
  function start(){
    if(!document.body) return;
    ensureRoot(); enhanceAll(document);
    if(window.MutationObserver){
      observer=new MutationObserver(function(records){
        if(observing) return;
        observing=true;
        records.forEach(function(record){record.addedNodes&&record.addedNodes.forEach(function(n){if(n.nodeType===1) enhanceAll(n)})});
        observing=false;
      });
      observer.observe(document.body,{childList:true,subtree:true});
    }
  }
  window.SPIKE_SURFACE_CONTROLS={open:open,close:close,refresh:function(){enhanceAll(document)}};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
