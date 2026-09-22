
function renderDiscover(q=''){
  const el = $('v2DiscoverResults');
  if(!el) return;
  const needle=q.trim().toLowerCase();
  const ps=state.posts || [];
  const matched=ps.filter(p=>!needle||JSON.stringify(p).toLowerCase().includes(needle)).slice(0,8);
  const tagCounts=new Map();
  ps.forEach(p=>{(String(p.content||'').match(/#[a-z0-9_]+/ig)||[]).forEach(t=>tagCounts.set(t.toLowerCase(),(tagCounts.get(t.toLowerCase())||0)+1));});
  let tags=[...tagCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
  if(needle)tags=tags.filter(([t])=>t.includes(needle));
  el.innerHTML=`
    <div class="discover-section-title">#️⃣ Topics & communities</div>
    <div class="spike-chip-row">${tags.map(([t,n])=>`<button class="spike-chip" data-discover-tag="${esc(t)}">${esc(t)} <small>(${n})</small></button>`).join('')||'<span class="meta">Hashtags from current posts will appear here.</span>'}</div>
    <div class="discover-section-title">📝 ${needle?'Search results':'Explore posts'}</div>
    <div class="discover-list">${matched.map(p=>`<div class="discover-item"><div class="discover-main"><b>${esc((p.content||'Untitled').slice(0,100))}</b><small>${reactionLikeCount(p)} likes · ${Array.isArray(p.comments)?p.comments.length:0} comments</small></div></div>`).join('')||'<div class="empty">No matching posts yet.</div>'}</div>`;
}

// ─── PROFILE PREVIEW ──────────────────────────────────
async function openSpikeProfilePreview(id, seed){
  const body = $('spikeProfileBody');
  const sheet = $('spikeProfileSheet');
  if(!body || !sheet || !id || id === state.user?.id) {
    if(id === state.user?.id) location.href = profileLink(id);
    return;
  }
  window.__SPIKE_PROFILE_FOCUS__ = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const requestId = (window.__SPIKE_PROFILE_REQUEST__ = (window.__SPIKE_PROFILE_REQUEST__ || 0) + 1);
  const previousFocus = document.activeElement;
  body.innerHTML='<div class="spike-profile-loading" role="status" aria-live="polite"><div class="spike-profile-spinner"></div><div>Loading profile…</div></div>';
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';

  let profile = seed && typeof seed === 'object' ? {...seed} : {};
  let mutual = Number(profile.mutual_count || 0);
  let relationship = 'stranger';
  let posts = [];
  const currentUid = state.user?.id || '';
  const safeQuery = async fn => { try { return await fn(); } catch(error) { return {data:null,error}; } };

  const profileReq = safeQuery(async () => {
    const r=await db.rpc('get_public_profiles',{p_user_ids:[id]});
    return {data:r.data?.[0]||null,error:r.error};
  });
  const [pr] = await Promise.all([profileReq]);
  if(requestId !== window.__SPIKE_PROFILE_REQUEST__) return;
  if(!pr.error && pr.data) profile = {...profile,...pr.data};
  if(!pr.error && pr.data) {
    const rel=pr.data.relationship||pr.data.friendship_status||pr.data.relationship_status;
    if(rel==='friend'||rel==='request_sent'||rel==='request_received') relationship=rel;
  }
  // Recent posts come from the already-authorized feed cache; profile metadata
  // itself is sourced exclusively from the public-profile RPC above.
  posts = state.posts.filter(p=>p.authorUid===id && !p.deleted)
    .sort((a,b)=>new Date(b.createdAt||b.created_at||0)-new Date(a.createdAt||a.created_at||0)).slice(0,3);
  const name = profile.display_name || profile.name || profile.username || 'User';
  const username = profile.username ? '@'+profile.username : '';
  const bio = profile.bio || '';
  const location = profile.location || '';
  const avatarUrl = safeHttpUrl(profile.avatar_url || profile.avatar || profile.photo_url || '');
  const avatarHtml = identityAvatar(profile,'spike-profile-avatar',name);
  const rel = {
    friend:{badge:'✓ Friends',primary:'💬 Message',secondary:'📞 Voice Call',tertiary:'🎥 Video Call'},
    request_sent:{badge:'⏳ Request sent',primary:'Request Sent',secondary:'Cancel Request',tertiary:'Message'},
    request_received:{badge:'💌 Wants to connect',primary:'Accept',secondary:'Decline',tertiary:'Message'},
    stranger:{badge:'Suggested connection',primary:'Add Friend',secondary:'Follow',tertiary:'Message'}
  }[relationship];
  const mutualLabel = mutual ? `👥 ${mutual} mutual friend${mutual===1?'':'s'}` : '✨ Suggested for you';
  body.innerHTML=`
    <div class="spike-profile-hero">
      <div class="spike-profile-topline"><span class="spike-profile-status">${esc(rel.badge)}</span><button class="spike-profile-more" type="button" data-profile-more aria-label="More profile actions">•••</button></div>
      ${avatarHtml}<h2 id="spikeProfileName" class="spike-profile-name">${esc(name)}</h2>
      ${username?`<div class="spike-profile-username">${esc(username)}</div>`:''}
      ${location?`<div class="spike-profile-meta">${esc(location)}</div>`:''}
      ${bio?`<div class="spike-profile-bio">${esc(bio)}</div>`:''}
      <div class="spike-profile-mutual">${esc(mutualLabel)}</div>
      <div class="spike-premium-stats"><div class="spike-premium-stat"><b>${posts.length}</b><span>Recent posts</span></div><div class="spike-premium-stat"><b>${mutual||'—'}</b><span>Mutual friends</span></div><div class="spike-premium-stat"><b>✓</b><span>SPIKE member</span></div></div>
      <div class="spike-quick-actions"><button type="button" data-pq="pass">SPIKE Pass Signal</button><button type="button" data-pq="copy">🔗 Copy link</button><button type="button" data-pq="mute">🔕 Mute</button><button type="button" data-pq="report">⚑ Report</button></div>
      <div class="spike-profile-actions"><button class="spike-profile-primary" data-profile-primary="${esc(id)}">${esc(rel.primary)}</button><button class="spike-profile-secondary" data-profile-secondary="${esc(id)}">${esc(rel.secondary)}</button><button class="spike-profile-tertiary" data-profile-tertiary="${esc(id)}">${esc(rel.tertiary)}</button></div>
    </div>
    <section class="spike-profile-section" aria-labelledby="spikeProfileRecentTitle"><div class="spike-profile-section-head"><strong id="spikeProfileRecentTitle">Recent Posts</strong>${posts.length?`<span class="spike-profile-count">${posts.length}</span>`:''}</div><div class="spike-profile-posts">${posts.length?posts.map(p=>{const bodyText=String(p.content||p.text||p.body||'');const media=safeHttpUrl(p.media_url||p.image_url||'');return `<article class="spike-profile-post"><div class="spike-profile-post-time">${esc(ago(p.createdAt||p.created_at))}</div>${bodyText?`<div>${esc(bodyText).slice(0,420)}</div>`:''}${media?`<img class="spike-profile-post-media" src="${esc(media)}" alt="Signal media" loading="lazy" decoding="async">`:''}</article>`}).join(''):'<div class="spike-profile-empty">No public posts yet.</div>'}</div></section>
    <div class="spike-profile-privacy-note"><span aria-hidden="true">🛡️</span><span>Only information allowed by this person’s privacy settings is shown here.</span></div>`;

  body.querySelectorAll('[data-pq]').forEach(btn=>btn.addEventListener('click',async()=>{
    const act=btn.dataset.pq;
    if(act==='share'||act==='copy'){
      const url=location.origin+location.pathname+'?profile='+encodeURIComponent(id);
      try{if(act==='share'&&navigator.share){await navigator.share({title:'SPIKE profile',url});toast('Profile shared','success');return;}await copyTextSafe(url);toast('Profile link copied','success');}catch(e){if(e?.name!=='AbortError')toast('Could not share profile','error');}
    } else if(act==='mute') toast('Use the profile menu to manage mute settings.','info');
    else if(act==='report') toast('Use the profile menu to report this account.','info');
  }));
  body.querySelector('[data-profile-primary]')?.addEventListener('click',async()=>{if(relationship==='friend')location.href='message.html?private_uid='+encodeURIComponent(id);else if(relationship==='request_sent')await cancelFriendRequest(id);else if(relationship==='request_received')await acceptFriendRequest(id);else await sendFriendRequest(id,null);});
  body.querySelector('[data-profile-secondary]')?.addEventListener('click',async()=>{
    if(relationship==='friend'){if(typeof window.startCall==='function')window.startCall(id,'audio');else location.href='message.html?private_uid='+encodeURIComponent(id)+'&call=audio';return;}
    if(relationship==='request_sent'){await cancelFriendRequest(id);return;}
    if(relationship==='request_received'){await declineFriendRequest(id);return;}
    try{
      const me=await getDoc(`users/${state.user.id}`).catch(()=>({}));
      const following=new Set(Array.isArray(me?.following)?me.following:state.following||[]);
      const isFollowing=following.has(id);
      if(isFollowing) following.delete(id); else following.add(id);
      await putDoc(`users/${state.user.id}`,{...(me||{}),following:[...following]},`users`);
      state.following=following;
      const btn=body.querySelector('[data-profile-secondary]');
      if(btn)btn.textContent=isFollowing?'Follow':'Following';
      toast(isFollowing?'Unfollowed':'Following','success');
      rankingDirty=true;rankingCache.clear();renderSignals();
    }catch(e){toast(e?.message||'Could not update following','error');}
  });
  body.querySelector('[data-profile-tertiary]')?.addEventListener('click',()=>{if(relationship==='friend'&&typeof window.startCall==='function')window.startCall(id,'video');else location.href='message.html?private_uid='+encodeURIComponent(id);});
  body.querySelector('[data-profile-more]')?.addEventListener('click',()=>showProfileActions(id,relationship,name));
  setTimeout(()=>body.querySelector('[data-profile-more]')?.focus(),0);
}

function closeSpikeProfile(){
  const sheet = $('spikeProfileSheet');
  sheet?.classList.remove('open');
  sheet?.setAttribute('aria-hidden','true');
  closeProfileActions();
  document.body.style.overflow = '';
  try { window.__SPIKE_PROFILE_REQUEST__ = (window.__SPIKE_PROFILE_REQUEST__ || 0) + 1; window.__SPIKE_PROFILE_FOCUS__?.focus?.(); } catch(_) {}
  window.__SPIKE_PROFILE_FOCUS__ = null;
}

async function cancelFriendRequest(id){
  try{ const r=await db.rpc('cancel_friend_request',{p_recipient_id:id}); if(r.error) throw r.error; toast('Request cancelled','success'); relationship='stranger'; } catch(e){ toast(e?.message||'Could not cancel request','error'); }
}
async function resolvePendingFriendRequestId(otherId){
  if(!state.user?.id||!otherId) throw new Error('Friend request participant is missing.');
  const {data,error}=await db.from('friend_requests')
    .select('id,sender_id,recipient_id,status')
    .or(`and(sender_id.eq.${state.user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${state.user.id})`)
    .eq('status','pending').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error) throw error;
  if(!data?.id) throw new Error('The friend request is no longer pending.');
  return data.id;
}
async function acceptFriendRequest(id){
  try{ const requestId=await resolvePendingFriendRequestId(id); const r=await db.rpc('accept_friend_request',{p_request_id:requestId}); if(r.error) throw r.error; toast('Friend request accepted','success'); relationship='friend'; } catch(e){ toast(e?.message||'Could not accept request','error'); }
}
async function declineFriendRequest(id){
  try{ const requestId=await resolvePendingFriendRequestId(id); const r=await db.rpc('decline_friend_request',{p_request_id:requestId}); if(r.error) throw r.error; toast('Request declined','success'); relationship='stranger'; } catch(e){ toast(e?.message||'Could not decline request','error'); }
}

function closeProfileActions(){
  const s=$('spikeProfileActions');
  if(!s) return;
  s.classList.remove('show');
  s.setAttribute('aria-hidden','true');
}

function showProfileActions(id, relationship, name){
  const s=$('spikeProfileActions'), b=$('spikeProfileActionButtons');
  if(!s||!b) return;
  const items=[];
  const run=async(fn)=>{ closeProfileActions(); closeSpikeProfile(); try{ await fn(); } catch(e){ console.error('[SPIKE profile action]',e); toast(e?.message||'Action could not be completed','error'); } };
  items.push(['👤','View profile',()=>{ closeProfileActions(); window.location.href=profileLink(id); }]);
  if(relationship==='friend'){
    items.push(['💬','Message',()=>{ location.href='message.html?private_uid='+encodeURIComponent(id); }]);
    items.push(['📞','Voice call',()=>{ location.href='message.html?private_uid='+encodeURIComponent(id)+'&call=audio'; }]);
    items.push(['🎥','Video call',()=>{ location.href='message.html?private_uid='+encodeURIComponent(id)+'&call=video'; }]);
    items.push(['❌','Unfriend',()=>run(async ()=>{
      const ok=await premiumConfirm({title:'Unfriend user', message:`Remove ${name} from your friends?`, confirmText:'Unfriend', cancelText:'Cancel', icon:'🗑️', danger:true });
      if(!ok)return;
      const r=await db.rpc('dm_unfriend',{p_other_user_id:id});
      if(r.error) throw r.error;
      if(window.state?.following instanceof Set) window.state.following.delete(id);
      toast('Friend removed','success');
      window.dispatchEvent(new CustomEvent('spike:friends-changed'));
    })]);
  } else if(relationship==='request_sent'){
    items.push(['↩️','Cancel request',()=>run(()=>cancelFriendRequest(id))]);
  } else if(relationship==='request_received'){
    items.push(['✓','Accept request',()=>run(()=>acceptFriendRequest(id))]);
    items.push(['×','Decline request',()=>run(()=>declineFriendRequest(id))]);
  } else {
    items.push(['➕','Add friend',()=>run(()=>sendFriendRequest(id,null))]);
    items.push(['💬','Message',()=>{ location.href='message.html?private_uid='+encodeURIComponent(id); }]);
  }
  items.push(['🔗','Share profile',()=>run(async()=>{
    const url=location.origin+location.pathname+'?profile='+encodeURIComponent(id);
    if(navigator.share){ try{ await navigator.share({title:name||'SPIKE profile',url}); toast('Profile shared','success'); return; } catch(e){ if(e?.name==='AbortError')return; } }
    await copyTextSafe(url); toast('Profile link copied','success');
  })]);
  items.push(['🔕','Mute',()=>run(async()=>{
    if(!state.muted) state.muted=new Set();
    const muted=state.muted.has(id);
    let doc={}; try{ doc=await getDoc(`users/${state.user.id}`)||{}; } catch(_){}
    const set=new Set(Array.isArray(doc.mutedAuthors)?doc.mutedAuthors:[]);
    if(muted) set.delete(id); else set.add(id);
    await putDoc(`users/${state.user.id}`,{...doc,mutedAuthors:[...set]},'users');
    state.muted=set; toast(muted?'Unmuted':'Muted','success');
    renderSignals();
  })]);
  items.push(['🚫','Block',()=>run(async()=>{
    const ok=await premiumConfirm({title:'Block user', message:`Block ${name}? They will not be able to interact with you.`, confirmText:'Block', cancelText:'Cancel', icon:'🚫', danger:true });
    if(!ok)return;
    const r=await db.rpc('dm_block_user',{p_other_user_id:id});
    if(r.error) throw r.error;
    if(state.blocked) state.blocked.add(id);
    toast('User blocked','success');
    renderSignals();
  })]);
  items.push(['⚠️','Report',()=>run(async()=>{
    const reason=await window.SPIKEPremiumDialog.input({title:`Report ${name}`,message:'Please enter a reason for review.',placeholder:'Reason…',value:'',confirmText:'Submit report',cancelText:'Cancel',kicker:'SPIKE SAFETY',maxLength:500});
    if(!reason||!reason.trim()) return;
    toast('User reporting is not available in the current Supabase schema.','warning');
  })]);

  b.innerHTML=items.map((x,i)=>`<button type="button" data-action-index="${i}" class="${/Unfriend|Block|Report/.test(x[1])?'danger':''}">${x[0]}&nbsp; ${esc(x[1])}</button>`).join('');
  b.querySelectorAll('[data-action-index]').forEach((el,i)=>el.addEventListener('click',()=>{ try{ items[i][2](); } catch(e){ toast(e?.message||'Action failed','error'); } }));
  s.classList.add('show'); s.setAttribute('aria-hidden','false');
}

// ─── AI SEARCH ─────────────────────────────────────────
function initAISearch(){
  const overlay = $('spikeAiSearchOverlay'), input = $('spikeAiInput'), body = $('spikeAiBody');
  if(!overlay||!input||!body) return;
  const words = s => String(s||'').toLowerCase().replace(/[^a-z0-9#@]+/g,' ').trim().split(/\s+/).filter(Boolean);
  const stop = new Set('the a an and or to of in on for with how do i is are can my me your what why where when who does it this that from about please show tell'.split(' '));
  const clean = s => words(s).filter(w=>w.length>1&&!stop.has(w));
  const posts = () => state.posts || [];
  const users = () => [...state.users.values()];
  const corpus = () => {
    const docs = [];
    const help = [
      ['Getting started','Create an account, complete your profile, then explore the Feed, Messages and Rooms.'],
      ['Profile','Update your username, profile picture, cover image and profile information.'],
      ['Feed','Browse personalized, discovery and trending content. Start Signals, react, Echo, Pass, save and connect.'],
      ['Stories','Open Stories to view updates, move between stories, interact and reply where available.'],
      ['Friends','Send friend requests, manage incoming requests and build connections.'],
      ['Messages','Open Messages, choose a conversation, type a message and send it.'],
      ['Calls','Open an eligible private conversation and choose audio or video call.'],
      ['Rooms','Browse Rooms, open a community, join it when available, select a channel and participate.'],
      ['Notifications','Review activity such as mentions, announcements and system updates.'],
      ['Safety','Report inappropriate content, block accounts when needed, choose audiences carefully.'],
      ['Password recovery','Use the password recovery option on the sign-in screen if you forget your password.']
    ];
    help.forEach(x=>docs.push({type:'help',title:x[0],text:x[1],url:null}));
    posts().slice(0,100).forEach(p=>docs.push({type:'post',title:String(p.content||'Post').slice(0,90),text:String(p.content||''),url:null,raw:p}));
    users().slice(0,100).forEach(u=>docs.push({type:'person',title:u.display_name||u.username||u.name||'SPIKE user',text:[u.username,u.bio,u.location].filter(Boolean).join(' '),url:profileLink(u.id),raw:u}));
    return docs;
  };
  function score(q,doc){ const qs=clean(q), text=(doc.title+' '+doc.text).toLowerCase(), title=doc.title.toLowerCase(); let n=0; qs.forEach(w=>{if(title.includes(w))n+=5; if(text.includes(w))n+=2;}); return n; }
  function answer(q,results){ const l=q.toLowerCase(); if(/video.*call|call.*video/.test(l))return 'To make a video call, open an eligible private conversation and choose the video-call option.'; if(/audio.*call|call.*audio/.test(l))return 'To make an audio call, open an eligible private conversation and choose the audio-call option.'; if(/create|make|post/.test(l)&&/post|feed/.test(l))return 'Open the Feed and start a new Signal. Add supported text or media, then publish your update.'; if(/room/.test(l))return 'Open Rooms to discover communities. Select a Room, join when available, then choose a channel.'; if(/friend|connect/.test(l))return 'Use Friends or a person\'s profile to send connection requests.'; if(/message|chat/.test(l))return 'Open Messages, choose a person or existing conversation, type your message and send it.'; if(/password|forgot/.test(l))return 'Use the password recovery option on the sign-in screen.'; if(/profile|username|avatar/.test(l))return 'Open your profile to update your username, profile picture and other information.'; if(/story|stories/.test(l))return 'Open the Stories area to view updates. You can move through stories and interact.'; if(results[0])return `I found information related to “${q}”. The most relevant result is “${results[0].title}”.`; return `I couldn't find a strong match for “${q}” in the information currently available. Try a shorter question or include a feature name.`; }
  function run(q){ q=q.trim(); if(!q)return; const docs=corpus().map(d=>({...d,_score:score(q,d)})).filter(d=>d._score>0).sort((a,b)=>b._score-a._score).slice(0,8); const ans=answer(q,docs); body.innerHTML=`<div class="spike-ai-answer"><div class="spike-ai-answer-label">✦ Local answer</div><p>${esc(ans)}</p></div><div class="spike-ai-related-title">Related results</div><div class="spike-ai-results">${docs.length?docs.slice(0,6).map((d,i)=>`<div class="spike-ai-result" data-url="${esc(d.url||'')}"><b>${esc(d.title)}</b><small>${esc((d.text||'').slice(0,180))}${(d.text||'').length>180?'…':''}</small></div>`).join(''):'<div class="spike-ai-empty">No matching SPIKE content found.</div>'}</div>`; }
  function openAI(){ overlay.classList.add('open'); overlay.setAttribute('aria-hidden','false'); setTimeout(()=>input.focus(),30); }
  function closeAI(){ overlay.classList.remove('open'); overlay.setAttribute('aria-hidden','true'); }
  $('spikeAiSearchBtn')?.addEventListener('click',openAI);
  $('spikeAiClose')?.addEventListener('click',closeAI);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) closeAI(); });
  $('spikeAiGo')?.addEventListener('click',()=>run(input.value));
  input.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); run(input.value); } if(e.key==='Escape') closeAI(); });
  body.addEventListener('click',e=>{ const chip=e.target.closest('.spike-ai-chip'); if(chip){ input.value=chip.textContent; run(input.value); return; } const r=e.target.closest('.spike-ai-result'); if(r?.dataset.url) location.href=r.dataset.url; });
  document.addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); openAI(); } });
}

