signalRefreshTimer=null,signalRefreshQueued=false,rankingDirty=true;
const rankingCache=new Map();
const SIGNAL_STORE_PREFIX='spike-feed-ranking-v3:';const signalStoreKey=()=>SIGNAL_STORE_PREFIX+(state.user?.id||'guest');
function readSignalStore(){try{const x=JSON.parse(localStorage.getItem(signalStoreKey())||'{}');return x&&typeof x==='object'?x:{}}catch(_){return{}}}
function writeSignalStore(x){try{localStorage.setItem(signalStoreKey(),JSON.stringify(x))}catch(_) {}}
const feedEventQueue=[];const feedSessionId=crypto.randomUUID();let feedFlushTimer=null;
function queueFeedEvent(postId,eventType,extra={}){if(!postId||!state.user?.id)return;const ev={post_id:String(postId),event_type:eventType,occurred_at:new Date().toISOString(),session_id:feedSessionId,position:Number.isFinite(extra.position)?extra.position:null,dwell_ms:Number.isFinite(extra.dwell_ms)?extra.dwell_ms:null,metadata:{...(extra.metadata||{}),ranking_version:FEED_RANKING_CONFIG.version,experiment:FEED_RANKING_CONFIG.experiment},client_event_id:crypto.randomUUID()};feedEventQueue.push(ev);if(feedEventQueue.length>feedCfg.telemetry.maxQueue)feedEventQueue.splice(0,feedEventQueue.length-feedCfg.telemetry.maxQueue);const l=readSignalStore(),r=l[postId]||{};if(eventType==='impression')r.impressions=Number(r.impressions||0)+1;if(eventType==='viewed')r.lastViewedAt=Date.now();r[eventType]=Number(r[eventType]||0)+1;l[postId]=r;writeSignalStore(l);scheduleFeedFlush()}
async function flushFeedEvents(){if(!navigator.onLine||!state.user?.id||!feedEventQueue.length)return;const batch=feedEventQueue.splice(0,feedCfg.telemetry.batchSize);try{const {error}=await db.rpc('record_feed_recommendation_events',{p_events:batch});if(error)throw error}catch(e){feedEventQueue.unshift(...batch)}}
function scheduleFeedFlush(){if(feedFlushTimer)return;feedFlushTimer=setTimeout(async()=>{feedFlushTimer=null;await flushFeedEvents();if(feedEventQueue.length)scheduleFeedFlush()},feedCfg.telemetry.flushMs)}window.addEventListener('online',()=>flushFeedEvents().catch(()=>{}));
const creatorEngagementViewSessions=new Set();
async function recordCreatorEngagement(id,action){if(!id||!state.user?.id)return false;try{const {error}=await db.rpc('mutate_post_interaction',{p_post_id:String(id),p_action:action,p_emoji:null,p_comment:null});if(error)throw error;return true}catch(e){console.warn('[SPIKE creator engagement]',action,e);return false}}
function recordSignal(signalId,type,delta=1){const map={opens:'open',likes:delta>0?'like':'unlike',saves:delta>0?'save':'unsave',comments:'comment',reactions:'reaction'};if(map[type])queueFeedEvent(signalId,map[type],{metadata:{delta}})}
let trendingFeatureCache={},serverSignalProfile={};
async function loadServerSignalProfile(){if(!navigator.onLine||!state.user?.id)return;try{const {data,error}=await withTimeout(db.rpc('get_feed_signal_profile',{p_days:90}),8000,'Signal profile');if(error)throw error;const out={...serverSignalProfile};(data||[]).forEach(r=>{out[String(r.post_id)]={...r,opens:Number(r.opens||0),viewed:Number(r.viewed||0),impressions:Number(r.impressions||0),likes:Number(r.likes||0),saves:Number(r.saves||0),comments:Number(r.comments||0),reactions:Number(r.reactions||0),not_interested:Number(r.not_interested||0),show_fewer:Number(r.show_fewer||0),mute_creator:Number(r.mute_creator||0),hides:Number(r.hides||0),hide:Number(r.hide??r.hides??0),lastViewedAt:r.last_viewed_at?new Date(r.last_viewed_at).getTime():0}});serverSignalProfile=out}catch(e){console.warn('[FEED SIGNAL PROFILE]',e)}}
async function loadTrendingFeatures(posts){const ids=posts.map(p=>String(p.id)).filter(Boolean).slice(0,200);if(!ids.length||!navigator.onLine||!state.user?.id)return;try{const {data,error}=await db.rpc('get_feed_trending_features',{p_post_ids:ids,p_window_hours:6});if(error)throw error;const next={...trendingFeatureCache};(data||[]).forEach(r=>{next[String(r.post_id)]={currentVelocity:Number(r.current_velocity||0),previousVelocity:Number(r.previous_velocity||0),currentEngagement:Number(r.current_engagement||0),previousEngagement:Number(r.previous_engagement||0)}});trendingFeatureCache=next}catch(e){console.warn('[FEED TRENDING FEATURES]',e)}}
function rankingContext(posts){return{userId:state.user?.id||'',following:state.following||new Set(),signals:Object.fromEntries(Object.entries(readSignalStore()).map(([id,v])=>[id,{...(serverSignalProfile[id]||{}),...v}])),creatorAffinity:{},topicAffinity:{},explorationIds:new Set(),recentEngagement:trendingFeatureCache,now:Date.now(),posts}}
function rankSignals(candidates,mode='forYou'){return FeedRankingEngine.rank(candidates,rankingContext(candidates),mode,candidates.length).map(x=>{x.post.__signalStrength=Math.round(x.score*100);x.post.__signalBreakdown={...x.parts,...x.modifiers,baseScore:Math.round(x.baseScore*100),finalScore:Math.round(x.score*100),contract:mode,selectionReason:x.selectionReason||'Base rank'};x.post.__signalWhy=x.why;x.post.__signalQuality=Math.round(Number(x.parts.quality||0)*100);return x.post})}
function signalScore(p){return Number(p?.__signalStrength||0)}function signalRankBadge(p){const s=signalScore(p);return s>=80?'🔥 Top Signal':s>=60?'✦ Strong Signal':s>=40?'• Signal':''}function explainSignalStrength(p){return p?.__signalWhy||'Ranked for this feed'}
function filteredPosts(mode){mode=mode||({following:'following',saved:'saved'}[state.filter]||state.filter||'forYou');let x=state.posts.filter(p=>p&&!p.deleted&&String(p?.moderation?.status||'').toLowerCase()!=='removed'&&String(p?.moderation?.status||'').toLowerCase()!=='blocked'&&!state.blocked.has(p.authorUid)&&!state.muted.has(p.authorUid));const prefs=window.SPIKE_APP_PREFS?.feed||{},keywords=Array.isArray(prefs.muted_keywords)?prefs.muted_keywords.map(x=>String(x).toLowerCase().trim()).filter(Boolean):[];x=x.filter(p=>{const t=String(p.content||'').toLowerCase();return !keywords.some(k=>t.includes(k))&&(!prefs.following_only||state.following.has(p.authorUid)||p.authorUid===state.user.id)&&(prefs.show_sensitive!==false||!(p.sensitive||p.is_sensitive))&&(prefs.show_spoilers!==false||!(p.spoiler||p.is_spoiler))&&(prefs.show_political!==false||!(p.political||p.is_political))});if(mode==='following')x=x.filter(p=>state.following.has(p.authorUid)||p.authorUid===state.user.id);if(mode==='saved')x=x.filter(p=>state.saved.has(p.id));const cf=state.customFeed||window.SPIKE_ACTIVE_CUSTOM_FEED;if(cf?.rules?.topics?.length){const topics=cf.rules.topics.map(t=>String(t).toLowerCase().trim()).filter(Boolean);x=x.filter(p=>{const text=String(p.content||'').toLowerCase();return topics.some(t=>text.includes(t)||(Array.isArray(p.topics)&&p.topics.some(pt=>String(pt).toLowerCase()===t)));});}return rankSignals(x,mode)}
function renderSignalTopPicks(ranked){const box=$('signalTopPicks'),list=$('signalTopPicksList');if(!box||!list)return;const top=ranked.slice(0,5);box.hidden=!top.length;list.innerHTML=top.map((p,i)=>`<button type="button" class="signal-pick" data-signal-pick="${esc(p.id)}" aria-label="Rank ${i+1}, score ${signalScore(p)} out of 100"><span class="signal-pick-media is-empty">✦<span class="signal-pick-rank">#${i+1}</span><strong class="signal-pick-score">${signalScore(p)}<em>/100</em></strong></span><span class="signal-pick-main"><b>${esc(nameOf(authorFor(p)))}</b><span>${esc(String(p.content||'Untitled').slice(0,70))}</span><small title="${esc(explainSignalStrength(p))}">${esc(explainSignalStrength(p))}</small></span><span class="signal-pick-bar"><i style="width:${signalScore(p)}%"></i></span></button>`).join('')}
function refreshSignalRanking({render=true,force=false}={}){
  const mode=state.filter==='following'?'following':state.filter==='saved'?'saved':(state.filter||'forYou');
  const raw=state.posts.slice();
  const key=`${mode}:${state.posts.length}:${state.visiblePosts}:${state.following.size}:${state.muted.size}:${state.blocked.size}:${state.saved.size}`;
  const cached=rankingCache.get(key);
  if(!force&&!rankingDirty&&cached&&Date.now()-cached.at<30000){if(render){renderSignalTopPicks(cached.ranked);renderSignalsFromRanked(cached.ranked)}return cached.ranked;}
  if(mode==='trending'){
    loadTrendingFeatures(raw).then(()=>{const r=filteredPosts(mode);rankingCache.set(key,{at:Date.now(),ranked:r});rankingDirty=false;if(render){renderSignalTopPicks(r);renderSignalsFromRanked(r)}});
    return cached?.ranked||filteredPosts(mode);
  }
  const r=filteredPosts(mode);rankingCache.set(key,{at:Date.now(),ranked:r});rankingDirty=false;
  if(render){renderSignalTopPicks(r);renderSignalsFromRanked(r)}
  return r;
}
function scheduleSignalRefresh({render=false}={}){
  rankingDirty=true;
  if(!render||signalRefreshQueued)return;
  signalRefreshQueued=true;
  queueMicrotask(()=>{signalRefreshQueued=false;refreshSignalRanking({render:true})});
}function startSignalAutoRefresh(){clearInterval(signalRefreshTimer);signalRefreshTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshSignalRanking({render:false})},300000)}
const feedVisibility=new Map();let feedObserver=null;function initFeedImpressionTracking(){if(!('IntersectionObserver'in window))return;feedObserver?.disconnect();feedObserver=new IntersectionObserver(es=>es.forEach(e=>{const id=e.target.dataset.post;if(!id)return;let v=feedVisibility.get(id)||{since:0,impressed:false,past:false,timer:null};if(e.isIntersecting&&e.intersectionRatio>=feedCfg.impression.threshold){if(!v.since)v.since=Date.now();if(!v.impressed&&!v.timer)v.timer=setTimeout(()=>{const x=feedVisibility.get(id);if(x&&!x.impressed){x.impressed=true;queueFeedEvent(id,'impression',{dwell_ms:Date.now()-x.since,metadata:{visibility_ratio:e.intersectionRatio}});if(!creatorEngagementViewSessions.has(id)){creatorEngagementViewSessions.add(id);recordCreatorEngagement(id,'view').catch(()=>{})}}},feedCfg.impression.dwellMs)}else if(v.since){const d=Date.now()-v.since;clearTimeout(v.timer);v.timer=null;if(!v.impressed&&d>=feedCfg.impression.pastMs&&!v.past){v.past=true;queueFeedEvent(id,'scrolled_past',{dwell_ms:d,metadata:{visibility_ratio:e.intersectionRatio}})}v.since=0}feedVisibility.set(id,v)}),{threshold:[0,.5,.75,1]});document.querySelectorAll('#posts .post[data-post]').forEach(x=>feedObserver.observe(x))}
function feedbackMenu(p){ openSignalMoreMenu(p, document.querySelector(`[data-more="${CSS.escape(String(p.id))}"]`)); }
function ago(v) {
  const d = new Date(v);
  if (!v || isNaN(d)) return "Just now";
  const s = (Date.now() - d) / 1000;
  if (s < 60) return `${Math.max(1,Math.floor(s))}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  if (s < 604800) return `${Math.floor(s/86400)}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function authorFor(p) { return state.users.get(p.authorUid) || { id: p.authorUid, name: p.authorName || "User", avatar_url: p.authorAvatar || "" }; }

function safeHttpUrl(value) {
  try {
    const u = new URL(String(value || '').trim(), location.href);
    return /^https?:$/i.test(u.protocol) ? u.href : '';
  } catch (_) {
    return '';
  }
}
function markdownToHTML(text) {
  let x = esc(text);
  x = x.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  x = x.replace(/`([^`]+)`/g, '<code>$1</code>');
  x = x.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  x = x.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  x = x.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, rawUrl) => {
    const url = safeHttpUrl(rawUrl);
    return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  x = x.replace(/(^|\s)(#[a-z0-9_]+)/gi, '$1<span class="hashtag">$2</span>');
  x = x.replace(/(^|\s)(@[a-z0-9_]+)/gi, '$1<span class="mention">$2</span>');
  return x;
}

function signalVideoPlaybackUrl(mediaItem){
  const raw=safeHttpUrl(mediaItem?.playbackUrl||mediaItem?.url||'');
  if(!raw)return '';
  // A stored playback URL may be a legacy/failed derivative. Keep it as the
  // first candidate so watermarks are preserved, but the video controller will
  // automatically fall back to fresh H.264/AAC Cloudinary derivatives.
  if(mediaItem?.playbackUrl || mediaItem?.watermarked===true || mediaItem?.normalized===true) return raw;
  return cloudinaryFeedVideoUrl(raw);
}

function videoMarkupForFeed(mediaItem, post, index='') {
  const kind=mediaKindOf(mediaItem);
  if(kind!=='video') return '';
  const media=signalVideoPlaybackUrl(mediaItem);
  if(!media) return '';
  const original=safeHttpUrl(mediaItem?.originalUrl||mediaItem?.url||media)||media;
  const label=index!==''?`SPIKE video ${Number(index)+1}`:'SPIKE video';
  return `<div class="post-video-inline${index!=='' ? ' post-grid-video' : ''}" data-video-ready="0" data-video-mode="preview"><video class="post-feed-video" data-original-src="${esc(original)}" data-playback-src="${esc(media)}" src="${esc(media)}" poster="${esc(cloudinaryVideoPosterUrl(original))}" preload="metadata" muted autoplay loop playsinline controlslist="nodownload" disablepictureinpicture aria-label="${esc(label)}"></video>${videoWatermarkForSignal(mediaItem,post)}<span class="grid-video-play" aria-hidden="true">▶</span><span class="video-duration-badge" data-video-duration aria-hidden="true">Video</span><div class="feed-video-error" role="alert">Video unavailable · <button type="button" data-video-retry>Retry</button></div></div>`;
}

function mediaMarkup(p) {
  const items=Array.isArray(p.mediaItems)&&p.mediaItems.length?p.mediaItems:(p.mediaUrl?[{url:p.mediaUrl,type:p.mediaType||'image',watermarked:!!p.mediaWatermarked,spid:p.mediaSpid||null}]:[]);
  if(!items.length) return "";
  const caption=String(p.content||'SPIKE media').replace(/\s+/g,' ').trim().slice(0,90);
  if(items.length===1){
    const m=items[0], kind=mediaKindOf(m), media=kind==='gif'||kind==='image'?cloudinaryFeedImageUrl(m.url):kind==='video'?signalVideoPlaybackUrl(m):safeHttpUrl(m.url);
    if(!media)return '';
    if(kind==='video') return videoMarkupForFeed(m,p);
    return `<button class="post-media" data-image="${esc(media)}" data-media-caption="${esc(caption)}" aria-label="Open Signal media"><img src="${esc(media)}" alt="Signal media" loading="lazy" decoding="async"></button>`;
  }
  const count=items.length;
  return `<div class="post-media-grid count-${Math.min(count,4)} layout-${esc(p.mediaLayout||'auto')}" aria-label="${count} media items">${items.slice(0,4).map((m,i)=>{const kind=mediaKindOf(m),media=kind==='gif'||kind==='image'?cloudinaryFeedImageUrl(m.url):kind==='video'?signalVideoPlaybackUrl(m):safeHttpUrl(m.url);if(!media)return '';if(kind==='video')return videoMarkupForFeed(m,p,i);return `<button class="post-media" data-image="${esc(media)}" data-media-caption="${esc(caption)}" aria-label="Open image ${i+1}"><img src="${esc(media)}" alt="Signal media ${i+1}" loading="lazy" decoding="async">${i===3&&count>4?`<b class="post-media-more">+${count-4}</b>`:''}</button>`;}).join('')}<span class="post-media-count">${count} ${count===1?'item':'items'}</span></div>`;
}
function renderComments(comments, parentId = null, level = 0, seen = new Set()) {
  if (!Array.isArray(comments) || level > 8) return "";
  const parentKey = parentId == null ? null : String(parentId);
  const items = comments.filter(c => (c.parentCommentId == null ? null : String(c.parentCommentId)) === parentKey);
  if (!items.length) return "";
  return items.map(c => {
    const id = String(c.id || '');
    if (!id || seen.has(id)) return '';
    const nextSeen = new Set(seen); nextSeen.add(id);
    const replies = renderComments(comments, id, level + 1, nextSeen);
    const replyCount = comments.filter(x => x.parentCommentId != null && String(x.parentCommentId) === id).length;
    return `<div class="comment" data-comment-id="${esc(id)}" style="margin-left:${Math.min(level,8)*12}px">
<div class="post-avatar" style="width:28px;height:28px;">${identityAvatar({id:c.authorUid,display_name:c.authorName,avatar_url:c.authorAvatar},"spike-avatar",c.authorName||"User")}</div>
<div class="comment-body"><div><b>${esc(c.authorName||"User")}</b> <span class="post-meta">${ago(c.createdAt)}</span></div>
<p>${markdownToHTML(c.text||"")}</p>
<button type="button" class="reply-btn" data-reply-to="${esc(id)}" data-post="${esc(c.postId)}" data-reply-author="${esc(c.authorName||'User')}">↩ Reply${replyCount ? ` · ${replyCount} ${replyCount===1?'reply':'replies'}` : ''}</button>
${replies?`<div class="replies">${replies}</div>`:""}
</div>
</div>`;
  }).join("");
}
function skeletonSignals(count = 4) {
  return Array.from({ length: count }, () => `
<div class="card post skeleton" style="padding:13px">
<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">
<div class="skeleton-avatar"></div>
<div style="flex:1"><div class="skeleton-text" style="width:60%"></div><div class="skeleton-text" style="width:30%"></div></div>
</div>
<div class="skeleton-text" style="width:90%"></div>
<div class="skeleton-text" style="width:70%"></div>
<div class="skeleton-text" style="width:40%"></div>
<div style="margin-top:10px;display:flex;gap:8px">
${Array.from({length:4},()=>`<div class="skeleton-text" style="width:50px;height:28px;border-radius:99px"></div>`).join('')}
</div>
</div>`).join('');
}

function signalHTML(p) {
  const a = authorFor(p), comments = Array.isArray(p.comments) ? p.comments : [];
  const liked = reactionLikeUsers(p).has(String(state.user.id)), saved = state.saved.has(p.id);
  const isScheduled = p.scheduledAt && new Date(p.scheduledAt) > new Date();
  const commentsHtml = renderComments(comments);
  const reactionEntries = normalizedReactionEntries(p);
  const m = signalMetrics(p);
  const topReactions = reactionEntries.slice(0, 3).map(([emoji]) => `<span class="reaction-icon">${emoji}</span>`).join("");
  const reactionSummary = m.totalReactions
    ? `<button type="button" class="reaction-summary" data-react-menu="${esc(p.id)}" aria-label="${m.totalReactions} reactions">${topReactions}<span>${m.totalReactions}</span></button>`
    : `<button type="button" class="reaction-summary is-empty" data-react-menu="${esc(p.id)}" aria-label="React to Signal"><span>React</span></button>`;
  const rankBadge = signalRankBadge(p);
  const signalScoreValue = signalScore(p);
  const isOwner = p.authorUid === state.user.id;
  const signalRank = Number(p.__signalTopRank || 0);
  const isSignalFeatured = signalRank >= 1 && signalRank <= 5;
  const signalFeaturedBadge = isSignalFeatured ? `<div class="signal-featured-badge" aria-label="Top Pick rank ${signalRank}, Signal Strength ${signalScoreValue} out of 100"><b>#${signalRank}</b><span>Top Pick</span><em>${signalScoreValue}/100</em><i class="signal-score-track" aria-hidden="true"><i style="width:${signalScoreValue}%"></i></i></div>` : '';
  return `<article class="post${isSignalFeatured ? ' signal-featured-post' : ''}" data-post="${esc(p.id)}"${isSignalFeatured ? ` data-signal-rank="${signalRank}"` : ''}>
<div class="post-head">
<a class="post-author" href="${profileLink(p.authorUid)}">
<div class="post-avatar">${identityAvatar(a,"spike-avatar",nameOf(a))}</div>
<div>
<div class="post-name">${esc(nameOf(a))}${verifiedBadgeHTML(a)}</div>
<div class="post-meta">@${esc(a.username||"spike")} · ${ago(p.createdAt||p.created_at)}${rankBadge ? `<span class="rank-badge" title="Feed ranking score ${signalScoreValue}/100 · ${esc(explainSignalStrength(p))}">${rankBadge} ${signalScoreValue}</span>` : `<span class="rank-badge" title="Feed ranking score ${signalScoreValue}/100 · ${esc(explainSignalStrength(p))}">Signal ${signalScoreValue}</span>`}${p.updatedAt && (p.edited === true || !!p.editedAt) ? `<span class="edited">(edited)</span>` : ""}${isScheduled ? `<span class="scheduled-badge">Scheduled</span>` : ""}</div>
</div>
</a>
<button class="more" data-more="${esc(p.id)}" aria-label="More">⋯</button>
</div>

${p.content?`<div class="post-content ${state.expandedCaptions?.has(String(p.id))?'':'is-collapsed'}" data-caption><span class="caption-body">${markdownToHTML(p.content)}</span><button type="button" class="caption-more" data-caption-toggle aria-label="Expand caption"></button></div>`:""}
${isSignalFeatured && mediaMarkup(p) ? `<div class="signal-featured-media">${signalFeaturedBadge}${mediaMarkup(p)}</div>` : mediaMarkup(p)}
${safeHttpUrl(p.linkUrl)?`<div class="link-card">🔗 <a href="${esc(safeHttpUrl(p.linkUrl))}" target="_blank" rel="noopener noreferrer">${esc(p.linkUrl)}</a></div>`:""}
<div class="post-stats">
<span class="reaction-count">${m.totalReactions ? `${m.totalReactions} reactions` : ""}</span>
<span class="comments-count">${m.comments ? `💬 ${m.comments}` : ""}</span>
<span>${Number(p.views||0) ? `👁 ${Number(p.views||0)}` : ""}</span>

<span>${m.saves ? `🔖 ${m.saves}` : ""}</span>
</div>
<div class="post-actions">
<button class="${liked?"active":""}" data-like="${esc(p.id)}" aria-label="${liked?"Unlike Signal":"Like Signal"}" title="${liked?"Unlike":"Like"}">❤️</button>
<button data-comments="${esc(p.id)}" aria-label="Open comments" title="Comments">💬</button>
<button data-pass="${esc(p.id)}" aria-label="Pass this Signal">↗</button>
<button class="${saved?"active":""}" data-save="${esc(p.id)}" aria-label="${saved?"Unsave Signal":"Save Signal"}" title="${saved?"Unsave":"Save"}">🔖</button>
${p.mediaType === "video" ? `<button type="button" class="spike-video-download" data-download-video="${esc(p.id)}" aria-label="Download watermarked video" title="Download watermarked video">⬇️</button>` : ""}
</div>
<div class="reaction-picker">
<button class="react-trigger" data-react-menu="${esc(p.id)}" aria-label="Choose reaction">☺ React</button>
${reactionSummary}
</div>
<div class="signal-activity-row" aria-label="Signal activity"><span>Signal activity</span><span>${Number(p.views||0)} views</span><span>${m.totalReactions} reactions</span><span>${m.comments} comments</span><span>${m.saves} saves</span></div>${isOwner ? `<div class="owner-insights" id="insights-${esc(p.id)}" hidden><span>👁 ${Number(p.views||0)} views</span><span>❤️ ${m.totalReactions} reactions</span><span>💬 ${m.comments} comments</span><span>🔖 ${m.saves} saves</span></div>` : ""}
<div class="comments" id="comments-${esc(p.id)}" data-comments-panel="${esc(p.id)}">
  <div class="comments-head">
    <span class="comments-title">Echoes</span>
    <button type="button" class="comments-close" data-comments-close="${esc(p.id)}" aria-label="Close comments">×</button>
  </div>
  <div class="comment-list">${commentsHtml||`<div class="meta">No comments yet.</div>`}</div>
  <form class="comment-form" data-comment-form="${esc(p.id)}" novalidate>
    <div class="comment-input-wrap">
      <div class="comment-replying" data-comment-replying="${esc(p.id)}" hidden><span>Replying to <b data-comment-reply-name>User</b></span><button type="button" data-comment-reply-cancel aria-label="Cancel reply">×</button></div>
      <textarea id="commentInput-${esc(p.id)}" maxlength="500" rows="1" autocomplete="off" placeholder="Add an Echo…" aria-label="Add an Echo"></textarea>
      <button type="button" class="comment-emoji" data-comment-emoji="${esc(p.id)}" aria-label="Add emoji">☺</button>
      <div class="comment-emoji-picker" data-comment-emoji-picker="${esc(p.id)}" role="menu">
        ${["❤️","😂","👍","🔥","😍","😮","😢","👏","🎉","🙏","💯","✨"].map(x=>`<button type="button" data-comment-emoji-value="${esc(x)}" aria-label="${esc(x)}">${esc(x)}</button>`).join('')}
      </div>
      <div class="comment-char-counter" data-comment-counter="${esc(p.id)}">0/500</div>
    </div>
    <button type="submit">Echo</button>
  </form>
</div>
</article>`;
}

