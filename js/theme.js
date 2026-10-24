/* SPIKE Five-Theme Core — canonical registry and persistence. */
(function(){
 'use strict';
 const KEY='spike-theme-choice-v3';
 const VERSION_KEY='spike-theme-version';
 const VERSION='4';
 const THEMES=Object.freeze([
  Object.freeze({id:1,name:'Midnight Luxe',mode:'dark',signature:'Deep navy, electric violet, premium low-glare surfaces'}),
  Object.freeze({id:2,name:'Arctic Glass',mode:'light',signature:'Porcelain surfaces, cobalt blue, crisp editorial contrast'}),
  Object.freeze({id:3,name:'Emerald Obsidian',mode:'dark',signature:'Obsidian surfaces, emerald accents, calm precision'}),
  Object.freeze({id:4,name:'Sandstone Studio',mode:'light',signature:'Warm cream surfaces, terracotta accents, editorial warmth'}),
  Object.freeze({id:5,name:'Cosmic Pulse',mode:'dark',signature:'Deep plum surfaces, magenta accents, restrained cosmic glow'})
 ]);
 const ids=new Set(THEMES.map(t=>t.id));
 const normalize=v=>ids.has(Number(v))?Number(v):1;
 function read(){try{return normalize(localStorage.getItem(KEY));}catch(_){return 1;}}
 function apply(value,persist=true){
  const id=normalize(value),theme=THEMES[id-1],root=document.documentElement,mode=theme.mode;
  root.dataset.spikeStyle=String(id);root.dataset.theme=mode;root.dataset.spikeThemeMode=mode;root.dataset.spikeTheme=theme.name.toLowerCase().replace(/\s+/g,'-');root.dataset.spikeThemeId=String(id);root.dataset.spikeThemeVersion=VERSION;root.style.colorScheme=mode;
  window.__SPIKE_STYLE__=id;
  if(persist){try{localStorage.setItem(KEY,String(id));localStorage.setItem(VERSION_KEY,VERSION);localStorage.removeItem('spike-feed-style');localStorage.removeItem('spike-theme');localStorage.removeItem('spike-setting-theme_style');localStorage.removeItem('spike-theme-2-mode');}catch(_){}}
  try{const bg=getComputedStyle(root).getPropertyValue('--spike-bg').trim();const meta=document.querySelector('meta[name="theme-color"]');if(meta&&bg)meta.setAttribute('content',bg);}catch(_){}
  document.dispatchEvent(new CustomEvent('spike:theme-change',{detail:{id,name:theme.name,mode,version:Number(VERSION)}}));return id;
 }
 function next(){return apply(read()%THEMES.length+1);}
 // Version the new five-theme palette while preserving existing numeric preferences.
 try{const storedVersion=localStorage.getItem(VERSION_KEY);if(storedVersion!==VERSION){const prior=localStorage.getItem(KEY);if(prior!==null){const old=Number(prior);localStorage.setItem(KEY,String(old>=1&&old<=3?old:1));}localStorage.setItem(VERSION_KEY,VERSION);localStorage.removeItem('spike-theme-2-mode');}}catch(_){}
 window.SPIKE_THEMES=THEMES;
 window.SPIKE_THEME={get:()=>normalize(window.__SPIKE_STYLE__||read()),set:apply,setMode:()=>THEMES[read()-1].mode,getMode:()=>THEMES[read()-1].mode,next,cycle:next,hasStored:()=>{try{return ids.has(Number(localStorage.getItem(KEY)));}catch(_){return false;}}};
 apply(read(),false);
 window.addEventListener('storage',e=>{if(e.key===KEY)apply(e.newValue,false);});
 function wire(){
  for(const btn of document.querySelectorAll('#spikeThemeIcon,#spikeThemeSwitch,#themeBtn,[data-spike-theme-switch]')){
   if(btn.dataset.spikeThemeWired==='4')continue;btn.dataset.spikeThemeWired='4';
   const sync=()=>{const id=window.SPIKE_THEME.get(),t=THEMES[id-1];const glyph=document.getElementById('spikeThemeGlyph');if(btn.id==='spikeThemeIcon'&&glyph)glyph.textContent=t.name.charAt(0);btn.title=`Change theme · ${t.name} · ${id} of ${THEMES.length}`;btn.setAttribute('aria-label',`Change theme · ${t.name} · ${id} of ${THEMES.length}`);const label=btn.querySelector('[data-theme-label],#styleLabel');if(label)label.textContent=t.name;};
   btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();next();sync();},true);document.addEventListener('spike:theme-change',sync,{passive:true});sync();
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
})();