// ─── MODERN APP V3 ────────────────────────────────────
function initModernApp(){
  const DRAFT_KEY = 'spike-modern-draft-v1';
  const PIN_KEY = 'spike-pinned-post-v1';

  const composer = document.querySelector('.spike-signal-composer');
  const text = $('signalText');
  if(composer && text){
    let collapseTimer = null;
    const resizeComposerText = () => {
      if (!text) return;
      if (!composer.classList.contains('spike-expanded')) {
        text.style.height = '';
        text.style.overflowY = 'hidden';
        return;
      }
      text.style.height = 'auto';
      const next = Math.min(Math.max(text.scrollHeight, 64), 180);
      text.style.height = next + 'px';
      text.style.overflowY = text.scrollHeight > 180 ? 'auto' : 'hidden';
    };
    const setComposerOpen = (open, focusField = false) => {
      if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
      composer.classList.toggle('spike-expanded', open);
      composer.classList.toggle('spike-collapsed', !open);
      composer.setAttribute('data-composer-open', String(open));
      // Critical mobile behavior: while collapsed, the textarea is read-only.
      // A swipe/scroll beginning over it therefore cannot focus it or expose the
      // posting controls. Only an intentional click/tap enters compose mode.
      text.readOnly = !open;
      text.setAttribute('aria-expanded', String(open));
      resizeComposerText();
      if (open && focusField) {
        requestAnimationFrame(() => {
          text.focus({preventScroll:true});
          resizeComposerText();
        });
      }
    };
    const expand = (focusField = false) => setComposerOpen(true, focusField);
    const collapse = (delay = 80) => {
      if (collapseTimer) clearTimeout(collapseTimer);
      collapseTimer = setTimeout(() => {
        const active = document.activeElement;
        const inside = active && composer.contains(active);
        if (!inside) setComposerOpen(false, false);
      }, delay);
    };

    // The composer is intentionally compact until the writing field is actually in use.
    setComposerOpen(false, false);

    // Do NOT expand on pointerdown/focus: a finger swipe that starts over the
    // compact field must remain a normal page scroll. The field is read-only
    // until an actual click/tap is completed.
    text.addEventListener('click', () => {
      if (!composer.classList.contains('spike-expanded')) {
        expand(true);
      } else {
        text.focus({preventScroll:true});
      }
    });
    text.addEventListener('focus', () => {
      if (!composer.classList.contains('spike-expanded')) {
        text.blur();
        return;
      }
      resizeComposerText();
    });
    text.addEventListener('input', () => {
      try{ localStorage.setItem(DRAFT_KEY, text.value); }catch(_){}
      expand(false);
      resizeComposerText();
    });

    // Keep the expanded state while any composer control is being used.
    composer.addEventListener('focusin', expand);
    composer.addEventListener('focusout', () => {
      setTimeout(() => {
        if (!composer.contains(document.activeElement)) collapse();
      }, 0);
    });
    composer.addEventListener('pointerdown', e => {
      // Controls intentionally expand on touch; the textarea does not, because
      // it is the scroll-sensitive compact surface.
      if (e.target.closest('button,input,select,label') && !e.target.closest('#signalText')) expand(false);
    }, true);
    document.addEventListener('pointerdown', e => {
      if (!composer.contains(e.target)) collapse(40);
    }, true);

    // When the writing field is no longer focused and no composer control is active,
    // return automatically to the compact state.
    text.addEventListener('blur', () => collapse(100));
    text.addEventListener('keydown', e => {
      if (e.key === 'Escape' && composer.classList.contains('spike-expanded')) {
        e.preventDefault();
        text.blur();
        setComposerOpen(false, false);
      }
    });

    try{
      const draft = localStorage.getItem(DRAFT_KEY);
      if(draft){ text.value = draft; }
    }catch(_){}
    $('releaseSignalBtn')?.addEventListener('click', () => {
      setTimeout(() => {
        try{ localStorage.removeItem(DRAFT_KEY); }catch(_){}
        setComposerOpen(false, false);
      }, 300);
    });

    // Mobile keyboards can resize the viewport after focus. Re-center the composer
    // so the revealed tools are not hidden behind the keyboard/bottom navigation.
    if (window.visualViewport) {
      let lastHeight = window.visualViewport.height;
      window.visualViewport.addEventListener('resize', () => {
        const h = window.visualViewport.height;
        if (composer.classList.contains('spike-expanded') && document.activeElement === text && Math.abs(h-lastHeight) > 40) {
          setTimeout(() => {
            try { composer.scrollIntoView({behavior:'smooth', block:'nearest'}); } catch(_) {}
          }, 120);
        }
        lastHeight = h;
      });
    }
  }

  // Pin posts via shift+click on more button
  function pinSignal(id){
    try{ const current = localStorage.getItem(PIN_KEY); localStorage.setItem(PIN_KEY, current === id ? '' : id); }catch(_){}
    if(typeof window.renderSignals === 'function') window.renderSignals();
  }

  const postsContainer = $('posts');
  if(postsContainer){
    postsContainer.addEventListener('click', e => {
      const more = e.target.closest('.more');
      if(more && e.shiftKey){ e.preventDefault(); pinSignal(more.closest('.post')?.dataset.post); }
      const quote = e.target.closest('[data-modern-quote]');
      if(quote){ e.preventDefault(); const post=quote.closest('.post'); const name=post?.querySelector('.post-name')?.textContent?.trim()||'SPIKE user'; const content=post?.querySelector('.caption-body')?.textContent?.trim()||''; if(text && composer){ text.value=`\n\n❝ ${content.slice(0,280)}\n— ${name}`; composer.classList.remove('spike-collapsed'); composer.classList.add('spike-expanded'); composer.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(()=>text.focus(),250); } }
    });
  }

  // Bottom nav
  const nav = $('spikeBottomNav');
  if(nav){
    nav.addEventListener('click', e => {
      const b = e.target.closest('[data-spike-nav]');
      if(!b) return;
      nav.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      const target = b.dataset.spikeNav;
      if(target === 'home'){ window.scrollTo({top:0,behavior:'smooth'}); }
      if(target === 'discover'){ document.querySelector('[data-v2="discover"]')?.click(); $('feedV2Hub')?.scrollIntoView({behavior:'smooth',block:'start'}); }
      if(target === 'create'){ const c=document.querySelector('.spike-signal-composer'); const t=$('signalText'); c?.classList.remove('spike-collapsed'); c?.classList.add('spike-expanded'); document.getElementById('spikeBottomNav')?.classList.add('spike-composer-nav-hidden'); document.body.classList.add('spike-composer-active'); c?.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(()=>t?.focus(),250); }
      if(target === 'activity'){ refreshNotificationBadge(); window.location.href='notifications.html'; }
      if(target === 'profile'){ $('profileBtn')?.click(); }
    });
  }
}