function renderSignalsFromRanked(list) {
  state.posts.forEach(p => { delete p.__signalTopRank; });
  list.slice(0, 5).forEach((p, i) => { p.__signalTopRank = i + 1; });
  const visible = list.slice(0, state.visiblePosts);
  state.allLoaded = visible.length >= list.length;
  const container = $("posts");
  container.innerHTML = visible.length ? visible.map(signalHTML).join("") : `<div class="card empty">No Signals match this feed yet.</div>`;
  container.setAttribute("aria-busy", "false");
  const activeCommentId = window.SPIKEComments?.activePostId;
  if(activeCommentId){
    const section = container.querySelector(`[data-comments-panel="${CSS.escape(String(activeCommentId))}"]`);
    if(section) section.classList.add('open');
  }
  initVideoControls();
  queueMicrotask(() => { updateCaptionToggles(); initFeedImpressionTracking(); });
}

function renderSignals() {
  refreshSignalRanking();
}

// ─── SETTINGS ──────────────────────────────────────────
async function loadSettings() {
  const fallback = { feed: { show_sensitive: true, show_spoilers: true, show_political: true, following_only: false, muted_keywords: [] }, theme: null };
  try {
    const row = await getDoc(`users/${state.user.id}/settings/feed`).catch(() => null);
    const data = row?.feed ? row : (row || {});
    window.SPIKE_APP_PREFS = { ...fallback, ...window.SPIKE_APP_PREFS, ...data, feed: { ...fallback.feed, ...(window.SPIKE_APP_PREFS?.feed || {}), ...(data.feed || {}) } };
  } catch (e) { console.warn('loadSettings', e); window.SPIKE_APP_PREFS = fallback; }
  const f = window.SPIKE_APP_PREFS.feed;
  const v2s = $('v2Sensitive'), v2sp = $('v2Spoilers'), v2p = $('v2Political'), v2f = $('v2FollowingOnly'), v2mk = $('v2MutedKeywords');
  if (v2s) v2s.checked = f.show_sensitive !== false;
  if (v2sp) v2sp.checked = f.show_spoilers !== false;
  if (v2p) v2p.checked = f.show_political !== false;
  if (v2f) v2f.checked = !!f.following_only;
  if (v2mk) v2mk.value = Array.isArray(f.muted_keywords) ? f.muted_keywords.join(', ') : '';
  if (!window.SPIKE_THEME?.hasStored?.() && window.SPIKE_APP_PREFS.theme) applyTheme(window.SPIKE_APP_PREFS.theme);
}

async function saveSettings() {
  const feed = {
    show_sensitive: $('v2Sensitive').checked,
    show_spoilers: $('v2Spoilers').checked,
    show_political: $('v2Political').checked,
    following_only: $('v2FollowingOnly').checked,
    muted_keywords: $('v2MutedKeywords').value.split(',').map(x => x.trim()).filter(Boolean)
  };
  window.SPIKE_APP_PREFS = { ...(window.SPIKE_APP_PREFS || {}), feed };
  try { await putDoc(`users/${state.user.id}/settings/feed`, { feed, updated_at: now() }, `users/${state.user.id}/settings`); toast('Feed controls saved', 'success'); renderSignals(); } catch (e) { console.error('saveSettings', e); toast('Could not save feed controls'); }
}

// ─── BADGES ────────────────────────────────────────────
let notificationBadgeTimer = null;
function setNotificationBadge(count){
  const navBtn=document.querySelector('[data-spike-nav="activity"]');
  if(!navBtn)return;
  let badge=navBtn.querySelector('.spike-nav-badge');
  const n=Math.max(0,Number(count)||0);
  if(!n){badge?.remove();navBtn.removeAttribute('data-unread-count');return;}
  if(!badge){badge=document.createElement('span');badge.className='spike-nav-badge';badge.setAttribute('aria-hidden','true');navBtn.appendChild(badge);}
  badge.textContent=n>99?'99+':String(n);
  navBtn.dataset.unreadCount=String(n);
  navBtn.setAttribute('aria-label',`Activity, ${n} unread notification${n===1?'':'s'}`);
}
async function refreshNotificationBadge(){
  if(!state.user?.id||!navigator.onLine)return;
  try{
    const n=await withTimeout(db.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',state.user.id).eq('read',false),8000,'Notification badge');
    if(n?.error)throw n.error;
    setNotificationBadge(n?.count||0);
  }catch(e){console.debug('[SPIKE notification badge]',e);}
}
function startNotificationBadge(){
  clearInterval(notificationBadgeTimer);refreshNotificationBadge();
  notificationBadgeTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshNotificationBadge()},30000);
}
async function loadBadges(){await refreshNotificationBadge();}

// ─── ANNOUNCEMENT ──────────────────────────────────────
async function loadAnnouncement() {
  const box = $('announcement'), text = $('announcementText');
  try {
    const d = await getDoc('settings/announcement').catch(() => null);
    const message = typeof d === 'string' ? d : (d?.text || d?.message || d?.content || '');
    if (message) { text.textContent = message; box.classList.add('show'); } else box.classList.remove('show');
  } catch (e) { console.warn('loadAnnouncement', e); box.classList.remove('show'); }
}

// ─── POST CRUD ─────────────────────────────────────────
async function writeSignal({ content = '', mediaUrl = null, mediaType = null, mediaWatermarked = false, mediaSpid = null, mediaOriginalUrl = null, mediaNormalized = false, mediaItems = [], mediaLayout = 'auto', linkUrl = null, scheduledAt = null } = {}) {
  if (!state.user) return;
  const text = String(content || '').trim();
  if (!text && !mediaUrl && !mediaItems.length && !linkUrl) { toast('Write something first'); return null; }
  // UX-only preflight. NEVER stop the write here: the database trigger is authoritative and
  // must be allowed to create the policy case + notification before it marks the Signal removed.
  let preflightDecision = 'allow';
  if(text){
    try{
      const moderation=await db.rpc('moderate_spike_content',{p_content:text,p_content_type:'post'});
      if(!moderation.error) preflightDecision=String(moderation.data?.decision||'allow');
    }catch(e){ console.warn('SPIKE policy preflight unavailable; database enforcement remains authoritative.',e); }
  }
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const data = {
    authorUid: state.user.id, authorName: nameOf(state.profile), authorAvatar: avatarOf(state.profile),
    content: text, mediaUrl, mediaType, mediaWatermarked: !!mediaWatermarked, mediaSpid: mediaSpid || null, mediaOriginalUrl: mediaOriginalUrl || null, mediaNormalized: !!mediaNormalized, mediaItems: Array.isArray(mediaItems) ? mediaItems : [], mediaLayout: mediaLayout || 'auto', linkUrl, scheduledAt: scheduledAt || null,
    comments: [], reactions: { like: 0, like_users: [] }, views: 0, createdAt: now(), updatedAt: null, deleted: false
  };
  await putDoc(`posts/${id}`, data, 'posts');
  // Read back the row after the server trigger has run. This is important: the trigger may
  // have changed deleted/content/moderation and created the user's policy case + notification.
  const serverData = await getDoc(`posts/${id}`).catch(() => data);
  const serverRemoved = !!serverData?.deleted || String(serverData?.moderation?.status||'') === 'removed';
  if(serverRemoved){
    rankingDirty=true; rankingCache.clear();
    toast(preflightDecision==='remove' ? 'Signal removed by SPIKE Policy. Check Notifications and Policy & Appeals.' : 'Signal removed by SPIKE Policy. Check Notifications and Policy & Appeals.','error');
    renderSignals();
    return id;
  }
  state.posts.unshift(normalizeSignalModel({ id, ...serverData })); rankingDirty=true; rankingCache.clear();
  renderSignals();
  return id;
}

async function updateSignal(id, patch) {
  const p = state.posts.find(x => x.id === id);
  if (!p) throw new Error('Post not found');
  if(String(patch?.content??'').trim()){
    try{
      const moderation=await db.rpc('moderate_spike_content',{p_content:String(patch.content).trim(),p_content_type:'post_edit'});
      if(!moderation.error && moderation.data?.decision==='remove'){ toast('This Signal edit was blocked by SPIKE Policy.','error'); return false; }
    }catch(e){ console.warn('SPIKE policy edit preflight unavailable; database enforcement remains authoritative.',e); }
  }
  const next = { ...p, ...patch, updatedAt: now() };
  await putDoc(`posts/${id}`, next, 'posts');
  // Read back server-enforced moderation state so a blocked edit cannot remain visible locally.
  const serverData = await getDoc(`posts/${id}`).catch(() => next);
  const serverRemoved = !!serverData?.deleted || String(serverData?.moderation?.status||'') === 'removed';
  if(serverRemoved){
    state.posts = state.posts.filter(x => String(x.id) !== String(id));
    rankingDirty=true; rankingCache.clear();
    toast('Signal removed by SPIKE Policy. Check Notifications and Policy & Appeals.','error');
    renderSignals();
    return false;
  }
  Object.assign(p, serverData); rankingDirty=true; rankingCache.clear();
  renderSignals();
  return true;
}

async function deleteSignal(id) {
  const p = state.posts.find(x => x.id === id);
  if (!p || p.authorUid !== state.user.id) { toast('You cannot delete this Signal'); return; }

  const ok = await premiumConfirm({
    title: 'Delete this Signal?',
    message: 'This Signal will be removed from your SPIKE feed.',
    confirmText: 'Delete Signal',
    cancelText: 'Keep Signal',
    icon: '🗑️',
    eyebrow: 'DANGER ZONE',
    danger: true
  });
  if (!ok) return;

  // Optimistic UI: remove it from the in-memory feed immediately.
  // Previously the update path set deleted=true but left the Signal inside
  // state.posts, so it stayed visible until the next full feed reload.
  const previousPosts = state.posts;
  state.posts = previousPosts.filter(x => x.id !== id);
  rankingDirty = true;
  rankingCache.clear();
  renderSignals();
  toast('Signal deleted', 'success');

  try {
    // Persist directly instead of calling the update path, which would render
    // the still-present deleted object before it was removed from state.posts.
    await putDoc(
      `posts/${id}`,
      { ...p, deleted: true, deletedAt: now(), updatedAt: now() },
      'posts'
    );
  } catch (e) {
    // Roll back the optimistic removal if the backend write fails.
    state.posts = previousPosts;
    rankingDirty = true;
    rankingCache.clear();
    renderSignals();
    console.error('deleteSignal', e);
    toast(e.message || 'Could not delete this Signal', 'error');
  }
}
async function mutateSignalInteraction(id, action, emoji = null, comment = null) {
  if (!state.user?.id) throw new Error('Please sign in again.');
  const { data, error } = await withTimeout(
    db.rpc('mutate_post_interaction', {
      p_post_id: String(id),
      p_action: action,
      p_emoji: emoji,
      p_comment: comment
    }),
    12000,
    'Signal interaction'
  );
  if (error) throw error;
  return data;
}

