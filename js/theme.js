/* SPIKE Three-Theme Core — canonical registry and persistence. */
(function(){
 'use strict';
 const KEY='spike-theme-choice-v3';
 const MODE_KEY='spike-theme-2-mode';
 const readMode=()=>{try{const v=localStorage.getItem(MODE_KEY);return v==='dark'||v==='system'?v:'light';}catch(_){return 'light';}};
 const resolvedMode=mode=>mode==='system'?((window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'):mode;
 const THEMES=Object.freeze([
  Object.freeze({id:1,name:'Theme 1',mode:'dark',signature:'Pending approved design'}),
  Object.freeze({id:2,name:'Theme 2',mode:'light',signature:'Modern Mineral — mineral light, evergreen dark, jade accents'}),
  Object.freeze({id:3,name:'Premium Neon Red',mode:'dark',signature:'Black surfaces with restrained neon-red accents'})
 ]);
 const ids=new Set(THEMES.map(t=>t.id));
 const normalize=v=>ids.has(Number(v))?Number(v):1;
 function read(){try{return normalize(localStorage.getItem(KEY));}catch(_){return 1;}}
 function apply(value,persist=true){
  const id=normalize(value),theme=THEMES[id-1],root=document.documentElement;
  const mode=id===2?resolvedMode(readMode()):theme.mode;
  root.dataset.spikeStyle=String(id);root.dataset.theme=mode;root.dataset.spikeThemeMode=mode;root.dataset.spikeTheme=theme.name.toLowerCase();root.dataset.spikeThemeId=String(id);root.dataset.spikeThemeVersion='3';root.style.colorScheme=mode;
  window.__SPIKE_STYLE__=id;
  if(persist){try{localStorage.setItem(KEY,String(id));localStorage.removeItem('spike-feed-style');localStorage.removeItem('spike-theme');localStorage.removeItem('spike-setting-theme_style');}catch(_){}}
  try{const bg=getComputedStyle(root).getPropertyValue('--spike-bg').trim();const meta=document.querySelector('meta[name="theme-color"]');if(meta&&bg)meta.setAttribute('content',bg);}catch(_){}
  document.dispatchEvent(new CustomEvent('spike:theme-change',{detail:{id,name:theme.name,mode,version:3}}));return id;
 }
 function next(){return apply(read()%THEMES.length+1);}
 window.SPIKE_THEMES=THEMES;
 function setMode(mode){const value=['dark','system'].includes(mode)?mode:'light';try{localStorage.setItem(MODE_KEY,value);}catch(_){}if(normalize(window.__SPIKE_STYLE__||read())===2)apply(2,false);else document.documentElement.dataset.spikeThemeMode=resolvedMode(value);document.dispatchEvent(new CustomEvent('spike:theme-mode-change',{detail:{mode:value,resolvedMode:resolvedMode(value)}}));return value;}
 window.SPIKE_THEME={get:()=>normalize(window.__SPIKE_STYLE__||read()),set:apply,setMode,getMode:readMode,next,cycle:next,hasStored:()=>{try{return ids.has(Number(localStorage.getItem(KEY)));}catch(_){return false;}}};
 // Deliberately ignore and remove the previous ten-theme selection; never reinterpret it.
 try{localStorage.removeItem('spike-feed-style');localStorage.removeItem('spike-theme');localStorage.removeItem('spike-setting-theme_style');}catch(_){}
 apply(read(),false);
 window.addEventListener('storage',e=>{if(e.key===KEY)apply(e.newValue,false);if(e.key===MODE_KEY&&normalize(window.__SPIKE_STYLE__||read())===2)apply(2,false);});
 try{const mq=window.matchMedia('(prefers-color-scheme: dark)');const onSystemTheme=()=>{if(readMode()==='system'&&normalize(window.__SPIKE_STYLE__||read())===2)apply(2,false)};if(mq.addEventListener)mq.addEventListener('change',onSystemTheme);else if(mq.addListener)mq.addListener(onSystemTheme);}catch(_){}
 function wire(){
  for(const btn of document.querySelectorAll('#spikeThemeIcon,#spikeThemeSwitch,#themeBtn,[data-spike-theme-switch]')){
   if(btn.dataset.spikeThemeWired==='3')continue;btn.dataset.spikeThemeWired='3';
   const sync=()=>{const id=window.SPIKE_THEME.get(),t=THEMES[id-1];const glyph=document.getElementById('spikeThemeGlyph');if(btn.id==='spikeThemeIcon'&&glyph)glyph.textContent=t.name.charAt(0);btn.title=`Change theme · ${t.name} · ${id} of 3`;btn.setAttribute('aria-label',`Change theme · ${t.name} · ${id} of 3`);const label=btn.querySelector('[data-theme-label],#styleLabel');if(label)label.textContent=t.name;};
   btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();next();sync();},true);document.addEventListener('spike:theme-change',sync,{passive:true});sync();
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
})();