// ─── EVENT BINDING ─────────────────────────────────────

// ─── LONG-PRESS MEDIA ACTIONS ─────────────────────────
let spikeLongPressTimer=null, spikeLongPressTarget=null, spikeLongPressMoved=false, spikeLongPressOpened=false;
function closeMediaLongpress(){ const sheet=$('spikeMediaLongpress'); if(!sheet)return; sheet.classList.remove('open'); sheet.setAttribute('aria-hidden','true'); if(spikeLongPressTarget)spikeLongPressTarget.classList.remove('longpress-active'); spikeLongPressTarget=null; spikeLongPressOpened=false; document.body.style.overflow=''; }
function openMediaLongpress(button){ const sheet=$('spikeMediaLongpress'); if(!sheet)return; spikeLongPressTarget=button; const img=button.querySelector('img'); const thumb=$('spikeMediaLongpressThumb'); thumb.innerHTML=img?.src?`<img src="${esc(img.src)}" alt="" loading="lazy" decoding="async">`:''; const post=button.closest('.post'); const caption=post?.querySelector('[data-caption]')?.innerText?.trim()||'SPIKE media'; $('spikeMediaLongpressMeta').textContent=caption.slice(0,80)||'Selected media'; sheet.classList.add('open'); sheet.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; spikeLongPressOpened=true; button.classList.add('longpress-active'); }
function longpressMediaUrl(){ return spikeLongPressTarget?.dataset?.image||''; }
async function mediaUrlToFile(url){ const r=await fetch(url,{mode:'cors'}); if(!r.ok)throw new Error('Media could not be loaded'); const blob=await r.blob(); const ext=(blob.type.split('/')[1]||'jpg').replace(/[^a-z0-9]/gi,''); return new File([blob],`spike-media-${Date.now()}.${ext||'jpg'}`,{type:blob.type||'image/jpeg'}); }
async function useLongpressMedia(action){ const url=longpressMediaUrl(); if(!url)return; closeMediaLongpress(); if(action==='details'){ const img=spikeLongPressTarget?.querySelector('img'); const show=()=>{ const w=img?.naturalWidth||'—',h=img?.naturalHeight||'—'; toast(`Image · ${w}×${h}`,'success'); }; if(img?.complete)show(); else if(img){img.addEventListener('load',show,{once:true});} return; } try{ const file=await mediaUrlToFile(url); if(action==='new-signal'){ addMediaFiles([file]); $('signalText')?.focus(); $('signalText')?.scrollIntoView({behavior:'smooth',block:'center'}); toast('Media added to a new Signal','success'); } else if(action==='story'){ const input=$('storyMediaInput'); if(input){ const dt=new DataTransfer(); dt.items.add(file); input.files=dt.files; $('storyMediaName').textContent=file.name; openOverlay('storyOverlay'); toast('Media added to your story','success'); } else throw new Error('Story composer unavailable'); } }catch(e){ toast(e?.message||'Could not reuse this media','error'); } }
function bindLongpressMedia(){ const posts=$('posts'); if(!posts)return; posts.addEventListener('pointerdown',e=>{ const b=e.target.closest('button[data-image]'); if(!b)return; if(e.pointerType==='mouse'&&e.button!==0)return; clearTimeout(spikeLongPressTimer); spikeLongPressMoved=false; spikeLongPressOpened=false; spikeLongPressTimer=setTimeout(()=>{ if(!spikeLongPressMoved){ openMediaLongpress(b); } },560); }); posts.addEventListener('pointermove',e=>{ if(!spikeLongPressTimer)return; if(Math.abs(e.movementX)>8||Math.abs(e.movementY)>8){spikeLongPressMoved=true;clearTimeout(spikeLongPressTimer);spikeLongPressTimer=null;} }); const cancel=()=>{clearTimeout(spikeLongPressTimer);spikeLongPressTimer=null;}; posts.addEventListener('pointerup',cancel); posts.addEventListener('pointercancel',cancel); posts.addEventListener('pointerleave',cancel); posts.addEventListener('click',e=>{ if(spikeLongPressOpened){e.preventDefault();e.stopPropagation(); spikeLongPressOpened=false; } },true); }
function updateCaptionToggles() {
  document.querySelectorAll('#posts [data-caption]').forEach(box => {
    const body = box.querySelector('.caption-body');
    const toggle = box.querySelector('[data-caption-toggle]');
    if (!body || !toggle) return;
    const text = String(body.textContent || '').trim();
    // Avoid measuring hidden/empty captions. Long captions get the control; short
    // captions stay clean and do not show a useless See more button.
    let needsToggle = text.length > 280;
    if (!needsToggle) {
      const wasCollapsed = box.classList.contains('is-collapsed');
      if (wasCollapsed) box.classList.remove('is-collapsed');
      const fullHeight = body.scrollHeight;
      box.classList.toggle('is-collapsed', wasCollapsed);
      needsToggle = fullHeight > (body.clientHeight + 8);
    }
    toggle.hidden = !needsToggle;
    toggle.setAttribute('aria-expanded', box.classList.contains('is-collapsed') ? 'false' : 'true');
    toggle.setAttribute('aria-label', box.classList.contains('is-collapsed') ? 'See more of this Signal' : 'See less of this Signal');
  });
}