function signalSelector(id) {
  return `[data-post="${CSS.escape(String(id))}"]`;
}
function getSignalArticle(id) {
  return document.querySelector(signalSelector(id));
}
function getSignalState(id) {
  return state.posts.find(p => String(p.id) === String(id));
}

/*
 * Interaction DOM sync is intentionally surgical.
 * Never replace the article, comments panel, form, textarea, or feed container
 * for a like/comment. That would destroy focus, selection, scroll and reply state.
 */
function syncReactionDom(id, post) {
  const article = getSignalArticle(id);
  if (!article) return;
  const m = signalMetrics(post);
  const entries = normalizedReactionEntries(post);
  const top = entries.slice(0, 3).map(([emoji]) => `<span class="reaction-icon">${esc(emoji)}</span>`).join('');
  const summary = article.querySelector('.reaction-summary');
  if (summary) {
    summary.classList.toggle('is-empty', !m.totalReactions);
    summary.setAttribute('aria-label', m.totalReactions ? `${m.totalReactions} reactions` : 'React to Signal');
    summary.innerHTML = m.totalReactions ? `${top}<span>${m.totalReactions}</span>` : '<span>React</span>';
  }
  const total = article.querySelector('.reaction-count');
  if (total) total.textContent = m.totalReactions ? `${m.totalReactions} reactions` : '';
  const insights = article.querySelector('.owner-insights');
  if (insights) {
    const spans = insights.querySelectorAll('span');
    if (spans[1]) spans[1].textContent = `❤️ ${m.totalReactions} reactions`;
  }
}

function syncLikeDom(id, post) {
  const article = getSignalArticle(id);
  if (!article) return;
  const btn = article.querySelector(`[data-like="${CSS.escape(String(id))}"]`);
  if (btn) {
    const liked = reactionLikeUsers(post).has(String(state.user?.id));
    btn.classList.toggle('active', liked);
    btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
  }
  const m = signalMetrics(post);
  const stats = article.querySelector('.post-stats');
  if (stats) {
    const reactionCount = stats.querySelector('.reaction-count');
    if (reactionCount) reactionCount.textContent = m.totalReactions ? `${m.totalReactions} reactions` : '';
  }
  syncReactionDom(id, post);
}

function syncCommentDom(id, post) {
  const article = getSignalArticle(id);
  if (!article) return;
  const comments = Array.isArray(post?.comments) ? post.comments : [];
  const section = article.querySelector(`#comments-${CSS.escape(String(id))}`);
  if (!section) return;

  // Only the list is patched. The live composer is never replaced.
  const list = section.querySelector('.comment-list');
  if (list) list.innerHTML = renderComments(comments) || '<div class="meta">No comments yet.</div>';

  const count = article.querySelector('.comments-count');
  if (count) count.textContent = comments.length ? `💬 ${comments.length}` : '';

  const m = signalMetrics(post);
  const insights = article.querySelector('.owner-insights');
  if (insights) {
    const spans = insights.querySelectorAll('span');
    if (spans[2]) spans[2].textContent = `💬 ${m.comments} comments`;
  }

  if (window.SPIKEComments?.activePostId === String(id)) section.classList.add('open');
}

function syncSaveDom(id) {
  const article = getSignalArticle(id);
  if (!article) return;
  const btn = article.querySelector(`[data-save="${CSS.escape(String(id))}"]`);
  if (btn) {
    const saved = state.saved.has(id);
    btn.classList.toggle('active', saved);
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
  }
}

const feedInteractionBusy = new Set();
function setInteractionBusy(id, busy, action = null) {
  const article = getSignalArticle(id);
  if (!article) return;
  const selector = action === 'like'
    ? `[data-like="${CSS.escape(String(id))}"]`
    : action === 'save'
      ? `[data-save="${CSS.escape(String(id))}"]`
      : action === 'reaction'
        ? `[data-react-menu="${CSS.escape(String(id))}"]`
        : '';
  if (!selector) return;
  article.querySelectorAll(selector).forEach(btn => {
    btn.disabled = busy;
    btn.classList.toggle('is-busy', busy);
  });
}

async function toggleLike(id) {
  const p = getSignalState(id);
  const key = `like:${id}`;
  if (!p || !state.user?.id || feedInteractionBusy.has(key)) return false;
  feedInteractionBusy.add(key);
  setInteractionBusy(id, true, 'like');
  const before = JSON.parse(JSON.stringify(p.reactions || {}));
  const users = reactionLikeUsers(p);
  const wasLiked = users.has(String(state.user.id));
  if (wasLiked) users.delete(String(state.user.id)); else users.add(String(state.user.id));
  p.reactions = { ...(p.reactions || {}), like_users: [...users], like: users.size };
  syncLikeDom(id, p);
  try {
    const data = await mutateSignalInteraction(id, 'like');
    if (data && typeof data === 'object') normalizeSignalModel(Object.assign(p, data));
    syncLikeDom(id, p);
    recordSignal(id, 'likes', wasLiked ? -1 : 1);
    return !wasLiked;
  } catch (e) {
    p.reactions = before;
    syncLikeDom(id, p);
    throw e;
  } finally {
    feedInteractionBusy.delete(key);
    setInteractionBusy(id, false, 'like');
  }
}

async function toggleSave(id) {
  const key = `save:${id}`;
  if (!state.posts.some(p => String(p.id) === String(id)) || feedInteractionBusy.has(key)) return;
  feedInteractionBusy.add(key);
  setInteractionBusy(id, true, 'save');
  const wasSaved = state.saved.has(id);
  if (wasSaved) state.saved.delete(id); else state.saved.add(id);
  syncSaveDom(id);
  try {
    const data = await mutateSignalInteraction(id, wasSaved ? 'unsave' : 'save');
    const p = getSignalState(id);
    if (data && typeof data === 'object' && p) normalizeSignalModel(Object.assign(p, data));
    toast(state.saved.has(id) ? 'Saved' : 'Removed from saved', 'success');
  } catch (e) {
    if (wasSaved) state.saved.add(id); else state.saved.delete(id);
    syncSaveDom(id);
    throw e;
  } finally {
    feedInteractionBusy.delete(key);
    setInteractionBusy(id, false, 'save');
  }
}

async function reactToSignal(id, emoji) {
  const p = getSignalState(id);
  const key = `reaction:${id}`;
  if (!p || !SPIKE_REACTIONS.includes(emoji) || feedInteractionBusy.has(key)) return;
  feedInteractionBusy.add(key);
  setInteractionBusy(id, true, 'reaction');

  const before = JSON.parse(JSON.stringify(p.reactions || {}));
  const reactions = { ...(p.reactions || {}) };
  const uid = state.user.id;
  const targetUsersKey = `${emoji}_users`;
  const hadSame = Array.isArray(reactions[targetUsersKey]) && reactions[targetUsersKey].includes(uid);

  for (const usersKey of Object.keys(reactions).filter(k => k.endsWith('_users'))) {
    const emojiKey = usersKey.slice(0, -6);
    const users = Array.isArray(reactions[usersKey]) ? [...new Set(reactions[usersKey])] : [];
    if (users.includes(uid)) {
      const next = users.filter(x => x !== uid);
      reactions[usersKey] = next;
      reactions[emojiKey] = next.length;
    }
  }
  if (!hadSame) {
    const users = Array.isArray(reactions[targetUsersKey]) ? [...new Set(reactions[targetUsersKey])] : [];
    users.push(uid);
    reactions[targetUsersKey] = [...new Set(users)];
    reactions[emoji] = reactions[targetUsersKey].length;
  }
  for (const [k, v] of Object.entries(reactions)) {
    if (!k.endsWith('_users') && Number(v) <= 0) reactions[k] = 0;
  }
  p.reactions = reactions;
  syncReactionDom(id, p);

  try {
    const data = await mutateSignalInteraction(id, 'reaction', emoji);
    if (data && typeof data === 'object') normalizeSignalModel(Object.assign(p, data));
    recordSignal(id, 'reactions', 1);
    syncReactionDom(id, p);
    closeReactionTray();
    scheduleSignalRefresh({ render: false });
  } catch (e) {
    p.reactions = before;
    syncReactionDom(id, p);
    throw e;
  } finally {
    feedInteractionBusy.delete(key);
    setInteractionBusy(id, false, 'reaction');
  }
}

async function addComment(postId, text, parentCommentId = null) {
  const clean = String(text || '').trim();
  if (!clean) return;
  if (clean.length > 500) throw new Error('Comment is limited to 500 characters.');

  const p = getSignalState(postId);
  const key = `comment:${postId}`;
  if (!p || !state.user?.id || feedInteractionBusy.has(key)) return;

  feedInteractionBusy.add(key);
  const oldComments = Array.isArray(p.comments) ? [...p.comments] : [];
  const tempId = crypto.randomUUID ? crypto.randomUUID() : `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const comment = {
    id: tempId,
    postId: String(postId),
    authorUid: state.user.id,
    authorName: nameOf(state.profile),
    authorAvatar: avatarOf(state.profile),
    text: clean,
    parentCommentId: parentCommentId ? String(parentCommentId) : null,
    createdAt: now(),
    __optimistic: true
  };

  // Paint immediately. No feed render, no comment-form replacement, no refresh.
  p.comments = [...oldComments, comment];
  syncCommentDom(postId, p);

  try {
    const data = await mutateSignalInteraction(postId, 'comment', null, comment);
    if (data && typeof data === 'object') Object.assign(p, data);
    // If the RPC returned the authoritative comment list, use it. Otherwise
    // retain the optimistic comment so the UI never briefly disappears.
    syncCommentDom(postId, p);
    recordSignal(postId, 'comments', 1);
    toast('Comment added', 'success');
    scheduleSignalRefresh({ render: false });
    return data;
  } catch (e) {
    p.comments = oldComments;
    syncCommentDom(postId, p);
    throw e;
  } finally {
    feedInteractionBusy.delete(key);
  }
}

// ─── REACTION TRAY ─────────────────────────────────────
let spikeReactionTray = null;
function closeReactionTray(){ if (spikeReactionTray) { spikeReactionTray.remove(); spikeReactionTray = null; } }
function openReactionTray(id, anchor){
  closeReactionTray();
  const tray = document.createElement('div');
  tray.className = 'spike-reaction-tray';
  tray.setAttribute('role','dialog');
  tray.setAttribute('aria-label','Choose a reaction');
  tray.innerHTML = SPIKE_REACTIONS.map(emoji => `<button type="button" data-spike-reaction="${esc(emoji)}" aria-label="${esc(emoji)}">${esc(emoji)}</button>`).join('');
  document.body.appendChild(tray);
  spikeReactionTray = tray;
  const r = anchor.getBoundingClientRect();
  const trayWidth = Math.min(window.innerWidth - 20, 312);
  let left = Math.max(10, Math.min(window.innerWidth - trayWidth - 10, r.left));
  let top = r.top - 58;
  if (top < 8) top = r.bottom + 8;
  tray.style.left = `${left}px`;
  tray.style.top = `${top}px`;
  tray.addEventListener('click', e => {
    const b = e.target.closest('[data-spike-reaction]');
    if (!b) return;
    reactToSignal(id, b.dataset.spikeReaction);
  }, {once:true});
  setTimeout(() => document.addEventListener('pointerdown', function outside(e){
    if (!tray.contains(e.target) && e.target !== anchor) {
      closeReactionTray();
      document.removeEventListener('pointerdown', outside);
    }
  }), 0);
}

// ─── SPIKE PASS ─────────────────────────────────────────
let spikePassFriends = [];
let spikePassSelected = new Set();
let spikePassShareData = null;
function spikePassUrl(id){ return new URL(`feed.html?post=${encodeURIComponent(id)}`, location.href).href; }
function spikePassAvatar(p){
  const u=p?.avatar_url||p?.avatar||''; const n=p?.display_name||p?.name||p?.username||'S';
  return u?`<img src="${esc(u)}" alt="" loading="lazy" decoding="async">`:esc(String(n).trim().slice(0,1).toUpperCase()||'S');
}
function spikePassPersonId(p){return p?.user_id||p?.id||p?.owner_id||p?.document_id||null;}
function spikePassPersonName(p){return p?.display_name||p?.name||p?.username||'SPIKE friend';}
function spikePassResetShare(){
  spikePassShareData=null;
}
async function spikeLoadPassFriends(){
  try{const {data,error}=await db.rpc('get_friends_public',{p_limit:500,p_offset:0});if(error)throw error;const seen=new Set();spikePassFriends=(data||[]).filter(f=>{const raw=spikePassPersonId(f)||f?.username||`${f?.display_name||f?.name||''}|${f?.avatar_url||''}`;const key=String(raw).trim().toLowerCase();if(!key||seen.has(key))return false;seen.add(key);return true;});}catch(e){console.warn('[SPIKE PASS] friends',e);spikePassFriends=[];}
}
function spikePassPreview(p){
  const text=String(p?.content||'Signal').trim();
  return `<div class="spike-pass-original"><span class="spike-pass-label">ORIGINAL SIGNAL</span><div>${esc(text.slice(0,520))}${text.length>520?'…':''}</div><small>SPIKE ${esc(nameOf(authorFor(p)))}</small></div>`;
}
function spikePassRender(){
  spikePassResetShare();
  const panel=$('spikePassPanel'); if(!panel)return;
  const q=(panel.querySelector('.spike-pass-search')?.value||'').trim().toLowerCase();
  const rows=spikePassFriends.filter(f=>`${spikePassPersonName(f)} ${f.username||''}`.toLowerCase().includes(q));
  panel.innerHTML=`<input class="spike-pass-search" placeholder="Find a connection…" autocomplete="off">
  <div class="spike-pass-list">${rows.length?rows.map(f=>{const id=spikePassPersonId(f),sel=spikePassSelected.has(String(id));return `<button type="button" class="spike-pass-person ${sel?'selected':''}" data-spike-pass-pick="${esc(id)}"><span class="avatar-mini">${spikePassAvatar(f)}</span><span><b>${esc(spikePassPersonName(f))}</b><small>${f.username?'@'+esc(f.username):'Connection'}</small></span><span class="spike-pass-check">${sel?'✓':''}</span></button>`}).join(''):'<div class="meta" style="padding:15px;text-align:center">No connections found.</div>'}</div>
  <textarea class="spike-pass-message" maxlength="500" placeholder="Add your voice before passing it…"></textarea>
  <button type="button" class="spike-pass-primary" id="spikePassSend" ${spikePassSelected.size?'':'disabled'}>PASS WITH MY VOICE SPIKE</button>`;
  panel.querySelector('.spike-pass-search')?.addEventListener('input',spikePassRender);
  panel.querySelectorAll('[data-spike-pass-pick]').forEach(b=>b.addEventListener('click',()=>{const id=String(b.dataset.spikePassPick);if(spikePassSelected.has(id))spikePassSelected.delete(id);else spikePassSelected.add(id);spikePassRender();}));
  panel.querySelector('#spikePassSend')?.addEventListener('click',spikePassSendFriends);
}
function spikePassRenderLink(url){
  spikePassResetShare();
  const p=state.posts.find(x=>String(x.id)===String(state.activePost));
  const panel=$('spikePassPanel'); if(!panel||!p)return;
  panel.innerHTML=`<div class="spike-pass-link-card">
    <span class="spike-pass-label">PASS OUTSIDE SPIKE</span>
    <div class="spike-pass-share-copy"><b>Share this Signal outside SPIKE</b><span>Choose an app from your device share sheet to pass this Signal on.</span></div>
    <div class="spike-share-status" id="spikeShareStatus">Ready to share</div>
    <button type="button" class="spike-pass-primary spike-native-share" id="spikeNativeSignalShare">${navigator.share?'SHARE TO APPS':'COPY SIGNAL LINK'}</button>
    <button type="button" class="spike-pass-secondary" id="spikeCopySignalLink">COPY SIGNAL LINK</button>
  </div>`;
  spikePassShareData={title:`${nameOf(authorFor(p))} on SPIKE`,text:String(p.content||'A Signal from SPIKE').trim(),url:url};
  panel.querySelector('#spikeCopySignalLink')?.addEventListener('click',async()=>{try{await copyTextSafe(url);toast('Signal link copied','success')}catch{toast('Copy unavailable — press and hold the link.')}});
  panel.querySelector('#spikeNativeSignalShare')?.addEventListener('click',async()=>{
    if(!spikePassShareData){toast('Share is unavailable.','warning');return;}
    try{
      const result=await window.SPIKEShare.sharePrepared(spikePassShareData);
      if(result.method==='copied-link')toast('Signal link copied','success');
      else if(result.method!=='none'){await recordCreatorEngagement(p.id,'share');queueFeedEvent(p.id,'share',{metadata:{surface:'post_share',method:result.method}});toast('Share sheet opened','success');}
      else toast('Sharing unavailable — copy the Signal link instead.','error');
    }catch(e){if(e?.name!=='AbortError')toast(e?.message||'Device sharing unavailable','error');}
  });
}
async function spikePassSendFriends(){
  const p=state.posts.find(x=>x.id===state.activePost); if(!p||!spikePassSelected.size)return;
  const note=$('spikePassPanel')?.querySelector('.spike-pass-message')?.value?.trim()||'';
  const body=`${note?note+'\n\n':''}SPIKE A Signal was passed to you on SPIKE\n${spikePassUrl(p.id)}`;
  const btn=$('spikePassSend'); if(btn){btn.disabled=true;btn.textContent='PASSING…';}
  let sent=0;
  try{for(const recipient of spikePassSelected){const {error}=await db.from('private_messages').insert({sender_id:state.user.id,recipient_id:recipient,body:body.slice(0,10000),message_type:'text',read:false});if(error)throw error;sent++;}
    await recordCreatorEngagement(p.id,'share');
    renderSignals(); scheduleSignalRefresh();
    const panel=$('spikePassPanel'); if(panel)panel.innerHTML=`<div class="spike-pass-success"><div class="ok">✓</div><b>Signal passed</b><small>Your voice was added and sent to ${sent} connection${sent===1?'':'s'}.</small></div>`;
  }catch(e){console.error('[SPIKE PASS FRIENDS]',e);toast(e?.message||'Could not pass the Signal','error');if(btn){btn.disabled=false;btn.textContent='TRY AGAIN';}}
}
async function passSignal(id){
  const p=state.posts.find(x=>x.id===id); if(!p)return;
  state.activePost=id; spikePassSelected=new Set(); spikePassResetShare(); 
  const title=$('spikePassTitle'); if(title)title.textContent='Pass this Signal';
  const sub=$('spikePassSubtitle'); if(sub)sub.textContent='Carry the message forward — with your own voice.';
  const content=$('spikePassContent'); if(content)content.innerHTML=spikePassPreview(p);
  openOverlay('spikePassOverlay');
  await spikeLoadPassFriends(); spikePassRender();
}

// ─── REPORT ───────────────────────────────────────────
async function reportSignal(id, reason) {
  try { const {error}=await db.from('feed_reports').insert({ post_id: id, reporter_id: state.user.id, reason }); if(error) throw error; toast('Report submitted', 'success'); }
  catch (e) { console.warn('report insert', e); toast(e?.message||'Could not submit report','error'); }
  closeOverlay('reportOverlay');
}

// ─── OVERLAYS ──────────────────────────────────────────
function openOverlay(id) { $(id)?.classList.add('open'); }
function closeOverlay(id) { $(id)?.classList.remove('open'); }

// ─── PREMIUM MEDIA STUDIO ───────────────────────────────
const MAX_POST_MEDIA = 10;
function mediaItemId(){ return (globalThis.crypto?.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`; }
function formatMediaSize(bytes){ if(!Number.isFinite(bytes)) return ''; const u=['B','KB','MB','GB']; let n=bytes,i=0; while(n>=1024&&i<u.length-1){n/=1024;i++;} return `${n<10&&i?n.toFixed(1):Math.round(n)} ${u[i]}`; }
function mediaTypeOf(file){ return String(file?.type||'').startsWith('video/') ? 'video' : 'image'; }
function revokeMediaPreview(item){ try{ if(item?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl); }catch(_){} }
function mediaItemsFromState(){ return Array.isArray(state.mediaItems) ? state.mediaItems : []; }
function syncLegacyMediaState(){ const items=mediaItemsFromState(); state.media=items[0]?.file||null; state.mediaType=items[0]?.type||null; }
function mediaCollectionStats(items){
  const photos=items.filter(x=>x.type==='image').length, videos=items.filter(x=>x.type==='video').length;
  return `${photos?`${photos} photo${photos===1?'':'s'}`:''}${photos&&videos?' · ':''}${videos?`${videos} video${videos===1?'':'s'}`:''}` || 'Selected media';
}
function mediaFilterCss(v){return ({0:'none',1:'contrast(1.12) saturate(1.18)',2:'grayscale(.9) contrast(1.08)',3:'sepia(.55) saturate(1.2)',4:'brightness(1.12) saturate(.78)'})[Number(v)]||'none';}
function applyMediaEdit(action){const items=mediaItemsFromState(),item=items[state.activeMediaIndex];if(!item)return;if(action==='rotate'&&item.type==='image')item.rotation=((item.rotation||0)+90)%360;if(action==='filter'&&item.type==='image')item.filter=((item.filter||0)+1)%5;if(action==='mute'&&item.type==='video')item.muted=!item.muted;if(action==='crop'&&item.type==='image')item.crop=item.crop==='square'?'portrait':item.crop==='portrait'?'landscape':'square';renderMediaStudio();}

