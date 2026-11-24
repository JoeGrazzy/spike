
/* SPIKE Select Experience v1 */
(()=>{'use strict';
 const SELECTOR='select:not([data-native-select]):not([multiple])';
 let active=null,observer=null;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function labelFor(sel){const id=sel.id;let label=id?document.querySelector(`label[for="${CSS.escape(id)}"]`):null;if(!label)label=sel.closest('label');let t=label?.childNodes?Array.from(label.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim():'';return (t||sel.getAttribute('aria-label')||sel.name||'Choose an option').replace(/\s+/g,' ').trim()}
 function selectedText(sel){const o=sel.options[sel.selectedIndex];return o?o.textContent.trim():'Choose an option'}
 function makeShell(sel){
   if(sel.dataset.spikeSelectReady==='1'||!sel.parentNode)return;
   sel.dataset.spikeSelectReady='1';
   const shell=document.createElement('span');shell.className='spike-select-shell';shell.dataset.spikeSelectShell='1';
   sel.parentNode.insertBefore(shell,sel);shell.appendChild(sel);sel.classList.add('spike-select-native');
   const btn=document.createElement('button');btn.type='button';btn.className='spike-select-trigger';btn.setAttribute('aria-haspopup','listbox');btn.setAttribute('aria-expanded','false');
   const value=document.createElement('span');value.className='spike-select-value';const chevron=document.createElement('span');chevron.className='spike-select-chevron';chevron.setAttribute('aria-hidden','true');chevron.innerHTML='<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
   btn.append(value,chevron);shell.appendChild(btn);
   const overlay=document.createElement('div');overlay.className='spike-select-overlay';overlay.innerHTML='<section class="spike-select-panel" role="dialog" aria-modal="true"><header class="spike-select-heading"><div class="spike-select-heading-copy"><span class="spike-select-eyebrow">SPIKE SELECTION</span><strong class="spike-select-title"></strong></div><button type="button" class="spike-select-close" aria-label="Close options">×</button></header><div class="spike-select-options" role="listbox"></div></section>';
   document.body.appendChild(overlay);
   const title=overlay.querySelector('.spike-select-title'),list=overlay.querySelector('.spike-select-options'),close=overlay.querySelector('.spike-select-close');
   function refresh(){value.textContent=selectedText(sel)||'Choose an option';value.classList.toggle('spike-select-placeholder',!sel.value);btn.disabled=sel.disabled;btn.setAttribute('aria-label',`${labelFor(sel)}: ${value.textContent}`);btn.title=value.textContent}
   function renderOptions(){
     list.innerHTML='';let first=null;
     Array.from(sel.children).forEach(node=>{
       if(node.tagName==='OPTGROUP'){const h=document.createElement('div');h.className='spike-select-group';h.textContent=node.label;list.appendChild(h);Array.from(node.children).forEach(addOption)}
       else if(node.tagName==='OPTION')addOption(node);
     });
     function addOption(opt){
       const b=document.createElement('button');b.type='button';b.className='spike-select-option';b.setAttribute('role','option');b.dataset.value=opt.value;b.setAttribute('aria-selected',String(opt.selected));b.disabled=opt.disabled;
       const text=document.createElement('span');text.textContent=opt.textContent.trim();const check=document.createElement('span');check.className='spike-select-check';check.setAttribute('aria-hidden','true');check.textContent='✓';b.append(text,check);list.appendChild(b);if(opt.selected)first=b;
     }
     if(!first)first=list.querySelector('.spike-select-option:not(:disabled)');
   }
   function open(){if(sel.disabled)return; if(active&&active!==api)active.close();renderOptions();title.textContent=labelFor(sel);overlay.classList.add('is-open');btn.setAttribute('aria-expanded','true');document.body.dataset.spikeSelectOpen='1';active=api;const chosen=list.querySelector('[aria-selected="true"]')||list.querySelector('.spike-select-option:not(:disabled)');setTimeout(()=>chosen?.focus({preventScroll:true}),30)}
   function closeOverlay(){overlay.classList.remove('is-open');btn.setAttribute('aria-expanded','false');if(active===api)active=null;delete document.body.dataset.spikeSelectOpen}
   const api={close:closeOverlay};btn.addEventListener('click',open);close.addEventListener('click',()=>{closeOverlay();btn.focus()});overlay.addEventListener('click',e=>{if(e.target===overlay){closeOverlay();btn.focus()}});
   list.addEventListener('click',e=>{const opt=e.target.closest('.spike-select-option');if(!opt||opt.disabled)return;sel.value=opt.dataset.value;sel.dispatchEvent(new Event('input',{bubbles:true}));sel.dispatchEvent(new Event('change',{bubbles:true}));refresh();closeOverlay();btn.focus()});
   overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeOverlay();btn.focus();return}const options=[...list.querySelectorAll('.spike-select-option:not(:disabled)')],i=options.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const next=e.key==='ArrowDown'?Math.min(options.length-1,i+1):Math.max(0,i-1);options[next]?.focus()}if(e.key==='Home'){e.preventDefault();options[0]?.focus()}if(e.key==='End'){e.preventDefault();options.at(-1)?.focus()}});
   sel.addEventListener('change',refresh);sel.addEventListener('input',refresh);
   const optionObserver=new MutationObserver(()=>{refresh();if(overlay.classList.contains('is-open'))renderOptions()});optionObserver.observe(sel,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','label','value']});
   const form=sel.form;if(form)form.addEventListener('reset',()=>setTimeout(refresh,0));
   refresh();
 }
 function scan(root){if(root.nodeType===1&&root.matches?.(SELECTOR))makeShell(root);root.querySelectorAll?.(SELECTOR).forEach(makeShell)}
 function init(){scan(document);observer=new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1)scan(n)})));observer.observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active)active.close()});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
