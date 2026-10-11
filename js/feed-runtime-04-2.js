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

function authorFor(p) {
  const id = String(p?.authorUid || p?.author_uid || "");
  const current = id ? state.users.get(id) : null;
  if (current) {
    // The profile record is canonical. Never let an avatar snapshot saved on an
    // old post override the current profile (including an intentionally blank avatar).
    const currentAvatar = current.avatar_url ?? current.avatar ?? current.photo_url ?? "";
    return {
      ...current,
      id: current.id || id,
      display_name: current.display_name || current.full_name || current.name || p?.authorName || "User",
      avatar_url: currentAvatar,
      avatar: currentAvatar,
      photo_url: currentAvatar
    };
  }
  // Fallback only until the author's canonical profile is available.
  return { id, name: p?.authorName || "User", display_name: p?.authorName || "User", avatar_url: p?.authorAvatar || "" };
}

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

function cloudinaryFeedImageUrl(url){
  const raw=safeHttpUrl(url); if(!raw)return '';
  try{
    const u=new URL(raw); if(!u.hostname.includes('cloudinary.com'))return raw;
    const marker='/upload/'; const i=u.pathname.indexOf(marker); if(i<0)return raw;
    const tail=u.pathname.slice(i+marker.length);
    // Preserve animated GIF delivery. Do not let f_auto silently change an
    // animated GIF into a still/unsupported representation for older clients.
    const gif=isGifUrl(raw);
    const transform=gif ? 'f_gif,fl_animated,q_auto:eco,w_1080,c_limit' : 'f_auto,q_auto:eco,w_1080,c_limit,dpr_auto';
    u.pathname=u.pathname.slice(0,i+marker.length)+transform+'/'+tail;
    return u.toString();
  }catch(_){return raw;}
}

function cloudinaryVideoPosterUrl(url){
  const raw=safeHttpUrl(url); if(!raw)return '';
  try{const u=new URL(raw);if(!u.hostname.includes('cloudinary.com'))return '';const marker='/upload/';const i=u.pathname.indexOf(marker);if(i<0)return '';const tail=cloudinaryVideoAssetTail(u.pathname,i);if(!tail)return '';u.pathname=u.pathname.slice(0,i+marker.length)+'so_0,f_jpg,q_auto:eco,w_1080,c_limit/'+tail;u.pathname=u.pathname.replace(/\.(mp4|webm|mov|m4v|avi|mpeg|mpg)$/i,'.jpg');return u.toString();}catch(_){return '';}
}

// Browser-safe Cloudinary video delivery. Rebuild from the clean asset tail
// instead of stacking transformations on an already-derived URL.
function cloudinaryVideoAssetTail(pathname, markerIndex){
  const after=pathname.slice(markerIndex + '/upload/'.length);
  const parts=after.split('/').filter(Boolean);
  const versionIndex=parts.findIndex(x=>/^v\d+$/.test(x));
  if(versionIndex>=0) return parts.slice(versionIndex).join('/');
  const transformPrefix=/^(?:f|vc|ac|q|w|h|c|g|l|e|so|du|br|fps|sp|d|r|ar|dpr|fl|x|y|z)_/i;
  let i=0;
  while(i<parts.length && transformPrefix.test(parts[i])) i++;
  return parts.slice(i).join('/');
}

function cloudinaryVideoTransformUrl(url, transform){
  const raw=safeHttpUrl(url); if(!raw)return '';
  try{
    const u=new URL(raw);
    if(!u.hostname.includes('cloudinary.com')) return raw;
    const marker='/upload/'; const i=u.pathname.indexOf(marker);
    if(i<0) return raw;
    const tail=cloudinaryVideoAssetTail(u.pathname,i);
    if(!tail) return raw;
    u.pathname=u.pathname.slice(0,i+marker.length)+transform+'/'+tail;
    u.pathname=u.pathname.replace(/\.(mov|m4v|webm|avi|mpeg|mpg|gif)$/i,'.mp4');
    return u.toString();
  }catch(_){ return raw; }
}