function renderMediaStudio(){
  const items=mediaItemsFromState(), studio=$('mediaPreview'), stage=$('mediaStage'), strip=$('mediaFilmstrip');
  if(!studio||!stage||!strip) return;
  if(!items.length){ studio.hidden=true; studio.classList.remove('is-uploading'); stage.innerHTML=''; strip.innerHTML=''; if($('mediaCount'))$('mediaCount').textContent='0 items'; return; }
  studio.hidden=false;
  if(!Number.isInteger(state.activeMediaIndex)||state.activeMediaIndex<0||state.activeMediaIndex>=items.length) state.activeMediaIndex=0;
  const active=items[state.activeMediaIndex], total=items.length;
  const busy=items.some(x=>x.status==='uploading'); studio.classList.toggle('is-uploading',busy);
  if($('mediaCount'))$('mediaCount').textContent=`${total} ${total===1?'item':'items'}`;
  if($('mediaReady'))$('mediaReady').textContent=items.some(x=>x.status==='error')?'Needs attention':busy?'Uploading…':'Ready to post';
  const details=[mediaCollectionStats(items),active.file?.name,formatMediaSize(active.file?.size)].filter(Boolean).join(' · ');
  if($('mediaMeta'))$('mediaMeta').textContent=details;
  const mediaSrc=esc(active.previewUrl);
  const mediaStyle=`transform:rotate(${Number(active.rotation||0)}deg);filter:${mediaFilterCss(active.filter||0)};${active.crop==='square'?'aspect-ratio:1/1;':''}${active.crop==='portrait'?'aspect-ratio:4/5;':''}${active.crop==='landscape'?'aspect-ratio:16/9;':''}`;
  stage.innerHTML=`<span class="media-index">${state.activeMediaIndex+1} / ${total}</span><span class="media-type-badge">${active.type==='video'?'VIDEO':'PHOTO'}</span>${active.type==='video'?`<video src="${mediaSrc}" controls playsinline preload="metadata" ${active.muted?'muted':''} style="${mediaStyle}"></video>`:`<img src="${mediaSrc}" alt="Selected photo" decoding="async" style="${mediaStyle}" loading="lazy">`}`;
  if($('mediaEditbar'))$('mediaEditbar').hidden=false;
  if($('mediaLayoutSelect'))$('mediaLayoutSelect').value=state.mediaLayout||'auto';
  strip.innerHTML=items.map((item,i)=>`<div class="media-thumb-wrap" draggable="${busy?'false':'true'}" data-media-wrap="${i}"><button type="button" class="media-thumb ${i===state.activeMediaIndex?'active':''}" data-media-index="${i}" aria-label="${item.type==='video'?'Video':'Photo'} ${i+1}: ${esc(item.file?.name||'media')}" ${busy?'disabled':''}>${item.type==='video'?`<video src="${esc(item.previewUrl)}" muted preload="metadata"></video><span class="thumb-video">▶</span>`:`<img src="${esc(item.previewUrl)}" alt="" loading="lazy" decoding="async">`}<span class="thumb-number">${i+1}</span>${item.status==='uploading'?`<span class="thumb-status">${Math.round((item.progress||0)*100)}%</span>`:''}${item.status==='complete'?'<span class="thumb-status">✓</span>':''}</button><button type="button" class="thumb-remove" data-media-remove="${i}" aria-label="Remove media ${i+1}" ${busy?'disabled':''}>×</button></div>`).join('')+`<button type="button" class="media-thumb media-thumb-add" id="mediaStripAdd" ${busy?'disabled':''} aria-label="Add more media"><span>＋</span><small>Add</small></button>`;
  strip.querySelectorAll('[data-media-index]').forEach(btn=>btn.onclick=()=>{state.activeMediaIndex=Number(btn.dataset.mediaIndex);renderMediaStudio();});
  strip.querySelectorAll('[data-media-remove]').forEach(btn=>btn.onclick=(e)=>{e.stopPropagation();removeMediaItem(Number(btn.dataset.mediaRemove));});
  $('mediaStripAdd')?.addEventListener('click',()=>openMediaPicker());
  strip.querySelectorAll('[data-media-wrap]').forEach(w=>{
    w.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',w.dataset.mediaWrap);});
    w.addEventListener('dragover',e=>e.preventDefault());
    w.addEventListener('drop',e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain')),to=Number(w.dataset.mediaWrap);reorderMediaItem(from,to);});
  });
}
function openMediaPicker(){ $('mediaInput')?.click(); }
function addMediaFiles(fileList){
  const incoming=Array.from(fileList||[]).filter(f=>/^image\//.test(f.type)||/^video\//.test(f.type));
  if(!incoming.length){toast('Please choose an image or video','warning');return;}
  const items=mediaItemsFromState(); let added=0;
  for(const file of incoming){
    if(items.length>=MAX_POST_MEDIA){toast(`You can select up to ${MAX_POST_MEDIA} media items`,'warning');break;}
    const duplicate=items.some(x=>x.file?.name===file.name&&x.file?.size===file.size&&x.file?.lastModified===file.lastModified);
    if(duplicate){toast(`${file.name} is already selected`,'warning');continue;}
    const type=mediaTypeOf(file);
    items.push({id:mediaItemId(),file,type,previewUrl:URL.createObjectURL(file),status:'ready'}); added++;
  }
  if(added){state.mediaItems=items;state.activeMediaIndex=items.length-1;syncLegacyMediaState();renderMediaStudio();}
}
function reorderMediaItem(from,to){const items=mediaItemsFromState();if(from===to||!items[from]||!items[to])return;const [m]=items.splice(from,1);items.splice(to,0,m);state.mediaItems=items;state.activeMediaIndex=to;syncLegacyMediaState();renderMediaStudio();}
function removeMediaItem(index){const items=mediaItemsFromState();if(!items[index])return;revokeMediaPreview(items[index]);items.splice(index,1);state.activeMediaIndex=Math.min(state.activeMediaIndex||0,Math.max(0,items.length-1));syncLegacyMediaState();renderMediaStudio();}
function clearMedia(){mediaItemsFromState().forEach(revokeMediaPreview);state.mediaItems=[];state.activeMediaIndex=0;state.media=null;state.mediaType=null;state.mediaLayout='auto';if($('mediaEditbar'))$('mediaEditbar').hidden=true;renderMediaStudio();['imageInput','videoInput','mediaInput'].forEach(id=>{if($(id))$(id).value='';});}
function setMedia(file,type){addMediaFiles([file]);}
async function prepareMediaForUpload(item){
  if(!item?.file||item.type!=='image'||(!(item.rotation||0)&&!(item.filter||0)&&!item.crop)) return item.file;
  const img=new Image(); img.src=item.previewUrl; await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject});
  const angle=((item.rotation||0)%360+360)%360, swap=angle===90||angle===270; const baseW=img.naturalWidth||img.width,baseH=img.naturalHeight||img.height;
  let w=baseW,h=baseH;if(item.crop==='square'){const side=Math.min(w,h);w=side;h=side}else if(item.crop==='portrait'){const target=w*5/4;if(target<h)h=target;else w=h*4/5}else if(item.crop==='landscape'){const target=w*9/16;if(target<h)h=target;else w=h*16/9}
  const c=document.createElement('canvas');c.width=swap?h:w;c.height=swap?w:h;const ctx=c.getContext('2d');ctx.translate(c.width/2,c.height/2);ctx.rotate(angle*Math.PI/180);ctx.filter=mediaFilterCss(item.filter||0);ctx.drawImage(img,-w/2,-h/2,w,h);
  return await new Promise(resolve=>c.toBlob(b=>resolve(b||item.file),item.file.type||'image/jpeg',.94));
}
async function uploadMedia(file,type,options={}){return await uploadToCloudinary(file,type==='video'?'spike/videos':'spike/images',{watermark:type==='video',...options});}
function validateMediaCollection(items){
  if(items.length>MAX_POST_MEDIA)return `You can select up to ${MAX_POST_MEDIA} media items`;
  for(const item of items){if(!item.file)return 'One selected media item is unavailable.';if(!/^image\//.test(item.file.type)&&!/^video\//.test(item.file.type))return `Unsupported media: ${item.file.name}`;}
  return null;
}

const CONTENT_DRAFTS_KEY='spike-content-drafts-v3';
const CONTENT_DRAFT_DB='spike-composer-drafts-v1';
const CONTENT_DRAFT_STORE='drafts';
let draftSaveTimer=null;
function draftDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(CONTENT_DRAFT_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(CONTENT_DRAFT_STORE))db.createObjectStore(CONTENT_DRAFT_STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Draft storage unavailable'));});}
async function putDraftRecord(record){const db=await draftDb();return new Promise((resolve,reject)=>{const tx=db.transaction(CONTENT_DRAFT_STORE,'readwrite');tx.objectStore(CONTENT_DRAFT_STORE).put(record);tx.oncomplete=()=>{db.close();resolve(record)};tx.onerror=()=>{db.close();reject(tx.error||new Error('Draft save failed'))};});}
async function getDraftRecords(){const db=await draftDb();return new Promise((resolve,reject)=>{const tx=db.transaction(CONTENT_DRAFT_STORE,'readonly');const req=tx.objectStore(CONTENT_DRAFT_STORE).getAll();req.onsuccess=()=>{db.close();resolve((req.result||[]).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))));};req.onerror=()=>{db.close();reject(req.error||new Error('Draft read failed'))};});}
async function deleteDraftRecord(id){const db=await draftDb();return new Promise((resolve,reject)=>{const tx=db.transaction(CONTENT_DRAFT_STORE,'readwrite');tx.objectStore(CONTENT_DRAFT_STORE).delete(id);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error||new Error('Draft delete failed'))};});}
function draftSnapshot(){return {text:$('signalText')?.value.trim()||'',link:$('linkInput')?.value.trim()||'',schedule:$('scheduleTime')?.value||'',layout:state.mediaLayout||'auto',media:mediaItemsFromState().map(x=>({id:x.id,name:x.file?.name||'media',type:x.type,size:x.file?.size||0,lastModified:x.file?.lastModified||0,file:x.file||null}))};}
async function saveCurrentDraft({silent=false}={}){
  const snap=draftSnapshot();
  if(!snap.text&&!snap.media.length&&!snap.link){if(!silent)toast('Nothing to save yet','warning');return null;}
  const id=state.activeDraftId||mediaItemId(); state.activeDraftId=id;
  try{await putDraftRecord({id,...snap,updatedAt:new Date().toISOString()});if(!silent)toast('Draft saved','success');return id;}
  catch(e){console.warn('[SPIKE DRAFT]',e);if(!silent)toast('Draft storage is unavailable on this device','error');return null;}
}
function queueAutoDraft(){clearTimeout(draftSaveTimer);draftSaveTimer=setTimeout(()=>{saveCurrentDraft({silent:true}).catch(()=>{});},900);}
async function loadDrafts(){try{return await getDraftRecords()}catch(e){console.warn('[SPIKE DRAFT READ]',e);return []}}
async function restoreDraft(id){const rows=await loadDrafts(),d=rows.find(x=>String(x.id)===String(id));if(!d)return false;$('signalText').value=d.text||'';$('linkInput').value=d.link||'';$('scheduleTime').value=d.schedule||'';state.mediaLayout=d.layout||'auto';state.activeDraftId=d.id;const files=(d.media||[]).filter(x=>x.file instanceof Blob).map(x=>x.file);if(files.length){state.mediaItems=[];addMediaFiles(files);}renderMediaStudio();$('signalText').dispatchEvent(new Event('input',{bubbles:true}));toast('Draft restored','success');return true;}
async function renderContentCenter(tab='drafts'){
  const body=$('contentCenterBody');if(!body)return;
  if(tab==='drafts'){
    const d=await loadDrafts();
    body.innerHTML=d.length?d.map(x=>`<div class="content-item"><div class="content-item-main"><div class="content-item-title">${esc(x.text||'Media draft')}</div><div class="content-item-meta">${x.media?.length?x.media.length+' media · ':''}${x.schedule?'Scheduled · ':''}${new Date(x.updatedAt).toLocaleString()}</div></div><div class="content-item-actions"><button data-draft-restore="${esc(x.id)}">Restore</button><button data-draft-delete="${esc(x.id)}">Delete</button></div></div>`).join(''):'<div class="content-item"><div class="content-item-main"><div class="content-item-title">No drafts yet</div><div class="content-item-meta">Drafts save text, links, schedule and selected media on this device.</div></div></div>';
  }else if(tab==='scheduled'){
    const rows=state.posts.filter(p=>p.scheduledAt&&new Date(p.scheduledAt)>new Date()).sort((a,b)=>new Date(a.scheduledAt)-new Date(b.scheduledAt));
    body.innerHTML=rows.length?rows.map(p=>`<div class="content-item"><div class="content-item-main"><div class="content-item-title">${esc(p.content||'Scheduled media Signal')}</div><div class="content-item-meta">${new Date(p.scheduledAt).toLocaleString()} · ${Array.isArray(p.mediaItems)&&p.mediaItems.length?p.mediaItems.length+' media':'Text'}</div></div></div>`).join(''):'<div class="content-item"><div class="content-item-main"><div class="content-item-title">Nothing scheduled</div><div class="content-item-meta">Scheduled Signals will appear here.</div></div></div>';
  }else{
    const rows=state.posts.filter(p=>!p.scheduledAt||new Date(p.scheduledAt)<=new Date()).slice(0,20),views=rows.reduce((n,p)=>n+Number(p.views||0),0),likes=rows.reduce((n,p)=>n+reactionLikeCount(p),0),comments=rows.reduce((n,p)=>n+(Array.isArray(p.comments)?p.comments.length:Number(p.comments||0)),0);body.innerHTML=`<div class="analytics-grid"><div class="analytics-stat"><b>${views}</b><span>Views</span></div><div class="analytics-stat"><b>${likes}</b><span>Likes</span></div><div class="analytics-stat"><b>${comments}</b><span>Comments</span></div><div class="analytics-stat"><b>${rows.length}</b><span>Released Signals</span></div></div>`;
  }
}
function openContentCenter(tab='drafts'){openOverlay('contentCenterOverlay');document.querySelectorAll('[data-center-tab]').forEach(b=>b.classList.toggle('active',b.dataset.centerTab===tab));renderContentCenter(tab);}
function localAiAction(action){const t=$('signalText');if(!t)return;let v=t.value.trim();if(action==='polish')v=v.replace(/\s+/g,' ').replace(/(^|[.!?]\s+)([a-z])/g,(m,a,b)=>a+b.toUpperCase());if(action==='hook'&&v)v=`Here’s what you need to know: ${v}`;if(action==='shorten'&&v){const a=v.split(/\s+/);v=a.slice(0,35).join(' ')+(a.length>35?'…':'')}if(action==='hashtags'&&v){const words=v.toLowerCase().match(/\b[a-z][a-z0-9]{4,}\b/g)||[],tags=[...new Set(words)].slice(0,5).map(w=>`#${w}`);if(tags.length)v+=`\n\n${tags.join(' ')}`}t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}));toast('AI suggestion applied','success')}

