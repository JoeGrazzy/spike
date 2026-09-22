/* SPIKE Native Social Layer v2
 * Turns the existing social primitives into SPIKE-native mechanics.
 * Additive, resilient, and compatible with the existing Feed state.
 */
(() => {
  'use strict';
  if (window.__SPIKE_NATIVE_V2__) return;
  window.__SPIKE_NATIVE_V2__ = true;

  const KEY = 'spike-native-v2';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const db = () => window.supabaseClient || window.sb || window.db || null;
  const uid = () => window.state?.user?.id || window.currentUser?.id || null;
  const toast = (m, t='info') => { try { (window.spikePremiumToast || window.toast)?.(m, t, 3600); } catch {} };
  const now = () => Date.now();
  const posts = () => Array.isArray(window.state?.posts) ? window.state.posts.filter(p => p && !p.deleted) : [];
  const getLocal = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const setLocal = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

  function topicWords(text) {
    const stop = new Set('about after again against all also and are around because before being between both but can could did does doing down each for from had has have how into its just like more most not now only other our out over same should some than that their them then there these they this those through too under very was were what when where which while with would your you yours'.split(' '));
    const words = String(text || '').toLowerCase().match(/[a-z][a-z0-9_]{3,}/g) || [];
    const counts = new Map();
    for (const w of words) if (!stop.has(w) && !/^https?$/.test(w)) counts.set(w, (counts.get(w)||0)+1);
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([word,count])=>({word,count}));
  }

  function signalMetrics(p) {
    const created = Date.parse(p.createdAt || p.created_at || '') || now();
    const ageH = Math.max(.08, (now()-created)/3600000);
    const likes = Number(p?.reactions?.like ?? p?.likes ?? 0) || 0;
    const comments = Array.isArray(p.comments) ? p.comments.length : Number(p.commentCount || 0) || 0;
    const saves = Number(p.saveCount || 0) || 0;
    const shares = Number(p.shareCount || p.shares || 0) || 0;
    const views = Number(p.views || p.viewCount || 0) || 0;
    const depth = likes + comments*2 + saves*2.5 + shares*2.2;
    const velocity = depth / ageH;
    const acceleration = velocity / Math.max(1, Math.log1p(ageH+1));
    const momentum = Math.min(100, Math.round((Math.log1p(velocity)*22 + Math.log1p(comments+shares)*8 + Math.min(20, saves*2))));
    return {ageH, likes, comments, saves, shares, views, depth, velocity, acceleration, momentum};
  }

  function topMomentum(limit=10) {
    return posts().map(p => ({p, m: signalMetrics(p)})).sort((a,b)=>b.m.acceleration-a.m.acceleration || b.m.depth-a.m.depth).slice(0,limit);
  }

  function applyBrandLanguage(root=document) {
    const replacements = new Map([
      ['Close Friends','Circles'],['Close friends','Circles'],
      ['Stories','Pulses'],['Story','Pulse'],['stories','Pulses'],['story','Pulse'],
      ['Reels','Signal Stream'],['Reel','Signal Stream'],['reels','Signal Stream'],['reel','Signal Stream'],
      ['Trending','Momentum'],['trending','Momentum'],['Popular','Momentum'],['popular','Momentum'],
      ['Comments','Echoes'],['Comment','Echo'],['comments','Echoes'],['comment','Echo'],
      ['Saved & Collections','Signal Vault'],['Saved','Signal Vault'],['saved','Signal Vault'],
      ['Friends','Connections'],['Friend','Connection'],['friends','Connections'],['friend','Connection']
    ]);
    const nodes = root.querySelectorAll('button,a,h1,h2,h3,h4,p,small,strong,span,label,summary,[aria-label],[title],[placeholder]');
    for (const el of nodes) {
      if (el.dataset?.spikeNativeSkip === '1') continue;
      if (el.children.length === 0 && el.textContent) {
        const old = el.textContent.trim();
        if (replacements.has(old)) el.textContent = replacements.get(old);
      }
      for (const attr of ['aria-label','title','placeholder']) {
        const v = el.getAttribute?.(attr); if (!v) continue;
        let next=v;
        for (const [a,b] of replacements) next=next.replaceAll(a,b);
        if (next!==v) el.setAttribute(attr,next);
      }
    }
    const direct = [
      ['storyOverlay','h2','Create Pulse'], ['storyOverlay','p','Pulses evolve for 24 hours. Add text or media to show what is happening right now.'],
      ['storyText','placeholder','What is your Pulse right now?'],
      ['storyText','aria-label','Pulse text'], ['publishStory','textContent','Release Pulse'],
      ['storyActionShare','textContent','↗ Pass Pulse'], ['storyActionDelete','textContent','🗑 Delete Pulse'],
      ['storyLoaderTitle','textContent','Releasing your Pulse…'], ['storyLoaderText','textContent','Publishing your live state securely.'],
      ['storyViewerAuthor','textContent','Pulse'], ['storyViewerCaption','aria-label','Pulse caption'],
      ['storyViewerClose','aria-label','Close Pulse'], ['storyViewer','aria-label','Pulse viewer'],
      ['storyPrev','aria-label','Previous Pulse'], ['storyNext','aria-label','Next Pulse'],
      ['storyViewerDownload','aria-label','Download Pulse media'], ['storyViewerDelete','aria-label','Delete Pulse']
    ];
    for (const [id,attr,value] of direct) { const el=$(id); if(!el) continue; if(attr==='textContent') el.textContent=value; else el.setAttribute(attr,value); }
  }

  function ensureStyles() {
    if ($('spikeNativeV2Style')) return;
    const s=document.createElement('style'); s.id='spikeNativeV2Style'; s.textContent=`
      .spike-native-panel{margin:10px 0;padding:12px;border:1px solid var(--spike-line);border-radius:var(--spike-radius);background:var(--spike-surface)!important;color:var(--spike-text);box-shadow:var(--spike-shadow);overflow:hidden}
      .spike-native-tabs{display:flex;gap:6px;overflow:auto;padding-bottom:7px;scrollbar-width:none}.spike-native-tabs::-webkit-scrollbar{display:none}.spike-native-tabs button{border:1px solid var(--spike-line);background:var(--spike-surface-2);color:var(--spike-muted);border-radius:var(--spike-control-radius);padding:7px 11px;font-weight:800;white-space:nowrap}.spike-native-tabs button.active{background:linear-gradient(135deg,var(--spike-action-bg),var(--spike-action-bg-2));color:var(--spike-action-text);border-color:var(--spike-line);box-shadow:0 7px 20px var(--spike-glow)}
      .spike-native-panel-body{min-height:80px}.spike-native-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}.spike-native-card{padding:10px;border:1px solid var(--spike-line);border-radius:var(--spike-control-radius);background:var(--spike-surface-2)!important;color:var(--spike-text)}.spike-native-card b{display:block;color:var(--spike-text)}.spike-native-card small{display:block;color:var(--spike-muted);margin-top:4px;line-height:1.35}.spike-native-card button{margin-top:8px}.spike-native-meter{height:5px;border-radius:99px;background:var(--spike-line);overflow:hidden;margin-top:8px}.spike-native-meter i{display:block;height:100%;background:linear-gradient(90deg,var(--spike-accent),var(--spike-accent-2));border-radius:inherit}.spike-native-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.spike-native-input{width:100%;box-sizing:border-box;padding:9px;border:1px solid var(--spike-line);border-radius:var(--spike-control-radius);background:var(--spike-surface-2)!important;color:var(--spike-text)!important}.spike-native-input::placeholder{color:var(--spike-muted);opacity:.9}.spike-native-muted{color:var(--spike-muted);font-size:12px}.spike-native-empty{padding:14px;text-align:center;color:var(--spike-muted)}
      html[data-spike-style="3"] .spike-native-panel,html[data-spike-style="3"] .spike-native-card{border-width:2px;border-radius:0}html[data-spike-style="6"] .spike-native-panel,html[data-spike-style="6"] .spike-native-card,html[data-spike-style="8"] .spike-native-panel,html[data-spike-style="8"] .spike-native-card{box-shadow:var(--spike-shadow)}
      .spike-native-topic{cursor:pointer}.spike-native-topic:hover{transform:translateY(-1px)}
    `; document.head.appendChild(s);
  }

  function ensurePanel() {
    if ($('spikeNativePanel')) return $('spikeNativePanel');
    const hub=$('feedV2Hub'); if(!hub) return null;
    const panel=document.createElement('section'); panel.id='spikeNativePanel'; panel.className='spike-native-panel'; panel.innerHTML=`
      <div class="spike-native-tabs" role="tablist" aria-label="SPIKE native systems">
        <button class="active" data-native-tab="momentum">Momentum</button>
        <button data-native-tab="topics">◎ Topics</button>
        <button data-native-tab="lenses">◉ Signal Lenses</button>
        <button data-native-tab="chains">↗ Signal Chains</button>
        <button data-native-tab="pulses">◌ Pulses</button>
      </div>
      <div id="spikeNativePanelBody" class="spike-native-panel-body"></div>`;
    hub.parentNode.insertBefore(panel, hub.nextSibling);
    panel.addEventListener('click', handlePanelClick);
    return panel;
  }

  function ensureNativeNavButton() {
    const nav=$('feedV2Nav'); if(!nav || nav.querySelector('[data-native-tab="momentum"]')) return;
    const btn=document.createElement('button'); btn.type='button'; btn.dataset.nativeOpen='1'; btn.textContent='SPIKE Native';
    btn.addEventListener('click',()=>{ ensurePanel()?.scrollIntoView({behavior:'smooth',block:'start'}); setNativeTab('momentum'); });
    nav.insertBefore(btn, nav.firstElementChild?.nextSibling || nav.firstChild);
  }

  function setNativeTab(tab) {
    const panel=ensurePanel(); if(!panel) return;
    panel.querySelectorAll('[data-native-tab]').forEach(b=>b.classList.toggle('active',b.dataset.nativeTab===tab));
    renderNative(tab);
  }

  function renderNative(tab='momentum') {
    const body=$('spikeNativePanelBody'); if(!body) return;
    if(tab==='momentum') return renderMomentum(body);
    if(tab==='topics') return renderTopics(body);
    if(tab==='lenses') return renderLenses(body);
    if(tab==='chains') return renderChains(body);
    if(tab==='pulses') return renderPulses(body);
  }

  function renderMomentum(body) {
    const rows=topMomentum(10);
    body.innerHTML=rows.length?`<div class="spike-native-grid">${rows.map(({p,m},i)=>`<article class="spike-native-card"><b>${i+1}. ${esc((p.content||'Untitled Signal').slice(0,90))}</b><small>${m.momentum}/100 Momentum · ${m.comments} Echoes · ${m.shares} passes · ${m.saves} saves</small><div class="spike-native-meter"><i style="width:${m.momentum}%"></i></div><div class="spike-native-actions"><button type="button" data-native-open-signal="${esc(p.id)}">Open Signal</button><button type="button" data-native-chain="${esc(p.id)}">Start Chain</button></div></article>`).join('')}</div>`:'<div class="spike-native-empty">Release the first Signals to create Momentum.</div>';
  }

  function renderTopics(body) {
    const map=new Map();
    for(const p of posts()) for(const t of topicWords(p.content||p.text)) { const x=map.get(t.word)||{word:t.word,count:0,signals:0}; x.count+=t.count; x.signals++; map.set(t.word,x); }
    const rows=[...map.values()].sort((a,b)=>b.count-a.count).slice(0,24);
    body.innerHTML=rows.length?`<div class="spike-native-grid">${rows.map(x=>`<button class="spike-native-card spike-native-topic" type="button" data-native-topic="${esc(x.word)}"><b>#${esc(x.word)}</b><small>${x.signals} Signals · ${x.count} mentions</small></button>`).join('')}</div><p class="spike-native-muted">Topics are living clusters. They are not just tags; selecting one changes the current Signal view.</p>`:'<div class="spike-native-empty">Topics appear as Signals accumulate.</div>';
  }

  async function loadLenses() {
    const local=getLocal(); let rows=Array.isArray(local.lenses)?local.lenses:[];
    try { const c=db(); if(c&&uid()){ const {data}=await c.from('spike_signal_lenses').select('id,name,description,rules,sort_mode,created_at').eq('owner_id',uid()).order('created_at',{ascending:false}).limit(20); if(Array.isArray(data)) rows=data; } } catch {}
    return rows;
  }

  async function renderLenses(body) {
    const rows=await loadLenses();
    body.innerHTML=`<div class="spike-native-actions"><input id="spikeLensName" class="spike-native-input" placeholder="Lens name e.g. Design Ideas"><input id="spikeLensTopic" class="spike-native-input" placeholder="Topic or keyword"><button type="button" data-native-create-lens>Create Lens</button></div><div class="spike-native-grid" style="margin-top:9px">${rows.length?rows.map(x=>`<article class="spike-native-card"><b>${esc(x.name)}</b><small>${esc(x.description||'A personal way to view Signals')} · ${esc(x.sort_mode||'momentum')}</small><button type="button" data-native-apply-lens="${esc(x.id)}">Use Lens</button></article>`).join(''):'<div class="spike-native-empty">No Signal Lenses yet.</div>'}</div>`;
  }

  async function renderChains(body) {
    let rows=[]; try { const c=db(); if(c&&uid()){ const {data}=await c.from('spike_signal_chains').select('id,title,description,created_at,root_post_id').order('created_at',{ascending:false}).limit(20); if(Array.isArray(data)) rows=data; } } catch {}
    body.innerHTML=`<div class="spike-native-actions"><input id="spikeChainTitle" class="spike-native-input" placeholder="Chain title"><button type="button" data-native-create-chain>Create Chain</button></div><div class="spike-native-grid" style="margin-top:9px">${rows.length?rows.map(x=>`<article class="spike-native-card"><b>${esc(x.title)}</b><small>${esc(x.description||'A connected line of Signals')} · ${new Date(x.created_at).toLocaleDateString()}</small></article>`).join(''):'<div class="spike-native-empty">No Signal Chains yet. Start one from a Signal.</div>'}</div>`;
  }

  function renderPulses(body) {
    const stories=Array.isArray(window.state?.stories)?window.state.stories:[];
    const active=stories.filter(s=>!s.deleted && (!s.expiresAt || new Date(s.expiresAt).getTime()>now())).length;
    body.innerHTML=`<div class="spike-native-card"><b>Pulses are your live state.</b><small>${active} active Pulse${active===1?'':'s'} visible to you. A Pulse expires naturally and can carry text, image, video or audio.</small><div class="spike-native-actions"><button type="button" data-native-create-pulse>＋ Create Pulse</button><button type="button" data-native-view-pulses>View Pulses</button></div></div>`;
  }

  async function createLens() {
    const name=$('spikeLensName')?.value.trim(); const topic=$('spikeLensTopic')?.value.trim();
    if(!name) return toast('Give the Lens a name','warning');
    const id=crypto.randomUUID(); const row={id,name,description:topic?`Focused on ${topic}`:'Personal Signal view',rules:{keywords:topic?[topic]:[]},sort_mode:'momentum',created_at:new Date().toISOString()};
    const local=getLocal(); local.lenses=Array.isArray(local.lenses)?local.lenses:[]; local.lenses.unshift(row); setLocal(local);
    try { const c=db(); if(c&&uid()){ const {error}=await c.from('spike_signal_lenses').insert({id,owner_id:uid(),name,description:row.description,rules:row.rules,sort_mode:row.sort_mode}); if(error) throw error; } } catch(e) { console.warn('[SPIKE LENS]',e); toast('Lens saved locally; sync failed','warning'); renderLenses($('spikeNativePanelBody')); return; }
    toast('Signal Lens created','success'); renderLenses($('spikeNativePanelBody'));
  }

  async function createChain(rootId) {
    const dialog=window.SPIKEPremiumDialog;
    let title='';
    try { title=await dialog?.input?.({title:'Create Signal Chain',message:'Give this connected line of Signals a name.',placeholder:'Chain title…',confirmText:'Create Chain',cancelText:'Cancel',kicker:'SPIKE CHAINS',maxLength:120}) || ''; } catch(e) { console.warn('[SPIKE CHAIN DIALOG]',e); }
    if(!title.trim()) return;
    try { const c=db(); if(!c||!uid()) throw new Error('Please sign in to create a Signal Chain.'); const {data,error}=await c.rpc('spike_chain_create',{p_title:title.trim(),p_description:'A connected line of Signals.',p_root_post_id:String(rootId||'')||null,p_first_entry:null}); if(error) throw error; if(!data?.ok) throw new Error('The Signal Chain could not be created.'); toast('Signal Chain created','success'); setNativeTab('chains'); } catch(e) { console.warn('[SPIKE CHAIN]',e); toast(e?.message||'Could not create Signal Chain','error'); }
  }

  function openSignal(id) {
    const el=document.querySelector(`[data-post="${CSS.escape(String(id))}"]`) || document.getElementById(`post-${id}`);
    if(el) el.scrollIntoView({behavior:'smooth',block:'center'}); else toast('Signal is not currently rendered','info');
  }

  function applyTopic(topic) {
    const input=$('v2DiscoverSearch'); if(input) input.value=topic;
    const go=$('v2DiscoverGo'); if(go) go.click();
    const local=getLocal(); local.activeTopic=topic; setLocal(local);
    toast(`Topic: ${topic}`,'success');
  }

  async function handlePanelClick(e) {
    const tab=e.target.closest('[data-native-tab]'); if(tab){ setNativeTab(tab.dataset.nativeTab); return; }
    if(e.target.closest('[data-native-create-lens]')) return createLens();
    const topic=e.target.closest('[data-native-topic]'); if(topic) return applyTopic(topic.dataset.nativeTopic);
    const open=e.target.closest('[data-native-open-signal]'); if(open) return openSignal(open.dataset.nativeOpenSignal);
    const chain=e.target.closest('[data-native-chain]'); if(chain) return createChain(chain.dataset.nativeChain);
    if(e.target.closest('[data-native-create-chain]')) return createChain(null);
    if(e.target.closest('[data-native-create-pulse]')) { $('storyOverlay')?.classList.add('open'); $('storyOverlay')?.removeAttribute('hidden'); return; }
    if(e.target.closest('[data-native-view-pulses]')) { $('storiesRow')?.scrollIntoView({behavior:'smooth',block:'center'}); return; }
    const lens=e.target.closest('[data-native-apply-lens]'); if(lens){ const rows=await loadLenses(); const x=rows.find(r=>String(r.id)===String(lens.dataset.nativeApplyLens)); const topic=x?.rules?.keywords?.[0]; if(topic) applyTopic(topic); else toast('This Lens has no keyword rule yet','info'); }
  }

  function patchExistingLabels() {
    const scope = document.body?.dataset?.spikeNativeGlobal === '1' ? document : ($('feedV2Hub') || document);
    applyBrandLanguage(scope);
    const filters=$('filters');
    if(filters){
      const map={latest:'Latest Signals',following:'Connections',popular:'Momentum',trending:'Momentum',saved:'Signal Vault'};
      filters.querySelectorAll('[data-filter]').forEach(b=>{ if(map[b.dataset.filter]) b.textContent=map[b.dataset.filter]; });
    }
    const storyBtn=$('storyBtn'); if(storyBtn) storyBtn.textContent='◌ Pulse';
    const search=$('v2DiscoverSearch'); if(search) search.placeholder='Search Signals or Topics…';
    const reelPanel=document.querySelector('[data-v2-panel="reels"]'); if(reelPanel){ const empty=reelPanel.querySelector('.empty'); if(empty) empty.textContent='Loading Signal Stream…'; }
  }

  function observeBranding() {
    const root=$('feedV2Hub')||document.querySelector('[data-spike-native-global=\"1\"]')||null;
    if(!root) return;
    let scheduled=false;
    const obs=new MutationObserver(()=>{ if(scheduled)return; scheduled=true; requestAnimationFrame(()=>{scheduled=false;applyBrandLanguage(root);}); });
    obs.observe(root,{subtree:true,childList:true});
    setTimeout(()=>obs.disconnect(),30000);
  }

  function boot() {
    ensureStyles(); patchExistingLabels(); ensureNativeNavButton(); ensurePanel();
    renderNative('momentum'); observeBranding();
    document.addEventListener('click',e=>{
      const b=e.target.closest('[data-comments]'); if(b){ setTimeout(()=>applyBrandLanguage(document),0); }
      if(e.target.closest('#storyBtn')) setTimeout(()=>applyBrandLanguage($('storyOverlay')||document),0);
    },true);
    setInterval(()=>{ if($('spikeNativePanelBody') && document.visibilityState==='visible'){ const active=document.querySelector('#spikeNativePanel [data-native-tab].active')?.dataset.nativeTab; if(active==='momentum') renderMomentum($('spikeNativePanelBody')); } },30000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