function cloudinaryFeedVideoCandidates(url){
  const raw=safeHttpUrl(url); if(!raw)return [];
  if(!/cloudinary\.com/i.test(raw)) return [raw];
  const transforms=[
    // Android-safe H.264 + AAC first. Keep the baseline profile as a later
    // fallback instead of making it the primary delivery path.
    'f_mp4,vc_h264,ac_aac,q_auto:good',
    'f_mp4,vc_auto,ac_aac,q_auto:good',
    SPIKE_VIDEO_FALLBACK_TRANSFORM,
    SPIKE_VIDEO_DELIVERY_TRANSFORM,
    'f_mp4,q_auto:good'
  ];
  const out=[];
  for(const t of transforms){
    const candidate=cloudinaryVideoTransformUrl(raw,t);
    if(candidate && !out.includes(candidate)) out.push(candidate);
  }
  if(!out.includes(raw)) out.push(raw);
  return out;
}

function cloudinaryFeedVideoUrl(url){
  return cloudinaryFeedVideoCandidates(url)[0] || '';
}



function isGifUrl(url){ return /\.gif(?:[?#].*)?$/i.test(String(url||'')); }
function mediaKindOf(item){
  const type=String(item?.type||item?.mediaType||'').toLowerCase();
  const urls=[item?.url,item?.mediaUrl,item?.originalUrl,item?.playbackUrl].map(x=>String(x||'')).filter(Boolean);
  const mime=String(item?.mimeType||item?.mime||'').toLowerCase();
  // GIFs are animated images, never HTML5 video sources. Check every stored
  // URL (including original/playback URLs) before trusting a legacy mediaType.
  if(type==='gif' || /image\/gif/i.test(mime) || urls.some(isGifUrl)) return 'gif';
  return type==='video' ? 'video' : 'image';
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
  const m = signalMetrics(p);
  const isOwner = p.authorUid === state.user.id;
  return `<article class="post" data-post="${esc(p.id)}">
<div class="post-head">
<a class="post-author" href="${profileLink(p.authorUid)}">
<div class="post-avatar">${identityAvatar(a,"spike-avatar",nameOf(a))}</div>
<div>
<div class="post-name">${esc(nameOf(a))}${verifiedBadgeHTML(a)}</div>
<div class="post-meta">@${esc(a.username||"spike")} · ${ago(p.createdAt||p.created_at)}${p.updatedAt && (p.edited === true || !!p.editedAt) ? `<span class="edited">(edited)</span>` : ""}${isScheduled ? `<span class="scheduled-badge">Scheduled</span>` : ""}</div>
</div>
</a>
<button class="more" data-more="${esc(p.id)}" aria-label="More">⋯</button>
</div>

${p.content?`<div class="post-content ${state.expandedCaptions?.has(String(p.id))?'':'is-collapsed'}" data-caption><span class="caption-body">${markdownToHTML(p.content)}</span><button type="button" class="caption-more" data-caption-toggle aria-label="Expand caption"></button></div>`:""}
${mediaMarkup(p)}
${safeHttpUrl(p.linkUrl)?`<div class="link-card">🔗 <a href="${esc(safeHttpUrl(p.linkUrl))}" target="_blank" rel="noopener noreferrer">${esc(p.linkUrl)}</a></div>`:""}
<div class="reaction-summary-row">${m.totalReactions ? `<button type="button" class="reaction-summary" data-react-menu="${esc(p.id)}" aria-label="${m.totalReactions} reactions" title="View reactions">${normalizedReactionEntries(p).slice(0,3).map(([emoji])=>`<span class="reaction-icon">${esc(emoji)}</span>`).join("")}<span>${m.totalReactions}</span></button>` : `<button type="button" class="reaction-summary is-empty" data-react-menu="${esc(p.id)}" aria-label="React to Signal" title="View reactions"><span>React</span></button>`}</div>
<div class="post-actions spike-post-action-bar" role="group" aria-label="Signal actions">
<button class="spike-post-action ${liked?"active":""}" data-like="${esc(p.id)}" aria-pressed="${liked?"true":"false"}" aria-label="${liked?"Unlike Signal":"Like Signal"}" title="${liked?"Unlike":"Like"} · long press for reactions"><span class="spike-action-icon" aria-hidden="true">♡</span><span class="spike-action-count" data-like-count="${esc(p.id)}">${m.likes || ""}</span><span class="spike-action-label">Like</span></button>
<button class="spike-post-action" data-comments="${esc(p.id)}" aria-label="Open ${m.comments || ""} comments" title="Comments"><span class="spike-action-icon" aria-hidden="true">💬</span><span class="spike-action-count" data-comments-count="${esc(p.id)}">${m.comments || ""}</span><span class="spike-action-label">Comment</span></button>
<button class="spike-post-action" data-share="${esc(p.id)}" aria-label="Share Signal" title="Share"><span class="spike-action-icon" aria-hidden="true">↗</span><span class="spike-action-label">Share</span></button>
<button class="spike-post-action ${saved?"active":""}" data-save="${esc(p.id)}" aria-pressed="${saved?"true":"false"}" aria-label="${saved?"Remove from Saved":"Save Signal"}" title="${saved?"Saved":"Save"}"><span class="spike-action-icon" aria-hidden="true">🔖</span><span class="spike-action-label">${saved?"Saved":"Save"}</span></button>
</div>
${isOwner ? `<div class="owner-insights" id="insights-${esc(p.id)}" hidden><span>👁 ${Number(p.views||0)} views</span><span>❤️ ${m.totalReactions} reactions</span><span>💬 ${m.comments} comments</span><span>🔖 ${m.saves} saves</span></div>` : ""}
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
    if(window.SPIKENotificationCenter?.refresh){
      const count=await window.SPIKENotificationCenter.refresh();
      if(count!==null){setNotificationBadge(count);return;}
    }
    const n=await withTimeout(db.rpc('get_notification_summary'),8000,'Notification badge');
    if(n?.error)throw n.error;
    setNotificationBadge(Number(n?.data?.unread||0));
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
    btn.setAttribute('aria-label', liked ? 'Unlike Signal' : 'Like Signal');
    btn.setAttribute('title', liked ? 'Unlike' : 'Like');
    const icon = btn.querySelector('.spike-action-icon');
    if(icon) icon.textContent = liked ? '♥' : '♡';
  }
  const m = signalMetrics(post);
  const count = article.querySelector(`[data-like-count="${CSS.escape(String(id))}"]`);
  if (count) count.textContent = m.likes ? String(m.likes) : '';
  syncReactionDom(id, post);
}

function syncCommentDom(id, post) {
  const article = getSignalArticle(id);
  if (!article) return;
  const comments = Array.isArray(post?.comments) ? post.comments : [];
  const section = article.querySelector(`#comments-${CSS.escape(String(id))}`);
  if (!section) return;

  // Only the list is patched; Feed content and post interactions remain stable.
  const list = section.querySelector('.comment-list');
  if (list) list.innerHTML = renderComments(comments) || '<div class="meta">No comments yet.</div>';

  const count = article.querySelector(`[data-comments-count="${CSS.escape(String(id))}"]`);
  if (count) count.textContent = comments.length ? String(comments.length) : '';
  const commentButton = article.querySelector(`[data-comments="${CSS.escape(String(id))}"]`);
  if (commentButton) commentButton.setAttribute('aria-label', comments.length ? `Open ${comments.length} comments` : 'Open comments');

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
    btn.setAttribute('aria-label', saved ? 'Remove from Saved' : 'Save Signal');
    btn.setAttribute('title', saved ? 'Saved' : 'Save');
    const label = btn.querySelector('.spike-action-label');
    if(label) label.textContent = saved ? 'Saved' : 'Save';
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
  if (!p) throw new Error('This Signal is no longer available. Please refresh the feed.');
  if (!SPIKE_REACTIONS.includes(emoji)) throw new Error('That reaction is not available.');
  if (feedInteractionBusy.has(key)) return;
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
let spikeReactionTarget = null;
let spikeReactionPostId = null;
let spikeReactionCommitBusy = false;

function ensureReactionTray(){
  if(spikeReactionTray && document.body.contains(spikeReactionTray)) return spikeReactionTray;
  const tray=document.createElement('div');
  tray.id='spikeReactionPicker';
  tray.className='spike-reaction-tray';
  tray.setAttribute('role','dialog');
  tray.setAttribute('aria-label','Choose a reaction');
  tray.hidden=true;
  tray.innerHTML=SPIKE_REACTIONS.map(emoji=>`<button type="button" data-spike-reaction="${esc(emoji)}" aria-label="${esc(emoji)}">${esc(emoji)}</button>`).join('');
  document.body.appendChild(tray);
  spikeReactionTray=tray;

  tray.addEventListener('pointerup', e=>{
    const button=e.target?.closest?.('[data-spike-reaction]');
    if(!button || !tray.contains(button) || button.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const emoji=button.dataset.spikeReaction;
    if(!emoji || spikeReactionCommitBusy || !spikeReactionPostId) return;
    void commitReactionSelection(button,emoji);
  }, {passive:false});

  tray.addEventListener('keydown', e=>{
    const button=e.target?.closest?.('[data-spike-reaction]');
    if(!button || button.disabled || (e.key!=='Enter' && e.key!==' ')) return;
    e.preventDefault();
    const emoji=button.dataset.spikeReaction;
    if(!emoji || spikeReactionCommitBusy || !spikeReactionPostId) return;
    void commitReactionSelection(button,emoji);
  });
  return tray;
}

function positionReactionTray(anchor){
  const tray=ensureReactionTray();
  const r=anchor.getBoundingClientRect();
  const trayWidth=Math.min(window.innerWidth-20,312);
  let left=Math.max(10,Math.min(window.innerWidth-trayWidth-10,r.left));
  let top=r.top-62;
  if(top<8) top=r.bottom+8;
  tray.style.left=`${Math.round(left)}px`;
  tray.style.top=`${Math.round(top)}px`;
  tray.style.minWidth=`${Math.min(trayWidth,312)}px`;
}

function closeReactionTray(){
  const tray=spikeReactionTray;
  if(!tray) return;
  tray.hidden=true;
  tray.setAttribute('aria-hidden','true');
  tray.querySelectorAll('[data-spike-reaction]').forEach(b=>{
    b.disabled=false;
    b.removeAttribute('aria-busy');
    b.classList.remove('is-selected');
  });
  spikeReactionTarget=null;
  spikeReactionPostId=null;
  spikeReactionCommitBusy=false;
}

function openReactionTray(id,anchor){
  const tray=ensureReactionTray();
  spikeReactionPostId=String(id);
  spikeReactionTarget=anchor;
  spikeReactionCommitBusy=false;
  tray.hidden=false;
  tray.setAttribute('aria-hidden','false');
  tray.querySelectorAll('[data-spike-reaction]').forEach(b=>{
    b.disabled=false;
    b.removeAttribute('aria-busy');
    b.classList.remove('is-selected');
  });
  positionReactionTray(anchor);
  const first=tray.querySelector('[data-spike-reaction]');
  if(first) requestAnimationFrame(()=>first.focus({preventScroll:true}));
}

async function commitReactionSelection(button,emoji){
  if(spikeReactionCommitBusy || !spikeReactionPostId || !SPIKE_REACTIONS.includes(emoji)) return;
  const id=spikeReactionPostId;
  const tray=spikeReactionTray;
  spikeReactionCommitBusy=true;
  const buttons=[...(tray?.querySelectorAll('[data-spike-reaction]')||[])];
  buttons.forEach(b=>{b.disabled=true;b.setAttribute('aria-busy','true');});
  button.classList.add('is-selected');
  try{
    await reactToSignal(id,emoji);
  }catch(err){
    buttons.forEach(b=>{b.disabled=false;b.removeAttribute('aria-busy');});
    button.classList.remove('is-selected');
    spikeReactionCommitBusy=false;
    toast(err?.message||'Could not save that reaction. Please try again.','error');
  }
}

function initReactionPickerDismiss(){
  if(window.__SPIKE_REACTION_DISMISS__) return;
  window.__SPIKE_REACTION_DISMISS__=true;
  document.addEventListener('pointerdown',e=>{
    const tray=spikeReactionTray;
    if(!tray || tray.hidden) return;
    if(tray.contains(e.target) || e.target===spikeReactionTarget) return;
    closeReactionTray();
  },{capture:true});
  window.addEventListener('resize',()=>{
    if(spikeReactionTray && !spikeReactionTray.hidden && spikeReactionTarget) positionReactionTray(spikeReactionTarget);
  },{passive:true});
}
initReactionPickerDismiss();

// ─── POST SHARE SHEET ───────────────────────────────────
function spikePostShareUrl(id){ return new URL(`feed.html?post=${encodeURIComponent(id)}`, location.href).href; }
function openPostShare(id){
  const p=state.posts.find(x=>String(x.id)===String(id));
  if(!p)return;
  state.activePost=id;
  const overlay=$('spikePostShareOverlay');
  const preview=$('spikePostSharePreview');
  if(preview){
    const text=String(p.content||'Signal').trim();
    preview.innerHTML=`<span class="spike-share-preview-kicker">SHARE SIGNAL</span><b>${esc(nameOf(authorFor(p)))}</b><span>${esc(text.slice(0,220))}${text.length>220?'…':''}</span>`;
  }
  overlay?.classList.add('open');
  overlay?.setAttribute('aria-hidden','false');
  setTimeout(()=>overlay?.querySelector('[data-post-share-action]')?.focus(),30);
}
function closePostShare(){
  const overlay=$('spikePostShareOverlay');
  overlay?.classList.remove('open');
  overlay?.setAttribute('aria-hidden','true');
}
async function sharePostExternally(id){
  const p=state.posts.find(x=>String(x.id)===String(id));
  if(!p||!window.SPIKEShare){toast('Sharing is unavailable right now','error');return;}
  const payload={title:`${nameOf(authorFor(p))} on SPIKE`,text:String(p.content||'A Signal from SPIKE').trim(),url:spikePostShareUrl(id)};
  try{
    const prepared=await window.SPIKEShare.prepare(payload);
    const result=await window.SPIKEShare.sharePrepared(prepared);
    if(result.method==='copied-link') toast('Signal link copied','success');
    else if(result.method!=='none'){ await recordCreatorEngagement(id,'share'); queueFeedEvent(id,'share',{metadata:{surface:'post_share',method:result.method}}); toast('Share sheet opened','success'); }
    else toast('Sharing unavailable — copy the Signal link instead.','error');
  }catch(e){ if(e?.name!=='AbortError') toast(e?.message||'Device sharing unavailable','error'); }
}
async function copyPostShareLink(id){
  try{ await copyTextSafe(spikePostShareUrl(id)); toast('Signal link copied','success'); }
  catch(_){ toast('Copy unavailable — press and hold the link.','error'); }
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

/* Legacy post media studio/upload pipeline removed with the old composer. */


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
function cloudinaryFeedAttachmentUrl(url, filename) {
  const raw=safeHttpUrl(url); if(!raw)return '';
  if(!/cloudinary\.com/i.test(raw))return raw;
  try {
    const u=new URL(raw);
    const marker='/upload/';
    const i=u.pathname.indexOf(marker);
    if(i<0)return raw;
    const tail=cloudinaryVideoAssetTail(u.pathname,i);
    if(!tail)return raw;
    const safeName=String(filename||'SPIKE-feed-download').trim()
      .replace(/[^a-z0-9._-]/gi,'-').replace(/-+/g,'-') || 'SPIKE-feed-download';
    u.pathname=u.pathname.slice(0,i+marker.length)+`fl_attachment:${encodeURIComponent(safeName)}/`+tail;
    return u.toString();
  } catch (_) { return raw; }
}

async function downloadFeedMediaInApp(url, filename, kind, button) {
  if (!url) { toast('Media is not available', 'error'); return; }
  if (button?.dataset.busy === '1') return;
  if (button) { button.dataset.busy='1'; button.disabled=true; button.classList.add('is-busy'); }
  try {
    const requestedName=String(filename||`SPIKE-media.${kind==='video'?'mp4':'jpg'}`).trim();
    const sourceUrl=safeHttpUrl(url);
    if (!sourceUrl) throw new Error('Media URL is invalid.');

    // Android app path: hand the authenticated SPIKE proxy URL to the native
    // DownloadManager bridge. Native Android owns the filesystem destination
    // (/storage/emulated/0/Download) and the WebView stays on the current page.
    // Never hand the Cloudinary URL directly to Android.
    const isAndroidApp=/Android/i.test(navigator.userAgent||'');
    const androidBridge=window.SPIKEAndroidDownload;
    if(isAndroidApp && androidBridge && typeof androidBridge.download==='function'){
      const sessionResult=await db.auth.getSession();
      const accessToken=sessionResult?.data?.session?.access_token;
      if(!accessToken) throw new Error('Please sign in again to download this media.');
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
    if(!accessToken) throw new Error('Please sign in again to download this media.');
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
    console.error('downloadFeedMediaInApp',e);
    toast(e?.message || 'Could not download media','error');
  } finally {
    if (button) { button.dataset.busy='0'; button.disabled=false; button.classList.remove('is-busy'); }
  }
}
// Feed-post video downloads use the shared in-app media helper.
async function downloadWatermarkedVideoUrl(url, filename, button) {
  return downloadFeedMediaInApp(url, filename, 'video', button);
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