let publishInFlight = false;
async function releaseSignal(){
  if(publishInFlight) return;
  const btn=$('releaseSignalBtn'), content=$('signalText').value.trim(), link=$('linkInput').value.trim(), items=mediaItemsFromState();
  if(link){try{const u=new URL(link);if(!/^https?:$/.test(u.protocol))throw new Error();}catch(_){toast('Enter a valid http(s) link','warning');return;}}
  if(!content&&!items.length&&!link){ toast('Write something or add media first','warning'); return; }
  const mediaError=validateMediaCollection(items); if(mediaError){toast(mediaError,'error');return;}
  let scheduledAt=null;
  if($('scheduleTime').value){const d=new Date($('scheduleTime').value);if(Number.isNaN(d.getTime())){toast('Choose a valid schedule time','warning');return;}if(d.getTime()<=Date.now()){toast('Schedule time must be in the future','warning');return;}scheduledAt=d.toISOString();}
  publishInFlight=true; if(btn){btn.disabled=true;btn.dataset.originalText=btn.textContent;btn.textContent=items.length?'Uploading…':'Releasing…';}
  try{
    const uploadedItems=[];
    for(let i=0;i<items.length;i++){
      const item=items[i]; item.status='uploading'; renderMediaStudio();
      try{ const uploadFile=await prepareMediaForUpload(item); const uploaded=await uploadMedia(uploadFile,item.type,{onProgress:(ratio)=>{item.progress=ratio;renderMediaStudio();}}); uploadedItems.push({id:item.id,url:uploaded?.playbackUrl||uploaded?.url||uploaded,type:item.type,name:item.file.name,size:item.file.size,originalUrl:uploaded?.originalUrl||null,playbackUrl:uploaded?.playbackUrl||uploaded?.url||null,normalized:!!uploaded?.normalized,format:uploaded?.format||null,videoCodec:uploaded?.videoCodec||null,audioCodec:uploaded?.audioCodec||null,watermarked:!!uploaded?.watermarked,spid:uploaded?.spid||null}); item.status='complete'; }
      catch(e){item.status='error';renderMediaStudio();throw e;}
    }
    const first=uploadedItems[0]||null;
    await writeSignal({content,mediaUrl:first?.url||null,mediaType:first?.type||null,mediaWatermarked:!!first?.watermarked,mediaSpid:first?.spid||null,mediaOriginalUrl:first?.originalUrl||null,mediaNormalized:!!first?.normalized,mediaItems:uploadedItems,mediaLayout:state.mediaLayout||'auto',linkUrl:link||null,scheduledAt});
    if(state.activeDraftId){try{await deleteDraftRecord(state.activeDraftId)}catch(_){}} state.activeDraftId=null; $('signalText').value='';$('linkInput').value='';$('scheduleTime').value='';clearMedia();toast(scheduledAt?'Signal scheduled':'Signal released','success');
  }catch(e){console.error('publish',e);toast(e?.message||'Could not release Signal','error');}
  finally{publishInFlight=false;if(btn){btn.disabled=false;btn.textContent=btn.dataset.originalText||'Post';delete btn.dataset.originalText;}}
}

