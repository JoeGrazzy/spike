/* SPIKE Premium Theme Engine — single source of truth. */
(function(){
  'use strict';
  const KEY='spike-feed-style';
  const THEMES=[
    {id:1,name:'Aurora Glass',mode:'dark',signature:'Electric Cyan'},
    {id:2,name:'Velvet Nocturne',mode:'dark',signature:'Neon Purple'},
    {id:3,name:'Solar Ember',mode:'dark',signature:'Blazing Orange'},
    {id:4,name:'Emerald Atelier',mode:'dark',signature:'Mint Emerald'},
    {id:5,name:'Ocean Cobalt',mode:'dark',signature:'Royal Blue'},
    {id:6,name:'Desert Rose',mode:'light',signature:'Warm Rose'},
    {id:7,name:'Royal Amethyst',mode:'dark',signature:'Lavender'},
    {id:8,name:'Arctic Platinum',mode:'light',signature:'Glacier Cyan'},
    {id:9,name:'Neon Citrus',mode:'dark',signature:'Metallic Gold'},
    {id:10,name:'Midnight Cherry',mode:'dark',signature:'Crimson OLED'}
  ];
  const allowed=new Set(THEMES.map(t=>t.id));
  const clamp=n=>allowed.has(Number(n))?Number(n):1;
  const read=()=>{try{return clamp(parseInt(localStorage.getItem(KEY)||'1',10));}catch(_){return 1;}};
  const hasStored=()=>{try{return allowed.has(Number(parseInt(localStorage.getItem(KEY),10)));}catch(_){return false;}};
  function apply(value,persist=true){
    const n=clamp(value), theme=THEMES[n-1], root=document.documentElement;
    root.dataset.spikeStyle=String(n);
    root.dataset.theme=theme.mode;
    root.dataset.spikeTheme=theme.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    root.style.colorScheme=theme.mode;
    root.style.setProperty('--spike-style',String(n));
    window.__SPIKE_STYLE__=n;
    if(persist){try{localStorage.setItem(KEY,String(n));localStorage.setItem('spike-theme',theme.mode);}catch(_) {}}
    document.dispatchEvent(new CustomEvent('spike:theme-change',{detail:{id:n,name:theme.name,mode:theme.mode}}));
    return n;
  }
  function next(){return apply(read()%THEMES.length+1);}
  window.SPIKE_THEMES=Object.freeze(THEMES.map(t=>Object.freeze({...t})));
  window.SPIKE_THEME={get:()=>clamp(window.__SPIKE_STYLE__||read()),set:apply,next,hasStored};
  apply(read(),false);
  window.addEventListener('storage',event=>{
    if(event.key!==KEY)return;
    const n=clamp(parseInt(event.newValue||'1',10));
    apply(n,false);
  });
})();
/* Harden the Feed theme pill: one atomic click -> one full theme change. */
(function(){
  function wire(){
    const btn=document.getElementById('spikeThemeIcon'), glyph=document.getElementById('spikeThemeGlyph');
    if(!btn||!glyph||btn.dataset.spikeThemeHardened==='1') return;
    btn.dataset.spikeThemeHardened='1';
    const sync=()=>{
      const n=window.SPIKE_THEME?.get?.()||1, t=window.SPIKE_THEMES?.[n-1];
      glyph.textContent=t?.name?.charAt(0)||'✦';
      btn.title=`Change theme · ${t?.name||'Theme'} · ${n} of 10`;
      btn.setAttribute('aria-label',`Change theme · ${t?.name||'Theme'} · ${n} of 10`);
      btn.dataset.themeId=String(n);
    };
    btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();window.SPIKE_THEME.next();sync();},true);
    document.addEventListener('spike:theme-change',sync,{passive:true});
    sync();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire,{once:true}); else wire();
})();
