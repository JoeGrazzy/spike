/* SPIKE local i18n: pre-translated local packs, no network translation. */
(() => {
  'use strict';
  const KEY='spike-language';
  const LANGS={en:'English',fr:'Français',ig:'Igbo',yo:'Yorùbá',ha:'Hausa',pcm:'Nigerian Pidgin'};
  const DEFAULT='en';
  const SELECTOR_UI={en:{label:'Language',hint:'Choose your language'},fr:{label:'Langue',hint:'Choisissez votre langue'},ig:{label:'Asụsụ',hint:'Họrọ asụsụ gị'},yo:{label:'Èdè',hint:'Yan èdè rẹ'},ha:{label:'Harshe',hint:'Zaɓi harshenka'},pcm:{label:'Language',hint:'Choose your language'}};
  const readSaved=()=>{try{const v=localStorage.getItem(KEY);if(LANGS[v]) return v}catch{}; const m=document.cookie.match(/(?:^|;\s*)spike-language=([^;]+)/); const v=m&&decodeURIComponent(m[1]); return LANGS[v]?v:DEFAULT};
  let active=readSaved();
  document.documentElement.lang=active;
  document.documentElement.dataset.spikeLang=active;
  document.documentElement.dataset.spikeI18nReady='0';
  const originals=new WeakMap(), attrOriginals=new WeakMap();
  let pack=null, observer=null;
  const saveLanguage=l=>{try{localStorage.setItem(KEY,l)}catch{}; try{document.cookie='spike-language='+encodeURIComponent(l)+'; Max-Age=31536000; Path=/; SameSite=Lax'}catch{}};

  const userContent = el => {
    if(!el || !(el instanceof Element)) return false;
    if(el.closest('input,textarea,select,option,[contenteditable="true"],[data-i18n-ignore],[data-i18n-user-content]')) return true;
    const s=((el.id||'')+' '+(el.className||'')).toLowerCase();
    return /(username|display[-_ ]?name|user[-_ ]?content|user[-_ ]?generated|message[-_ ]?(text|body)|chat[-_ ]?(text|body|message)|comment[-_ ]?(text|body)|post[-_ ]?(text|body|content)|feed[-_ ]?(text|content)|bio)/.test(s);
  };
  const shouldText=n=>{
    const p=n.parentElement;
    if(!p || userContent(p)) return false;
    if(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','PRE','CODE','TEXTAREA','INPUT','SELECT','OPTION'].includes(p.tagName)) return false;
    const t=n.nodeValue.replace(/\s+/g,' ').trim();
    return !!t && /[A-Za-zÀ-ÿ]/.test(t);
  };
  const translateExact=(text,dict)=>dict[text] || text;
  async function loadPack(lang){
    if(lang==='en') return {};
    const all=window.__SPIKE_I18N_PACK__;
    if(!all || !all[lang]) throw new Error('Embedded translation pack unavailable');
    return all[lang];
  }
  function restore(){
    const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let n; while(n=w.nextNode()) if(originals.has(n)) n.nodeValue=originals.get(n);
    document.querySelectorAll('[data-i18n-original]').forEach(el=>{
      try{
        const m=JSON.parse(el.getAttribute('data-i18n-original'));
        for(const [a,v] of Object.entries(m)) el.setAttribute(a,v);
        el.removeAttribute('data-i18n-original');
      }catch{}
    });
  }
  function apply(){
    if(!pack) return;
    if(active==='en'){ restore(); return; }
    const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let n;
    while(n=w.nextNode()){
      if(!shouldText(n)) continue;
      if(!originals.has(n)) originals.set(n,n.nodeValue);
      const original=originals.get(n);
      const key=original.replace(/\s+/g,' ').trim();
      const translated=translateExact(key,pack);
      if(translated && translated!==key){
        const lead=original.match(/^\s*/)?.[0]||'', trail=original.match(/\s*$/)?.[0]||'';
        n.nodeValue=lead+translated+trail;
      }
    }
    document.querySelectorAll('[placeholder],[title],[aria-label],[alt]').forEach(el=>{
      if(userContent(el)) return;
      let m={};
      for(const a of ['placeholder','title','aria-label','alt']){
        const v=el.getAttribute(a); if(!v||!/[A-Za-z]/.test(v)) continue;
        if(!m[a]) m[a]=v;
        const t=translateExact(v,pack);
        if(t && t!==v) el.setAttribute(a,t);
      }
      if(Object.keys(m).length) el.setAttribute('data-i18n-original',JSON.stringify(m));
    });
    document.title=translateExact(document.title,pack);
    document.documentElement.lang=active;
  }
  function watch(){
    observer?.disconnect();
    observer=new MutationObserver(ms=>{
      if(document.documentElement.dataset.spikeI18nReady!=='1') return;
      for(const m of ms) if(m.type==='childList' && m.addedNodes.length){ apply(); break; }
    });
    observer.observe(document.body,{subtree:true,childList:true});
  }
  function buildSelector(){
    if(location.pathname.split('/').pop()!=='settings.html') return;
    // settings.html now contains the language control directly, so never inject
    // a second selector. This also makes the control available even if i18n
    // initialization is delayed or a translation pack fails to load.
    if(document.getElementById('spike-language-select')) return;
    if(document.getElementById('spike-language-setting')) return;
    const host=document.createElement('section');
    host.id='spike-language-setting';
    host.setAttribute('data-i18n-ignore','');
    host.innerHTML=`<div class="spike-language-card"><div><strong>${SELECTOR_UI[active].label}</strong><small>${SELECTOR_UI[active].hint}</small></div><select id="spike-language-select" aria-label="Language"><option value="en">English</option><option value="fr">Français</option><option value="ig">Igbo</option><option value="yo">Yorùbá</option><option value="ha">Hausa</option><option value="pcm">Nigerian Pidgin</option></select></div>`;
    const style=document.createElement('style');
    style.textContent='.spike-language-card{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px;margin:16px 0;border:1px solid var(--line,rgba(255,255,255,.1));border-radius:16px;background:var(--surface,rgba(255,255,255,.05))}.spike-language-card strong,.spike-language-card small{display:block}.spike-language-card small{opacity:.7;margin-top:4px}.spike-language-card select{padding:10px 12px;border-radius:10px;background:inherit;color:inherit;border:1px solid var(--line,rgba(255,255,255,.15))}';
    document.head.appendChild(style);
    const anchor=document.querySelector('main,.wrap,.container,body');
    anchor.insertBefore(host,anchor.firstChild);
    const sel=host.querySelector('select'); sel.value=active;
    sel.addEventListener('change',e=>{
      const next=e.target.value;
      if(!LANGS[next]) return;
      active=next;
      saveLanguage(next)
      document.documentElement.lang=next;
      document.documentElement.dataset.spikeLang=next;
      // Reload from the saved preference. This guarantees every page starts
      // with the selected language instead of relying on in-place DOM state.
      location.reload();
    });
  }
  async function boot(reapply=false){
    if(reapply) restore();
    try { pack=await loadPack(active); apply(); }
    catch(e){ console.error('[SPIKE i18n]',e); active=DEFAULT; saveLanguage(DEFAULT); pack={}; restore(); }
    buildSelector();
    if(location.pathname.split('/').pop()==='settings.html'){
      const s=document.getElementById('spike-language-select');
      if(s){
        s.value=active;
        if(!s.dataset.spikeLanguageBound){
          s.dataset.spikeLanguageBound='1';
          s.addEventListener('change',e=>{
            const next=e.target.value;
            if(!LANGS[next]) return;
            active=next;
            saveLanguage(next)
            document.documentElement.lang=next;
            document.documentElement.dataset.spikeLang=next;
            location.reload();
          });
        }
        const card=s.closest('#language-settings') || document.getElementById('spike-language-setting');
        if(card){
          const section=card.querySelector('.section');
          const strong=card.querySelector('strong'), small=card.querySelector('small');
          if(section) section.textContent=SELECTOR_UI[active].label;
          if(strong) strong.textContent=SELECTOR_UI[active].label;
          if(small) small.textContent=SELECTOR_UI[active].hint;
        }
      }
    }
    document.documentElement.dataset.spikeI18nReady='1';
    watch();
  }
  document.addEventListener('DOMContentLoaded',()=>boot(false),{once:true});
  window.SPIKE_I18N={get language(){return active}, setLanguage:l=>{
    if(!LANGS[l]) return Promise.resolve(false);
    active=l;
    saveLanguage(l)
    document.documentElement.lang=l;
    document.documentElement.dataset.spikeLang=l;
    location.reload();
    return Promise.resolve(true);
  }, languages:LANGS};
})();