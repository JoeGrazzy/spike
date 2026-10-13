
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
  user: null, profile: {}, posts: [], users: new Map(),
  saved: new Set(), following: new Set(), muted: new Set(), blocked: new Set(),
  filter: "forYou", media: null, mediaType: null, mediaItems: [], activeMediaIndex: 0, mediaLayout: "auto",
  activePost: null, activeComment: null, customFeed: null,
  visiblePosts: 20, loadingMore: !1, allLoaded: !1, expandedCaptions: new Set(), realtimeRetryTimer: null, realtimeRetryAttempt: 0, realtimeStarting: false, realtimeRefreshTimer: null, postsLoadGeneration: 0
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
function applyTheme(theme) { const n = Number(theme); if (window.SPIKE_THEME && [1,2,3].includes(n)) window.SPIKE_THEME.set(n); }
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
  return true;
}

// ─── DATA LOADING ──────────────────────────────────────
async function loadAux() {
  const mePromise = withTimeout(getDoc(`users/${state.user.id}`).catch(() => null), 6000, "User settings").catch(() => null);
  const blocksPromise = withTimeout(db.from("feed_blocks").select("blocked_id").eq("blocker_id", state.user.id), 8000, "Block list").catch(() => ({ data: [] }));
  const ids = [...new Set([
    ...state.posts.map(p => p.authorUid),
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
  const requestedUserId = String(state.user?.id || '');
  if (!requestedUserId) throw new Error('Authentication required to load the feed.');
  const generation = ++state.postsLoadGeneration;
  const rows = await withTimeout(listCollection('posts', ''), 10000, "Posts loading");

  // Requests can overlap (boot, refresh, realtime). Only the newest response
  // for the still-active user may replace the canonical in-memory feed.
  if (generation !== state.postsLoadGeneration || requestedUserId !== String(state.user?.id || '')) return;

  const posts = rows.map(r => normalizeSignalModel({ id: r.document_id, ...(r.data || {}) })).filter(p => {
    if (!p.id || p.deleted) return false;
    const scheduled = p.scheduledAt && new Date(p.scheduledAt) > new Date();
    return !scheduled || p.authorUid === requestedUserId;
  });
  if (generation !== state.postsLoadGeneration || requestedUserId !== String(state.user?.id || '')) return;
  state.posts = posts;
  rankingDirty = true;
  rankingCache.clear();
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

// Narrow bridge for the independent Signal Studio module; keeps the retired composer API retired.
window.SPIKEUploadToCloudinary = uploadToCloudinary;
