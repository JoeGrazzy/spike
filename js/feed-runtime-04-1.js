
"use strict";
// ─── CONFIG ──────────────────────────────────────────────
const CLOUDINARY_CONFIG = { cloudName: 'vhmoz6a0', uploadPreset: 'spike_present', videoEagerTransform: '' };
const SUPABASE_URL = "https://cjqpyndceqyqsijihxbb.supabase.co";
const SUPABASE_KEY = "sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: !0, autoRefreshToken: !0, detectSessionInUrl: !1, flowType: "pkce" } });
window.sb = db;
window.supabaseClient = db;

// ─── HELPERS ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const now = () => new Date().toISOString();
const toast = window.spikePremiumToast || ((msg, type, ms) => {
  type = type || 'info';
  const el = document.getElementById('toast');
  if (!el) return;
  const icon = el.querySelector('.toast-icon');
  const title = el.querySelector('.toast-title');
  const message = el.querySelector('.toast-message');
  const progress = el.querySelector('.toast-progress');
  el.className = 'toast ' + type;
  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : '✦';
  title.textContent = type === 'success' ? 'Success' : type === 'error' ? 'Error' : type === 'warning' ? 'Warning' : 'SPIKE';
  message.textContent = String(msg || '');
  progress.style.animation = 'none';
  void progress.offsetWidth;
  progress.style.animation = `toastProgress ${ms || 3600}ms linear forwards`;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), (ms || 3600) + 200);
});

// ─── STATE ──────────────────────────────────────────────
const state = {
  user: null, profile: {}, posts: [], stories: [], users: new Map(),
  saved: new Set(), following: new Set(), muted: new Set(), blocked: new Set(), storyViewed: new Set(),
  filter: "latest", media: null, mediaType: null, mediaItems: [], activeMediaIndex: 0, mediaLayout: "auto",
  activePost: null, activeComment: null, activeStory: null, customFeed: null,
  visiblePosts: 20, loadingMore: !1, allLoaded: !1, expandedCaptions: new Set(), realtimeRetryTimer: null, realtimeRetryAttempt: 0, realtimeStarting: false, realtimeRefreshTimer: null
};
window.state = state;
try { const cf=JSON.parse(localStorage.getItem('spike-active-custom-feed')||'null'); if(cf&&typeof cf==='object') { state.customFeed=cf; window.SPIKE_ACTIVE_CUSTOM_FEED=cf; } } catch(_) {}

// ─── SUPABASE HELPERS ───────────────────────────────────
const SPIKE_VIDEO_DELIVERY_TRANSFORM = 'f_mp4,vc_h264:baseline:3.1,ac_aac,q_auto:good';
const SPIKE_VIDEO_FALLBACK_TRANSFORM = 'f_mp4,vc_h264,ac_aac,q_auto:good';

