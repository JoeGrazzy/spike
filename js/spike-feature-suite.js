/* SPIKE Feature Suite v1 — additive feature layer. Existing Feed controls remain untouched. */
(() => {
  'use strict';
  if (window.__SPIKE_FEATURE_SUITE_V1__) return;
  window.__SPIKE_FEATURE_SUITE_V1__ = true;

  const KEY = 'spike-feature-suite-v1';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
  const uid = () => window.state?.user?.id || window.currentUser?.id || null;
  const db = () => window.supabaseClient || window.sb || null;
  const toast = (m, t='info') => { try { (window.spikePremiumToast || window.toast)?.(m, t, 3600); } catch {} };

  function featureState() {
    const s = read();
    s.feeds ||= [];
    s.polls ||= [];
    s.series ||= [];
    s.collabs ||= [];
    s.memberships ||= [];
    s.products ||= [];
    s.resume ||= [];
    return s;
  }

  function open() {
    const o = $('spikeFeatureHub');
    if (!o) return;
    o.hidden = false; o.classList.add('open'); o.setAttribute('aria-hidden','false');
    document.body.classList.add('spike-feature-open');
    render('overview');
    syncRemote().then(()=>render('overview')).catch(()=>{});
    updatePulse();
  }
  function close() {
    const o = $('spikeFeatureHub'); if (!o) return;
    o.classList.remove('open'); o.setAttribute('aria-hidden','true'); o.hidden = true;
    document.body.classList.remove('spike-feature-open');
  }

  function setTab(tab) {
    document.querySelectorAll('[data-feature-tab]').forEach(b => b.classList.toggle('active', b.dataset.featureTab === tab));
    document.querySelectorAll('[data-feature-panel]').forEach(p => p.hidden = p.dataset.featurePanel !== tab);
    render(tab);
  }

  async function syncRemote() {
    const client = db(), me = uid();
    if (!client || !me) return;
    const s = featureState();
    const jobs = [
      ['feeds','spike_custom_feeds','owner_id, name, description, rules, created_at'],
      ['polls','spike_polls','id, question, created_at'],
      ['series','spike_signal_series','id, title, description, status, created_at'],
      ['collabs','spike_signal_collaborators','post_id, collaborator_id, status, created_at'],
      ['memberships','spike_creator_memberships','id, name, description, monthly_coins, created_at'],
      ['products','spike_creator_products','id, title, description, product_type, price_coins, created_at'],
      ['resume','spike_resume_states','action_key, title, route, payload, updated_at']
    ];
    await Promise.all(jobs.map(async ([key, table, columns]) => {
      try {
        const {data,error}=await client.from(table).select(columns).order(key==='resume'?'updated_at':'created_at',{ascending:false}).limit(50);
        if (error || !Array.isArray(data)) return;
        if(key==='feeds') s.feeds=data.map(x=>({id:x.id,name:x.name,description:x.description,rules:x.rules||{},createdAt:x.created_at}));
        if(key==='polls') s.polls=data.map(x=>({id:x.id,question:x.question,options:[],votes:0,createdAt:x.created_at}));
        if(key==='series') s.series=data.map(x=>({id:x.id,title:x.title,description:x.description,status:x.status,items:[],createdAt:x.created_at}));
        if(key==='collabs') s.collabs=data.map(x=>({id:`${x.post_id}:${x.collaborator_id}`,postId:x.post_id,collaboratorId:x.collaborator_id,status:x.status,createdAt:x.created_at}));
        if(key==='memberships') s.memberships=data.map(x=>({id:x.id,name:x.name,description:x.description,monthlyCoins:x.monthly_coins,createdAt:x.created_at}));
        if(key==='products') s.products=data.map(x=>({id:x.id,title:x.title,description:x.description,productType:x.product_type,priceCoins:x.price_coins,createdAt:x.created_at}));
        if(key==='resume') s.resume=data.map(x=>({id:x.action_key,title:x.title,route:x.route,payload:x.payload||{},updatedAt:x.updated_at}));
      } catch {}
    }));
    write(s);
  }

  function updatePulse() {
    const dot=$('spikePulseDot'); if(!dot) return;
    const posts=Array.isArray(window.state?.posts)?window.state.posts:[];
    const recent=posts.some(p=>{const t=Date.parse(p?.createdAt||p?.created_at||'');return Number.isFinite(t)&&Date.now()-t<30*60*1000;});
    dot.hidden=!recent;
    dot.title=recent?'Fresh SPIKE activity is available':'No fresh activity indicator';
  }

  function render(tab='overview') {
    const s = featureState();
    if (tab === 'feeds') renderFeeds(s);
    if (tab === 'polls') renderPolls(s);
    if (tab === 'series') renderSeries(s);
    if (tab === 'collab') renderCollabs(s);
    if (tab === 'creator') renderCreator(s);
    if (tab === 'search') renderSearch();
    if (tab === 'reputation') renderReputation();
    if (tab === 'resume') renderResume(s);
    if (tab === 'dashboard') renderDashboard(s);
  }

  function list(el, items, empty, map) {
    if (!el) return;
    el.innerHTML = items.length ? items.map(map).join('') : `<div class="spike-feature-empty">${empty}</div>`;
  }

  function renderFeeds(s) {
    list($('featureFeedsList'), s.feeds, 'No custom Feeds yet.', x => `<div class="spike-feature-row"><div><b>${esc(x.name)}</b><small>${esc(x.description || 'Personal Feed')}</small></div><span>${esc((x.rules?.topics || []).join(', ') || 'All topics')}</span></div>`);
  }
  function renderPolls(s) {
    list($('featurePollsList'), s.polls, 'Create your first poll.', p => `<div class="spike-feature-row"><div><b>${esc(p.question)}</b><small>${p.options.length} options · ${p.votes || 0} votes</small></div><button type="button" class="spike-feature-mini" data-poll-vote="${esc(p.id)}">Vote</button></div>`);
  }
  function renderSeries(s) {
    list($('featureSeriesList'), s.series, 'No Signal Series yet.', x => `<div class="spike-feature-row"><div><b>${esc(x.title)}</b><small>${esc(x.description || 'Signal Series')}</small></div><span>${x.items.length} part${x.items.length===1?'':'s'}</span></div>`);
  }
  function renderCollabs(s) {
    list($('featureCollabList'), s.collabs, 'No collaboration requests yet.', x => `<div class="spike-feature-row"><div><b>Post ${esc(x.postId)}</b><small>Invite: ${esc(x.collaboratorId)}</small></div><span>${esc(x.status)}</span></div>`);
  }
  function renderCreator(s) {
    list($('featureMembershipList'), s.memberships, 'No membership tier yet.', x => `<div class="spike-feature-row"><div><b>${esc(x.name)}</b><small>${esc(x.description || 'Creator membership')}</small></div><span>${x.monthlyCoins} Coins / month</span></div>`);
    list($('featureProductList'), s.products, 'No creator products yet.', x => `<div class="spike-feature-row"><div><b>${esc(x.title)}</b><small>${esc(x.description || x.productType)}</small></div><span>${x.priceCoins} Coins</span></div>`);
  }
  function renderSearch() {
    const q = $('featureSearchInput')?.value.trim().toLowerCase() || '';
    const posts = Array.isArray(window.state?.posts) ? window.state.posts : [];
    const users = [...(window.state?.users?.values?.() || [])];
    const results = [];
    if (q) {
      posts.filter(p => `${p.content||''} ${p.authorUid||''}`.toLowerCase().includes(q)).slice(0,8).forEach(p => results.push(`<button type="button" class="spike-search-result" data-search-post="${esc(p.id)}"><b>Signal</b><span>${esc(String(p.content||'Untitled').slice(0,110))}</span></button>`));
      users.filter(u => `${u.username||''} ${u.display_name||u.full_name||''}`.toLowerCase().includes(q)).slice(0,8).forEach(u => results.push(`<button type="button" class="spike-search-result" data-search-user="${esc(u.id)}"><b>Person</b><span>${esc(u.display_name||u.full_name||u.username||'SPIKE user')}</span></button>`));
    }
    $('featureSearchResults').innerHTML = q ? (results.join('') || '<div class="spike-feature-empty">No results found in the current SPIKE data.</div>') : '<div class="spike-feature-empty">Search Signals and people from the current Feed.</div>';
  }
  async function renderReputation() {
    const out = $('featureReputationBody'); if (!out) return;
    out.innerHTML = '<div class="spike-feature-loading">Loading Reputation…</div>';
    let score = 50, events = 0;
    try {
      const client = db();
      if (client && uid()) {
        const r = await client.rpc('spike_my_reputation');
        if (!r.error && r.data) { score = Number(r.data.score ?? 50); events = Number(r.data.events ?? 0); }
      }
    } catch {}
    const local = featureState();
    const localEvents = local.reputationEvents || [];
    score = Math.max(0, Math.min(100, score + localEvents.reduce((n,e)=>n+Number(e.points||0),0)));
    events += localEvents.length;
    out.innerHTML = `<div class="spike-score"><strong>${score}</strong><span>/100 Reputation</span></div><p>Your Reputation reflects constructive participation and trust signals. XP and Level remain separate.</p><small>${events} reputation event${events===1?'':'s'} recorded.</small>`;
  }
  function renderResume(s) {
    list($('featureResumeList'), s.resume.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)), 'Nothing to resume.', x => `<div class="spike-feature-row"><div><b>${esc(x.title)}</b><small>${esc(x.route)} · ${new Date(x.updatedAt).toLocaleString()}</small></div><button type="button" class="spike-feature-mini" data-resume="${esc(x.id)}">Resume</button></div>`);
  }
  function renderDashboard(s) {
    const posts = Array.isArray(window.state?.posts) ? window.state.posts : [];
    const me = window.state?.user;
    const views = posts.reduce((n,p)=>n+Number(p.views||p.viewCount||0),0);
    const saved = window.state?.saved?.size || 0;
    const following = window.state?.following?.size || 0;
    const metrics = [
      ['Signals', posts.filter(p=>p.authorUid===me?.id).length],
      ['Views', views],
      ['Saved', saved],
      ['Following', following],
      ['Custom Feeds', s.feeds.length],
      ['Series', s.series.length],
      ['Polls', s.polls.length],
      ['Resumable', s.resume.length]
    ];
    $('featureDashboardGrid').innerHTML = metrics.map(([a,b])=>`<div class="spike-dashboard-stat"><strong>${esc(b)}</strong><span>${esc(a)}</span></div>`).join('');
  }

  async function createCustomFeed() {
    const name = $('featureFeedName')?.value.trim(); if (!name) return toast('Enter a Feed name','warning');
    const topics = ($('featureFeedTopics')?.value || '').split(',').map(x=>x.trim()).filter(Boolean).slice(0,20);
    const row = { id: crypto.randomUUID(), name, description: $('featureFeedDescription')?.value.trim() || '', rules:{topics}, createdAt:new Date().toISOString() };
    const s=featureState(); s.feeds.unshift(row); write(s); renderFeeds(s);
    try { if (db() && uid()) { const r=await db().from('spike_custom_feeds').insert({owner_id:uid(),name,description:row.description,rules:row.rules}).select().single(); if(r.error) throw r.error; } } catch { /* local-first keeps the feature usable if the new migration has not reached the database */ }
    ['featureFeedName','featureFeedDescription','featureFeedTopics'].forEach(id=>{if($(id))$(id).value=''});
    toast('Custom Feed created','success');
  }

  async function createPoll() {
    const q=$('featurePollQuestion')?.value.trim();
    const options=($('featurePollOptions')?.value||'').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,8);
    if(!q || options.length<2) return toast('Add a question and at least two options','warning');
    const row={id:crypto.randomUUID(),question:q,options,votes:0,createdAt:new Date().toISOString()};
    const s=featureState(); s.polls.unshift(row); write(s); renderPolls(s);
    try {
      if(db()&&uid()) {
        const r=await db().from('spike_polls').insert({id:row.id,owner_id:uid(),question:q}).select('id').single(); if(r.error) throw r.error;
        const opts=options.map((label,i)=>({poll_id:row.id,label,position:i})); const rr=await db().from('spike_poll_options').insert(opts); if(rr.error) throw rr.error;
      }
    } catch {}
    $('featurePollQuestion').value=''; $('featurePollOptions').value=''; toast('Poll created','success');
  }

  async function createSeries() {
    const title=$('featureSeriesTitle')?.value.trim(); const ids=($('featureSeriesPosts')?.value||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,30);
    if(!title) return toast('Enter a Series title','warning');
    const row={id:crypto.randomUUID(),title,description:$('featureSeriesDescription')?.value.trim()||'',items:ids.map((postId,i)=>({postId,position:i})),createdAt:new Date().toISOString()};
    const s=featureState(); s.series.unshift(row); write(s); renderSeries(s);
    try { if(db()&&uid()){ const r=await db().from('spike_signal_series').insert({id:row.id,owner_id:uid(),title,description:row.description}).select('id').single(); if(r.error)throw r.error; if(ids.length){const rr=await db().from('spike_series_items').insert(ids.map((postId,i)=>({series_id:row.id,post_id:postId,position:i,title:`Part ${i+1}`})));if(rr.error)throw rr.error;} } } catch {}
    ['featureSeriesTitle','featureSeriesDescription','featureSeriesPosts'].forEach(id=>{if($(id))$(id).value=''}); toast('Signal Series created','success');
  }

  async function createCollab() {
    const postId=$('featureCollabPost')?.value.trim(), collaboratorId=$('featureCollabUser')?.value.trim();
    if(!postId||!collaboratorId) return toast('Enter a post ID and collaborator ID','warning');
    const row={id:crypto.randomUUID(),postId,collaboratorId,status:'pending',createdAt:new Date().toISOString()};
    const s=featureState();s.collabs.unshift(row);write(s);renderCollabs(s);
    try{if(db()&&uid()){const r=await db().from('spike_signal_collaborators').insert({post_id:postId,owner_id:uid(),collaborator_id:collaboratorId});if(r.error)throw r.error;}}catch{}
    $('featureCollabPost').value='';$('featureCollabUser').value='';toast('Collaboration invite created','success');
  }

  async function createMembership() {
    const name=$('featureMembershipName')?.value.trim(), coins=Number($('featureMembershipCoins')?.value||0);
    if(!name||!Number.isFinite(coins)||coins<1)return toast('Enter a membership name and monthly Coin price','warning');
    const row={id:crypto.randomUUID(),name,description:$('featureMembershipDescription')?.value.trim()||'',monthlyCoins:Math.round(coins),createdAt:new Date().toISOString()};
    const s=featureState();s.memberships.unshift(row);write(s);renderCreator(s);
    try{if(db()&&uid()){const r=await db().from('spike_creator_memberships').insert({id:row.id,creator_id:uid(),name,description:row.description,monthly_coins:row.monthlyCoins});if(r.error)throw r.error;}}catch{}
    ['featureMembershipName','featureMembershipDescription','featureMembershipCoins'].forEach(id=>{if($(id))$(id).value=''});toast('Membership tier created','success');
  }

  async function createProduct() {
    const title=$('featureProductTitle')?.value.trim(), coins=Number($('featureProductCoins')?.value||0);
    if(!title||!Number.isFinite(coins)||coins<1)return toast('Enter a product name and Coin price','warning');
    const row={id:crypto.randomUUID(),title,description:$('featureProductDescription')?.value.trim()||'',productType:$('featureProductType')?.value||'digital',priceCoins:Math.round(coins),createdAt:new Date().toISOString()};
    const s=featureState();s.products.unshift(row);write(s);renderCreator(s);
    try{if(db()&&uid()){const r=await db().from('spike_creator_products').insert({id:row.id,creator_id:uid(),title,description:row.description,product_type:row.productType,price_coins:row.priceCoins});if(r.error)throw r.error;}}catch{}
    ['featureProductTitle','featureProductDescription','featureProductCoins'].forEach(id=>{if($(id))$(id).value=''});toast('Creator product created','success');
  }

  function saveResume(title='Continue where you left off', route=location.href, payload={}) {
    const s=featureState(); const id=crypto.randomUUID(); s.resume.unshift({id,title,route,payload,updatedAt:new Date().toISOString()}); s.resume=s.resume.slice(0,10); write(s); renderResume(s);
    try{if(db()&&uid())db().from('spike_resume_states').upsert({user_id:uid(),action_key:id,title,route,payload,updated_at:new Date().toISOString()});}catch{}
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('spikePulseBtn')?.addEventListener('click', open);
    $('spikeFeatureHub')?.addEventListener('click', e => {
      const t=e.target.closest('[data-feature-tab]'); if(t){setTab(t.dataset.featureTab);return;}
      if(e.target.closest('[data-feature-close]')){close();return;}
      const vote=e.target.closest('[data-poll-vote]');
      if(vote){
        const item=featureState().polls.find(x=>x.id===vote.dataset.pollVote);
        if(item){ item.votes=Number(item.votes||0)+1; const s=featureState(); s.polls=s.polls.map(x=>x.id===item.id?item:x); write(s); renderPolls(s); toast('Vote recorded','success'); }
        return;
      }
      const b=e.target.closest('[data-feature-action]'); if(!b)return;
      const action=b.dataset.featureAction;
      if(action==='feed')createCustomFeed(); if(action==='poll')createPoll(); if(action==='series')createSeries(); if(action==='collab')createCollab(); if(action==='membership')createMembership(); if(action==='product')createProduct();
      if(action==='search')renderSearch();
    });
    $('featureSearchInput')?.addEventListener('input',()=>renderSearch());
    $('featureSearchInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();renderSearch();}});
    $('featureResumeList')?.addEventListener('click',e=>{const b=e.target.closest('[data-resume]');if(!b)return;const item=featureState().resume.find(x=>x.id===b.dataset.resume);if(item){location.href=item.route;}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('spikeFeatureHub')?.classList.contains('open'))close();});
    let resumeSavedAt=0;
    const saveComposerResume=()=>{
      const text=$('signalText')?.value.trim();
      if(!text || Date.now()-resumeSavedAt<5000) return;
      resumeSavedAt=Date.now();
      saveResume('Continue your Signal draft','feed.html#spikeComposer',{text:text.slice(0,1000)});
    };
    $('signalText')?.addEventListener('input',()=>{ if(document.visibilityState==='hidden') saveComposerResume(); });
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') saveComposerResume(); });
    updatePulse();
    window.setInterval(updatePulse,30000);
    window.SPIKEFeatureSuite={open,close,setTab,saveResume,render,syncRemote};
  });
})();