function handleCaptionToggle(button) {
  const box = button?.closest('[data-caption]');
  if (!box) return;
  const article = button.closest('[data-post]');
  const id = article?.dataset.post;
  const collapsed = box.classList.toggle('is-collapsed');
  if (id) {
    if (collapsed) state.expandedCaptions.delete(String(id));
    else state.expandedCaptions.add(String(id));
  }
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  button.setAttribute('aria-label', collapsed ? 'See more of this Signal' : 'See less of this Signal');
}

function bindClick(id, handler) { const el = $(id); if (el) el.onclick = handler; }
function bindChange(id, handler) { const el = $(id); if (el) el.onchange = handler; }

function bindEvents() {
  bindLongpressMedia();
  $('spikeMediaLongpress')?.addEventListener('click',e=>{ if(e.target.id==='spikeMediaLongpress'||e.target.closest('[data-longpress-close]')) closeMediaLongpress(); const action=e.target.closest('[data-longpress-action]')?.dataset.longpressAction; if(action) useLongpressMedia(action); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape' && $('spikeMediaLongpress')?.classList.contains('open')) closeMediaLongpress(); });
  const imageViewerClose=$('feedImageViewerClose');
  imageViewerClose?.addEventListener('click', closeFeedImageViewer);
  $('feedImageViewerPrev')?.addEventListener('click', () => stepFeedImageViewer(-1));
  $('feedImageViewerNext')?.addEventListener('click', () => stepFeedImageViewer(1));
  $('feedImageViewer')?.addEventListener('click', e=>{
    if(e.target.closest('[data-feed-image-close]')) closeFeedImageViewer();
  });
  document.addEventListener('keydown', e=>{
    if($('feedImageViewer')?.classList.contains('open')){ if(e.key==='Escape') closeFeedImageViewer(); else if(e.key==='ArrowLeft') stepFeedImageViewer(-1); else if(e.key==='ArrowRight') stepFeedImageViewer(1); }
  });
  // Navigation
  // Header profile control removed; profile remains available from the menu/bottom navigation.
  bindClick('menuBtn', () => openOverlay('menuOverlay'));
  $('menuClose')?.addEventListener('click', () => closeOverlay('menuOverlay'));
  $('menuOverlay')?.addEventListener('click', e => { if (e.target.id === 'menuOverlay') closeOverlay('menuOverlay'); });
  bindClick('closeAnnouncement', () => { $('announcement')?.classList.remove('show'); sessionStorage.setItem('spikeAnnouncementClosed', '1'); });

  // Menu items
  bindClick('menuProfile', () => go(profileLink(state.user.id)));
  bindClick('menuFriends', () => go('friends.html'));
  bindClick('menuMessages', () => go('messages.html'));
  bindClick('menuSettings', () => go('settings.html'));
  bindClick('menuSaved', async () => { closeOverlay('menuOverlay'); try { await openSavedCollections(); } catch (e) { console.error('Saved & Collections', e); toast(e.message || 'Unable to open Saved & Collections'); } });
  bindClick('menuAudience', async () => { closeOverlay('menuOverlay'); try { await openCloseFriends(); } catch (e) { console.error('Close Friends', e); toast(e.message || 'Unable to open Close Friends'); } });
  bindClick('menuPolicy', () => go('policy.html'));
  bindClick('menuPolicyAppeals', () => go('policy_appeals.html'));
  bindClick('menuSafety', async () => { closeOverlay('menuOverlay'); try { await openSafetyCenter(); } catch (e) { console.error('Safety Center', e); toast(e.message || 'Unable to open Safety Center'); } });
  bindClick('menuRoom', () => go('rooms.html'));
  bindClick('menuGuide', () => go('guide.html'));
  bindClick('menuWorld', () => go('spike_world.html'));


  $('menuAdmin')?.addEventListener('click', async e => {
    e.preventDefault();
    const allowed = await verifyAdminUid();
    if (!allowed) {
      closeOverlay('menuOverlay');
      toast('Admin access is restricted.','error');
      return;
    }
    location.href = 'admin.html';
  });
  bindClick('menuSignOut', () => { const o=$('logoutConfirmOverlay'); if(o) o.classList.add('show'); });
  bindClick('logoutCancel', () => $('logoutConfirmOverlay')?.classList.remove('show'));
  bindClick('logoutConfirmOverlay', e => { if(e.target.id==='logoutConfirmOverlay') e.currentTarget.classList.remove('show'); });
  bindClick('logoutYes', async () => { const btn=$('logoutYes'); btn.disabled=true; btn.textContent='Signing out…'; try { cleanupFeedRuntime(); const {error}=await db.auth.signOut({scope:'local'}); if(error) throw error; location.replace('index.html?logged_out=1'); } catch(err) { btn.disabled=false; btn.textContent='Yes, sign out'; console.error('SPIKE logout error:',err); toast(err?.message||'Could not sign out','error'); } });

  // Composer
  bindClick('imageBtn', () => $('imageInput').click());
  bindClick('videoBtn', () => $('videoInput').click());
  bindClick('mediaAddMore', openMediaPicker);
  bindChange('imageInput', e => { addMediaFiles(e.target.files); e.target.value=''; });
  bindChange('videoInput', e => { addMediaFiles(e.target.files); e.target.value=''; });
  bindChange('mediaInput', e => { addMediaFiles(e.target.files); e.target.value=''; });
  bindClick('removeMedia', clearMedia);
  bindClick('scheduleBtn', () => $('scheduleRow').classList.toggle('show'));
  bindClick('linkBtn', () => openOverlay('linkOverlay'));
  bindClick('addLink', () => { const u = $('linkInput').value.trim(); try{const x=new URL(u);if(!/^https?:$/.test(x.protocol))throw new Error();}catch(_){toast('Enter a valid http(s) link','warning');return;} $('signalText').value += `${$('signalText').value?'\n':''}${u}`; closeOverlay('linkOverlay'); $('signalText').dispatchEvent(new Event('input',{bubbles:true})); });
  bindClick('cancelLink', () => closeOverlay('linkOverlay'));
  bindClick('releaseSignalBtn', releaseSignal);
  $('signalText')?.addEventListener('input',()=>{const c=$('signalCharCount');if(c)c.textContent=`${$('signalText').value.length} / 5000`;});
  $('saveDraftBtn')?.addEventListener('click',()=>saveCurrentDraft());
  $('contentCenterBtn')?.addEventListener('click',()=>openContentCenter('drafts'));
  $('contentCenterClose')?.addEventListener('click',()=>closeOverlay('contentCenterOverlay'));
  $('contentCenterBody')?.addEventListener('click',async e=>{const r=e.target.closest('[data-draft-restore]');if(r){await restoreDraft(r.dataset.draftRestore);closeOverlay('contentCenterOverlay');return;}const b=e.target.closest('[data-draft-delete]');if(!b)return;try{await deleteDraftRecord(b.dataset.draftDelete);renderContentCenter('drafts');toast('Draft deleted','success')}catch(_){toast('Could not delete draft','error')}});
  $('signalText')?.addEventListener('input',queueAutoDraft); $('linkInput')?.addEventListener('input',queueAutoDraft); $('scheduleTime')?.addEventListener('change',queueAutoDraft);
  document.querySelectorAll('[data-center-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-center-tab]').forEach(x=>x.classList.toggle('active',x===b));renderContentCenter(b.dataset.centerTab)}));
  $('composeAiBtn')?.addEventListener('click',()=>{const p=$('composeAiPanel');if(p)p.hidden=!p.hidden});
  document.querySelectorAll('[data-ai-action]').forEach(b=>b.addEventListener('click',()=>localAiAction(b.dataset.aiAction)));
  document.querySelectorAll('[data-media-edit]').forEach(b=>b.addEventListener('click',()=>applyMediaEdit(b.dataset.mediaEdit)));
  $('mediaLayoutSelect')?.addEventListener('change',e=>{state.mediaLayout=e.target.value;renderMediaStudio()});

  // Story
  bindClick('storyBtn', () => openOverlay('storyOverlay'));
  bindClick('cancelStory', () => closeOverlay('storyOverlay'));
  bindClick('publishStory', publishStory);
  bindClick('storyMediaBtn', () => $('storyMediaInput').click());
  bindClick('storyAudioBtn', () => $('storyAudioInput').click());
  bindChange('storyMediaInput', e => { const f = e.target.files?.[0]; if (f) $('storyMediaName').textContent = `Selected: ${f.name}`; });
  bindChange('storyAudioInput', e => { const f = e.target.files?.[0]; if (f) $('storyAudioName').textContent = `Selected: ${f.name}`; });

  // Story actions
  bindClick('cancelStoryActions', () => closeOverlay('storyActionsOverlay'));
  bindClick('storyActionShare', () => { const s = storyFor(activeStoryActionId); if (s) shareStoryToFriends(s); });
  bindClick('storyActionDelete', () => deleteStory(activeStoryActionId));

  // Story viewer
  $('storyViewerClose')?.addEventListener('click', storyViewerClose);
  $('storyPrev')?.addEventListener('click', () => storyGo(-1));
  $('storyNext')?.addEventListener('click', () => storyGo(1));
  document.addEventListener('keydown', e => {
    if(!$('storyViewer')?.classList.contains('open')) return;
    if(e.key==='Escape') storyViewerClose();
    else if(e.key==='ArrowRight') storyGo(1);
    else if(e.key==='ArrowLeft') storyGo(-1);
  });
  StoryEngine.bind();

  // Stories row click
  $('storiesRow')?.addEventListener('click', e => {
    const b = e.target.closest('[data-story]');
    if (b) storyViewerOpen(b.dataset.story);
  });

  // Filters
  $('filters')?.addEventListener('click', e => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    document.querySelectorAll('.filter').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.filter = b.dataset.filter;
    state.visiblePosts = 20;
    renderSignals();
  });

  // Feed V2 nav
  $('feedV2Nav')?.addEventListener('click', e => {
    const b = e.target.closest('[data-v2]');
    if (!b) return;
    document.querySelectorAll('[data-v2-panel]').forEach(x => x.classList.toggle('open', x.dataset.v2Panel === b.dataset.v2));
    document.querySelectorAll('[data-v2]').forEach(x => x.classList.toggle('active', x === b));
    if (b.dataset.v2 === 'trending') renderTrending();
    if (b.dataset.v2 === 'analytics') renderAnalytics();
    if (b.dataset.v2 === 'gamify') renderGamify();
    if (b.dataset.v2 === 'reels') renderReels();
    if (b.dataset.v2 === 'discover') setTimeout(() => renderDiscover($('v2DiscoverSearch')?.value||''), 0);
    if (b.dataset.v2 === 'moments') renderMoments();
  });

  bindClick('v2SaveSafety', saveSettings);
  bindClick('v2NearbyEnable', findNearby);
  bindClick('v2NearbyReset', () => { $('v2NearbyList').innerHTML = '<div class="empty">Nearby discovery is opt-in.</div>'; });
  bindClick('v2MomentsRefresh', renderMoments);
  $('v2MomentsList')?.addEventListener('click', e => { const b=e.target.closest('[data-moment-post]'); if(!b)return; const p=state.posts.find(x=>String(x.id)===String(b.dataset.momentPost)); if(!p)return; queueFeedEvent(p.id,'moment_open',{metadata:{surface:'moments'}}); const article=document.querySelector(`[data-post="${CSS.escape(String(p.id))}"]`); if(article){article.scrollIntoView({behavior:'smooth',block:'center'}); article.classList.add('moment-focus'); setTimeout(()=>article.classList.remove('moment-focus'),1600);} });
  document.querySelectorAll('[data-trend-window]').forEach(b => b.onclick = renderTrending);
  $('v2DiscoverGo')?.addEventListener('click', () => renderDiscover($('v2DiscoverSearch')?.value||''));
  $('v2DiscoverSearch')?.addEventListener('keydown', e => { if(e.key==='Enter') renderDiscover(e.target.value); });
  $('v2DiscoverResults')?.addEventListener('click', e => {
    const tag=e.target.closest('[data-discover-tag]');
    if(tag){ const input=$('v2DiscoverSearch'); if(input)input.value=tag.dataset.discoverTag; renderDiscover(tag.dataset.discoverTag); }
  });

  // SPIKE Pass overlay
  $('spikePassClose')?.addEventListener('click', () => closeOverlay('spikePassOverlay'));
  document.querySelectorAll('[data-pass-mode]').forEach(b => b.addEventListener('click', async () => { document.querySelectorAll('[data-pass-mode]').forEach(x=>x.classList.toggle('active',x===b)); const p=state.posts.find(x=>x.id===state.activePost); if(!p)return; if(b.dataset.passMode==='friends'){await spikeLoadPassFriends();spikePassSelected=new Set();spikePassRender();}else spikePassRenderLink(spikePassUrl(p.id)); }));

  // Reels
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-open-reel]');
    if (!b) return;
    const p = state.posts.find(x => x.id === b.dataset.openReel);
    if (!p || !p.mediaUrl) return;
    recordSignal(p.id, 'opens', 1); scheduleSignalRefresh();
    const list = rankSignals(state.posts.filter(x => {
      if (!x || !x.mediaUrl || x.deleted) return false;
      const items = Array.isArray(x.mediaItems) && x.mediaItems.length ? x.mediaItems : [{url:x.mediaUrl,type:x.mediaType||'image',originalUrl:x.mediaOriginalUrl}];
      return items.some(m => mediaKindOf(m)==='video');
    }),'forYou').slice(0,10);
    $('reelsFullList').innerHTML = list.map(x => `<div style="position:relative;min-height:100%;display:grid;place-items:center;padding:24px 8px;scroll-snap-align:start"><video src="${esc(signalVideoPlaybackUrl({url:x.mediaUrl,playbackUrl:x.mediaUrl,watermarked:!!x.mediaWatermarked,normalized:!!x.mediaNormalized}))}" controls autoplay muted playsinline loop style="width:min(100%,520px);max-height:88vh;border-radius:16px;background:#000"></video>${videoWatermarkForSignal({watermarked:!!x.mediaWatermarked},x)}</div>`).join('');
    openOverlay('reelsShell');
  }, true);
  bindClick('reelsClose', () => closeOverlay('reelsShell'));

  // Signal reading controls
  $('posts')?.addEventListener('click', e => {
    const b = e.target.closest('[data-caption-toggle]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    handleCaptionToggle(b);
  }, true);

  // Post interactions (delegated)
  $('posts')?.addEventListener('click', handleSignalClick);
  $('posts')?.addEventListener('submit', handleSignalSubmit);
  $('signalTopPicksRefresh')?.addEventListener('click', () => refreshSignalRanking());
  $('signalTopPicksList')?.addEventListener('click', e => {
    const b = e.target.closest('[data-signal-pick]');
    if (!b) return;
    const id = b.dataset.signalPick;
    recordSignal(id, 'opens', 1);
    const article = getSignalArticle(id);
    if (article) article.scrollIntoView({ behavior: 'smooth', block: 'center' });
    scheduleSignalRefresh();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshSignalRanking(); });
  startSignalAutoRefresh();

  // Report overlay
  bindClick('confirmReport', () => reportSignal(state.activePost, $('reportReason').value));
  bindClick('cancelReport', () => closeOverlay('reportOverlay'));

  // Premium sheet
  $('spikePremiumClose')?.addEventListener('click', closePremiumSheet);
  $('spikePremiumOverlay')?.addEventListener('click', e => { if (e.target.id === 'spikePremiumOverlay') closePremiumSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePremiumSheet(); });

  // Premium sheet actions
  $('spikePremiumBody')?.addEventListener('click', async e => {
    const b=e.target.closest('button'); if(!b) return;
    try {
      if(b.dataset.col){ spikePremiumData.selectedCollection=b.dataset.col; renderSavedPanel([...state.saved],spikePremiumData.collections); return; }
      if(b.id==='spikeCreateCollection'){ const inp=$('spikeCollectionName'), n=inp?.value.trim(); if(!n) return toast('Enter a collection name'); if(spikePremiumData.collections.some(c=>c.name.toLowerCase()===n.toLowerCase())) return toast('Collection already exists'); spikePremiumData.collections.push({id:crypto.randomUUID(),name:n,postIds:[],created_at:now()}); await saveCollections(); renderSavedPanel([...state.saved],spikePremiumData.collections); toast('Collection created','success'); return; }
      if(b.dataset.colRename){ spikePremiumData.editingCollectionId=b.dataset.colRename; renderSavedPanel([...state.saved],spikePremiumData.collections); return; }
      if(b.dataset.colDelete){ const id=b.dataset.colDelete; spikePremiumData.collections=spikePremiumData.collections.filter(c=>c.id!==id); await saveCollections(); spikePremiumData.selectedCollection=''; renderSavedPanel([...state.saved],spikePremiumData.collections); toast('Collection deleted','success'); return; }
      if(b.id==='spikeRenameSave'){ const c=spikePremiumData.collections.find(x=>x.id===spikePremiumData.editingCollectionId), n=$('spikeRenameValue')?.value.trim(); if(!c||!n)return toast('Enter a collection name'); if(spikePremiumData.collections.some(x=>x.id!==c.id&&x.name.toLowerCase()===n.toLowerCase()))return toast('Collection already exists'); c.name=n; spikePremiumData.editingCollectionId=''; await saveCollections(); renderSavedPanel([...state.saved],spikePremiumData.collections); toast('Collection renamed','success'); return; }
      if(b.id==='spikeRenameCancel'){ spikePremiumData.editingCollectionId=''; renderSavedPanel([...state.saved],spikePremiumData.collections); return; }
      if(b.dataset.colAdd){ const id=$('spikeAddCollection')?.value; const c=spikePremiumData.collections.find(x=>x.id===id); if(!c) return toast('Choose a collection first'); if(!c.postIds.includes(b.dataset.colAdd)) c.postIds.push(b.dataset.colAdd); spikePremiumData.selectedCollection=c.id; await saveCollections(); renderSavedPanel([...state.saved],spikePremiumData.collections); toast('Added to collection','success'); return; }
      if(b.dataset.colRemove){ const c=spikePremiumData.collections.find(x=>x.id===spikePremiumData.selectedCollection); if(c)c.postIds=c.postIds.filter(id=>id!==b.dataset.colRemove); await saveCollections(); renderSavedPanel([...state.saved],spikePremiumData.collections); return; }
      if(b.dataset.cfToggle){ const id=b.dataset.cfToggle, a=spikePremiumData.closeFriends; const i=a.indexOf(id); if(i>=0)a.splice(i,1); else a.push(id); await putDoc(`users/${state.user.id}`,{...(spikePremiumData.me||{}),closeFriends:a},'users'); renderCloseFriends($('spikeCFSearch')?.value||''); toast(i>=0?'Removed from Close Friends':'Added to Close Friends','success'); return; }
      if(b.id==='spikeSaveSafety'){ const me=await getDoc(`users/${state.user.id}`).catch(()=>({})); const feedSafety={...(me?.feedSafety||{}),showSensitive:$('spikeSafeSensitive').checked,showSpoilers:$('spikeSafeSpoilers').checked,followingOnly:$('spikeSafeFollowing').checked}; await putDoc(`users/${state.user.id}`,{...(me||{}),feedSafety},'users'); const v2s=$('v2Sensitive'),v2sp=$('v2Spoilers'),v2f=$('v2FollowingOnly'); if(v2s)v2s.checked=feedSafety.showSensitive;if(v2sp)v2sp.checked=feedSafety.showSpoilers;if(v2f)v2f.checked=feedSafety.followingOnly; toast('Safety preferences saved','success'); return; }
      if(b.dataset.safeBlock){ const id=b.dataset.safeBlock; if(state.blocked.has(id)){const r=await db.from('feed_blocks').delete().eq('blocker_id',state.user.id).eq('blocked_id',id);if(r.error)throw r.error;state.blocked.delete(id);toast('User unblocked','success')}else{const r=await db.from('feed_blocks').insert({blocker_id:state.user.id,blocked_id:id});if(r.error)throw r.error;state.blocked.add(id);toast('User blocked','success')} renderSafetyPanel();renderSignals();return; }
      if(b.dataset.safeMute){ const id=b.dataset.safeMute; if(state.muted.has(id))state.muted.delete(id);else state.muted.add(id); const me=await getDoc(`users/${state.user.id}`).catch(()=>({})); await putDoc(`users/${state.user.id}`,{...(me||{}),mutedAuthors:[...state.muted]},'users'); renderSafetyPanel();renderSignals();toast(state.muted.has(id)?'User muted':'User unmuted','success'); return; }
    } catch(err){console.error('premium feature action',err);toast(err.message||'Action failed','error');}
  });
  $('spikePremiumBody')?.addEventListener('input', e => { if(e.target.id==='spikeCFSearch') renderCloseFriends(e.target.value); if(e.target.id==='spikeSafetySearch'){ spikePremiumData.safetyQuery=e.target.value; renderSafetyPanel(); } });

  // Premium dialog
  $("premiumDialogCancel")?.addEventListener('click', () => finishPremiumConfirm(false));
  $("premiumDialogConfirm")?.addEventListener('click', () => finishPremiumConfirm(true));
  $("premiumDialog")?.addEventListener('click', e => { if (e.target.id === 'premiumDialog') finishPremiumConfirm(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $("premiumDialog")?.classList.contains('open')) finishPremiumConfirm(false); });

  // Profile sheet close
  document.addEventListener('keydown', e => { if(e.key==='Escape') closeSpikeProfile(); });
  document.addEventListener('click', e => {
    if(e.target.closest('[data-spike-profile-close]')) closeSpikeProfile();
    if(e.target.closest('.spike-profile-backdrop')) closeSpikeProfile();
  });
  document.addEventListener('click', e => {
    if(e.target.closest('[data-profile-actions-close]')) closeProfileActions();
  });
  document.addEventListener('keydown', e => {
    if(e.key==='Escape' && $('spikeProfileActions')?.classList.contains('show')) closeProfileActions();
  });
  // Profile preview triggers
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-spike-profile-id]');
    if(trigger){ e.preventDefault(); const id=trigger.getAttribute('data-spike-profile-id'); if(id) openSpikeProfilePreview(id, trigger._spikeProfileSeed || null); }
  });
  // Also catch profile.html links
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href*="profile.html"]');
    if(a){ const m=a.getAttribute('href').match(/[?&](?:uid|id)=([^&]+)/); if(m){ e.preventDefault(); openSpikeProfilePreview(decodeURIComponent(m[1])); } }
  });

  // Toast close
  document.addEventListener('click', e => {
    if(e.target.closest('.toast-close')){ const t=$('toast'); if(t) t.classList.remove('show'); }
  });
}