// ─── STORY PUBLISH ─────────────────────────────────────
function setStoryPublishing(on, title = "Publishing your story…", text = "Uploading media securely.") {
  const loader = $('storyPublishLoader');
  if (loader) loader.hidden = !on;
  if ($('storyLoaderTitle')) $('storyLoaderTitle').textContent = title;
  if ($('storyLoaderText')) $('storyLoaderText').textContent = text;
  if (on) $('storiesRow')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function resetStoryForm() {
  $('storyText').value = '';
  if ($('storyMediaInput')) $('storyMediaInput').value = '';
  if ($('storyAudioInput')) $('storyAudioInput').value = '';
  if ($('storyMediaName')) $('storyMediaName').textContent = '';
  if ($('storyAudioName')) $('storyAudioName').textContent = '';
}
async function publishStory() {
  const text = $('storyText').value.trim(), mediaFile = $('storyMediaInput')?.files?.[0] || null, audioFile = $('storyAudioInput')?.files?.[0] || null;
  if (!text && !mediaFile && !audioFile) { toast('Add story content'); return; }
  closeOverlay('storyOverlay');
  setStoryPublishing(true, "Publishing your story…");
  try {
    let mediaUrl = null, mediaType = null, audioUrl = null, mediaOriginalUrl = null, mediaNormalized = false, mediaWatermarked = false, mediaSpid = null;
    if (mediaFile) {
      mediaType = mediaFile.type.startsWith('video/') ? 'video' : 'image';
      const uploadedMedia = await uploadToCloudinary(mediaFile, 'spike/stories', { watermark: mediaType === 'video' });
      mediaUrl = uploadedMedia?.playbackUrl || uploadedMedia?.url || uploadedMedia;
       mediaOriginalUrl = uploadedMedia?.originalUrl || null;
       mediaNormalized = !!uploadedMedia?.normalized;
       mediaWatermarked = !!uploadedMedia?.watermarked;
       mediaSpid = uploadedMedia?.spid || null;
    }
    if (audioFile) { audioUrl = await uploadToCloudinary(audioFile, 'spike/story-audio'); }
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const data = {
      authorUid: state.user.id, authorName: nameOf(state.profile), authorAvatar: avatarOf(state.profile),
      text, mediaUrl, mediaType, audioUrl, playbackSeconds: 50, lifetimeSeconds: 86400,
      mediaOriginalUrl, mediaNormalized, mediaWatermarked, mediaSpid,
      createdAt: now(), expiresAt: new Date(Date.now() + 86400000).toISOString(), deleted: false
    };
    await putDoc(`stories/${id}`, data, 'stories');
    const saved = await getDoc(`stories/${id}`);
    if (!saved) throw new Error('Story could not be verified');
    state.stories.unshift({ id, ...saved });
    renderStories();
    resetStoryForm();
    setStoryPublishing(true, "Story published ✓", "Your story is now live in Stories.");
    setTimeout(() => setStoryPublishing(false), 700);
    toast('Story published', 'success');
  } catch (e) { console.error('publishStory', e); setStoryPublishing(false); openOverlay('storyOverlay'); toast(e?.message || 'Could not release Signal story'); }
}

// ─── STORY VIEWER ENGINE ──────────────────────────────
const StoryEngine = (() => {
  const s = { groups: [], creatorIndex: 0, index: 0, token: 0, raf: 0, timer: 0, completed: false, paused: false, busy: false, audio: null, muted: true }
  const $e = id => document.getElementById(id);
  function allStories(){ return (window.state?.stories || []).filter(s => s && !s.deleted && (!s.expiresAt || new Date(s.expiresAt).getTime() > Date.now())).sort((a,b) => (new Date(a.createdAt||a.created_at||0) - new Date(b.createdAt||b.created_at||0))); }
  function creatorKey(s){ return s?.authorUid || s?.authorId || s?.userId || s?.author_id || s?.user_id || s?.uid || s?.authorName || s?.id; }
  function isOwnStory(stOrKey){
    const uid=String(state.user?.id||'').trim().toLowerCase();
    if(!uid)return false;
    if(typeof stOrKey==='string')return stOrKey.trim().toLowerCase()===uid;
    const candidates=[stOrKey?.authorUid,stOrKey?.authorId,stOrKey?.userId,stOrKey?.author_id,stOrKey?.user_id,stOrKey?.uid];
    return candidates.some(v=>String(v||'').trim().toLowerCase()===uid);
  }
  function rebuildGroups(){
    const map = new Map();
    for(const st of allStories()){ const k=creatorKey(st); if(!map.has(k)) map.set(k,[]); map.get(k).push(st); }
    s.groups=[...map.entries()].map(([key,stories])=>({key,stories}));
    return s.groups;
  }
  function locate(id){ const gs=rebuildGroups(); for(let gi=0;gi<gs.length;gi++){ const si=gs[gi].stories.findIndex(st=>st.id===id); if(si>=0)return {gi,si}; } return null; }
  function mediaKind(st){ const url=String(st?.mediaUrl||'').trim(); const mt=String(st?.mediaType||'').toLowerCase(); if(mt==='gif'||isGifUrl(url)||/image\/gif/i.test(String(st?.mimeType||'')))return'image'; if(mt==='video'||/\.(mp4|webm|mov|m4v|avi|mpeg|mpg)(?:[?#].*)?$/i.test(url))return'video'; if(mt==='image'||url)return'image'; return'text'; }
  function seconds(st){ return Math.max(2,Math.min(60,Number(st?.playbackSeconds||st?.duration||5))); }
  function audioUrl(st){ return String(st?.audioUrl||st?.musicUrl||'').trim(); }
  function cancelClock(){ if(s.raf)cancelAnimationFrame(s.raf); s.raf=0; clearTimeout(s.timer); s.timer=0; }
  function stopMedia(){ const v=$e('storyViewerVideo'), img=$e('storyViewerImage'), text=$e('storyViewerText'); if(v){try{v.pause()}catch(_){} v.onloadedmetadata=null;v.onloadeddata=null;v.oncanplay=null;v.ontimeupdate=null;v.onended=null;v.onerror=null;v.removeAttribute('src');v.load();v.hidden=true;} if(img){img.onload=null;img.onerror=null;img.hidden=true;img.removeAttribute('src');} if(text)text.hidden=true; if(s.audio){try{s.audio.pause()}catch(_){} s.audio.onended=null;s.audio.onerror=null;s.audio.removeAttribute('src');s.audio.load();s.audio=null;} }
  function setProgress(r){ const bars=$e('storyProgress')?.querySelectorAll('i>b'); if(!bars)return; bars.forEach((b,i)=>{ b.style.width=i<s.index?'100%':i===s.index?`${Math.max(0,Math.min(1,r))*100}%`:'0%'; }); }
  function buildProgress(list){ const host=$e('storyProgress'); if(!host)return; const frag=document.createDocumentFragment(); list.forEach(()=>{const i=document.createElement('i');i.appendChild(document.createElement('b'));frag.appendChild(i)}); host.replaceChildren(frag); setProgress(0); }
  function finish(token){ if(token!==s.token||s.completed)return; s.completed=true; cancelClock(); setProgress(1); requestAnimationFrame(()=>{ if(token===s.token)next(true); }); }
  function timed(token,dur,ratioReader){ const started=performance.now(), total=dur*1000; const tick=()=>{ if(token!==s.token||s.completed||s.paused)return; const ratio=ratioReader?ratioReader():Math.min(1,(performance.now()-started)/total); setProgress(ratio); if(ratio>=1){finish(token);return;} s.raf=requestAnimationFrame(tick); }; s.raf=requestAnimationFrame(tick); }
  function setAudioButton(on){ const b=$e('storyViewerMute'); if(!b)return; b.textContent=on?'🔊':'🔇'; b.setAttribute('aria-label',on?'Mute story audio':'Unmute story audio'); b.title=on?'Mute story audio':'Unmute story audio'; b.dataset.audioEnabled=on?'1':'0'; }
  function showAudioHint(show){ const viewer=$e('storyViewer'); if(viewer) viewer.classList.toggle('audio-unavailable',!!show); }
  function startBackgroundAudio(st,token){
    const url=audioUrl(st); if(!url)return;
    const a=new Audio(); a.preload='auto'; a.loop=false; a.volume=1; a.muted=!!s.muted; s.audio=a;
    a.onended=()=>{ if(token===s.token) s.audio=null; };
    a.onerror=()=>{ if(token===s.token) { s.audio=null; showAudioHint(false); } };
    a.src=url; a.load();
    if(!s.muted) a.play().catch(()=>{ if(token===s.token) showAudioHint(true); });
  }
  async function enableAudio(){
    const v=$e('storyViewerVideo');
    s.muted=false; setAudioButton(true); showAudioHint(false);
    let ok=false;
    if(v && !v.hidden){
      v.muted=false;
      try { await v.play(); ok=true; } catch(_) { v.muted=true; }
    }
    if(s.audio){
      s.audio.muted=false;
      try { await s.audio.play(); ok=true; } catch(_) {}
    }
    if(!ok && ((v && !v.hidden) || s.audio)) { s.muted=true; setAudioButton(false); showAudioHint(true); return false; }
    return true;
  }
  function disableAudio(){ s.muted=true; setAudioButton(false); showAudioHint(false); const v=$e('storyViewerVideo'); if(v && !v.hidden) v.muted=true; if(s.audio) s.audio.muted=true; }
  function playImage(st,token){ const img=$e('storyViewerImage'), shell=document.querySelector('.story-viewer-shell'), stage=$e('storyStage'); if(!img||!st.mediaUrl)return playText(st,token); img.hidden=false; img.decoding='async'; img.onload=()=>{ if(token!==s.token)return; shell?.classList.remove('story-loading'); stage?.classList.add('story-media-ready'); startBackgroundAudio(st,token); timed(token,seconds(st)); }; img.onerror=()=>finish(token); img.src=typeof storyFullMediaUrl==='function'?storyFullMediaUrl(st.mediaUrl,'image'):st.mediaUrl; }
  function storyVideoCandidates(st){
    const out=[];
    const push=u=>{u=String(u||'').trim();if(u&&!out.includes(u))out.push(u);};
    const original=st.mediaOriginalUrl || st.mediaUrl;
    // Prefer the persisted playback URL when it was generated by the upload
    // pipeline. Then fall back to a known-good Cloudinary H.264/AAC delivery.
    push(st.mediaUrl);
    if(st.mediaSpid && typeof cloudinaryWatermarkedVideoUrl==='function'){
      push(cloudinaryWatermarkedVideoUrl(original,st.mediaSpid));
    }
    if(typeof cloudinaryFeedVideoCandidates==='function'){
      cloudinaryFeedVideoCandidates(original).forEach(push);
    } else {
      push(original);
    }
    return out;
  }
  function playVideo(st,token){
    const v=$e('storyViewerVideo'), shell=document.querySelector('.story-viewer-shell'), stage=$e('storyStage');
    if(!v||!st.mediaUrl)return finish(token);
    const candidates=storyVideoCandidates(st);
    if(!candidates.length)return finish(token);

    v.hidden=false;
    v.controls=false;
    v.playsInline=true;
    v.setAttribute('playsinline','');
    v.setAttribute('webkit-playsinline','');
    v.autoplay=true;
    v.preload='auto';
    v.muted=!!s.muted;
    setAudioButton(false);
    showAudioHint(false);

    let sourceIndex=0, begun=false;
    const applySource=()=>{
      if(token!==s.token)return;
      begun=false;
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.src=candidates[sourceIndex];
      v.load();
    };
    const markReadyAndPlay=()=>{
      if(token!==s.token||begun)return;
      begun=true;
      shell?.classList.remove('story-loading');
      stage?.classList.add('story-media-ready');
      v.muted=!!s.muted;
      v.currentTime=0;
      const promise=v.play();
      if(promise && typeof promise.catch==='function'){
        promise.catch(()=>{
          if(token!==s.token)return;
          if(!s.muted){
            s.muted=true;
            v.muted=true;
            setAudioButton(false);
            showAudioHint(true);
            v.play().catch(()=>{});
          }
        });
      }
      timed(token,seconds(st),()=>{
        if(Number.isFinite(v.duration)&&v.duration>0)return v.currentTime/v.duration;
        return Math.min(1,(performance.now()-s.videoStarted)/(seconds(st)*1000));
      });
    };
    const maybePlay=()=>{
      if(token!==s.token)return;
      if(v.readyState>=2)markReadyAndPlay();
    };

    s.videoStarted=performance.now();
    v.onloadedmetadata=maybePlay;
    v.onloadeddata=maybePlay;
    v.oncanplay=maybePlay;
    v.onplaying=()=>{
      if(token!==s.token)return;
      shell?.classList.remove('story-loading');
      stage?.classList.add('story-media-ready');
    };
    v.ontimeupdate=()=>{
      if(token!==s.token||s.completed)return;
      if(Number.isFinite(v.duration)&&v.duration>0){
        const r=v.currentTime/v.duration;
        setProgress(r);
        if(r>=.999)finish(token);
      }
    };
    v.onended=()=>finish(token);
    v.onerror=()=>{
      if(token!==s.token)return;
      if(sourceIndex<candidates.length-1){
        sourceIndex++;
        applySource();
        return;
      }
      finish(token);
    };
    applySource();
  }
  function playText(st,token){ const text=$e('storyViewerText'), shell=document.querySelector('.story-viewer-shell'), stage=$e('storyStage'); if(!text)return finish(token); text.hidden=false; text.textContent=st.text||'Story'; shell?.classList.remove('story-loading'); stage?.classList.add('story-media-ready'); startBackgroundAudio(st,token); timed(token,seconds(st)); }
  function render(direction=1){ cancelClock();stopMedia(); const gs=rebuildGroups(), group=gs[s.creatorIndex], st=group?.stories[s.index]; if(!st)return close(); const token=++s.token; s.completed=false;s.paused=false;s.busy=false; setAudioButton(!s.muted); showAudioHint(false); const viewer=$e('storyViewer'), shell=document.querySelector('.story-viewer-shell'), stage=$e('storyStage'); const avatar=$e('storyViewerAvatar'), author=$e('storyViewerAuthor'), time=$e('storyViewerTime'); const cap=$e('storyViewerCaption'), meta=$e('storyViewerMeta');
    const wm=$e('storyViewerWatermark'), wmId=$e('storyViewerWatermarkId');
    const storyAuthor = state.users.get(st.authorUid) || st;
    const storySpId = spIdOf(st) || spIdOf(storyAuthor);
    const storyIsVideo = mediaKind(st) === 'video' && !!storySpId;
    const storyNeedsOverlay = storyIsVideo && st.mediaWatermarked !== true;
    if (wm) wm.classList.toggle('show', storyNeedsOverlay);
    if (wmId) wmId.textContent = storyIsVideo ? `• ${storySpId}` : '';
 viewer?.classList.remove('story-transition-next','story-transition-prev'); void viewer?.offsetWidth; viewer?.classList.add(direction>0?'story-transition-next':'story-transition-prev'); shell?.classList.add('story-loading'); stage?.classList.remove('story-media-ready'); if(avatar){ avatar.style.backgroundImage=''; avatar.innerHTML=identityAvatar(st,'spike-avatar',nameOf(st)||'Story'); } if(author)author.textContent=nameOf(st)||'Story'; if(time)time.textContent=typeof SPIKETime?.relativeTime==='function'?SPIKETime.relativeTime(st.createdAt||st.created_at):'now'; if(cap)cap.textContent=st.text||''; if(meta)meta.textContent=`${nameOf(st)} · ${s.index+1}/${group.stories.length}`; buildProgress(group.stories); markStoryViewed(st.id).catch(()=>{}); const k=mediaKind(st); const muteBtn=$e('storyViewerMute'); const hasAudio = k==='video' || !!audioUrl(st); const dlBtn=$e('storyViewerDownload'); const delBtn=$e('storyViewerDelete'); const canManageStory=isOwnStory(st); if(dlBtn){ dlBtn.hidden = !canManageStory || !['video','image'].includes(k); dlBtn.setAttribute('aria-label', k==='video'?'Download story video':'Download story image'); dlBtn.title = k==='video'?'Download story video':'Download story image'; } if(delBtn) delBtn.hidden = !canManageStory; if(muteBtn){ muteBtn.hidden=!hasAudio; if(hasAudio)setAudioButton(!s.muted); } if(k==='video')playVideo(st,token); else if(k==='image')playImage(st,token); else playText(st,token); const ns=group.stories[s.index+1]||gs[s.creatorIndex+1]?.stories?.[0]; if(ns?.mediaUrl){ if(mediaKind(ns)==='video'){const p=document.createElement('video');p.preload='metadata';p.src=ns.mediaUrl;} else{const p=new Image();p.decoding='async';p.src=typeof storyFullMediaUrl==='function'?storyFullMediaUrl(ns.mediaUrl,'image'):ns.mediaUrl;} } }
  function next(auto=false){ if(s.busy)return false; const gs=rebuildGroups(), g=gs[s.creatorIndex]; if(!g)return false; if(s.index<g.stories.length-1){s.busy=true;s.index++;render(1);return true;} if(s.creatorIndex<gs.length-1){s.busy=true;s.creatorIndex++;s.index=0;render(1);return true;} close();return false; }
  function previous(){ if(s.busy)return false; const gs=rebuildGroups(); if(s.index>0){s.busy=true;s.index--;render(-1);return true;} if(s.creatorIndex>0){s.busy=true;s.creatorIndex--;s.index=gs[s.creatorIndex].stories.length-1;render(-1);return true;} return false; }
  function open(id){ const loc=locate(id);if(!loc)return; cancelClock();stopMedia();s.token++; s.creatorIndex=loc.gi; s.index=0; s.busy=false; s.muted=true; setAudioButton(false); showAudioHint(false); document.body.classList.add('story-viewer-open'); const viewer=$e('storyViewer'); viewer?.classList.add('open'); viewer?.setAttribute('aria-hidden','false'); render(1); }
  function close(){ cancelClock();s.token++;stopMedia();s.busy=false;s.muted=true;showAudioHint(false);document.body.classList.remove('story-viewer-open'); const viewer=$e('storyViewer'); viewer?.classList.remove('open','story-transition-next','story-transition-prev','audio-unavailable'); viewer?.setAttribute('aria-hidden','true'); }
  function pause(){ s.paused=true; try{$e('storyViewerVideo')?.pause()}catch(_){} try{s.audio?.pause()}catch(_){} }
  function resume(){ s.paused=false; try{$e('storyViewerVideo')?.play().catch(()=>{})}catch(_){} try{s.audio?.play().catch(()=>{})}catch(_){} }
  function bind(){
    const stage=$e('storyStage'); if(!stage||stage.dataset.storyEngine==='v4')return; stage.dataset.storyEngine='v4';
    $e('storyViewerDownload')?.addEventListener('click',async e=>{
      e.preventDefault(); e.stopPropagation();
      const gs=rebuildGroups(), group=gs[s.creatorIndex], st=group?.stories[s.index];
      const kind=st ? mediaKind(st) : 'text';
      if (!isOwnStory(st)) { toast('You can only download your own story.', 'error'); return; }
      if (!st?.mediaUrl || !['video','image'].includes(kind)) { toast('This story has no downloadable media.', 'warning'); return; }
      const spid=spIdOf(st)||spIdOf(state.users.get(st.authorUid))||'story';
      const isVideo=kind==='video';
      const ext=isVideo?'mp4':'jpg';
      const filename=`SPIKE-${String(spid).replace(/[^a-z0-9_-]/gi,'-')}-story.${ext}`;
      const ok=await premiumConfirm({
        title:isVideo?'Download this story video?':'Download this story picture?',
        message:isVideo?'The watermarked video will be saved to your device without leaving SPIKE.':'The story picture will be saved to your device without leaving SPIKE.',
        confirmText:isVideo?'Download video':'Download picture',
        cancelText:'Not now',
        icon:'⬇️',
        eyebrow:'SPIKE DOWNLOAD'
      });
      if(!ok)return;
      const source=isVideo && st.mediaWatermarked!==true ? (st.mediaOriginalUrl || st.mediaUrl) : st.mediaUrl;
      await downloadStoryMediaInApp(source, filename, kind, $e('storyViewerDownload'));
    });
    $e('storyViewerDelete')?.addEventListener('click',async e=>{
      e.preventDefault(); e.stopPropagation();
      const gs=rebuildGroups(), group=gs[s.creatorIndex], st=group?.stories[s.index];
      if(!st)return;
      if(!isOwnStory(st)){ toast('You can only delete your own story','error'); return; }
      await deleteStory(st.id, { closeViewer:true });
    });
    $e('storyViewerMute')?.addEventListener('click',async e=>{ e.preventDefault(); e.stopPropagation(); if(s.muted) await enableAudio(); else disableAudio(); });
    $e('storyViewerClose')?.addEventListener('click',e=>{ e.preventDefault(); e.stopPropagation(); close(); });
    const nav=$e('storyViewer'); nav?.addEventListener('click',e=>{ if(e.target===nav) close(); });
    let sx=0,sy=0,active=false;
    stage.addEventListener('pointerdown',e=>{ if(e.pointerType==='mouse'&&e.button!==0)return; sx=e.clientX;sy=e.clientY;active=true;clearTimeout(s.holdTimer);s.holdTimer=setTimeout(()=>{if(active)pause()},280);stage.setPointerCapture?.(e.pointerId); });
    stage.addEventListener('pointerup',e=>{ if(!active)return;active=false;clearTimeout(s.holdTimer);const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.15){dx<0?next():previous();return;}if(s.paused){resume();return;}if(Math.abs(dx)<14&&Math.abs(dy)<14){const r=stage.getBoundingClientRect();e.clientX-r.left>r.width*.5?next():previous();}});
    stage.addEventListener('pointercancel',()=>{active=false;clearTimeout(s.holdTimer)});
  }
  return {open,close,next,previous,pause,resume,bind};
})();

function storyViewerOpen(id){ StoryEngine.open(id); }
function storyViewerClose(){ StoryEngine.close(); }
function storyGo(dir){ return dir>0 ? StoryEngine.next(true) : StoryEngine.previous(); }

async function markStoryViewed(id) {
  if (!id || !state.user?.id) return;
  state.storyViewed = state.storyViewed instanceof Set ? state.storyViewed : new Set();
  state.storyViewed.add(id);
  try { await db.rpc('mark_story_view', { p_story_id:id }); } catch (e) { console.warn('markStoryViewed', e); }
}
function storyFor(id) { return state.stories.find(s => s.id === id) || null; }

function storyShareUrl(s) { return `${location.origin}${location.pathname}?story=${encodeURIComponent(s.id)}`; }
function storyMediaName(s) { const base = nameOf(s).replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'spike-story'; return `${base}-${s.id}`; }
async function shareStoryToFriends(s) {
  if (!s) return;
  const url = storyShareUrl(s);
  try {
    if (navigator.share) { await navigator.share({ title: `${nameOf(s)} on SPIKE`, text: s.text || 'Shared a story on SPIKE', url }); toast('Story shared', 'success'); }
    else { await copyTextSafe(url); toast('Story link copied', 'success'); }
  } catch (e) { if (e?.name !== 'AbortError') toast('Sharing unavailable', 'error'); }
}
async function deleteStory(id, options = {}) {
  const s = storyFor(id);
  if (!s || s.authorUid !== state.user.id) { toast('You can only delete your own story', 'error'); return; }
  const ok = await premiumConfirm({ title: 'Delete this story?', message: 'This story will disappear from Stories immediately.', confirmText: 'Delete story', cancelText: 'Keep story', icon: '🗑️', eyebrow: 'STORY CONTROL', danger: true });
  if (!ok) return;
  try {
    await putDoc(`stories/${id}`, { ...s, deleted: true, deletedAt: now() }, 'stories');
    state.stories = state.stories.filter(x => x.id !== id);
    closeOverlay('storyActionsOverlay');
    if(options.closeViewer) StoryEngine.close();
    renderStories();
    toast('Story deleted', 'success');
  } catch (e) { console.error('deleteStory', e); toast(e?.message || 'Could not delete story', 'error'); }
}
let activeStoryActionId = null;
function openStoryActions(id) {
  const s = storyFor(id);
  if (!s) return;
  activeStoryActionId = id;
  $('storyActionsSummary').textContent = `${nameOf(s)} · ${s.mediaType || 'text'} story`;
  $('storyActionDelete').hidden = s.authorUid !== state.user.id;
  openOverlay('storyActionsOverlay');
}


// ─── FEED V2 PANELS ────────────────────────────────────
function renderTrending(){const ranked=filteredPosts('trending').slice(0,8),list=$('v2TrendingList');list.innerHTML=ranked.length?ranked.map(p=>{const b=p.__signalBreakdown||{};return `<div class="stat" style="margin-bottom:7px"><b>${signalScore(p)}</b><span>${esc((p.content||'Untitled').slice(0,100))}<small style="display:block;color:var(--muted)">${b.acceleration>.65?'↑ Accelerating':'↑ Rising'} · ${Math.round((b.recentVelocity||0)*100)}% momentum</small></span></div>`}).join(''):'<div class="empty">No trends yet.</div>'}
function momentTopicTokens(p){
  const text=String(p?.content||'').toLowerCase();
  const tags=[...(text.match(/#[a-z0-9_]+/g)||[])].map(x=>x.slice(1));
  const words=text.replace(/https?:\/\/\S+/g,' ').match(/\b[a-z][a-z0-9]{4,}\b/g)||[];
  const stop=new Set(['about','after','again','could','every','first','going','great','have','their','there','these','think','those','today','where','which','would','really','should','because','people','something','things','still','being','this','that','with','from','your','just','what','when','will','into','more','than','they','them','then','here','some','only','also','like','make','want','know','very','over','under','using','while']);
  const counts=new Map();
  [...tags,...words.filter(w=>!stop.has(w))].forEach(w=>counts.set(w,(counts.get(w)||0)+1));
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([w])=>w);
}
function renderMoments(){
  const list=$('v2MomentsList'); if(!list)return;
  const nowMs=Date.now(), windowMs=72*60*60*1000;
  const eligible=(state.posts||[]).filter(p=>{const t=new Date(p.createdAt||p.created_at||0).getTime();return p&&!p.deleted&&Number.isFinite(t)&&nowMs-t<=windowMs&&!state.blocked.has(p.authorUid)&&!state.muted.has(p.authorUid)});
  const groups=new Map();
  eligible.forEach(p=>{
    const tokens=momentTopicTokens(p);
    const key=tokens.length?tokens[0]:'community';
    const g=groups.get(key)||{key,posts:[],tokens:new Set()}; g.posts.push(p); tokens.forEach(x=>g.tokens.add(x)); groups.set(key,g);
  });
  const moments=[...groups.values()].filter(g=>g.posts.length>=2).map(g=>{
    const latest=Math.max(...g.posts.map(p=>new Date(p.createdAt||p.created_at||0).getTime()));
    const authors=new Set(g.posts.map(p=>p.authorUid).filter(Boolean));
    const media=g.posts.filter(p=>p.mediaUrl||p.mediaItems?.length).length;
    const score=g.posts.length*8+authors.size*5+media*2+Math.max(0,24-(nowMs-latest)/3600000);
    return {...g,authors:authors.size,media,latest,score};
  }).sort((a,b)=>b.score-a.score).slice(0,6);
  if(!moments.length){list.innerHTML='<div class="empty">No Moments are forming yet. Moments appear when multiple recent posts naturally connect around a topic.</div>';return;}
  list.innerHTML=moments.map((m,i)=>{
    const top=m.posts.sort((a,b)=>new Date(b.createdAt||b.created_at||0)-new Date(a.createdAt||a.created_at||0))[0];
    const topic=m.key==='community'?'Community pulse':`#${m.key}`;
    const age=SPIKETime?.relativeTime?.(m.latest)||'now';
    return `<article class="moment-card" data-moment-key="${esc(m.key)}"><div class="moment-kicker"><span>✨ MOMENT ${i+1}</span><small>${esc(age)}</small></div><h3>${esc(topic)}</h3><p>${m.posts.length} recent posts · ${m.authors} people${m.media?` · ${m.media} with media`:''}</p><div class="moment-posts">${m.posts.slice(0,3).map(p=>`<button type="button" class="moment-post" data-moment-post="${esc(p.id)}"><b>${esc(nameOf(authorFor(p)))}</b><span>${esc((p.content||'Untitled').slice(0,96))}</span></button>`).join('')}</div><div class="moment-footer"><span>${[...m.tokens].slice(0,3).map(x=>`#${esc(x)}`).join(' · ')}</span><button type="button" class="moment-open" data-moment-post="${esc(top.id)}">Open</button></div></article>`;
  }).join('');
}
function renderAnalytics() {
  const mine = state.posts.filter(p => p.authorUid === state.user.id);
  const likes = mine.reduce((n, p) => n + reactionLikeCount(p), 0);
  const comments = mine.reduce((n, p) => n + (Array.isArray(p.comments) ? p.comments.length : 0), 0);
  const views = mine.reduce((n, p) => n + Number(p.views || 0), 0);
  const saves = mine.filter(p => state.saved.has(p.id)).length;
  $('v2StatsGrid').innerHTML = `<div class="stat"><b>${mine.length}</b><span>Your posts</span></div><div class="stat"><b>${likes}</b><span>Likes received</span></div><div class="stat"><b>${comments}</b><span>Comments received</span></div><div class="stat"><b>${views}</b><span>Views</span></div><div class="stat"><b>${saves}</b><span>Saved posts</span></div><div class="stat"><b>${state.following.size}</b><span>Following</span></div>`;
}
function renderGamify() {
  const mine = state.posts.filter(p => p.authorUid === state.user.id);
  const posts = mine.length, likes = mine.reduce((n, p) => n + reactionLikeCount(p), 0);
  const comments = mine.reduce((n, p) => n + (Array.isArray(p.comments) ? p.comments.length : 0), 0);
  const xp = posts * 10 + likes * 2 + comments * 3;
  const level = Math.max(1, Math.floor(xp / 100) + 1);
  const badges = [posts >= 1 ? '🌱 First Post' : null, posts >= 5 ? '✍️ Active Creator' : null, likes >= 10 ? '❤️ Crowd Favorite' : null, comments >= 10 ? '💬 Conversation Starter' : null, xp >= 500 ? '🏆 SPIKE Star' : null].filter(Boolean);
  $('v2GamifyGrid').innerHTML = `<div class="stat"><b>${xp}</b><span>XP</span></div><div class="stat"><b>${level}</b><span>Level</span></div><div class="stat"><b>${posts}</b><span>Posts</span></div><div class="stat"><b>${likes}</b><span>Likes received</span></div>`;
  $('v2BadgeList').innerHTML = badges.length ? `<div class="meta">${badges.join(' • ')}</div>` : '<div class="meta">Create and engage to unlock your first badge.</div>';
}
function renderReels(){const reels=filteredPosts('forYou').filter(p=>p.mediaType==='video'&&p.mediaUrl&&!isGifUrl(p.mediaUrl)).slice(0,10);$('v2ReelsList').innerHTML=reels.length?reels.map(p=>`<div class="v2-reel-card"><video src="${esc(signalVideoPlaybackUrl({url:p.mediaUrl,playbackUrl:p.mediaUrl,watermarked:!!p.mediaWatermarked,normalized:!!p.mediaNormalized}))}" muted playsinline loop preload="metadata"></video>${videoWatermarkForSignal({watermarked:!!p.mediaWatermarked},p)}<button class="v2-reel-overlay" data-open-reel="${esc(p.id)}" type="button"><span>▶ ${esc((p.content||'Video').slice(0,70))}<small>${esc(nameOf(authorFor(p)))}</small></span><span>↗</span></button></div>`).join(''):'<div class="empty">No video posts yet.</div>';if('IntersectionObserver'in window){const io=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting?e.target.play().catch(()=>{}):e.target.pause()),{threshold:.5});$('v2ReelsList').querySelectorAll('video').forEach(v=>io.observe(v))}}
function renderCreator() {
  const mine = state.posts.filter(p => p.authorUid === state.user.id);
  const signals = readSignalStore();
  const interactions = Object.values(signals).reduce((n, x) => n + Number(x.likes||0) + Number(x.saves||0) + Number(x.comments||0) + Number(x.reactions||0), 0);
  const top = rankSignals(mine.slice())[0];
  const engagement = mine.length ? Math.round((mine.reduce((n,p)=>n+reactionLikeCount(p)+(Array.isArray(p.comments)?p.comments.length:0),0)/mine.length)*10)/10 : 0;
  $('v2CreatorGrid').innerHTML = `<div class="stat"><b>${mine.length}</b><span>Signals released</span></div><div class="stat"><b>${engagement}</b><span>Avg. interactions/Signal</span></div><div class="stat"><b>${interactions}</b><span>Your Signal interactions</span></div><div class="stat"><b>${top ? signalScore(top) : 0}</b><span>Top Signal Strength</span></div>`;
  $('v2CreatorBadges').textContent = top ? `Top Signal: ${(top.content || 'Untitled').slice(0, 90)}` : 'Release your first Signal to unlock creator insights.';
}
function findNearby() {
  const out = $('v2NearbyList');
  if (!navigator.geolocation) { out.innerHTML = '<div class="empty">Location is unavailable on this device.</div>'; return; }
  out.innerHTML = '<div class="empty">Finding nearby posts…</div>';
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const candidates = state.posts.map(p => {
      const plat = Number(p.latitude ?? p.lat ?? p.location?.lat), plng = Number(p.longitude ?? p.lng ?? p.lon ?? p.location?.lng);
      if (!Number.isFinite(plat)||!Number.isFinite(plng)) return null;
      const dLat=(plat-lat)*111, dLng=(plng-lng)*111*Math.cos(lat*Math.PI/180);
      return {...p, distance:Math.sqrt(dLat*dLat+dLng*dLng)};
    }).filter(Boolean).sort((a,b)=>a.distance-b.distance).slice(0,8);
    if (!candidates.length) { out.innerHTML='<div class="empty">No location-tagged posts nearby yet.</div>'; return; }
    out.innerHTML=candidates.map(p=>`<div class="v2-nearby-card"><div class="nearby-icon">📍</div><div><strong>${esc(nameOf(authorFor(p)))}</strong><small>${esc((p.content||'Untitled').slice(0,120))} · ${p.distance<1 ? `${Math.round(p.distance*1000)}m` : `${p.distance.toFixed(1)}km`} away</small></div></div>`).join('');
  }, () => { out.innerHTML='<div class="empty">Location permission was not granted.</div>'; }, {enableHighAccuracy:false, timeout:8000, maximumAge:300000});
}

// ─── PREMIUM SHEET ─────────────────────────────────────
let spikePremiumMode = '';
let spikePremiumData = { me:{}, collections:[], closeFriends:[], safety:{}, editingCollectionId:'', safetyQuery:'' };
function openPremiumSheet(mode,title,subtitle,icon,body){
  spikePremiumMode=mode;
  document.documentElement.classList.add('spike-modal-open'); document.body.classList.add('spike-modal-open');
  $('spikePremiumIcon').textContent=icon; $('spikePremiumTitle').textContent=title; $('spikePremiumSubtitle').textContent=subtitle||'';
  $('spikePremiumBody').innerHTML=body; $('spikePremiumOverlay').style.display='flex'; $('spikePremiumOverlay').classList.add('open'); $('spikePremiumOverlay').setAttribute('aria-hidden','false');
}
function closePremiumSheet(){ document.documentElement.classList.remove('spike-modal-open'); document.body.classList.remove('spike-modal-open'); $('spikePremiumOverlay')?.classList.remove('open'); $('spikePremiumOverlay')?.style.removeProperty('display'); $('spikePremiumOverlay')?.setAttribute('aria-hidden','true'); spikePremiumMode=''; }
function premiumUserCard(u,selected=false){
  const id=u.id, name=esc(nameOf(u)), av=avatarOf(u);
  return `<div class="spike-premium-card"><div class="spike-premium-avatar">${identityAvatar(u,'spike-avatar',nameOf(u))}</div><div class="spike-premium-card-main"><b>${name}</b><small>@${esc(u.username||u.handle||'user')}</small></div><button class="spike-premium-btn ${selected?'primary':''}" data-cf-toggle="${esc(id)}">${selected?'✓ Added':'Add'}</button></div>`;
}
async function openSavedCollections(){
  const me=await getDoc(`users/${state.user.id}`).catch(()=>({}));
  const cols=Array.isArray(me?.savedCollections)?me.savedCollections:[]; const saved=[...state.saved];
  spikePremiumData={me:me||{},collections:cols};
  renderSavedPanel(saved,cols);
}
function renderSavedPanel(saved,cols){
  const selected=spikePremiumData.selectedCollection||'';
  const active=selected?cols.find(c=>c.id===selected):null;
  const signalList=saved.map(id=>state.posts.find(p=>p.id===id)).filter(Boolean);
  const edit=spikePremiumData.editingCollectionId?cols.find(c=>c.id===spikePremiumData.editingCollectionId):null;
  const collectionOptions=cols.map(c=>`<option value="${esc(c.id)}" ${selected===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
  openPremiumSheet('saved','Saved & Collections',`${saved.length} saved item${saved.length===1?'':'s'} · private to you`,'🔖',`
    <div class="spike-premium-stat"><div><b>${saved.length}</b><small>Saved</small></div><div><b>${cols.length}</b><small>Collections</small></div><div><b>${active?active.postIds?.length||0:0}</b><small>In selected</small></div></div>
    <div class="spike-premium-tabs"><button class="spike-premium-tab ${!active?'active':''}" data-col="">All saved</button>${cols.map(c=>`<button class="spike-premium-tab ${(active&&c.id===selected)?'active':''}" data-col="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>
    <div class="spike-premium-search"><input id="spikeCollectionName" placeholder="New collection name…"><button class="spike-premium-btn primary" id="spikeCreateCollection">＋ Create</button></div>
    ${edit?`<div class="spike-premium-card" style="margin-bottom:10px"><div class="spike-premium-card-main"><b>Rename collection</b><small>Choose a new name for “${esc(edit.name)}”.</small></div><input id="spikeRenameValue" value="${esc(edit.name)}" style="flex:1;min-width:90px"><button class="spike-premium-btn primary" id="spikeRenameSave">Save</button><button class="spike-premium-btn" id="spikeRenameCancel">Cancel</button></div>`:''}
    ${active&&!edit?`<div class="spike-premium-card" style="margin-bottom:10px"><div class="spike-premium-card-main"><b>${esc(active.name)}</b><small>${active.postIds?.length||0} saved posts</small></div><button class="spike-premium-btn" data-col-rename="${esc(active.id)}">Rename</button><button class="spike-premium-btn danger" data-col-delete="${esc(active.id)}">Delete</button></div>`:''}
    ${!active&&cols.length?`<div class="spike-premium-search"><select id="spikeAddCollection" style="flex:1"><option value="">Choose collection for Add…</option>${collectionOptions}</select></div>`:''}
    <div class="spike-premium-grid">${(active?signalList.filter(p=>active.postIds?.includes(p.id)):signalList).map(p=>`<div class="spike-premium-card"><div class="spike-premium-card-main"><b>${esc((p.content||'Untitled post').slice(0,100))}</b><small>${esc(nameOf(state.users.get(p.authorUid)||{}))} · ${active?'In collection':'Saved'}</small></div>${active?`<button class="spike-premium-btn" data-col-remove="${esc(p.id)}">Remove</button>`:(cols.length?`<button class="spike-premium-btn primary" data-col-add="${esc(p.id)}">Add</button>`:'')}</div>`).join('') || '<div class="spike-premium-empty">No saved posts here yet.<br>Tap the bookmark on a post to save it.</div>'}</div>`);
}
async function saveCollections(){ const me=await getDoc(`users/${state.user.id}`).catch(()=>({})); await putDoc(`users/${state.user.id}`,{...(me||{}),savedCollections:spikePremiumData.collections},'users'); }
async function openCloseFriends(){
  const me=await getDoc(`users/${state.user.id}`).catch(()=>({}));
  const list=Array.isArray(me?.closeFriends)?me.closeFriends:[]; spikePremiumData={me:me||{},closeFriends:list}; renderCloseFriends('');
}
function renderCloseFriends(q=''){
  const list=spikePremiumData.closeFriends||[], needle=q.trim().toLowerCase();
  const users=[...state.users.values()].filter(u=>u.id!==state.user.id && (!needle||nameOf(u).toLowerCase().includes(needle)||(u.username||'').toLowerCase().includes(needle))).slice(0,60);
  openPremiumSheet('friends','Close Friends','Choose who gets your Close Friends audience','👥',`<div class="spike-premium-stat"><div><b>${list.length}</b><small>Close friends</small></div><div><b>${users.length}</b><small>Showing</small></div><div><b>Private</b><small>Audience</small></div></div><div class="spike-premium-search"><input id="spikeCFSearch" placeholder="Search people…" value="${esc(q)}"></div><div class="spike-premium-grid">${users.map(u=>premiumUserCard(u,list.includes(u.id))).join('')||'<div class="spike-premium-empty">No other users are available yet.</div>'}</div>`);
}
async function openSafetyCenter(){
  const me=await getDoc(`users/${state.user.id}`).catch(()=>({}));
  const safety=me?.feedSafety||{}; spikePremiumData={me:me||{},safety}; renderSafetyPanel();
}
function renderSafetyPanel(){
  const muted=state.muted||new Set(), blocked=state.blocked||new Set();
  const q=(spikePremiumData.safetyQuery||'').trim().toLowerCase();
  const people=[...state.users.values()].filter(u=>u.id!==state.user.id && (!q||nameOf(u).toLowerCase().includes(q)||(u.username||'').toLowerCase().includes(q))).slice(0,60);
  const peopleHtml=people.map(u=>{
    const b=blocked.has(u.id), m=muted.has(u.id);
    const avatar=identityAvatar(u,'spike-avatar',nameOf(u));
    return `<div class="spike-premium-card"><div class="spike-premium-avatar">${avatar}</div><div class="spike-premium-card-main"><b>${esc(nameOf(u))}</b><small>${b?'Blocked':m?'Muted':'Not restricted'}</small></div><button class="spike-premium-btn ${b?'primary':'danger'}" data-safe-block="${esc(u.id)}">${b?'Unblock':'Block'}</button><button class="spike-premium-btn" data-safe-mute="${esc(u.id)}">${m?'Unmute':'Mute'}</button></div>`;
  }).join('') || '<div class="spike-premium-empty">No matching users.</div>';
  const body=`
    <div class="spike-premium-stat"><div><b>${blocked.size}</b><small>Blocked</small></div><div><b>${muted.size}</b><small>Muted</small></div><div><b>3</b><small>Controls</small></div></div>
    <div class="spike-premium-toggle"><div><b>Show sensitive content</b><small>Allow sensitive posts in your feed</small></div><input class="spike-switch" id="spikeSafeSensitive" type="checkbox" ${spikePremiumData.safety.showSensitive!==false?'checked':''}></div>
    <div class="spike-premium-toggle"><div><b>Show spoilers</b><small>Allow spoiler-marked posts</small></div><input class="spike-switch" id="spikeSafeSpoilers" type="checkbox" ${spikePremiumData.safety.showSpoilers!==false?'checked':''}></div>
    <div class="spike-premium-toggle"><div><b>Following only</b><small>Limit the feed to accounts you follow</small></div><input class="spike-switch" id="spikeSafeFollowing" type="checkbox" ${spikePremiumData.safety.followingOnly===true?'checked':''}></div>
    <div class="spike-premium-search" style="margin-top:12px"><input id="spikeSafetySearch" placeholder="Search users to manage…" value="${esc(spikePremiumData.safetyQuery||'')}"></div>
    <div class="spike-premium-grid">${peopleHtml}</div>
    <button class="spike-premium-btn primary" id="spikeSaveSafety" style="width:100%;margin-top:12px;padding:11px">Save Safety Preferences</button>`;
  openPremiumSheet('safety','Safety Center','Protect your experience on SPIKE','🛡️',body);
}

// ─── PREMIUM CONFIRM ──────────────────────────────────
let premiumDialogResolver = null;
function premiumConfirm(o = {}) {
  const { title = 'Are you sure?', message = '', confirmText = 'Continue', cancelText = 'Cancel', icon = '✦', eyebrow = 'SPIKE ACTION', danger = false } = o;
  return new Promise(resolve => {
    const box = $("premiumDialog");
    premiumDialogResolver = resolve;
    $("premiumDialogIcon").textContent = icon;
    $("premiumDialogEyebrow").textContent = eyebrow;
    $("premiumDialogTitle").textContent = title;
    $("premiumDialogMessage").textContent = message;
    $("premiumDialogConfirm").textContent = confirmText;
    $("premiumDialogCancel").textContent = cancelText;
    $("premiumDialogConfirm").classList.toggle('danger', !!danger);
    box.classList.add('open');
    setTimeout(() => $("premiumDialogConfirm")?.focus(), 40);
  });
}
function finishPremiumConfirm(value) {
  $("premiumDialog")?.classList.remove('open');
  const r = premiumDialogResolver;
  premiumDialogResolver = null;
  if (r) r(value);
}

// ─── ADMIN VISIBILITY (STRICT UID GATE) ─────────────────
// This is a UI/navigation gate only. admin.html must enforce its own server-side authorization.
// The only account allowed to see the Admin entry is this Supabase Auth UID.
const SPIKE_ADMIN_UID = 'daef4aa2-f099-4ff0-a23e-57debc278cc0';

function setAdminVisibility(allowed) {
  const menuAdmin = $('menuAdmin'), feedAdmin = $('feedAdminLink');
  const show = allowed === true;
  if (menuAdmin) {
    menuAdmin.hidden = !show;
    menuAdmin.setAttribute('aria-hidden', show ? 'false' : 'true');
    menuAdmin.dataset.adminAllowed = show ? '1' : '0';
  }
  if (feedAdmin) {
    feedAdmin.hidden = !show;
    feedAdmin.setAttribute('aria-hidden', show ? 'false' : 'true');
    feedAdmin.dataset.adminAllowed = show ? '1' : '0';
  }
  return show;
}

// Always fail closed. This prevents a non-admin from seeing the item during session loading.
setAdminVisibility(false);

function updateAdminVisibility() {
  const uid = String(state.user?.id || '').trim().toLowerCase();
  return setAdminVisibility(uid === SPIKE_ADMIN_UID);
}


if (db?.auth?.onAuthStateChange) {
  db.auth.onAuthStateChange((_event, session) => {
    const uid = String(session?.user?.id || '').trim().toLowerCase();
    setAdminVisibility(uid === SPIKE_ADMIN_UID);
  });
}

async function verifyAdminUid() {
  // Hide first, then verify the authoritative Supabase Auth identity.
  setAdminVisibility(false);
  try {
    const { data, error } = await withTimeout(db.auth.getUser(), 10000, 'Admin authorization');
    if (error) throw error;
    const uid = String(data?.user?.id || '').trim().toLowerCase();
    const allowed = uid === SPIKE_ADMIN_UID;
    state.user = data?.user || state.user;
    return setAdminVisibility(allowed);
  } catch (e) {
    console.warn('[SPIKE ADMIN] authorization check failed', e);
    return setAdminVisibility(false);
  }
}


// ─── WATERMARKED VIDEO DOWNLOADS ───────────────────────
function cloudinaryDownloadUrl(url, filename='SPIKE-video.mp4') {
  const raw=safeHttpUrl(url); if(!raw)return '';
  if(!/cloudinary\.com/i.test(raw))return raw;
  const safeName=String(filename||'SPIKE-video.mp4').trim().replace(/[^a-z0-9._-]/gi,'-').replace(/-+/g,'-') || 'SPIKE-video.mp4';
  // Cloudinary accepts fl_attachment[:filename] for video delivery. The filename
  // is a transformation qualifier, so encode the qualifier value only; do not
  // encode the whole transformation or the public ID. This avoids malformed
  // paths while preserving a predictable download name.
  return cloudinaryVideoTransformUrl(raw, `fl_attachment:${encodeURIComponent(safeName)}`);
}

function cloudinaryStandardDownloadUrl(url) {
  const raw=safeHttpUrl(url); if(!raw)return '';
  if(!/cloudinary\.com/i.test(raw))return raw;
  return cloudinaryVideoTransformUrl(raw, 'fl_attachment');
}

// Build a Cloudinary attachment URL for either image or video without changing
// the public ID. The response is then downloaded as a Blob when CORS allows it;
// otherwise the attachment navigation is handed to the browser/WebView download
// manager. Neither path intentionally opens a new tab or sends the user away
// from the SPIKE UI.
function cloudinaryStoryAttachmentUrl(url, filename) {
  const raw=safeHttpUrl(url); if(!raw)return '';
  if(!/cloudinary\.com/i.test(raw))return raw;
  try {
    const u=new URL(raw);
    const marker='/upload/';
    const i=u.pathname.indexOf(marker);
    if(i<0)return raw;
    const tail=cloudinaryVideoAssetTail(u.pathname,i);
    if(!tail)return raw;
    const safeName=String(filename||'SPIKE-story-download').trim()
      .replace(/[^a-z0-9._-]/gi,'-').replace(/-+/g,'-') || 'SPIKE-story-download';
    u.pathname=u.pathname.slice(0,i+marker.length)+`fl_attachment:${encodeURIComponent(safeName)}/`+tail;
    return u.toString();
  } catch (_) { return raw; }
}

async function downloadStoryMediaInApp(url, filename, kind, button) {
  if (!url) { toast('Media is not available', 'error'); return; }
  if (button?.dataset.busy === '1') return;
  if (button) { button.dataset.busy='1'; button.disabled=true; button.classList.add('is-busy'); }
  try {
    const requestedName=String(filename||`SPIKE-story.${kind==='video'?'mp4':'jpg'}`).trim();
    const sourceUrl=safeHttpUrl(url);
    if (!sourceUrl) throw new Error('Story media URL is invalid.');

    // Android app path: hand the authenticated SPIKE proxy URL to the native
    // DownloadManager bridge. Native Android owns the filesystem destination
    // (/storage/emulated/0/Download) and the WebView stays on the current page.
    // Never hand the Cloudinary URL directly to Android.
    const isAndroidApp=/Android/i.test(navigator.userAgent||'');
    const androidBridge=window.SPIKEAndroidDownload;
    if(isAndroidApp && androidBridge && typeof androidBridge.download==='function'){
      const sessionResult=await db.auth.getSession();
      const accessToken=sessionResult?.data?.session?.access_token;
      if(!accessToken) throw new Error('Please sign in again to download this story.');
      const endpoint=`${SUPABASE_URL}/functions/v1/spike-media-download?url=${encodeURIComponent(sourceUrl)}&filename=${encodeURIComponent(requestedName)}`;
      const mimeType=kind==='video'?'video/mp4':'image/jpeg';
      try {
        const accepted=androidBridge.download(endpoint,requestedName,mimeType,accessToken);
        if(accepted!==false){
          window.__SPIKE_LAST_DOWNLOAD={url:endpoint,filename:requestedName,kind,mode:'android-download-manager',createdAt:Date.now()};
          toast(kind==='video'?'Download started · check your Downloads folder':'Download started · check your Downloads folder','success');
          return;
        }
      } catch(e) {
        console.warn('[SPIKE DOWNLOAD] Android bridge failed; using WebView fallback',e);
      }
    }

    // Browser/WebView fallback: first try the media directly. If Cloudinary CORS
    // blocks the browser, use SPIKE's authenticated media-download Edge Function.
    const candidates=[];
    const push=u=>{u=String(u||'').trim();if(u&&!candidates.includes(u))candidates.push(u);};
    push(sourceUrl);
    if (/cloudinary\.com/i.test(sourceUrl)) {
      try {
        const u=new URL(sourceUrl);
        const marker='/upload/';
        const i=u.pathname.indexOf(marker);
        if(i>=0){
          const tail=cloudinaryVideoAssetTail(u.pathname,i);
          if(tail) { u.pathname=u.pathname.slice(0,i+marker.length)+tail; push(u.toString()); }
        }
      } catch (_) {}
    }

    let lastError=null;
    for (const candidate of candidates) {
      try {
        const response=await fetch(candidate,{mode:'cors',credentials:'omit',cache:'no-store',redirect:'follow'});
        if (!response.ok) throw new Error(`Media request failed (${response.status})`);
        const blob=await response.blob();
        if (!blob.size) throw new Error('Downloaded file is empty.');
        const blobUrl=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=blobUrl; a.download=requestedName; a.rel='noopener';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(blobUrl),60000);
        window.__SPIKE_LAST_DOWNLOAD={url:candidate,filename:requestedName,kind,mode:'blob',createdAt:Date.now()};
        toast(kind==='video'?'Video saved to your device':'Picture saved to your device','success');
        return;
      } catch(e) { lastError=e; }
    }

    // CORS-safe server-side stream. The function requires the signed-in
    // Supabase JWT and only permits Cloudinary as its upstream host.
    const sessionResult=await db.auth.getSession();
    const accessToken=sessionResult?.data?.session?.access_token;
    if(!accessToken) throw new Error('Please sign in again to download this story.');
    const endpoint=`${SUPABASE_URL}/functions/v1/spike-media-download?url=${encodeURIComponent(sourceUrl)}&filename=${encodeURIComponent(requestedName)}`;
    const proxyResponse=await fetch(endpoint,{method:'GET',headers:{Authorization:`Bearer ${accessToken}`,apikey:SUPABASE_KEY},cache:'no-store'});
    if(!proxyResponse.ok) throw new Error(`Download service failed (${proxyResponse.status})`);
    const proxyBlob=await proxyResponse.blob();
    if(!proxyBlob.size) throw new Error('Downloaded file is empty.');
    const blobUrl=URL.createObjectURL(proxyBlob);
    const a=document.createElement('a'); a.href=blobUrl; a.download=requestedName; a.rel='noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(blobUrl),60000);
    window.__SPIKE_LAST_DOWNLOAD={url:endpoint,filename:requestedName,kind,mode:'supabase-proxy',createdAt:Date.now()};
    toast(kind==='video'?'Video saved to your device':'Picture saved to your device','success');
  } catch(e) {
    console.error('downloadStoryMediaInApp',e);
    toast(e?.message || 'Could not download story media','error');
  } finally {
    if (button) { button.dataset.busy='0'; button.disabled=false; button.classList.remove('is-busy'); }
  }
}
// Backward-compatible post-video helper. Story downloads use the generic
// in-app media helper above, while existing feed-post video downloads continue
// to use the same Cloudinary attachment behavior.
async function downloadWatermarkedVideoUrl(url, filename, button) {
  return downloadStoryMediaInApp(url, filename, 'video', button);
}

// ─── VIDEO CONTROLS ────────────────────────────────────
function initVideoControls() {
  const SELECTOR = 'video.post-feed-video';
  const PREVIEW_SECONDS = 3;
  const observed = new WeakSet();
  const previewTimers = new WeakMap();
  const retryTokens = new WeakMap();
  let switchingVideo = false;

  const wrap = video => video?.closest('.post-video-inline');
  const setState = (video, mode) => {
    const w = wrap(video);
    if (!w) return;
    w.dataset.videoMode = mode;
    w.dataset.videoReady = video.readyState >= 1 ? '1' : '0';
    if (mode === 'playing') w.classList.add('is-playing');
    else w.classList.remove('is-playing');
  };
  const clearError = video => {
    const w = wrap(video);
    if (!w) return;
    w.classList.remove('has-video-error');
    w.dataset.videoError = '';
  };
  const setError = (video, message = 'Video unavailable') => {
    const w = wrap(video);
    if (!w || w.dataset.videoReloading === '1') return;
    // Never show the error layer over an actively playing video.
    if (!video.error && !video.networkState) return;
    w.classList.add('has-video-error');
    w.dataset.videoError = message;
    const box = w.querySelector('.feed-video-error');
    if (box) box.innerHTML = `${esc(message)} · <button type="button" data-video-retry>Retry</button>`;
  };
  const setDuration = video => {
    const badge = wrap(video)?.querySelector('[data-video-duration]');
    if (badge && Number.isFinite(video.duration) && video.duration > 0) {
      const n = Math.round(video.duration);
      badge.textContent = `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
    }
  };
  const clearPreviewTimer = video => {
    const t = previewTimers.get(video);
    if (t) clearTimeout(t);
    previewTimers.delete(video);
  };
  const safePlay = async (video, reason = 'playback') => {
    if (!video || !video.isConnected) return false;
    const w = wrap(video);
    if (!w || w.dataset.videoReloading === '1') return false;
    try {
      await video.play();
      return true;
    } catch (err) {
      // AbortError is normal when a competing pause/load interrupts play().
      // It is not a broken video and must not create a retry loop or error UI.
      if (err?.name === 'AbortError' || err?.code === DOMException.ABORT_ERR) return false;
      if (reason === 'preview') return false;
      throw err;
    }
  };
  const waitForCanPlay = (video, timeout = 8000) => new Promise((resolve, reject) => {
    if (!video || !video.isConnected) return reject(new Error('Video element is unavailable'));
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return resolve();
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
      fn(value);
    };
    const onReady = () => finish(resolve);
    const onError = () => finish(reject, video.error || new Error('Video source could not be loaded'));
    const timer = setTimeout(() => finish(reject, new Error('Video load timed out')), timeout);
    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
  const schedulePreviewLoop = video => {
    clearPreviewTimer(video);
    const w = wrap(video);
    if (!w || w.dataset.videoMode !== 'preview') return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;

    const target = Math.min(PREVIEW_SECONDS, video.duration);
    const remaining = Math.max(100, (target - video.currentTime) * 1000);
    previewTimers.set(video, setTimeout(async () => {
      if (w.dataset.videoMode !== 'preview' || w.dataset.videoReloading === '1') return;
      try { video.currentTime = 0; } catch (_) {}
      video.muted = true;
      await safePlay(video, 'preview');
      schedulePreviewLoop(video);
    }, remaining));
  };

  const pauseOthers = current => {
    switchingVideo = true;
    try {
      document.querySelectorAll(SELECTOR).forEach(v => {
        if (v === current) return;
        clearPreviewTimer(v);
        if (!v.paused) v.pause();
        const w = wrap(v);
        if (w?.dataset.videoMode === 'preview' && w.dataset.videoReloading !== '1') {
          v.muted = true;
          v.loop = true;
          // Re-start previews without allowing their play events to recurse
          // back into pauseOthers().
          safePlay(v, 'preview').catch(() => {});
          schedulePreviewLoop(v);
        }
      });
    } finally {
      switchingVideo = false;
    }
  };

  const enterPlayback = async video => {
    const w = wrap(video);
    if (!w) return;

    clearPreviewTimer(video);
    clearError(video);
    pauseOthers(video);
    setState(video, 'playing');

    video.loop = false;
    video.controls = true;
    video.playsInline = true;

    // Try sound first. If mobile/browser policy rejects it, keep playback
    // working muted instead of presenting a false "unavailable" error.
    video.muted = false;
    try {
      await safePlay(video, 'user');
      clearError(video);
    } catch (_) {
      video.muted = true;
      try {
        await safePlay(video, 'user');
        clearError(video);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setError(video, 'Video could not be played');
        console.warn('[SPIKE video] playback failed', err);
      }
    }
  };

  const videoSourceCandidates = video => {
    const candidates = [];
    const playback = safeHttpUrl(video?.dataset?.spikePlaybackSrc || video?.getAttribute('data-playback-src') || video?.getAttribute('src') || video?.currentSrc || '');
    const original = safeHttpUrl(video?.dataset?.spikeOriginalSrc || video?.getAttribute('data-original-src') || '');
    const add = u => { if (u && !candidates.includes(u)) candidates.push(u); };
    // Always try the exact URL stored for playback first. This preserves watermarks and
    // avoids replacing a known-good derived asset with another transformation.
    add(playback);
    if (original && /cloudinary\.com/i.test(original)) cloudinaryFeedVideoCandidates(original).forEach(add);
    else add(original);
    return candidates;
  };

  const probeVideoSource = async source => {
    try {
      const r = await fetch(source,{method:'GET',headers:{Range:'bytes=0-1'},credentials:'omit',cache:'no-store'});
      return {ok:r.ok,status:r.status,type:r.headers.get('content-type')||'',length:r.headers.get('content-length')||'',acceptRanges:r.headers.get('accept-ranges')||'',cldError:r.headers.get('x-cld-error')||''};
    } catch(error) {
      return {ok:false,status:0,type:'',message:error?.message||String(error)};
    }
  };

  const resetAndRetry = async video => {
    if (!video) return;
    const w = wrap(video);
    if (!w) return;

    const token = (retryTokens.get(video) || 0) + 1;
    retryTokens.set(video, token);
    clearPreviewTimer(video);
    clearError(video);
    setState(video, 'preview');
    w.dataset.videoReloading = '1';
    video.controls = false;
    video.loop = true;
    video.muted = true;

    const candidates = videoSourceCandidates(video);
    if (!candidates.length) {
      w.dataset.videoReloading = '0';
      setError(video, 'Video unavailable');
      return;
    }

    let lastErr = null;
    const diagnostics = [];
    let sawProcessing = false;
    for (let index=0; index<candidates.length; index++) {
      const source=candidates[index];
      if (retryTokens.get(video)!==token || !video.isConnected) return;
      // Cloudinary may return HTTP 423 while a newly requested video derivative
      // is being generated. Give that exact candidate a short grace period
      // instead of immediately declaring the video unsupported.
      for (let attempt=0; attempt<3; attempt++) {
        if (retryTokens.get(video)!==token || !video.isConnected) return;
        try {
          const preflight=await probeVideoSource(source);
          if (preflight.status===423) {
            sawProcessing=true;
            diagnostics.push({index,attempt,source,preflight});
            await new Promise(r=>setTimeout(r,2500));
            continue;
          }
          video.pause();
          video.removeAttribute('src');
          video.load();
          video.src=source;
          video.load();
          await waitForCanPlay(video,12000);
          if (retryTokens.get(video)!==token || !video.isConnected) return;
          w.dataset.videoReloading='0';
          clearError(video);
          await safePlay(video,'preview');
          if (retryTokens.get(video)===token) schedulePreviewLoop(video);
          return;
        } catch(err) {
          lastErr=err;
          const probe=await probeVideoSource(source);
          if (probe.status===423) sawProcessing=true;
          diagnostics.push({index,attempt,source,mediaCode:video.error?.code||0,mediaMessage:video.error?.message||'',networkState:video.networkState,readyState:video.readyState,canPlayMp4:video.canPlayType('video/mp4'),probe});
          try { video.pause(); } catch(_) {}
          break;
        }
      }
    }
    if (retryTokens.get(video)!==token) return;
    w.dataset.videoReloading='0';
    const mediaError=video.error;
    const code=mediaError?.code;
    const mp4Support=video.canPlayType('video/mp4');
    const message=sawProcessing?'Video is still processing · Retry':code===MediaError.MEDIA_ERR_NETWORK?'Video network error':code===MediaError.MEDIA_ERR_DECODE?'Video could not be decoded':code===MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED?(mp4Support?'Video source unavailable':'Video format is not supported'):'Video unavailable';
    setError(video,message);
    console.warn('[SPIKE video] retry failed',lastErr,{code,mp4Support,currentSrc:video.currentSrc,sources:candidates,diagnostics});
  };

  document.querySelectorAll(SELECTOR).forEach(v => {
    if (observed.has(v)) return;
    observed.add(v);

    v.muted = true;
    v.playsInline = true;
    v.loop = true;
    v.controls = false;
    if (!v.dataset.spikeOriginalSrc) {
      const declared = v.getAttribute('data-original-src') || v.getAttribute('src') || '';
      if (declared) v.dataset.spikeOriginalSrc = declared;
    }
    if (!v.dataset.spikePlaybackSrc) {
      const playback = v.getAttribute('data-playback-src') || v.getAttribute('src') || '';
      if (playback) v.dataset.spikePlaybackSrc = playback;
    }

    const w = wrap(v);
    if (w) {
      w.dataset.videoReady = '0';
      w.dataset.videoMode = 'preview';
      w.dataset.videoError = '';
      w.dataset.videoReloading = '0';
      w.dataset.videoAutoRetry = '0';
    }

    v.addEventListener('loadedmetadata', () => {
      if (!wrap(v)) return;
      clearError(v);
      setDuration(v);
      const w2 = wrap(v);
      if (w2?.dataset.videoMode === 'preview' && w2.dataset.videoReloading !== '1') {
        v.muted = true;
        safePlay(v, 'preview').catch(() => {});
        schedulePreviewLoop(v);
      }
    });

    v.addEventListener('durationchange', () => setDuration(v));

    v.addEventListener('loadeddata', () => {
      clearError(v);
    });

    v.addEventListener('canplay', () => {
      clearError(v);
      const w2 = wrap(v);
      if (w2?.dataset.videoMode === 'preview' && w2.dataset.videoReloading !== '1' && v.paused) {
        v.muted = true;
        safePlay(v, 'preview').catch(() => {});
      }
    });

    v.addEventListener('playing', () => {
      clearError(v);
      const w2 = wrap(v);
      if (w2?.dataset.videoMode === 'preview') schedulePreviewLoop(v);
    });

    v.addEventListener('play', () => {
      if (!switchingVideo) pauseOthers(v);
      const w2 = wrap(v);
      if (w2?.dataset.videoMode === 'playing') {
        clearPreviewTimer(v);
        clearError(v);
        w2.classList.add('is-playing');
        v.controls = true;
      } else if (w2) {
        v.muted = true;
        clearError(v);
        schedulePreviewLoop(v);
      }
    });

    v.addEventListener('pause', () => {
      const w2 = wrap(v);
      // Do not auto-resume a user-paused full playback video.
      if (w2?.dataset.videoMode === 'preview' && w2.dataset.videoReloading !== '1') {
        v.muted = true;
        safePlay(v, 'preview').catch(() => {});
        schedulePreviewLoop(v);
      }
    });

    v.addEventListener('ended', () => {
      const w2 = wrap(v);
      if (!w2) return;
      if (w2.dataset.videoMode === 'playing') {
        w2.classList.remove('is-playing');
        return;
      }
      try { v.currentTime = 0; } catch (_) {}
      v.muted = true;
      v.loop = true;
      safePlay(v, 'preview').catch(() => {});
      schedulePreviewLoop(v);
    });

    v.addEventListener('error', () => {
      // Ignore errors generated while intentionally replacing/reloading src.
      const w2 = wrap(v);
      if (!w2 || w2.dataset.videoReloading === '1') return;
      if (!v.error) return;
      // Ignore stale errors that arrive after a successful play event.
      if (w2.dataset.videoMode === 'playing' && !v.paused && v.readyState >= 2) {
        clearError(v);
        return;
      }
      const code = v.error.code;
      const message =
        code === MediaError.MEDIA_ERR_NETWORK ? 'Video network error' :
        code === MediaError.MEDIA_ERR_DECODE ? 'Video format could not be decoded' :
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? 'Video format is not supported' :
        'Video unavailable';
      // One automatic recovery pass is critical for legacy posts whose stored
      // playback URL is an unsupported derivative. Do not loop forever.
      if (w2.dataset.videoAutoRetry !== '1') {
        w2.dataset.videoAutoRetry = '1';
        resetAndRetry(v).catch(err => console.warn('[SPIKE video] auto-retry failed', err));
        return;
      }
      setError(v, message);
    });
  });

  document.addEventListener('click', async e => {
    const downloadBtn = e.target.closest('[data-download-video]');
    if (downloadBtn) {
      e.preventDefault();
      e.stopPropagation();
      const post = state.posts.find(x => String(x.id) === String(downloadBtn.dataset.downloadVideo));
      if (!post?.mediaUrl) { toast('Video is not available','error'); return; }
      const spid = spIdOf(post) || spIdOf(state.users.get(post.authorUid)) || 'video';
      await downloadWatermarkedVideoUrl(post.mediaUrl, `SPIKE-${String(spid).replace(/[^a-z0-9_-]/gi,'-')}-watermarked.mp4`, downloadBtn);
      return;
    }

    const retry = e.target.closest('[data-video-retry]');
    if (retry) {
      e.preventDefault();
      e.stopPropagation();
      const v = retry.closest('.post-video-inline')?.querySelector(SELECTOR);
      if (v) await resetAndRetry(v);
      return;
    }

    const card = e.target.closest('.post-video-inline');
    const video = card?.querySelector(SELECTOR);
    if (!card || !video || e.target.closest('button,input,select,textarea')) return;

    if (card.dataset.videoMode !== 'playing') {
      await enterPlayback(video);
    }
  }, true);
}

// ─── DISCOVER ──────────────────────────────────────────