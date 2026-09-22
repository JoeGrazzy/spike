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
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  async function requireDb() { const c=db(); if(!c || !uid()) throw new Error('Please sign in to use this feature.'); return c; }
  async function remoteInsert(table, payload) { const c=await requireDb(); const r=await c.from(table).insert(payload).select().single(); if(r.error) throw r.error; return r.data; }
  function setLocalActiveFeed(feed) { try { localStorage.setItem('spike-active-custom-feed', JSON.stringify(feed)); } catch {} window.SPIKE_ACTIVE_CUSTOM_FEED = feed || null; if(window.state) { window.state.customFeed = feed || null; window.state.visiblePosts = 20; } if(typeof window.refreshSignalRanking==='function') window.refreshSignalRanking({force:true,render:true}); else window.renderSignals?.(); }

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
      ['feeds','spike_custom_feeds','id, name, description, rules, created_at'],
      ['polls','spike_polls','id, question, created_at'],
      ['series','spike_signal_series','id, title, description, status, created_at'],
      ['collabs','spike_signal_collaborators','post_id, owner_id, collaborator_id, status, created_at'],
      ['memberships','spike_creator_memberships','id, name, description, monthly_coins, created_at'],
      ['products','spike_creator_products','id, title, description, product_type, price_coins, created_at'],
      ['resume','spike_resume_states','action_key, title, route, payload, updated_at']
    ];
    await Promise.all(jobs.map(async ([key, table, columns]) => {
      const {data,error}=await client.from(table).select(columns).order(key==='resume'?'updated_at':'created_at',{ascending:false}).limit(50);
      if (error || !Array.isArray(data)) return;
      if(key==='feeds') s.feeds=data.map(x=>({id:x.id,name:x.name,description:x.description,rules:x.rules||{},createdAt:x.created_at}));
      if(key==='polls') {
        const ids=data.map(x=>x.id); let opts=[];
        if(ids.length){const rr=await client.from('spike_poll_options').select('id,poll_id,label,position').in('poll_id',ids).order('position',{ascending:true}); opts=rr.data||[];}
        const counts=new Map();
        if(ids.length){const rr=await client.from('spike_poll_votes').select('poll_id,option_id').in('poll_id',ids); for(const v of rr.data||[]) counts.set(v.option_id,(counts.get(v.option_id)||0)+1);}
        s.polls=data.map(x=>{const options=opts.filter(o=>o.poll_id===x.id).map(o=>({...o,votes:counts.get(o.id)||0}));return {id:x.id,question:x.question,options,votes:options.reduce((n,o)=>n+o.votes,0),createdAt:x.created_at};});
      }
      if(key==='series') {
        const ids=data.map(x=>x.id); const rr=ids.length?await client.from('spike_series_items').select('id,series_id,post_id,position,title').in('series_id',ids).order('position',{ascending:true}):{data:[]}; const items=rr.data||[];
        s.series=data.map(x=>({id:x.id,title:x.title,description:x.description,status:x.status,items:items.filter(i=>i.series_id===x.id),createdAt:x.created_at}));
      }
      if(key==='collabs') s.collabs=data.map(x=>({id:`${x.post_id}:${x.collaborator_id}`,postId:x.post_id,ownerId:x.owner_id,collaboratorId:x.collaborator_id,status:x.status,createdAt:x.created_at}));
      if(key==='memberships') s.memberships=data.map(x=>({id:x.id,name:x.name,description:x.description,monthlyCoins:x.monthly_coins,createdAt:x.created_at}));
      if(key==='products') s.products=data.map(x=>({id:x.id,title:x.title,description:x.description,productType:x.product_type,priceCoins:x.price_coins,createdAt:x.created_at}));
      if(key==='resume') s.resume=data.map(x=>({id:x.action_key,title:x.title,route:x.route,payload:x.payload||{},updatedAt:x.updated_at}));
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
    list($('featureFeedsList'), s.feeds, 'No custom Feeds yet.', x => `<div class="spike-feature-row"><div><b>${esc(x.name)}</b><small>${esc(x.description || 'Personal Feed')}</small></div><span>${esc((x.rules?.topics || []).join(', ') || 'All topics')}</span><div class="spike-feature-actions"><button type="button" class="spike-feature-mini" data-feed-use="${esc(x.id)}">Use</button><button type="button" class="spike-feature-mini danger" data-feed-delete="${esc(x.id)}">Delete</button></div></div>`);
  }
  function renderPolls(s) {
    list($('featurePollsList'), s.polls, 'Create your first poll.', p => {
      const options=Array.isArray(p.options)?p.options:[];
      const choices=options.map(o=>`<label class="spike-poll-choice"><input type="radio" name="poll-${esc(p.id)}" value="${esc(o.id)}"><span>${esc(o.label)}</span><small>${Number(o.votes||0)} vote${Number(o.votes||0)===1?'':'s'}</small></label>`).join('');
      return `<div class="spike-feature-row spike-feature-poll"><div><b>${esc(p.question)}</b><small>${options.length} options · ${Number(p.votes||0)} total votes</small></div>${choices?`<div class="spike-poll-options">${choices}</div><button type="button" class="spike-feature-mini" data-poll-vote="${esc(p.id)}">Vote</button>`:'<small>Poll options are unavailable.</small>'}</div>`;
    });
  }
  function renderSeries(s) {
    list($('featureSeriesList'), s.series, 'No Signal Series yet.', x => `<div class="spike-feature-row"><div><b>${esc(x.title)}</b><small>${esc(x.description || 'Signal Series')} · ${x.items.length} part${x.items.length===1?'':'s'}</small></div><div class="spike-feature-actions"><button type="button" class="spike-feature-mini" data-series-open="${esc(x.id)}">Open</button></div></div>`);
  }
  function renderCollabs(s) {
    list($('featureCollabList'), s.collabs, 'No collaboration requests yet.', x => {
      const pending=String(x.status)==='pending' && String(x.collaboratorId)===String(uid());
      return `<div class="spike-feature-row"><div><b>Signal ${esc(x.postId)}</b><small>${pending?'Collaboration request':'Collaborator'} · ${esc(x.collaboratorId)}</small></div><div class="spike-feature-actions">${pending?`<button type="button" class="spike-feature-mini" data-collab-respond="accept" data-collab-post="${esc(x.postId)}" data-collab-owner="${esc(x.ownerId||'')}">Accept</button><button type="button" class="spike-feature-mini danger" data-collab-respond="decline" data-collab-post="${esc(x.postId)}" data-collab-owner="${esc(x.ownerId||'')}">Decline</button>`:`<span>${esc(x.status)}</span>`}</div></div>`;
    });
  }
  function renderCreator(s) {
    list($('featureMembershipList'), s.memberships, 'No membership tier yet.', x => `<div class="spike-feature-row"><div><b>${esc(x.name)}</b><small>${esc(x.description || 'Creator membership')}</small></div><span>${x.monthlyCoins} Coins / month</span></div>`);
    list($('featureProductList'), s.products, 'No creator products yet.', x => `<div class="spike-feature-row"><div><b>${esc(x.title)}</b><small>${esc(x.description || x.productType)}</small></div><span>${x.priceCoins} Coins</span></div>`);
  }
  async function renderSearch() {
    const q = $('featureSearchInput')?.value.trim() || '';
    const resultsEl=$('featureSearchResults'); if(!resultsEl) return;
    if(!q){resultsEl.innerHTML='<div class="spike-feature-empty">Search Signals and people across the available SPIKE data.</div>';return;}
    resultsEl.innerHTML='<div class="spike-feature-loading">Searching SPIKE…</div>';
    const posts = Array.isArray(window.state?.posts) ? window.state.posts : [];
    const localUsers = [...(window.state?.users?.values?.() || [])];
    const results=[];
    posts.filter(p => String(p.content||'').toLowerCase().includes(q.toLowerCase())).slice(0,8).forEach(p => results.push(`<button type="button" class="spike-search-result" data-search-post="${esc(p.id)}"><b>Signal</b><span>${esc(String(p.content||'Untitled').slice(0,110))}</span></button>`));
    localUsers.filter(u => `${u.username||''} ${u.display_name||u.full_name||''}`.toLowerCase().includes(q.toLowerCase())).slice(0,8).forEach(u => results.push(`<button type="button" class="spike-search-result" data-search-user="${esc(u.id)}"><b>Person</b><span>${esc(u.display_name||u.full_name||u.username||'SPIKE user')}</span></button>`));
    try {
      const c=await requireDb();
      const {data:users,error:userErr}=await c.from('profiles').select('id,username,display_name,full_name').or(`username.ilike.%${q.replace(/[%_,]/g,'')}%,display_name.ilike.%${q.replace(/[%_,]/g,'')}%,full_name.ilike.%${q.replace(/[%_,]/g,'')}%`).limit(8);
      if(!userErr) (users||[]).forEach(u=>{if(!results.some(x=>x.includes(`data-search-user=\"${u.id}\"`))) results.push(`<button type="button" class="spike-search-result" data-search-user="${esc(u.id)}"><b>Person</b><span>${esc(u.display_name||u.full_name||u.username||'SPIKE user')}</span></button>`);});
    } catch {}
    resultsEl.innerHTML=results.join('')||'<div class="spike-feature-empty">No matching SPIKE results.</div>';
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
    try {
      const row=await remoteInsert('spike_custom_feeds',{owner_id:uid(),name,description:$('featureFeedDescription')?.value.trim()||'',rules:{topics}});
      const s=featureState(); s.feeds.unshift({id:row.id,name:row.name,description:row.description,rules:row.rules||{},createdAt:row.created_at}); write(s); renderFeeds(s);
      ['featureFeedName','featureFeedDescription','featureFeedTopics'].forEach(id=>{if($(id))$(id).value=''}); toast('Custom Feed created','success');
    } catch(e){ toast(e?.message||'Could not create Custom Feed','error'); }
  }

  async function createPoll() {
    const q=$('featurePollQuestion')?.value.trim(); const options=($('featurePollOptions')?.value||'').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,8);
    if(!q || options.length<2) return toast('Add a question and at least two options','warning');
    try {
      const row=await remoteInsert('spike_polls',{owner_id:uid(),question:q});
      const rr=await (await requireDb()).from('spike_poll_options').insert(options.map((label,i)=>({poll_id:row.id,label,position:i}))); if(rr.error) throw rr.error;
      await syncRemote(); renderPolls(featureState()); $('featurePollQuestion').value=''; $('featurePollOptions').value=''; toast('Poll created','success');
    } catch(e){ toast(e?.message||'Could not create Poll','error'); }
  }

  async function createSeries() {
    const title=$('featureSeriesTitle')?.value.trim(); const ids=($('featureSeriesPosts')?.value||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,30);
    if(!title) return toast('Enter a Series title','warning');
    try {
      const row=await remoteInsert('spike_signal_series',{owner_id:uid(),title,description:$('featureSeriesDescription')?.value.trim()||''});
      if(ids.length){const rr=await (await requireDb()).from('spike_series_items').insert(ids.map((postId,i)=>({series_id:row.id,post_id:postId,position:i,title:`Part ${i+1}`})));if(rr.error)throw rr.error;}
      await syncRemote(); renderSeries(featureState()); ['featureSeriesTitle','featureSeriesDescription','featureSeriesPosts'].forEach(id=>{if($(id))$(id).value=''}); toast('Signal Series created','success');
    } catch(e){ toast(e?.message||'Could not create Signal Series','error'); }
  }

  async function createCollab() {
    const postId=$('featureCollabPost')?.value.trim(), collaboratorId=$('featureCollabUser')?.value.trim();
    if(!postId||!collaboratorId) return toast('Enter a Signal ID and collaborator ID','warning');
    if(!/^[0-9a-f-]{36}$/i.test(collaboratorId)) return toast('Collaborator ID must be a valid SPIKE user ID','warning');
    try {
      await remoteInsert('spike_signal_collaborators',{post_id:postId,owner_id:uid(),collaborator_id:collaboratorId});
      await syncRemote(); renderCollabs(featureState()); $('featureCollabPost').value='';$('featureCollabUser').value='';toast('Collaboration invite sent','success');
    } catch(e){ toast(e?.message||'Could not send collaboration invite','error'); }
  }

  async function createMembership() {
    const name=$('featureMembershipName')?.value.trim(), coins=Number($('featureMembershipCoins')?.value||0);
    if(!name||!Number.isFinite(coins)||coins<1)return toast('Enter a membership name and monthly Coin price','warning');
    try { const row=await remoteInsert('spike_creator_memberships',{creator_id:uid(),name,description:$('featureMembershipDescription')?.value.trim()||'',monthly_coins:Math.round(coins)}); await syncRemote(); renderCreator(featureState()); ['featureMembershipName','featureMembershipDescription','featureMembershipCoins'].forEach(id=>{if($(id))$(id).value=''}); toast('Membership tier created','success'); }
    catch(e){ toast(e?.message||'Could not create membership','error'); }
  }

  async function createProduct() {
    const title=$('featureProductTitle')?.value.trim(), coins=Number($('featureProductCoins')?.value||0);
    if(!title||!Number.isFinite(coins)||coins<1)return toast('Enter a product name and Coin price','warning');
    try { const row=await remoteInsert('spike_creator_products',{creator_id:uid(),title,description:$('featureProductDescription')?.value.trim()||'',product_type:$('featureProductType')?.value||'digital',price_coins:Math.round(coins)}); await syncRemote(); renderCreator(featureState()); ['featureProductTitle','featureProductDescription','featureProductCoins'].forEach(id=>{if($(id))$(id).value=''}); toast('Creator product created','success'); }
    catch(e){ toast(e?.message||'Could not create product','error'); }
  }

  async function deleteCustomFeed(id) {
    try { const c=await requireDb(); const r=await c.from('spike_custom_feeds').delete().eq('id',id).eq('owner_id',uid()); if(r.error)throw r.error; const s=featureState();s.feeds=s.feeds.filter(x=>x.id!==id);write(s); if(window.state?.customFeed?.id===id)setLocalActiveFeed(null); renderFeeds(s); toast('Custom Feed deleted','success'); } catch(e){toast(e?.message||'Could not delete Custom Feed','error');}
  }
  async function votePoll(id) {
    const input=document.querySelector(`input[name="poll-${CSS.escape(String(id))}"]:checked`); if(!input)return toast('Choose an option first','warning');
    try { const c=await requireDb(); const r=await c.rpc('spike_cast_poll_vote',{p_poll_id:id,p_option_id:input.value}); if(r.error)throw r.error; await syncRemote(); renderPolls(featureState()); toast('Vote recorded','success'); } catch(e){toast(e?.message||'Could not record your vote','error');}
  }
  async function respondCollab(postId, ownerId, accept) {
    try { const c=await requireDb(); const r=await c.rpc('spike_signal_collaboration_respond',{p_post_id:postId,p_owner_id:ownerId,p_accept:accept}); if(r.error)throw r.error; await syncRemote(); renderCollabs(featureState()); toast(accept?'Collaboration accepted':'Collaboration declined','success'); } catch(e){toast(e?.message||'Could not update collaboration','error');}
  }
  function openSeries(id) {
    const s=featureState().series.find(x=>String(x.id)===String(id)); if(!s)return;
    const first=s.items?.[0]?.post_id || s.items?.[0]?.postId; if(first){ const el=document.querySelector(`[data-post="${CSS.escape(String(first))}"]`); if(el){close();el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('moment-focus');setTimeout(()=>el.classList.remove('moment-focus'),1400);return;} }
    toast(`${s.title}: ${s.items?.length||0} parts`,'info');
  }

  function saveResume(title='Continue where you left off', route=location.href, payload={}) {
    const id=`resume:${uid()}:${String(route).slice(0,120)}`; const s=featureState(); const row={id,title,route,payload,updatedAt:new Date().toISOString()}; s.resume=[row,...s.resume.filter(x=>x.id!==id)].slice(0,10); write(s); renderResume(s);
    requireDb().then(c=>c.from('spike_resume_states').upsert({user_id:uid(),action_key:id,title,route,payload,updated_at:new Date().toISOString()},{onConflict:'user_id,action_key'})).catch(e=>console.warn('[SPIKE RESUME]',e));
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('spikePulseBtn')?.addEventListener('click', open);
    $('spikeFeatureHub')?.addEventListener('click', e => {
      const t=e.target.closest('[data-feature-tab]'); if(t){setTab(t.dataset.featureTab);return;}
      if(e.target.closest('[data-feature-close]')){close();return;}
      const vote=e.target.closest('[data-poll-vote]'); if(vote){ votePoll(vote.dataset.pollVote); return; }
      const feedUse=e.target.closest('[data-feed-use]'); if(feedUse){ const x=featureState().feeds.find(f=>String(f.id)===String(feedUse.dataset.feedUse)); if(x){setLocalActiveFeed(x);close();toast(`Using ${x.name}`,'success');} return; }
      const feedDelete=e.target.closest('[data-feed-delete]'); if(feedDelete){deleteCustomFeed(feedDelete.dataset.feedDelete);return;}
      const seriesOpen=e.target.closest('[data-series-open]'); if(seriesOpen){openSeries(seriesOpen.dataset.seriesOpen);return;}
      const collab=e.target.closest('[data-collab-respond]'); if(collab){respondCollab(collab.dataset.collabPost,collab.dataset.collabOwner,collab.dataset.collabRespond==='accept');return;}
      const b=e.target.closest('[data-feature-action]'); if(!b)return;
      const action=b.dataset.featureAction;
      if(action==='feed')createCustomFeed(); if(action==='poll')createPoll(); if(action==='series')createSeries(); if(action==='collab')createCollab(); if(action==='membership')createMembership(); if(action==='product')createProduct();
      if(action==='search')renderSearch();
    });
    $('featureSearchInput')?.addEventListener('input',()=>renderSearch());
    $('featureSearchInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();renderSearch();}});
    $('featureSearchResults')?.addEventListener('click',e=>{ const p=e.target.closest('[data-search-post]'); if(p){close();document.querySelector(`[data-post=\"${CSS.escape(String(p.dataset.searchPost))}\"]`)?.scrollIntoView({behavior:'smooth',block:'center'});return;} const u=e.target.closest('[data-search-user]'); if(u){location.href=`view_user.html?uid=${encodeURIComponent(u.dataset.searchUser)}`;} });
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