let feedImageViewerItems=[];
let feedImageViewerIndex=0;
function renderFeedImageViewer(){
  const img=$('feedImageViewerImage'), cap=$('feedImageViewerCaption'), load=$('feedImageViewerLoading'), err=$('feedImageViewerError');
  const prev=$('feedImageViewerPrev'), next=$('feedImageViewerNext'), counter=$('feedImageViewerCounter');
  const item=feedImageViewerItems[feedImageViewerIndex]; if(!img||!item)return;
  img.hidden=true; img.removeAttribute('src'); load.hidden=false; err.classList.remove('show');
  cap.textContent=item.caption||''; cap.hidden=!item.caption;
  if(counter) counter.textContent=`${feedImageViewerIndex+1} / ${feedImageViewerItems.length}`;
  if(prev) prev.disabled=feedImageViewerIndex<=0;
  if(next) next.disabled=feedImageViewerIndex>=feedImageViewerItems.length-1;
  img.onload=()=>{load.hidden=true; img.hidden=false;};
  img.onerror=()=>{load.hidden=true; err.classList.add('show');};
  img.src=item.url;
}
function openFeedImageViewer(url, caption='', items=null, index=0){
  const overlay=$('feedImageViewer');
  if(!overlay)return;
  feedImageViewerItems=(Array.isArray(items)&&items.length?items:[{url,caption}]).filter(x=>x&&x.url);
  feedImageViewerIndex=Math.max(0,Math.min(index,feedImageViewerItems.length-1));
  overlay.classList.add('open'); overlay.setAttribute('aria-hidden','false'); document.body.classList.add('spike-image-viewer-open');
  renderFeedImageViewer();
}
function stepFeedImageViewer(delta){
  const next=feedImageViewerIndex+delta;
  if(next<0||next>=feedImageViewerItems.length)return;
  feedImageViewerIndex=next; renderFeedImageViewer();
}
function closeFeedImageViewer(){
  const overlay=$('feedImageViewer'); const img=$('feedImageViewerImage'); const load=$('feedImageViewerLoading'); const err=$('feedImageViewerError');
  if(!overlay)return;
  overlay.classList.remove('open'); overlay.setAttribute('aria-hidden','true'); document.body.classList.remove('spike-image-viewer-open');
  if(img){img.onload=null;img.onerror=null;img.removeAttribute('src');img.hidden=true;}
  if(load)load.hidden=true; if(err)err.classList.remove('show');
  feedImageViewerItems=[]; feedImageViewerIndex=0;
}

