/* SPIKE spatial experience v3 — restrained pointer lighting; no data or action hooks */
(()=>{'use strict';
 const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const selectors=['[data-spike-page="messages"] .content>.hero:first-child','[data-spike-page="message"] .top','[data-spike-page="message"] .composer','[data-spike-page="profile"] .main>.card',];
 const surfaces=[...new Set(selectors.flatMap(s=>Array.from(document.querySelectorAll(s))))];
 surfaces.forEach(el=>{el.setAttribute('data-spike-spatial','surface');if(reduce)return;el.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;const r=el.getBoundingClientRect();const x=(e.clientX-r.left)/Math.max(r.width,1);const y=(e.clientY-r.top)/Math.max(r.height,1);el.style.setProperty('--spatial-x',(x*100).toFixed(1)+'%');el.style.setProperty('--spatial-y',(y*100).toFixed(1)+'%');},{passive:true});el.addEventListener('pointerleave',()=>{el.style.setProperty('--spatial-x','50%');el.style.setProperty('--spatial-y','0%');},{passive:true});});
})();