function cloudinaryWatermarkedVideoUrl(secureUrl, spid) {
  const url = String(secureUrl || '');
  const id = String(spid || '').trim();
  if (!url || !id || !/\/video\/upload\//i.test(url)) return url;
  const enc = encodeURIComponent(id).replace(/%/g, '%25');
  const sparkle = encodeURIComponent('✦').replace(/%/g, '%25');
  const transforms = [
    SPIKE_VIDEO_DELIVERY_TRANSFORM,
    `l_text:Arial_28_bold:SPIKE,co_rgb:EC4899/e_glow:8/fl_layer_apply,g_south_west,x_38,y_24`,
    `l_text:Arial_22_bold:${enc},co_rgb:22C55E/e_glow:8/fl_layer_apply,g_south_west,x_116,y_27`,
    `l_text:Arial_28_bold:${sparkle},co_rgb:F97316/e_glow:10/fl_layer_apply,g_south_west,x_16,y_22`
  ].join('/');
  return cloudinaryVideoTransformUrl(url, transforms);
}

async function uploadCloudinaryChunked(file, endpoint, folder, options = {}) {
  const CHUNK_SIZE = 20 * 1024 * 1024;
  const uploadId = (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g,'');
  let lastResponse = null;
  for (let start = 0, part = 1; start < file.size; start += CHUNK_SIZE, part++) {
    const end = Math.min(file.size, start + CHUNK_SIZE) - 1;
    const blob = file.slice(start, end + 1);
    let partError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        lastResponse = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const timer = setTimeout(() => { try { xhr.abort(); } catch (_) {} reject(new Error('Cloudinary chunk upload timed out')); }, 90000);
          xhr.open('POST', endpoint, true);
          xhr.responseType = 'json';
          xhr.setRequestHeader('X-Unique-Upload-Id', uploadId);
          xhr.setRequestHeader('Content-Range', `bytes ${start}-${end}/${file.size}`);
          xhr.upload.onprogress = e => {
            if (e.lengthComputable) {
              const overall = (start + e.loaded) / file.size;
              options.onProgress?.(Math.max(0, Math.min(1, overall)), part, part);
            }
          };
          xhr.onerror = () => reject(new Error('Cloudinary chunk upload failed. Check your connection.'));
          xhr.ontimeout = () => reject(new Error('Cloudinary chunk upload timed out'));
          xhr.onabort = () => reject(new Error('Cloudinary chunk upload cancelled'));
          xhr.onload = () => {
            clearTimeout(timer);
            const d = xhr.response || (() => { try { return JSON.parse(xhr.responseText || '{}'); } catch (_) { return {}; } })();
            if (xhr.status >= 200 && xhr.status < 300 && (d.done === false || d.secure_url)) resolve(d);
            else reject(new Error(d.error?.message || `Cloudinary chunk upload failed (${xhr.status})`));
          };
          const form = new FormData();
          form.append('file', blob, file.name || `chunk-${part}`);
          form.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
          form.append('folder', folder);
          xhr.send(form);
        });
        break;
      } catch (e) {
        partError = e;
        if (attempt < 3) await new Promise(r => setTimeout(r, 800 * attempt));
      }
    }
    if (!lastResponse || !lastResponse.secure_url && partError) throw partError;
  }
  if (!lastResponse?.secure_url) throw new Error('Cloudinary did not return a completed video asset.');
  return lastResponse;
}