// ─── BULLETPROOF COMMENT CONTROLLER ─────────────────────
(function initCommentsController(){
  const MAX = 500;
  let activePostId = null;
  const controller = {};
  Object.defineProperty(controller, 'activePostId', { get: () => activePostId });
  window.SPIKEComments = controller;

  function getArticle(id){
    try { return document.querySelector(`[data-post="${CSS.escape(String(id))}"]`); }
    catch (_) { return null; }
  }
  function focusInput(article){
    const input=article?.querySelector('.comment-form textarea');
    if(input) setTimeout(()=>{ try{input.focus({preventScroll:true});}catch(_){input.focus();} },0);
  }
  function close(id){
    getArticle(id)?.querySelector('.comments')?.classList.remove('open');
    if(String(activePostId)===String(id)) activePostId=null;
  }
  function closeAll(exceptId=null){
    document.querySelectorAll('.comments.open').forEach(section=>{
      const id=section.dataset.commentsPanel || section.id.replace(/^comments-/,'');
      if(exceptId==null || String(id)!==String(exceptId)) section.classList.remove('open');
    });
  }
  function open(id){
    const article=getArticle(id), section=article?.querySelector('.comments');
    if(!article || !section) return;
    closeAll(id); activePostId=String(id); section.classList.add('open'); focusInput(article);
  }
  function toggle(id){
    const section=getArticle(id)?.querySelector('.comments');
    if(!section) return;
    section.classList.contains('open') ? close(id) : open(id);
  }
  function resize(input){ if(input){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,120)+'px';} }
  function updateCounter(form){
    const input=form?.querySelector('textarea'), counter=form?.querySelector('[data-comment-counter]');
    if(input&&counter) counter.textContent=`${input.value.length}/${MAX}`;
  }
  function setReply(postId, commentId, authorName='User'){
    const article=getArticle(postId), section=article?.querySelector('.comments'), form=section?.querySelector('.comment-form'), input=form?.querySelector('textarea'), bar=section?.querySelector(`[data-comment-replying="${CSS.escape(String(postId))}"]`), name=bar?.querySelector('[data-comment-reply-name]');
    if(!article || !section || !form || !input) return;
    closeAll(postId); activePostId=String(postId); section.classList.add('open');
    form.dataset.replyTo=String(commentId);
    if(name) name.textContent=authorName || 'User';
    if(bar) bar.hidden=false;
    input.placeholder=`Reply to ${authorName || 'User'}…`;
    setTimeout(()=>{ try{input.focus({preventScroll:true});}catch(_){input.focus();} },0);
  }
  function clearReply(postId){
    const article=getArticle(postId), section=article?.querySelector('.comments'), form=section?.querySelector('.comment-form'), input=form?.querySelector('textarea'), bar=section?.querySelector(`[data-comment-replying="${CSS.escape(String(postId))}"]`);
    if(!form) return;
    delete form.dataset.replyTo;
    if(bar) bar.hidden=true;
    if(input) input.placeholder='Write a comment…';
  }

  // Close ONLY when the pointer is outside the entire post. Capture phase makes
  // this immune to unrelated document handlers and to dynamically-added posts.
  document.addEventListener('pointerdown', e=>{
    if(!activePostId) return;
    const article=e.target instanceof Element ? e.target.closest('.post[data-post]') : null;
    if(article) return;
    close(activePostId);
  }, true);

  document.addEventListener('keydown', e=>{
    if(e.key==='Escape' && activePostId){ e.preventDefault(); close(activePostId); }
  });

  document.addEventListener('click', e=>{
    const target=e.target instanceof Element ? e.target : null; if(!target) return;
    const closeBtn=target.closest('[data-comments-close]');
    if(closeBtn){e.preventDefault();e.stopPropagation();close(closeBtn.dataset.commentsClose);return;}
    const replyCancel=target.closest('[data-comment-reply-cancel]');
    if(replyCancel){e.preventDefault();e.stopPropagation();clearReply(replyCancel.closest('.comment-form')?.dataset.commentForm);return;}
    const emojiBtn=target.closest('[data-comment-emoji]');
    if(emojiBtn){
      e.preventDefault();e.stopPropagation();
      const id=emojiBtn.dataset.commentEmoji;
      const picker=getArticle(id)?.querySelector(`[data-comment-emoji-picker="${CSS.escape(String(id))}"]`);
      picker?.classList.toggle('open'); return;
    }
    const emoji=target.closest('[data-comment-emoji-value]');
    if(emoji){
      e.preventDefault();e.stopPropagation();
      const form=emoji.closest('.comment-form'), input=form?.querySelector('textarea');
      if(input){
        const start=input.selectionStart??input.value.length, end=input.selectionEnd??input.value.length;
        input.value=input.value.slice(0,start)+emoji.dataset.commentEmojiValue+input.value.slice(end);
        input.dispatchEvent(new Event('input',{bubbles:true})); input.focus();
      }
      emoji.closest('.comment-emoji-picker')?.classList.remove('open');
    }
  }, true);

  document.addEventListener('input', e=>{
    const input=e.target instanceof Element ? e.target.closest('.comment-form textarea') : null;
    if(!input) return; resize(input); updateCounter(input.closest('.comment-form'));
  });

  document.addEventListener('keydown', e=>{
    const input=e.target instanceof Element ? e.target.closest('.comment-form textarea') : null;
    if(!input || e.isComposing) return;
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); input.closest('form')?.requestSubmit(); }
  });

  controller.open=open; controller.close=close; controller.closeAll=closeAll; controller.toggle=toggle; controller.setReply=setReply; controller.clearReply=clearReply;
})();

function showReactionUsers(id, anchor){
  const p=getSignalState(id); if(!p)return;
  document.querySelector('#spikeReactionUsers')?.remove();
  const rows=[];
  for(const [emoji,value] of Object.entries(p.reactions||{})){
    if(!emoji.endsWith('_users')||!Array.isArray(value)||!value.length)continue;
    const names=value.map(uid=>nameOf(state.users.get(String(uid))||{id:uid,name:'SPIKE user'}));
    rows.push(`<div style="padding:7px 0;border-bottom:1px solid var(--line)"><b>${esc(emoji)}</b> ${esc(names.join(', '))}</div>`);
  }
  const box=document.createElement('div');box.id='spikeReactionUsers';box.className='spike-reaction-tray';box.style.display='block';box.innerHTML=rows.length?rows.join(''):'<span style="padding:6px 10px;font-size:10px">No reactions yet.</span>';document.body.appendChild(box);
  const r=anchor.getBoundingClientRect();const w=Math.min(window.innerWidth-20,360);box.style.width=`${w}px`;box.style.left=`${Math.max(10,Math.min(window.innerWidth-w-10,r.left))}px`;box.style.top=`${Math.max(8,r.top-box.offsetHeight-8)}px`;
  const close=e=>{if(!box.contains(e.target)&&e.target!==anchor){box.remove();document.removeEventListener('pointerdown',close,true);}};setTimeout(()=>document.addEventListener('pointerdown',close,true),0);
}

