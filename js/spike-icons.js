/* SPIKE Semantic Icon System — centralized, accessible, teal-ready SVG icon vocabulary. */
(() => {
  'use strict';
  const paths = {
    flag:'<path d="M5 21V5m0 0c5-4 9 4 14 0v11c-5 4-9-4-14 0"/>',
    trash:'<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>',
    ban:'<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    archive:'<path d="M3 4h18v4H3zM5 8v12h14V8m-9 4h4"/>',
    phone:'<path d="M5 4h4l2 5-3 2a15 15 0 0 0 5 5l2-3 5 2v4c0 1-1 2-2 2C9 21 3 15 3 6c0-1 1-2 2-2Z"/>',
    video:'<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    pin:'<path d="m16 3 5 5-4 1-4 5-1 5-2-2-2-2-2-2 5-1 5-4zM4 20l6-6"/>',
    reply:'<path d="m9 7-5 5 5 5M4 12h10a6 6 0 0 1 6 6"/>',
    copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4m-6.6 8.4 6.6 4.4"/>',
    heart:'<path d="M20.8 8.8c0 5.2-8.8 10.2-8.8 10.2S3.2 14 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z"/>',
    x:'<path d="m18 6-12 12M6 6l12 12"/>', check:'<path d="m5 12 4 4L19 6"/>',
    file:'<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M13 3v7h7M8 14h8m-8 4h8"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-7a4 4 0 0 1 0 8m2 3a5 5 0 0 1 3 4v2"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    userPlus:'<path d="M15 21v-2a6 6 0 0 0-12 0v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11-6v6m-3-3h6"/>',
    message:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z"/>',
    comments:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 10h8m-8 4h5"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1z"/>',
    chevronRight:'<path d="m9 18 6-6-6-6"/>', arrowLeft:'<path d="m15 18-6-6 6-6M9 12h12"/>', arrowRight:'<path d="M3 12h18m-7-7 7 7-7 7"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"/>',
    microphone:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>', headphones:'<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 14h4v7H5a2 2 0 0 1-2-2zm18 0h-4v7h2a2 2 0 0 0 2-2z"/>',
    lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>', shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>', settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4L7.3 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2Z"/>',
    gift:'<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8H7a2.5 2.5 0 1 1 2.5-2.5V8Zm0 0h5a2.5 2.5 0 1 0-2.5-2.5V8Z"/>',
    coins:'<ellipse cx="9" cy="6" rx="6" ry="3"/><path d="M3 6v5c0 1.7 2.7 3 6 3s6-1.3 6-3V6M3 11v5c0 1.7 2.7 3 6 3 1 0 2-.1 2.8-.4M15 13c3.3 0 6 1.3 6 3s-2.7 3-6 3-6-1.3-6-3 2.7-3 6-3Zm6 3v4c0 1.7-2.7 3-6 3s-6-1.3-6-3v-4"/>',
    folder:'<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>', film:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4m-4 8h4m10-8h4m-4 8h4"/>',
    music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 6L8 16l2.5-6z"/>',
    sparkle:'<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/>',
    close:'<path d="m18 6-12 12M6 6l12 12"/>', stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>', plus:'<path d="M12 5v14m-7-7h14"/>',
    rotate:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"/>',
    bookmark:'<path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4z"/>', trendingUp:'<path d="m3 17 6-6 4 4 8-9m-6 0h6v6"/>', book:'<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 4v18m4-15h8m-8 4h8"/>', briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3m-13 5h18m-11 0v2h4v-2"/>', cpu:'<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/>', leaf:'<path d="M20 4c-8 0-14 3-14 10a6 6 0 0 0 6 6c7 0 8-8 8-16Z"/><path d="M4 22c2-6 6-10 12-13"/>', chart:'<path d="M4 19V5m0 14h17"/><rect x="7" y="11" width="3" height="6"/><rect x="13" y="7" width="3" height="10"/><rect x="19" y="3" width="2" height="14"/>', receipt:'<path d="M5 3h14v18l-3-2-4 2-4-2-3 2z"/><path d="M8 8h8m-8 4h8m-8 4h5"/>', scale:'<path d="M12 3v18m-7 0h14M5 6h14m-14 0-3 7h6zm14 0-3 7h6z"/><circle cx="12" cy="3" r="1"/>', palette:'<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.6-3.2 1.7 1.7 0 0 1 1.4-2.8H18a3 3 0 0 0 3-3c0-5-4-9-9-9Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="15" cy="8" r="1"/>'
  };
  const aliases = {report:'flag',delete:'trash',remove:'trash',block:'ban',call:'phone',voice:'phone',videoCall:'video',pinMessage:'pin',ai:'sparkle',notifications:'bell',profile:'user',friends:'users',chat:'message',logout:'arrowRight',theme:'sparkle',archiveChat:'archive'};
  const legacy = {
    'fa-flag':'flag','fa-trash':'trash','fa-trash-can':'trash','fa-ban':'ban','fa-box-archive':'archive','fa-archive':'archive','fa-phone':'phone','fa-video':'video','fa-thumbtack':'pin','fa-thumb-tack':'pin',
    'fa-comments':'comments','fa-chevron-right':'chevronRight','fa-headphones':'headphones','fa-user':'user','fa-user-group':'users','fa-magnifying-glass':'search','fa-search':'search','fa-house':'home','fa-xmark':'close','fa-times':'close','fa-rotate':'refresh','fa-plus':'plus','fa-arrow-right':'arrowRight','fa-arrow-left':'arrowLeft','fa-microphone':'microphone','fa-wave-square':'microphone','fa-stop':'stop','fa-music':'music','fa-lock':'lock','fa-image':'image','fa-folder-open':'folder','fa-film':'film','fa-file-zipper':'file','fa-file-pdf':'file','fa-compass':'compass','fa-coins':'coins','fa-user-plus':'userPlus'
  };
  const normalize = name => aliases[name] || name;
  function svg(name, className='spike-icon', size=20) {
    const key=normalize(String(name||'')); const path=paths[key]; if(!path) return '';
    const cls=String(className).replace(/[^a-zA-Z0-9 _-]/g,''); const px=Math.max(12,Math.min(48,Number(size)||20));
    return `<svg class="${cls}" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
  }
  function render(root=document) {
    if(!root || !root.querySelectorAll) return;
    const semanticNodes=[]; if(root.matches?.('[data-spike-icon]'))semanticNodes.push(root); semanticNodes.push(...root.querySelectorAll('[data-spike-icon]'));
    semanticNodes.forEach(node=>{if(node.dataset.spikeIconReady==='1')return;const markup=svg(node.dataset.spikeIcon,'spike-icon',node.dataset.spikeIconSize||18);if(markup){node.replaceChildren(document.createRange().createContextualFragment(markup));node.dataset.spikeIconReady='1';}});
    const selector=Object.keys(legacy).map(name=>'.'+name).join(','); const nodes=[];
    if(root.matches?.(selector))nodes.push(root); nodes.push(...root.querySelectorAll(selector));
    nodes.forEach(node=>{if(node.dataset.spikeIconReady==='1')return;const name=Object.keys(legacy).find(key=>node.classList.contains(key));const markup=svg(legacy[name],'spike-icon',18);if(markup){node.replaceChildren(document.createRange().createContextualFragment(markup));node.classList.add('spike-icon-replaced');node.dataset.spikeIconReady='1';}});
  }
  window.SPIKEIcons=Object.freeze({version:2,svg,render,names:Object.freeze(Object.keys(paths)),aliases:Object.freeze({...aliases}),legacy:Object.freeze({...legacy})});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>render(),{once:true});else render();
  const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)render(node);}))); observer.observe(document.documentElement,{childList:true,subtree:true});
})();
