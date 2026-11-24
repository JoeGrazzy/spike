/* SPIKE SPATIAL EXPERIENCE v2 — feature-specific dimensional polish.
   Decorative rendering only: no synthetic metrics, network calls, or changes to feature actions. */
(() => {
  'use strict';
  const body = document.body;
  if (!body || body.dataset.spikeSpatialV2 === 'ready') return;
  body.dataset.spikeSpatialV2 = 'ready';
  const svg = `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <defs><linearGradient id="spx-g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a8f6ff"/><stop offset=".48" stop-color="#4bdcff"/><stop offset="1" stop-color="#8c7cff"/></linearGradient><radialGradient id="spx-core"><stop stop-color="#b7faff" stop-opacity=".65"/><stop offset=".42" stop-color="#36a9ff" stop-opacity=".22"/><stop offset="1" stop-color="#07182b" stop-opacity="0"/></radialGradient></defs>
    <circle cx="50" cy="50" r="42" fill="url(#spx-core)" class="spx-pulse"/>
    <g fill="none" stroke="url(#spx-g)" stroke-width=".65" opacity=".8"><circle cx="50" cy="50" r="39" stroke-dasharray="2 4"/><circle cx="50" cy="50" r="31" opacity=".65"/><path d="M50 5v12M50 83v12M5 50h12M83 50h12"/></g>
    <g class="spx-spin" fill="none" stroke="#62e8ff" stroke-width="1.1" opacity=".8"><ellipse cx="50" cy="50" rx="43" ry="16" transform="rotate(-34 50 50)"/><path d="M12 50h10m56 0h10" stroke-dasharray="2 3"/></g>
    <g class="spx-counter" fill="none" stroke="#9c8bff" stroke-width="1" opacity=".75"><ellipse cx="50" cy="50" rx="18" ry="43" transform="rotate(38 50 50)"/><path d="M50 14l3 5-3 5-3-5zM50 76l3 5-3 5-3-5z" fill="#9c8bff"/></g>
    <circle cx="50" cy="50" r="5.2" fill="#b8faff" opacity=".9"/><circle cx="50" cy="50" r="10" fill="none" stroke="#69eaff" stroke-opacity=".7"/>
    <circle cx="16" cy="31" r="1.8" fill="#9c8bff"/><circle cx="81" cy="70" r="1.6" fill="#63e6ff"/>
  </svg>`;
  const addMark = (target, label) => {
    if (!target || target.querySelector(':scope > .spx-spatial-mark')) return;
    const mark = document.createElement('div');
    mark.className = 'spx-spatial-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.dataset.spxLabel = label;
    mark.innerHTML = svg;
    target.append(mark);
  };
  const page = body.dataset.spikePage || '';
  if (page === 'feed') addMark(document.querySelector('#feedV2Hub .spike-discover-head'), 'DISCOVERY');
  if (page === 'wallet') addMark(document.querySelector('.wallet-balance-card'), 'WALLET CORE');

  const canTilt = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches &&
    !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!canTilt) return;
  const targets = [...document.querySelectorAll('.sc-hero,.wallet-balance-card,#feedV2Hub .spike-discover-head')];
  targets.forEach(el => {
    el.classList.add('spx-depth-ready');
    let frame = 0;
    const move = event => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX-r.left)/r.width));
        const y = Math.max(0, Math.min(1, (event.clientY-r.top)/r.height));
        const rx = (0.5-y)*2.1, ry = (x-0.5)*2.8;
        el.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
        el.style.setProperty('--spx-light-x', `${x*100}%`);
        el.style.setProperty('--spx-light-y', `${y*100}%`);
      });
    };
    const reset = () => { if(frame) cancelAnimationFrame(frame); el.style.transform=''; el.style.setProperty('--spx-light-x','78%'); el.style.setProperty('--spx-light-y','22%'); };
    el.addEventListener('pointermove', move, {passive:true});
    el.addEventListener('pointerleave', reset, {passive:true});
    el.addEventListener('pointercancel', reset, {passive:true});
  });
})();