function closeSignalMoreMenu(){
  const menu=document.getElementById('spikeSignalMoreMenu');
  if(menu) menu.remove();
  document.removeEventListener('pointerdown',closeSignalMoreMenuOutside,true);
  document.removeEventListener('keydown',closeSignalMoreMenuKey,true);
  window.removeEventListener('resize',positionSignalMoreMenu);
  window.removeEventListener('scroll',positionSignalMoreMenu,true);
}
function closeSignalMoreMenuOutside(e){
  const menu=document.getElementById('spikeSignalMoreMenu');
  if(!menu) return;
  if(!menu.contains(e.target) && !e.target.closest('[data-more]')) closeSignalMoreMenu();
}
function closeSignalMoreMenuKey(e){ if(e.key==='Escape') closeSignalMoreMenu(); }
let signalMoreMenuAnchor=null;
function positionSignalMoreMenu(){
  const menu=document.getElementById('spikeSignalMoreMenu'), a=signalMoreMenuAnchor;
  if(!menu||!a) return;
  const r=a.getBoundingClientRect(), gap=8, margin=10;
  const w=Math.min(250,window.innerWidth-margin*2);
  menu.style.width=`${w}px`;
  menu.style.left=`${Math.max(margin,Math.min(window.innerWidth-w-margin,r.right-w))}px`;
  menu.style.visibility='hidden';
  menu.style.top='0px';
  const h=menu.offsetHeight;
  const below=r.bottom+gap;
  const above=r.top-gap-h;
  const top=(below+h<=window.innerHeight-margin||above<margin)?Math.min(below,window.innerHeight-h-margin):above;
  menu.style.top=`${Math.max(margin,top)}px`;
  menu.style.visibility='visible';
}
function openSignalMoreMenu(p,anchor){
  closeSignalMoreMenu();
  signalMoreMenuAnchor=anchor;
  const owner=p.authorUid===state.user?.id;
  const menu=document.createElement('div');
  menu.id='spikeSignalMoreMenu';
  menu.className='spike-signal-more-menu';
  menu.setAttribute('role','menu');
  const items=owner ? [
    ['insights','Insights','View activity for this Signal','◉'],
    ['engagement','Engagement','Open creator engagement','↗'],
    ['delete','Delete Signal','Remove your Signal from SPIKE','×']
  ] : [
    ['not_interested','Not interested','Show fewer Signals like this','−'],
    ['show_fewer','Show fewer like this','Tune similar recommendations','⌁'],
    ['mute_creator','Mute creator','Stop recommendations from this creator','⊘'],
    ['hide','Hide this Signal','Remove this Signal from your Feed','⌁']
  ];
  menu.innerHTML=`<div class="spike-signal-more-head"><b>${owner?'Signal controls':'Tune this Signal'}</b><button type="button" data-more-close aria-label="Close">×</button></div><div class="spike-signal-more-list">${items.map(([action,title,desc,icon])=>`<button type="button" role="menuitem" data-more-action="${action}" class="${action==='delete'?'is-danger':''}"><span class="more-action-icon" aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${desc}</small></span></button>`).join('')}</div>`;
  document.body.appendChild(menu);
  positionSignalMoreMenu();
  menu.addEventListener('click',async e=>{
    const close=e.target.closest('[data-more-close]'); if(close){closeSignalMoreMenu();return;}
    const b=e.target.closest('[data-more-action]'); if(!b)return;
    const action=b.dataset.moreAction;
    closeSignalMoreMenu();
    if(owner){
      if(action==='insights'){
        const article=getSignalArticle(p.id), panel=article?.querySelector('.owner-insights');
        if(panel){panel.hidden=!panel.hidden; panel.classList.toggle('is-open',!panel.hidden);}
        return;
      }
      if(action==='engagement'){location.href='engagement.html';return;}
      if(action==='delete'){await deleteSignal(p.id);return;}
    } else {
      const fake=document.createElement('button'); fake.dataset.feedback=action;
      await applySignalFeedback(p,action,fake);
    }
  });
  document.addEventListener('pointerdown',closeSignalMoreMenuOutside,true);
  document.addEventListener('keydown',closeSignalMoreMenuKey,true);
  window.addEventListener('resize',positionSignalMoreMenu);
  window.addEventListener('scroll',positionSignalMoreMenu,true);
  setTimeout(()=>menu.querySelector('[data-more-close]')?.focus(),30);
}
async function applySignalFeedback(p,k,b=null){
  const topics=FeedRankingEngine.topics(p),type=FeedRankingEngine.type(p);
  try{
    const {error}=await db.rpc('record_feed_negative_feedback',{p_post_id:p.id,p_event_type:k,p_metadata:{content_type:type,topics:Object.fromEntries(topics.map(t=>[t,1]))}});
    if(error) throw error;
    const l=readSignalStore(),r=l[p.id]||{};r[k]=Number(r[k]||0)+1;l[p.id]=r;writeSignalStore(l);
    if(k==='hide') state.posts=state.posts.filter(x=>x.id!==p.id);
    if(k==='mute_creator') state.muted.add(p.authorUid);
    renderSignalsFromRanked(filteredPosts());
    toast(k==='mute_creator'?'Creator muted':k==='hide'?'Signal hidden':'Feed preference saved','success');
  }catch(err){
    queueFeedEvent(p.id,k,{metadata:{content_type:type,topics,offline:true}});
    toast('Saved locally; it will sync when you are back online','success');
  }
}

function handleSignalClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const id = b.dataset.like || b.dataset.comments || b.dataset.pass || b.dataset.save || b.dataset.more || b.dataset.reactMenu || b.dataset.insights || b.dataset.video || b.dataset.replyTo || b.dataset.image;
  if (!id || b.dataset.busy === '1') return;
  const lock = () => { b.dataset.busy = '1'; b.disabled = true; };
  const unlock = () => { b.dataset.busy = '0'; b.disabled = false; };
  if (b.dataset.like) { lock(); return toggleLike(id).then(() => { scheduleSignalRefresh({ render: false }); }).catch(x => toast(x?.message || 'Could not update like','error')).finally(unlock); }
  if (b.dataset.save) { lock(); return toggleSave(id).then(() => { recordSignal(id, 'saves', state.saved.has(id) ? 1 : -1); scheduleSignalRefresh(); }).catch(x => toast(x?.message || 'Could not update saved post','error')).finally(unlock); }
  if (b.dataset.comments) { recordSignal(id, 'opens', 1); window.SPIKEComments?.toggle(id); scheduleSignalRefresh(); return; }
  if (b.dataset.insights) { const panel = $(`insights-${id}`); if(panel){ const opening=panel.hidden; panel.hidden=!opening; b.textContent=opening?'📊 Hide insights':'📊 Insights'; } return; }
  if (b.dataset.pass) { lock(); return Promise.resolve(passSignal(id)).catch(x => toast(x?.message || 'Could not open Pass','error')).finally(unlock); }
  if (b.dataset.more) { state.activePost = id; const p = state.posts.find(x => x.id === id); if (p) openSignalMoreMenu(p, b); return; }
  if (b.dataset.reactMenu) {
    state.activePost = id;
    if(b.classList.contains('reaction-summary') && getSignalState(id)?.reactions){ showReactionUsers(id,b); }
    else openReactionTray(id, b);
    return;
  }
  if (b.dataset.image) { const post=b.closest('.post'); const buttons=[...(post?.querySelectorAll('button[data-image]')||[])]; const items=buttons.map(x=>({url:x.dataset.image,caption:x.dataset.mediaCaption||''})); const index=Math.max(0,buttons.indexOf(b)); openFeedImageViewer(b.dataset.image,b.dataset.mediaCaption||'',items,index); return; }
  if (b.dataset.replyTo) { window.SPIKEComments?.setReply(b.dataset.post, b.dataset.replyTo, b.dataset.replyAuthor || 'User'); return; }
}

async function handleSignalSubmit(e) {
  const f=e.target.closest('[data-comment-form]');
  if(!f) return;
  e.preventDefault(); e.stopPropagation();
  const id=f.dataset.commentForm, input=f.querySelector('textarea');
  if(!id||!input) return;
  const text=input.value.trim();
  const parentCommentId=f.dataset.replyTo || null;
  if(!text) return;
  if(text.length>500){toast('Comment is limited to 500 characters','error');return;}
  if(f.classList.contains('is-submitting')) return;
  window.SPIKEComments?.open(id);
  f.classList.add('is-submitting');
  const submit=f.querySelector('[type="submit"]'), oldLabel=submit?.textContent;
  if(submit){submit.disabled=true;submit.textContent='Sending…';}
  try{
    await addComment(id,text,parentCommentId);
    input.value=''; input.style.height='40px';
    window.SPIKEComments?.clearReply(id);
    const counter=f.querySelector('[data-comment-counter]'); if(counter)counter.textContent='0/500';
    window.SPIKEComments?.open(id);
  }catch(x){toast(x?.message||'Could not add comment','error');window.SPIKEComments?.open(id);}
  finally{
    f.classList.remove('is-submitting');
    if(submit){submit.disabled=false;submit.textContent=oldLabel||'Send';}
  }
}

function cleanupFeedRuntime(){
  try{feedSentinelObserver?.disconnect?.();}catch(_){}
  try{feedObserver?.disconnect?.();}catch(_){}
  try{clearInterval(signalRefreshTimer);}catch(_){}
  try{clearTimeout(state.realtimeRetryTimer);state.realtimeRetryTimer=null;}catch(_){}
  try{clearTimeout(state.realtimeRefreshTimer);state.realtimeRefreshTimer=null;}catch(_){}
  try{window.SPIKEPresencePatch?.stop?.();window.AppPresence?.stop?.();}catch(_){}
  try{state.realtime?.unsubscribe?.();state.realtime=null;}catch(_){}
  try{db.removeAllChannels?.();}catch(_){}
}

function go(page) { location.href = page; }

// ─── INFINITE SCROLL ───────────────────────────────────
let feedSentinelObserver = null;
function loadMoreSignals() {
  if (state.loadingMore || state.allLoaded) return;
  state.loadingMore = true;
  requestAnimationFrame(() => {
    state.visiblePosts += 10;
    renderSignals();
    state.loadingMore = false;
  });
}