async function uploadToCloudinary(file, folder = "spike", options = {}) {
  if (!file) return null;
  const type=String(file.type||'');
  const maxBytes=type.startsWith('video/')?100*1024*1024:type.startsWith('image/')?10*1024*1024:type.startsWith('audio/')?10*1024*1024:0;
  if(!maxBytes) throw new Error('Unsupported media type.');
  if(file.size>maxBytes) throw new Error(`File is too large. Maximum size is ${type.startsWith('video/')?'100 MB':type.startsWith('image/')?'10 MB':'10 MB'}.`);

  const isVideo=type.startsWith('video/');
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/${isVideo?'video':'auto'}/upload`;
  let lastError=null;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const data = (isVideo && file.size > 20 * 1024 * 1024)
        ? await uploadCloudinaryChunked(file, endpoint, folder, options)
        : await new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest();
        const timer=setTimeout(()=>{try{xhr.abort()}catch(_){} reject(new Error('Cloudinary upload timed out'));},90000);
        xhr.open('POST',endpoint,true); xhr.responseType='json';
        xhr.upload.onprogress=e=>{if(e.lengthComputable) options.onProgress?.(e.loaded/e.total,attempt);};
        xhr.onerror=()=>reject(new Error('Cloudinary upload failed. Check your connection.'));
        xhr.ontimeout=()=>reject(new Error('Cloudinary upload timed out'));
        xhr.onabort=()=>reject(new Error('Cloudinary upload cancelled'));
        xhr.onload=()=>{
          clearTimeout(timer);
          const d=xhr.response||(()=>{try{return JSON.parse(xhr.responseText||'{}')}catch(_){return{}}})();
          if(xhr.status>=200&&xhr.status<300&&d.secure_url)resolve(d);
          else reject(new Error(d.error?.message||`Cloudinary upload failed (${xhr.status})`));
        };
        const form=new FormData();
        form.append('file',file);
        form.append('upload_preset',CLOUDINARY_CONFIG.uploadPreset);
        form.append('folder',folder);
        // If the preset permits eager transforms, request a pre-generated Android-safe MP4.
        // Unsigned presets may reject this parameter; that is handled by the normal delivery fallback.
        if(isVideo && options.eagerVideo !== false && CLOUDINARY_CONFIG.videoEagerTransform){
          form.append('eager', CLOUDINARY_CONFIG.videoEagerTransform);
        }
        xhr.send(form);
      });

      if(isVideo){
        const spid=spIdOf(state.profile)||spIdOf(state.user)||'';
        const originalUrl=data.secure_url;
        const eagerUrl=data.eager?.[0]?.secure_url || '';
        let playbackUrl=eagerUrl || cloudinaryFeedVideoUrl(originalUrl);
        let watermarked=false;
        if(options.watermark){
          if(!spid) throw new Error('Your SP ID could not be verified for this video.');
          playbackUrl=cloudinaryWatermarkedVideoUrl(originalUrl,spid);
          watermarked=true;
        }
        return {url:playbackUrl,playbackUrl,originalUrl,watermarked,spid:watermarked?spid:null,normalized:true,format:'mp4',videoCodec:'h264',audioCodec:'aac'};
      }
      return{url:data.secure_url,playbackUrl:data.secure_url,originalUrl:data.secure_url,watermarked:false,spid:null,normalized:false};
    }catch(e){
      lastError=e;
      if(attempt<3)await new Promise(r=>setTimeout(r,700*attempt));
    }
  }
  throw lastError||new Error('Cloudinary upload failed');
}
async function docPath(path) { return db.from("app_documents").select("data,created_at").eq("path", path).maybeSingle(); }
async function getDoc(path) { const r = await docPath(path); if (r.error) throw r.error; return r.data?.data || null; }
async function putDoc(path, data, parent = "") {
  if (!state.user?.id) throw new Error("Authentication required");
  const old = await docPath(path);
  const row = {
    path,
    parent_path: (parent && parent !== path.split("/")[0]) ? parent : "",
    collection_name: path.split("/").slice(0, -1).join("/") || path.split("/")[0],
    document_id: path.split("/").pop(),
    owner_id: state.user.id,
    data,
    updated_at: now(),
    created_at: old.data?.created_at || now()
  };
  const r = await db.from("app_documents").upsert(row, { onConflict: "path" });
  if (r.error) throw r.error;
  return data;
}
async function listCollection(collection, parent = "") {
  let q;
  if(collection === 'posts' && !parent){
    q = db.from('spike_recommendation_eligible_posts').select('document_id,data,created_at');
  } else {
    q = db.from("app_documents").select("document_id,data,created_at").eq("collection_name", collection);
  }
  if (parent) q = q.eq("parent_path", parent);
  const r = await q;
  if (r.error) throw r.error;
  return r.data || [];
}
function withTimeout(promise, ms, label = "Request") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}
async function copyTextSafe(value) {
  const text = String(value ?? '');
  if (!text) throw new Error('Nothing to copy');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const ta=document.createElement('textarea');
  ta.value=text; ta.setAttribute('readonly','');
  ta.style.position='fixed'; ta.style.left='-9999px'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0,text.length);
  try { if(!document.execCommand('copy')) throw new Error('Copy unavailable'); return true; }
  finally { ta.remove(); }
}

// ─── AUTH / PROFILE ─────────────────────────────────────
function nameOf(u) { return u?.display_name || u?.full_name || u?.name || u?.email || "User"; }
function spIdOf(u) {
  const value = u?.sp_id || u?.spId || u?.spID || u?.spike_id || u?.spikeId ||
                u?.lifetime_sp_id || u?.lifetimeSpId || u?.sp_identifier ||
                u?.spIdentifier || u?.authorSpId || u?.authorSPID;
  return value ? String(value).trim() : "";
}
function videoWatermarkForSignal(mediaItem, post) {
  return (!mediaItem?.watermarked && !post?.mediaWatermarked) ? videoWatermarkHTML(post) : '';
}
function videoWatermarkHTML(entity) {
  const author = entity?.authorUid ? authorFor(entity) : entity;
  const spid = spIdOf(entity) || spIdOf(author);
  if (!spid) return "";
  return `<div class="spike-video-watermark" aria-hidden="true"><span class="spike-wm-spark">✦</span><span class="spike-wm-brand">SPIKE</span><span class="spike-wm-id">• ${esc(spid)}</span></div>`;
}

function isVerified(u) { return u?.verified === true || u?.is_verified === true; }
function verifiedBadgeHTML(u, extraClass="") {
  return isVerified(u) ? `<span class="verified-badge ${extraClass}" aria-label="Verified account" title="Verified account">✓</span>` : "";
}
function avatarOf(u) { return u?.avatar_url || u?.avatar || ""; }
function identityAvatar(u, cls="spike-avatar", label){ return window.SPIKE_IDENTITY.avatarMarkup(u, cls, label||nameOf(u)); }
function profileLink(id) { const uid=String(id||""); return uid && uid===String(state.user?.id||"") ? `profile.html?uid=${encodeURIComponent(uid)}` : `view_user.html?uid=${encodeURIComponent(uid)}`; }
function applyTheme(theme) { const n = Number(theme); if (window.SPIKE_THEME && Number.isFinite(n)) window.SPIKE_THEME.set(n); }
function initTheme() { if (window.SPIKE_THEME) window.SPIKE_THEME.set(window.SPIKE_THEME.get()); }

async function requireUser() {
  const { data, error } = await withTimeout(db.auth.getSession(), 15000, "Session check");
  if (error || !data.session?.user) { location.replace("index.html?reauth=1"); return false; }
  state.user = data.session.user;
  db.auth.getUser().then(({data})=>{ if(data?.user) window.AppPresence?.start(db); });
  const p = await withTimeout(db.rpc('get_public_profiles', { p_user_ids: [state.user.id] }), 8000, "Profile loading");
  if (p.error) throw p.error;
  const ext = await withTimeout(getDoc(`users/${state.user.id}`).catch(() => null), 6000, "User settings").catch(() => null);
  state.profile = { ...(p.data?.[0] || {}), ...(ext || {}), id: state.user.id };
  const composerAvatar = $("composerAvatar");
  if (composerAvatar) {
    const avatar = avatarOf(state.profile);
    composerAvatar.innerHTML = identityAvatar(state.profile,"spike-avatar",nameOf(state.profile));
  }
  return true;
}

// ─── DATA LOADING ──────────────────────────────────────
async function loadAux() {
  const mePromise = withTimeout(getDoc(`users/${state.user.id}`).catch(() => null), 6000, "User settings").catch(() => null);
  const blocksPromise = withTimeout(db.from("feed_blocks").select("blocked_id").eq("blocker_id", state.user.id), 8000, "Block list").catch(() => ({ data: [] }));
  const ids = [...new Set([
    ...state.posts.map(p => p.authorUid),
    ...state.stories.map(st => st.authorUid),
    state.user.id
  ].filter(Boolean))];
  const profilesPromise = (async () => {
    const out = [];
    for (let i = 0; i < ids.length; i += 100) {
      const r = await withTimeout(db.rpc('get_public_profiles', { p_user_ids: ids.slice(i, i + 100) }), 8000, 'Public profiles');
      if (r.error) throw r.error;
      out.push(...(r.data || []));
    }
    return out;
  })();
  const [profiles, me, blocks] = await Promise.all([profilesPromise, mePromise, blocksPromise]);
  for (const u of profiles) {
    if (!u?.id) continue;
    state.users.set(String(u.id), { ...(state.users.get(String(u.id)) || {}), ...u, id: String(u.id) });
  }
  state.users.set(state.user.id, { ...(state.users.get(state.user.id) || {}), ...state.profile, id: state.user.id });
  state.saved = new Set(me?.savedPosts || me?.saved || []);
  state.following = new Set(me?.following || []);
  state.muted = new Set(me?.mutedAuthors || []);
  state.blocked = new Set((blocks.data || []).map(x => x.blocked_id).filter(Boolean));
}

// ─── STORIES ──────────────────────────────────────────
async function loadStories() {
  const previous = Array.isArray(state.stories) ? state.stories.slice() : [];
  try {
    const { data: rows, error } = await withTimeout(db.from("app_documents").select("document_id,data,created_at").eq("collection_name", "stories"), 10000, "Stories loading");
    if (error) throw error;
    const nowMs = Date.now();
    state.stories = (rows || []).map(r => ({ id:r.document_id, ...(r.data || {}) })).filter(s => {
      if (s.deleted) return false;
      const created = new Date(s.createdAt || s.created_at || 0).getTime();
      const expiresRaw = s.expiresAt || s.expires_at;
      const expires = expiresRaw ? new Date(expiresRaw).getTime() : (created ? created + 86400000 : 0);
      return expires > nowMs;
    });
    await loadStoryReadState();
    renderStories();
  } catch (e) { console.warn('loadStories failed', e); state.stories = previous; renderStories(); }
}

async function loadStoryReadState() {
  state.storyViewed = state.storyViewed instanceof Set ? state.storyViewed : new Set();
  if (!state.user?.id || !state.stories.length) return;
  try {
    const ids = state.stories.map(s => s.id).filter(Boolean);
    const { data, error } = await withTimeout(db.from('story_views').select('story_id').eq('user_id', state.user.id).in('story_id', ids), 8000, 'Story read state');
    if (error) throw error;
    state.storyViewed = new Set((data || []).map(x => x.story_id));
  } catch (e) { console.warn('story read state unavailable', e); }
}

function storyRank(s) {
  const created = new Date(s.createdAt || s.created_at || 0).getTime() || 0;
  const ageHours = Math.max(0, (Date.now() - created) / 3600000);
  const freshness = Math.max(0, 24 - ageHours) / 24;
  const unseen = state.storyViewed?.has(s.id) ? 0 : 1;
  const relationship = s.authorUid === state.user?.id ? 100 : (state.following?.has(s.authorUid) ? 45 : 0);
  const engagement = Math.min(20, Number(s.views || 0) * .05 + Number(s.replies || 0) * 1.5 + Number(s.reactions || 0) * 1.2);
  const mediaQuality = s.mediaType === 'image' || s.mediaType === 'video' ? 4 : 1;
  return relationship + unseen * 70 + freshness * 28 + engagement + mediaQuality;
}

function isGifUrl(url){ return /\.gif(?:[?#].*)?$/i.test(String(url||'')); }
function mediaKindOf(item){
  const type=String(item?.type||item?.mediaType||'').toLowerCase();
  const urls=[item?.url,item?.mediaUrl,item?.originalUrl,item?.playbackUrl].map(x=>String(x||'')).filter(Boolean);
  const mime=String(item?.mimeType||item?.mime||'').toLowerCase();
  // GIFs are animated images, never HTML5 video sources. Check every stored
  // URL (including original/playback URLs) before trusting a legacy mediaType.
  // This prevents a GIF whose delivery URL was converted to .mp4 from being
  // rendered inside <video>, which causes Android to show "format not supported".
  if(type==='gif' || /image\/gif/i.test(mime) || urls.some(isGifUrl)) return 'gif';
  return type==='video' ? 'video' : 'image';
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

function storyCardMediaUrl(url, kind='image') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (!u.hostname.includes('cloudinary.com')) return raw;
    const marker='/upload/'; const i=u.pathname.indexOf(marker); if(i<0)return raw;
    const transform = kind==='video' ? 'so_0,f_jpg,q_auto:eco,w_360,h_504,c_fill,g_auto' : 'f_auto,q_auto:eco,w_360,h_504,c_fill,g_auto,dpr_auto';
    u.pathname=u.pathname.slice(0,i+marker.length)+transform+'/'+u.pathname.slice(i+marker.length);
    if(kind==='video') u.pathname=u.pathname.replace(/\.(mp4|webm|mov|m4v)$/i,'.jpg');
    return u.toString();
  } catch (_) { return raw; }
}

function storyFullMediaUrl(url, kind='image') {
  const raw=String(url||'').trim(); if(!raw)return '';
  try{const u=new URL(raw);if(!u.hostname.includes('cloudinary.com'))return raw;const marker='/upload/';const i=u.pathname.indexOf(marker);if(i<0)return raw;u.pathname=u.pathname.slice(0,i+marker.length)+(kind==='video'?'f_mp4,vc_h264,ac_aac,q_auto:good':'f_auto,q_auto:good,w_1080,h_1920,c_limit')+'/'+u.pathname.slice(i+marker.length);if(kind==='video')u.pathname=u.pathname.replace(/\.(mov|m4v|webm|avi)$/i,'.mp4');return u.toString();}catch(_){return raw;}
}

function storyAvatarUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (!u.hostname.includes('cloudinary.com')) return raw;
    const marker='/upload/'; const i=u.pathname.indexOf(marker); if(i<0)return raw;
    u.pathname=u.pathname.slice(0,i+marker.length)+'f_auto,q_auto:eco,w_64,h_64,c_fill,g_face/'+u.pathname.slice(i+marker.length);
    return u.toString();
  } catch (_) { return raw; }
}

function renderStories() {
  const row = $('storiesRow');
  if (!row) return;
  const nowMs = Date.now();
  const groups = new Map();
  for (const s of (state.stories || [])) {
    if (!s || s.deleted) continue;
    const expires = new Date(s.expiresAt || s.expires_at || 0).getTime();
    if (expires && expires <= nowMs) continue;
    const key = s.authorUid || s.authorName || s.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const grouped = [...groups.entries()].map(([authorUid, stories]) => {
    const sorted = stories.slice().sort((a,b)=>(new Date(b.createdAt||b.created_at||0))-(new Date(a.createdAt||a.created_at||0)));
    const unread = sorted.filter(s => !state.storyViewed?.has(s.id));
    const preview = unread[0] || sorted[0];
    const author = state.users.get(authorUid) || {id:authorUid,name:preview.authorName||'User',avatar_url:preview.authorAvatar||''};
    return {authorUid,author,stories:sorted,preview,unread,score:Math.max(...sorted.map(storyRank))};
  }).sort((a,b)=>{
    if (a.authorUid === state.user?.id) return -1;
    if (b.authorUid === state.user?.id) return 1;
    return b.score-a.score;
  });
  if (!grouped.length) { row.innerHTML='<div class="empty" style="width:100%;padding:12px">No stories yet. Create the first one.</div>'; return; }
  const fragment=document.createDocumentFragment();
  grouped.forEach((g,idx)=>{
    const story=g.preview, card=document.createElement('button');
    card.type='button'; card.className=`story ${g.unread.length?'story-ring-unread':'story-ring-read'}`;
    card.dataset.story=story.id; card.dataset.storyAuthor=g.authorUid;
    card.setAttribute('aria-label',`${g.authorUid===state.user?.id?'Your Story':nameOf(g.author)}${g.stories.length>1?`, ${g.stories.length} stories`:''}`);
    const wrap=document.createElement('span'); wrap.className='story-preview';
    const storyKind=mediaKindOf(story);
    const media=story?.mediaUrl ? storyCardMediaUrl(story.mediaUrl,storyKind==='video'?'video':'image') : '';
    if(media){
      const img=document.createElement('img'); img.className='story-preview-media'; img.src=media; img.alt=''; img.width=84; img.height=118;
      img.loading=idx<4?'eager':'lazy'; img.decoding='async';
      if(idx<2) img.fetchPriority='high';
      img.onerror=()=>{img.remove(); const f=document.createElement('span'); f.className='story-preview-fallback'; f.textContent=(story?.text||nameOf(g.author)||'S').trim().slice(0,1).toUpperCase(); wrap.prepend(f);};
      wrap.appendChild(img);
    } else {
      const t=document.createElement('span'); t.className='story-preview-text'; t.textContent=(story?.text||nameOf(g.author)||'S').trim().slice(0,1).toUpperCase(); wrap.appendChild(t);
    }
    if(g.unread.length){const dot=document.createElement('span');dot.className='story-new-dot';dot.setAttribute('aria-hidden','true');wrap.appendChild(dot);}
    const avatar=storyAvatarUrl(avatarOf(g.author));
    const badge=document.createElement('span');badge.className='story-avatar-badge';badge.innerHTML=identityAvatar(g.author,'story-avatar',nameOf(g.author));wrap.appendChild(badge);
    if(g.stories.length>1){const count=document.createElement('b');count.className='story-count';count.textContent=String(g.stories.length);wrap.appendChild(count);}
    if(g.authorUid===state.user?.id){const add=document.createElement('b');add.className='story-add';add.textContent='+';wrap.appendChild(add);}
    card.appendChild(wrap);
    const label=document.createElement('span');label.textContent=g.authorUid===state.user?.id?'Your Story':nameOf(g.author);card.appendChild(label);
    fragment.appendChild(card);
  });
  row.replaceChildren(fragment);
}

// ─── POSTS ─────────────────────────────────────────────
// Client-side canonical model: reactions is the only reaction store. Legacy
// likes arrays returned by older RPCs are normalized into reactions.like_users.
function normalizeReactionModel(raw) {
  const reactions = raw && typeof raw === 'object' ? { ...(raw.reactions || {}) } : {};
  const legacyLikes = Array.isArray(raw?.likes) ? raw.likes.filter(Boolean).map(String) : [];
  const likeUsers = Array.isArray(reactions.like_users) ? reactions.like_users.filter(Boolean).map(String) : legacyLikes;
  reactions.like_users = [...new Set(likeUsers)];
  reactions.like = reactions.like_users.length;
  for (const [k, v] of Object.entries(reactions)) {
    if (!k.endsWith('_users') && Number(v) < 0) reactions[k] = 0;
  }
  return reactions;
}
function normalizeSignalModel(p) {
  if (!p || typeof p !== 'object') return p;
  p.reactions = normalizeReactionModel(p);
  delete p.likes;
  return p;
}
function reactionLikeUsers(p) {
  return new Set(Array.isArray(p?.reactions?.like_users) ? p.reactions.like_users.map(String) : []);
}
function reactionLikeCount(p) { return reactionLikeUsers(p).size; }

async function loadSignals() {
  const rows = await withTimeout(listCollection('posts', ''), 10000, "Posts loading");
  state.posts = rows.map(r => normalizeSignalModel({ id: r.document_id, ...(r.data || {}) })).filter(p => {
    if (!p.id || p.deleted) return false;
    const scheduled = p.scheduledAt && new Date(p.scheduledAt) > new Date();
    return !scheduled || p.authorUid === state.user.id;
  });
  rankingDirty=true; rankingCache.clear();
}

const SPIKE_REACTIONS = ["❤️","👍","😂","😮","😢","🔥"];

function normalizedReactionEntries(p) {
  const raw = p?.reactions || {};
  return Object.entries(raw)
    .filter(([emoji, value]) => !emoji.endsWith("_users") && Number(value) > 0)
    .map(([emoji, count]) => [emoji, Number(count)])
    .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function signalMetrics(p) {
  const likes = reactionLikeCount(p);
  const comments = Array.isArray(p?.comments) ? p.comments.length : 0;
  const reactions = normalizedReactionEntries(p).reduce((n, [,count]) => n + count, 0);
  const totalReactions = reactions;
  const saves = Number(p?.saveCount || p?.savesCount || p?.bookmarkCount || 0);
  return { likes, comments, reactions, totalReactions, saves };
}

// ─── SIGNAL STRENGTH RANKING ─────────────────────────────
// Signal Strength keeps the product-defined 40/30/20/10 foundation while
// enriching each signal with momentum, quality, topic affinity, fatigue,
// negative feedback and controlled exploration.
/* ========================= FEED RANKING V3 =========================
 * Contracts: each feed has its own scoring semantics. Base score is 100%
 * of documented weights; modifiers are bounded and explicitly exposed.
 * All rank functions are pure: state arrives through ctx; no I/O occurs.
 */