// ─── REALTIME ──────────────────────────────────────────
async function initRealtime({ immediate = true } = {}) {
  if (state.realtimeStarting) return;
  state.realtimeStarting = true;
  try {
    if (state.realtimeRetryTimer) { clearTimeout(state.realtimeRetryTimer); state.realtimeRetryTimer = null; }
    if (state.realtime?.unsubscribe) { try { await state.realtime.unsubscribe(); } catch (_) {} }
    state.realtime = null;

    const setStatus = text => {
      const el = $('onlineStatus');
      if (el && text) el.textContent = text;
    };
    const scheduleRefresh = kind => {
      clearTimeout(state.realtimeRefreshTimer);
      state.realtimeRefreshTimer = setTimeout(async () => {
        state.realtimeRefreshTimer = null;
        try {
          if (kind === 'stories') await loadStories();
          else await loadSignals();
          refreshSignalRanking();
        } catch (e) { console.warn('[SPIKE REALTIME REFRESH]', e); }
      }, 350);
    };
    const scheduleReconnect = () => {
      if (state.realtimeRetryTimer || !navigator.onLine || document.visibilityState === 'hidden') return;
      const attempt = Math.min(7, Number(state.realtimeRetryAttempt || 0));
      const delay = Math.min(30000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 500);
      state.realtimeRetryAttempt = attempt + 1;
      setStatus(`Live updates reconnecting…`);
      state.realtimeRetryTimer = setTimeout(() => {
        state.realtimeRetryTimer = null;
        initRealtime({ immediate: true }).catch(e => console.warn('[SPIKE REALTIME RETRY]', e));
      }, delay);
    };
    const applyPostEvent = payload => {
      const r = payload?.record || payload?.new || payload?.data || payload;
      const postId = r?.id || r?.post_id || r?.postId;
      if (!postId) return false;
      const local = getSignalState(postId);
      if (!local) return false;
      if (r && typeof r === 'object') normalizeSignalModel(Object.assign(local, r));
      syncLikeDom(postId, local);
      syncCommentDom(postId, local);
      syncReactionDom(postId, local);
      return true;
    };

    // Keep this channel public: Postgres Changes visibility is governed by the
    // authenticated database/RLS path. A private channel would require realtime.messages policies.
    const channel = db.channel(`feed:global:${state.user?.id || 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_documents', filter: 'collection_name=in.(posts,stories)' }, p => {
        const r = p?.new || p?.record || {};
        const collection = r.collection_name;
        if (collection === 'stories') scheduleRefresh('stories');
        else if (collection === 'posts' && !applyPostEvent(r.data ? { id: r.document_id, ...r.data } : r)) scheduleRefresh('posts');
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          state.realtimeRetryAttempt = 0;
          setStatus('Live · real-time');
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.debug('[SPIKE FEED REALTIME]', status, err || null);
          setStatus('Live updates reconnecting…');
          scheduleReconnect();
        }
      });
    state.realtime = channel;
    if (!immediate) setStatus('Live updates reconnecting…');
  } finally {
    state.realtimeStarting = false;
  }
}


window.addEventListener('online', () => {
  if (state.user?.id) initRealtime({ immediate: true }).catch(e => console.warn('[SPIKE REALTIME ONLINE]', e));
});
window.addEventListener('offline', () => {
  if (state.realtimeRetryTimer) { clearTimeout(state.realtimeRetryTimer); state.realtimeRetryTimer = null; }
  const el = $('onlineStatus'); if (el) el.textContent = 'Offline · changes will sync when connected';
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user?.id && !state.realtime) initRealtime({ immediate: true }).catch(e => console.warn('[SPIKE REALTIME VISIBILITY]', e));
});

// ─── NAVIGATION / FEED RESTORATION ─────────────────────
const SPIKE_FEED_SNAPSHOT_KEY = 'spike.feed.snapshot';
const SPIKE_FEED_SNAPSHOT_TTL = 30 * 60 * 1000;
function readFeedSnapshot(){
  try{
    const raw=sessionStorage.getItem(SPIKE_FEED_SNAPSHOT_KEY);
    if(!raw)return null;
    const snap=JSON.parse(raw);
    if(!snap||snap.v!==1||Date.now()-Number(snap.at||0)>SPIKE_FEED_SNAPSHOT_TTL)return null;
    return snap;
  }catch(_){return null;}
}
function clearFeedSnapshot(){try{sessionStorage.removeItem(SPIKE_FEED_SNAPSHOT_KEY)}catch(_){} }
function captureFeedSnapshot(){
  try{
    if(!state.user?.id||!Array.isArray(state.posts)||!state.posts.length)return;
    const snapshot={
      v:1,at:Date.now(),userId:String(state.user.id),scrollY:window.scrollY||window.pageYOffset||0,
      posts:state.posts.slice(0,60),stories:(state.stories||[]).slice(0,40),
      users:[...state.users.entries()].slice(0,120),
      saved:[...state.saved],following:[...state.following],muted:[...state.muted],blocked:[...state.blocked],storyViewed:[...state.storyViewed],
      profile:state.profile,filter:state.filter,visiblePosts:state.visiblePosts,expandedCaptions:[...state.expandedCaptions]
    };
    const encoded=JSON.stringify(snapshot);
    if(encoded.length>4_500_000)return;
    sessionStorage.setItem(SPIKE_FEED_SNAPSHOT_KEY,encoded);
  }catch(e){console.debug('[SPIKE FEED SNAPSHOT]',e)}
}
function restoreFeedSnapshot(snapshot){
  if(!snapshot||String(snapshot.userId)!==String(state.user?.id||''))return false;
  try{
    state.profile=snapshot.profile&&typeof snapshot.profile==='object'?snapshot.profile:state.profile;
    state.posts=Array.isArray(snapshot.posts)?snapshot.posts:[];
    state.stories=Array.isArray(snapshot.stories)?snapshot.stories:[];
    state.users=new Map(Array.isArray(snapshot.users)?snapshot.users:[]);
    state.saved=new Set(Array.isArray(snapshot.saved)?snapshot.saved:[]);
    state.following=new Set(Array.isArray(snapshot.following)?snapshot.following:[]);
    state.muted=new Set(Array.isArray(snapshot.muted)?snapshot.muted:[]);
    state.blocked=new Set(Array.isArray(snapshot.blocked)?snapshot.blocked:[]);
    state.storyViewed=new Set(Array.isArray(snapshot.storyViewed)?snapshot.storyViewed:[]);
    state.filter=typeof snapshot.filter==='string'?snapshot.filter:'forYou';
    state.visiblePosts=Math.max(1,Math.min(50,Number(snapshot.visiblePosts)||20));
    state.expandedCaptions=new Set(Array.isArray(snapshot.expandedCaptions)?snapshot.expandedCaptions.map(String):[]);
    return !!state.posts.length;
  }catch(e){console.warn('[SPIKE FEED SNAPSHOT RESTORE]',e);return false;}
}
function restoreFeedScroll(snapshot){
  const y=Math.max(0,Number(snapshot?.scrollY)||0);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.scrollTo({top:y,left:0,behavior:'auto'})}catch(_){window.scrollTo(0,y)}}));
}
window.addEventListener('pagehide',captureFeedSnapshot,{capture:true});

// ─── BOOT ──────────────────────────────────────────────
async function boot() {
  try {
    updateAdminVisibility();
    const feedLoaderSubtitle = $("spike-feed-loader")?.querySelector(".spike-feed-loader-subtitle");
    const restoreCandidate = document.documentElement.dataset.spikeFeedRestore === '1' ? readFeedSnapshot() : null;
    if (feedLoaderSubtitle) feedLoaderSubtitle.textContent = restoreCandidate ? "Restoring your feed…" : "Connecting to SPIKE…";
    if (!(await requireUser())) return;
    const restored = restoreCandidate && restoreFeedSnapshot(restoreCandidate);
    try { sessionStorage.removeItem('spike.feed.return.intent.v1'); } catch (_) {}
    document.documentElement.removeAttribute('data-spike-feed-restore');
    if (restored) {
      clearFeedSnapshot();
      setAdminVisibility(false);
      await verifyAdminUid();
      initTheme();
      bindEvents();
      startNotificationBadge();
      $("v2PersonalStatus").textContent = `Personalized feed for ${nameOf(state.profile)}.`;
      renderStories();
      refreshSignalRanking();
      initModernApp();
      initAISearch();
      initRealtime().catch(e => console.warn('[SPIKE FEED RESTORE REALTIME]', e));
      restoreFeedScroll(restoreCandidate);
      window.SPIKE_HIDE_FEED_LOADER?.();
      void Promise.allSettled([
        loadSettings(),
        (async()=>{await loadSignals();await loadAux();refreshSignalRanking();})(),
        loadStories(),
        loadAnnouncement(),
        loadServerSignalProfile()
      ]).then(()=>{refreshSignalRanking();}).catch(()=>{});
      const sentinel = document.getElementById("infiniteScrollSentinel");
      if (sentinel) {
        feedSentinelObserver?.disconnect();
        feedSentinelObserver = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) loadMoreSignals(); }, { rootMargin: '600px 0px' });
        feedSentinelObserver.observe(sentinel);
      }
      return;
    }
    // Admin UI is determined only by the authenticated Supabase UID, never by email.
    setAdminVisibility(false);
    await verifyAdminUid();
    initTheme();
    $("posts").innerHTML = skeletonSignals(4);
    bindEvents();
    startNotificationBadge();
    $("v2PersonalStatus").textContent = `Personalized feed for ${nameOf(state.profile)}.`;

    // Critical hydration is sequential: posts must exist before public profiles are
    // hydrated, and both must exist before the first ranked render.
    await loadSettings();
    await loadSignals();
    await loadStories();
    await loadAux();
    await Promise.allSettled([loadAnnouncement(), loadServerSignalProfile()]);
    refreshSignalRanking();
    initModernApp();
    initAISearch();
    initRealtime().catch(e => console.warn('realtime init', e));

    const deepStory = new URLSearchParams(location.search).get('story');
    if (deepStory && state.stories.some(s => s.id === deepStory)) {
      storyViewerOpen(deepStory);
      document.querySelector(`[data-story="${CSS.escape(deepStory)}"]`)?.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
    }

    if (sessionStorage.getItem("spikeAnnouncementClosed") === "1") $("announcement").classList.remove("show");
  } catch (e) {
    console.error("[SPIKE FEED]", e);
    const feedLoaderSubtitle = $("spike-feed-loader")?.querySelector(".spike-feed-loader-subtitle");
    if (feedLoaderSubtitle) feedLoaderSubtitle.textContent = "SPIKE could not load this feed.";
    toast(e.message || "Feed initialization failed.");
  } finally {
    window.SPIKE_HIDE_FEED_LOADER?.();
    // Set up intersection observer for infinite scroll
    const sentinel = document.getElementById("infiniteScrollSentinel");
    if (sentinel) {
      feedSentinelObserver?.disconnect();
      feedSentinelObserver = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) loadMoreSignals(); }, { rootMargin: '600px 0px' });
      feedSentinelObserver.observe(sentinel);
    }
  }
}


/* SPIKE startup watchdog: a stalled network dependency must never keep the
   application loader alive forever. The internal boot still owns normal
   cleanup; this outer guard guarantees a bounded UI startup. */
if (!window.__SPIKE_FEED_STARTUP_WATCHDOG__) {
  window.__SPIKE_FEED_STARTUP_WATCHDOG__ = true;
  const __spikeBootCore = boot;
  boot = async function(){
    try {
      await withTimeout(__spikeBootCore(), 20000, 'SPIKE startup');
    } catch (e) {
      console.error('[SPIKE STARTUP WATCHDOG]', e);
      window.SPIKE_HIDE_FEED_LOADER?.();
      const sub = $('spike-feed-loader')?.querySelector('.spike-feed-loader-subtitle');
      if (sub) sub.textContent = 'SPIKE is taking too long to respond. You can retry.';
      toast('SPIKE startup timed out. Please retry.');
    }
  };
}

// ─── THEME PILL ────────────────────────────────────────
// The authoritative click handler lives in js/theme.js; keeping one runtime
// prevents duplicate transitions and guarantees the shared preference is saved.

// ─── START ─────────────────────────────────────────────
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
else boot();
