"use strict";
const CLOUDINARY_CONFIG = {
cloudName: 'vhmoz6a0',
uploadPreset: 'spike_present'
};
const db=window.SPIKE_PLATFORM?.getClient?.();
if(!db) throw new Error("SPIKE Platform connection service is unavailable.");
window.sb=db;
window.supabaseClient=db;
async function uploadToCloudinary(file, folder="spike"){
if(!file) return null;
const allowed=["image/jpeg","image/png","image/webp","image/gif"];
if(!allowed.includes(file.type)) throw new Error("Use JPG, PNG, WEBP, or GIF.");
if(file.size>10*1024*1024) throw new Error("Image must be 10MB or smaller.");
const endpoint=`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/auto/upload`;
const form=new FormData();
form.append("file",file);
form.append("upload_preset",CLOUDINARY_CONFIG.uploadPreset);
form.append("folder",folder);
const controller=new AbortController();
const timeout=setTimeout(()=>controller.abort(),30000);
let r;
try { r=await fetch(endpoint,{method:"POST",body:form,signal:controller.signal}); }
catch(err){ if(err?.name==="AbortError") throw new Error("Cloudinary upload timed out. Please try again."); throw err; }
finally { clearTimeout(timeout); }
const data=await r.json().catch(()=>({}));
if(!r.ok || !data.secure_url) throw new Error(data.error?.message||"Cloudinary upload failed");
return data.secure_url;
}
const $=id=>document.getElementById(id),now=()=>new Date().toISOString();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const spikeIcon=(name,cls="spike-icon")=>{
 const paths={
  lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  play:'<path d="m8 5 12 7-12 7V5Z"/>',
  layers:'<rect x="4" y="4" width="13" height="13" rx="2"/><path d="M8 20h10a2 2 0 0 0 2-2V8"/>',
  pin:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  arrowLeft:'<path d="m15 18-6-6 6-6M9 12h12"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4m-6.6 9 6.6 4.4"/>',
  heart:'<path d="M20.8 8.7c0 5.1-8.8 11-8.8 11s-8.8-5.9-8.8-11A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5Z"/>',
  bookmark:'<path d="M6 4h12v17l-6-4-6 4V4Z"/>',
  message:'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  external:'<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  whatsapp:'<path d="M20.2 11.7a8.2 8.2 0 0 1-12.1 7.2L3 20l1.2-4.8a8.2 8.2 0 1 1 16-3.5Z"/><path d="M8.2 8.1c.3-.6.6-.6 1-.6h.5c.2 0 .4.1.5.4l.8 1.8c.1.2.1.4-.1.6l-.6.7c-.2.2-.2.4-.1.6.5.9 1.3 1.7 2.3 2.2.2.1.4.1.6-.1l.8-.9c.2-.2.4-.2.7-.1l1.7.8c.3.1.4.3.4.5 0 .4-.2 1.1-.6 1.5-.4.4-1.1.7-1.8.7-.5 0-1.2-.2-2-.5-1.1-.5-2.3-1.4-3.2-2.4-.9-1-1.5-2.1-1.7-2.9-.2-.8 0-1.5.4-2.3Z"/>',
  close:'<path d="m18 6-12 12M6 6l12 12"/>',
  wallet:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2M6 6V4h12v2"/>',
  gift:'<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M2 8h20v4H2zM12 8H8.5a2.5 2.5 0 1 1 2.5-2.5V8Zm0 0h3.5A2.5 2.5 0 1 0 13 5.5V8Z"/>'
 };
 return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||paths.eye}</svg>`;
};

const nameOf=u=>u?.display_name||u?.full_name||u?.name||u?.email||"User",avatarOf=u=>u?.avatar_url||u?.avatar||"";
const profileLink=id=>`profile.html?uid=${encodeURIComponent(id)}`;
const state={me:null,uid:null,profile:null,referralCode:null,posts:[],following:false,followers:0,followingIds:[],activePost:null,realtime:null,views:0,canSeePosts:true,canSeeMedia:true,canSeeOnline:false,canSeeFriends:true,privacyLoadError:false,socialRealtime:[],cover:{url:"",position_x:0,position_y:0,zoom:1,fit:"cover"}};
function syncThemeColor(){try{const meta=document.querySelector('meta[name="theme-color"]');if(meta){const bg=getComputedStyle(document.documentElement).getPropertyValue('--spike-bg').trim();if(bg)meta.setAttribute('content',bg)}}catch(_){}}
document.addEventListener('spike:theme-change',syncThemeColor);
function toast(s,type,ms){spikePremiumToast(s,type,ms||3200)}
function open(id){const el=$(id);if(!el){console.warn(`[SPIKE UI] Cannot open missing element: ${id}`);return false;}el.classList.add("open");return true;}function close(id){const el=$(id);if(!el){console.warn(`[SPIKE UI] Cannot close missing element: ${id}`);return false;}el.classList.remove("open");return true;}
// Shared by menu bindings and QR handlers declared outside bind(). Keep this at module scope.
function closeProfileMenu(){const menu=$("menuOverlay"),button=$("menuBtn");if(!menu)return;close("menuOverlay");menu.setAttribute("aria-hidden","true");button?.setAttribute("aria-expanded","false");}
function ago(v){const d=new Date(v);if(!v||isNaN(d))return"Just now";const s=(Date.now()-d)/1000;if(s<60)return"now";if(s<3600)return Math.floor(s/60)+"m";if(s<86400)return Math.floor(s/3600)+"h";if(s<604800)return Math.floor(s/86400)+"d";return d.toLocaleDateString(undefined,{month:"short",day:"numeric"})}
function dateLabel(v){const d=new Date(v);return v&&!isNaN(d)?d.toLocaleDateString(undefined,{month:"long",year:"numeric"}):""}
function docPath(p){return db.from("app_documents").select("*").eq("path",p).maybeSingle()}
async function getDoc(p){const r=await docPath(p);if(r.error)throw r.error;return r.data?.data||null}
async function putDoc(path,data,parent=""){const old=await docPath(path);const row={path,parent_path:(parent&&parent!==path.split("/")[0])?parent:"",collection_name:path.split("/").slice(0,-1).join("/")||path.split("/")[0],document_id:path.split("/").pop(),owner_id:state.me?.id||null,data,updated_at:now(),created_at:old.data?.created_at||now()};const r=await db.from("app_documents").upsert(row,{onConflict:"path"});if(r.error)throw r.error}
async function listCollection(c,p=""){let q=db.from("app_documents").select("*").eq("collection_name",c);if(p)q=q.eq("parent_path",p);const r=await q;if(r.error)throw r.error;return r.data||[]}
async function bootAuth(){const session=await Promise.race([window.SPIKE_PLATFORM.getSession(),new Promise((_,rej)=>setTimeout(()=>rej(new Error("Session check timed out.")),15000))]);if(!session?.user){location.replace("index.html?reauth=1");return false}state.me=session.user;window.__SPIKE_ONLINE_ALLOWED__=true;state.uid=new URLSearchParams(location.search).get("uid")||state.me.id;return true}
async function initAdminHeader(){
const btn=$("adminBtn");
if(!btn || !state.me) return;
try {
  const {data,is_error}=await (async()=>{const r=await db.rpc('admin_is_super_admin_self');return {data:r.data,is_error:!!r.error}})();
  if(is_error||data!==true) return;
  btn.classList.remove("hidden");
  btn.classList.add("admin-btn-active");
  btn.onclick=()=>location.href="admin.html";
} catch(_) { /* fail closed: keep admin control hidden */ }
}
function openImagePicker(inputId){
const input=$(inputId);
if(!input) return;
input.value="";
input.click();
}
function validImage(file){
if(!file) return false;
const allowed=["image/jpeg","image/png","image/webp","image/gif"];
if(!allowed.includes(file.type)) { toast("Use JPG, PNG, WEBP, or GIF."); return false; }
if(file.size>10*1024*1024){ toast("Image must be 10MB or smaller."); return false; }
return true;
}
async function persistProfileMedia(field,url){
const stage = field === "avatar_url" ? "save-avatar-url" : "save-cover-document";
const old=await getDoc(`users/${state.me.id}`).catch(()=>({}));
const userPatch={...(old||{}),[field]:url,updated_at:now(),id:state.me.id};
// Only write columns that actually exist in public.profiles.
// cover_url is stored in the users document because profiles has no cover_url column.
if(field==="avatar_url"){
const privacy=state.privacy||{profile_visibility:"public",posts_visibility:"public",media_visibility:"public",friends_visibility:"public",allow_messages:"friends",show_online_status:true,allow_profile_discovery:true};
const profile={username:state.profile?.username||"",display_name:state.profile?.display_name||state.profile?.full_name||"",bio:state.profile?.bio||"",avatar_url:url,website:state.profile?.website||""};
const r=await db.rpc("spike_update_profile_v1",{p_profile:profile,p_privacy:privacy,p_user_doc:userPatch});
if(r.error) { console.error("[SPIKE PROFILE MEDIA]["+stage+"] RPC spike_update_profile_v1 failed", {code:r.error.code,message:r.error.message,details:r.error.details,hint:r.error.hint}); throw r.error; }
} else {
await putDoc(`users/${state.me.id}`,userPatch,"users");
}
state.profile={...state.profile,[field]:url};
if(field==="cover_url"){state.cover={url,position_x:0,position_y:0,zoom:1,fit:"cover"};const cr=await db.rpc("save_spike_cover_settings",{p_cover_url:url,p_position_x:0,p_position_y:0,p_zoom:1,p_fit:"cover"});if(cr.error)throw cr.error;renderCover();}
renderIdentity();renderCover();renderActions();renderAbout();
}
async function uploadProfileImage(file,type){
if(type==="avatar"&&state.privacyLoadError){toast("Your privacy preferences could not be loaded. Open Settings and retry before changing your profile picture.","error");return;}
if(!validImage(file)) return;
const area=type==="avatar"?document.querySelector(".avatar-wrap"):$("coverArea");
area?.classList.add("uploading");
try{
toast(type==="avatar"?"Uploading profile picture…":"Uploading cover photo…");
let url;
try { url=await uploadToCloudinary(file,`spike/profiles/${state.me.id}`); }
catch(uploadError) { console.error("[SPIKE PROFILE MEDIA][cloudinary-upload]", {message:uploadError?.message}); throw uploadError; }
try { await persistProfileMedia(type==="avatar"?"avatar_url":"cover_url",url); }
catch(saveError) { console.error("[SPIKE PROFILE MEDIA][supabase-save]", {code:saveError?.code,message:saveError?.message,details:saveError?.details,hint:saveError?.hint}); throw saveError; }
toast(type==="avatar"?"Profile picture updated":"Cover photo updated");if(type==="cover")openCoverEditor();
}catch(err){
console.error("[SPIKE PROFILE MEDIA]",err);
toast(err.message||"Image upload failed");
}finally{
area?.classList.remove("uploading");
}
}
async function loadProfile(){
  const profiles=await window.SPIKE.social.getPublicProfiles(db,[state.uid]);
  const relational=profiles[0]||null;
  if(!relational?.id) throw new Error("SPIKE member not found.");

  // The relational profile is the authoritative source for identity fields,
  // especially verified. App-document data is only an optional source of
  // profile extras that are not columns on public.profiles.
  // Only the owner may read legacy app-document profile extras. For another
  // member, the RPC result is the complete authorized public projection.
  let extras={};
  if(state.uid===state.me.id){
    try{
      const ext=await getDoc(`users/${state.uid}`);
      if(ext && typeof ext==="object") extras=ext;
    }catch(err){ console.warn("[SPIKE PROFILE EXTRAS]",err?.message||err); }
  }

  const merged={...extras,...relational,id:relational.id,verified:relational.verified===true};
  state.profile=window.SPIKE_IDENTITY?.normalizeProfile?.(merged)||merged;

}

async function loadPrivacy(){
 if(!state.me?.id) return;
 const own=state.uid===state.me.id;
 let privacy=null;
 if(own){
   const r=await db.from("profile_privacy").select("user_id,profile_visibility,posts_visibility,media_visibility,friends_visibility,allow_messages,show_online_status,allow_profile_discovery").eq("user_id",state.uid).maybeSingle();
   state.privacyLoadError=!!r.error || !r.data;
   if(r.error) console.warn("[SPIKE PRIVACY LOAD]",r.error.message);
   privacy=r.data;
 }
 state.privacy=privacy||{user_id:state.uid,profile_visibility:"private",posts_visibility:"private",media_visibility:"private",friends_visibility:"private",allow_messages:"friends",show_online_status:false,allow_profile_discovery:false};
 await (window.SPIKE_ACCESS?.ready||Promise.resolve());
 if(own){
   // The owner can still inspect their own content, but a failed privacy read
   // must never turn online presence on or overwrite settings with public defaults.
   state.canSeeFriends=true;
   state.canSeePosts=true;
   state.canSeeMedia=true;
   state.canSeeOnline=!state.privacyLoadError && state.privacy.show_online_status===true;
 }else{
   const access=window.SPIKE_ACCESS;
   const profileAllowed=await access?.profile?.(state.uid);
   if(profileAllowed!==true){
     document.body.innerHTML='<div class="spike-profile-private-state"><div><div class="spike-profile-private-icon">'+spikeIcon("lock")+'</div><h2>Private profile</h2><p>You do not have permission to view this profile.</p><a href="feed.html">Back to Feed</a></div></div>';
     throw new Error("Profile access denied");
   }
   // Access functions are authoritative for another member. Fail closed if unavailable.
   state.canSeePosts=(await access?.posts?.(state.uid))===true;
   state.canSeeMedia=(await access?.media?.(state.uid))===true;
   state.canSeeFriends=(await access?.friends?.(state.uid))===true;
   state.canSeeOnline=(await access?.online?.(state.uid))===true;
 }
}

async function loadSocial(){
  const meDoc=await getDoc(`users/${state.me.id}`).catch(err=>{
    console.warn("[SPIKE SOCIAL LOAD]",err?.message||err);
    return {};
  });
  const social=window.SPIKE?.social;
  if(!social) throw new Error('SPIKE social service is unavailable.');
  state.followingIds=await social.readFollowingIds(db,state.me.id,meDoc||{});
  state.following=state.followingIds.includes(state.uid);
  state.profile.savedPosts=Array.isArray(meDoc?.savedPosts)?meDoc.savedPosts:(Array.isArray(meDoc?.saved)?meDoc.saved:[]);
  const counts=await social.getCounts(db,state.uid);
  state.followers=counts.followers;
  state.profile.following_count=counts.following;
}

async function loadPosts(){
  if(!state.canSeePosts){ state.posts=[]; return; }
  if(state.uid!==state.me.id){
    const r=await db.rpc('get_public_profile_posts_v4',{p_owner:state.uid,p_limit:12});
    if(r.error) throw r.error;
    state.posts=(r.data||[]).map(x=>({
      id:x.id, authorUid:state.uid, content:x.content||'',
      createdAt:x.created_at, mediaUrl:x.media_url||'', mediaType:x.media_type||'', mediaItems:Array.isArray(x.media_items)?x.media_items:[], sensitive:x.sensitive===true, visibility:x.visibility||'public'
    }));
    return;
  }
  // Read only this owner's posts, in deterministic pages. A single PostgREST
  // request is capped by max_rows and previously hid older posts without
  // telling the owner that the result was truncated.
  const rows=[];
  const pageSize=500;
  const maxPosts=2000;
  for(let offset=0;offset<maxPosts;offset+=pageSize){
    const end=Math.min(offset+pageSize,maxPosts)-1;
    const r=await db.from("app_documents").select("document_id,data,updated_at")
      .eq("collection_name","posts")
      .eq("data->>authorUid",state.uid)
      .order("updated_at",{ascending:false})
      .order("document_id",{ascending:false})
      .range(offset,end);
    if(r.error) throw r.error;
    const page=r.data||[];
    rows.push(...page);
    if(page.length<(end-offset+1)) break;
  }
  if(rows.length===maxPosts) console.info('[SPIKE PROFILE] Profile post history reached its 2,000-post safety limit.');
  state.posts=rows.map(row=>({id:row.document_id,...(row.data||{})}))
    .filter(post=>post.authorUid===state.uid&&!post.deleted)
    .sort((a,b)=>new Date(b.createdAt||b.created_at||0)-new Date(a.createdAt||a.created_at||0));
}
function likeUsers(p){
  const users=p?.reactions?.like_users;
  if(Array.isArray(users)) return users.map(x=>typeof x==="string"?x:(x?.id||x?.user_id)).filter(Boolean);
  return Array.isArray(p?.likes)?p.likes:[]; // legacy documents remain readable during migration
}
function likeCount(p){
  const count=Number(p?.reactions?.like);
  return Number.isFinite(count)?count:likeUsers(p).length;
}
function liked(p){return likeUsers(p).includes(state.me.id)}function saved(p){return (state.profile.savedPosts||[]).includes(p.id)}
function renderFeatures(){const p=state.profile||{};const visibleOnline=state.uid===state.me.id ? state.privacy?.show_online_status!==false : state.canSeeOnline!==false; const online=visibleOnline && String(p.presence_status||p.presence||"").toLowerCase()==="online";$("profilePresenceDot").classList.toggle("online",online);$("profilePresenceText").textContent=visibleOnline?(online?"Online":"Offline"):"Offline";}
let spidShareFriends=[];
const spidShareSelected=new Set();
function spidReferralUrl(){
  if(state.referralCode){const url=new URL("index.html",location.href);url.searchParams.set("ref",state.referralCode);return url.toString();}
  const url=new URL("profile.html",location.href);url.searchParams.set("uid",state.uid||state.me?.id||"");return url.toString();
}
async function ensureSpidReferralCode(){
  if(state.uid!==state.me?.id)return null;
  if(state.referralCode)return state.referralCode;
  const result=await db.rpc("spike_referral_dashboard");
  if(result.error)throw result.error;
  state.referralCode=String(result.data?.referral_code||"");
  return state.referralCode;
}
function spidShareText(){
  const p=state.profile||{},sp=String(p.sp_id||"").trim();
  return `Connect with ${nameOf(p)} on SPIKE.\nMy SPIKE ID: ${sp}\nJoin SPIKE with my referral link: ${spidReferralUrl()}`;
}
function closeSpidShare(){
  const overlay=$("spidShareOverlay");
  if(!overlay)return;
  overlay.classList.remove("open");overlay.setAttribute("aria-hidden","true");
  document.body.style.overflow="";
}
function renderSpidFriends(){
  const list=$("spidFriendList"),query=String($("spidFriendSearch")?.value||"").trim().toLowerCase();
  if(!list)return;
  const visible=spidShareFriends.filter(friend=>{
    const name=nameOf(friend),username=String(friend.username||"").replace(/^@/,"");
    return !query||`${name} ${username}`.toLowerCase().includes(query);
  });
  if(!spidShareFriends.length){list.innerHTML='<div class="spid-friend-empty">Your SPIKE Friends list is empty.</div>';return;}
  if(!visible.length){list.innerHTML='<div class="spid-friend-empty">No friends match that search.</div>';return;}
  list.innerHTML=visible.map(friend=>{
    const id=String(friend.user_id||friend.id||"");
    const selected=spidShareSelected.has(id),name=nameOf(friend),avatar=avatarOf(friend);
    const disabled=!selected&&spidShareSelected.size>=50;
    const face=avatar?`<span class="spid-friend-avatar"><img src="${esc(avatar)}" alt="" loading="lazy" decoding="async"></span>`:`<span class="spid-friend-avatar">${esc((name[0]||"U").toUpperCase())}</span>`;
    return `<label class="spid-friend-row${selected?" selected":""}"><input type="checkbox" data-spid-friend="${esc(id)}" ${selected?"checked":""} ${disabled?"disabled":""}>${face}<span class="spid-friend-copy"><b>${esc(name)}</b><small>${esc(friend.username?"@"+String(friend.username).replace(/^@/,""):"SPIKE Friend")}</small></span></label>`;
  }).join("");
}
function updateSpidShareCount(){
  const count=$("spidShareCount"),send=$("spidSendFriends");
  if(count)count.textContent=`${spidShareSelected.size} of 50 selected`;
  if(send){send.disabled=spidShareSelected.size===0;send.textContent=spidShareSelected.size?`Share with ${spidShareSelected.size}`:"Share SP ID";}
}
async function loadSpidShareFriends(){
  const list=$("spidFriendList");
  list.innerHTML='<div class="spid-friend-loading">Loading your SPIKE Friends…</div>';
  spidShareFriends=[];
  try{
    const rows=[];let offset=0;
    while(offset<1000){
      const {data,error}=await db.rpc("get_friends_public",{p_limit:100,p_offset:offset});
      if(error)throw error;
      const page=Array.isArray(data)?data:[];
      rows.push(...page);offset+=page.length;
      if(page.length<100)break;
    }
    const seen=new Set();
    spidShareFriends=rows.filter(friend=>{
      const id=String(friend.user_id||friend.id||"");
      if(!id||id===state.me.id||seen.has(id))return false;
      seen.add(id);return true;
    });
    renderSpidFriends();
  }catch(error){
    console.error("[SPIKE SP ID SHARE] Friends list load failed",error);
    list.innerHTML=`<div class="spid-friend-empty">Could not load your friends. ${esc(error?.message||"Please try again.")}</div><button type="button" class="btn" id="spidFriendsRetry">Retry</button>`;
  }
  updateSpidShareCount();
}
async function openSpidShare(){
  const overlay=$("spidShareOverlay");
  if(!overlay){console.error("[SPIKE SP ID SHARE] Share dialog is missing from profile.html");toast("Sharing is temporarily unavailable. Please refresh your profile.","error");return;}
  spidShareSelected.clear();
  const search=$("spidFriendSearch"),status=$("spidShareStatus");
  if(search)search.value="";
  if(status)status.textContent="Preparing your referral link…";
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden","false");
  overlay.setAttribute("role","presentation");
  document.body.style.overflow="hidden";
  updateSpidShareCount();
  try {
    await ensureSpidReferralCode();
    if(status)status.textContent="Select up to 50 friends.";
  } catch(error) {
    console.error("[SPIKE REFERRAL LINK]",error);
    if(status)status.textContent="Referral link unavailable; you can still share your profile.";
  }
  loadSpidShareFriends();
  requestAnimationFrame(()=>$("spidShareClose")?.focus());
}
async function copySpidReferral(){
  const value=spidShareText();
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);
    else {const el=document.createElement("textarea");el.value=value;el.style.position="fixed";el.style.opacity="0";document.body.appendChild(el);el.select();if(!document.execCommand("copy"))throw new Error("Copy is unavailable");el.remove();}
    toast("SPIKE ID and referral link copied","success");
  }catch(error){toast("Could not copy the referral link. Please use Other apps.","error");}
}
async function shareSpidExternally(){
  const payload={title:"Connect with me on SPIKE",text:spidShareText(),url:spidReferralUrl()};
  if(navigator.share){
    try{await navigator.share(payload);return;}catch(error){if(error?.name==="AbortError")return;}
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(spidShareText())}`,"_blank","noopener,noreferrer");
}
async function sendSpidToFriends(){
  const ids=[...spidShareSelected].slice(0,50);
  if(!ids.length||!state.me?.id)return;
  const button=$("spidSendFriends"),status=$("spidShareStatus");
  button.disabled=true;button.textContent="Sharing…";
  status.textContent=`Sending to ${ids.length} friend${ids.length===1?"":"s"}…`;
  const body=spidShareText();
  let sent=0;const failed=[],sentIds=[];
  for(let i=0;i<ids.length;i+=5){
    const batch=ids.slice(i,i+5);
    const results=await Promise.all(batch.map(async recipient=>{
      try{
        const permission=await db.rpc("can_message_spike_user",{p_sender:state.me.id,p_recipient:recipient});
        if(permission.error)throw permission.error;
        if(permission.data!==true)throw new Error("Messaging is not allowed for this friend.");
        const result=await db.from("private_messages").insert({
          sender_id:state.me.id,recipient_id:recipient,body,message_type:"text"
        });
        if(result.error)throw result.error;
        sent++;sentIds.push(recipient);
      }catch(error){failed.push({id:recipient,message:error?.message||"Could not send"});}
    }));
    status.textContent=`Shared with ${sent} of ${ids.length}…`;
  }
  if(sent){
    sentIds.forEach(id=>spidShareSelected.delete(id));
    toast(`SP ID shared with ${sent} SPIKE Friend${sent===1?"":"s"}.`,"success");
    if(failed.length)status.textContent=`Sent to ${sent}; ${failed.length} could not receive it. You can retry the remaining selections.`;
    else closeSpidShare();
  }
  if(!sent)status.textContent="Nothing was sent. Check messaging permissions and try again.";
  button.disabled=false;button.textContent="Share SP ID";
  updateSpidShareCount();
}
function bindSpidShare(){
  $("spidShareClose")?.addEventListener("click",closeSpidShare);
  $("spidShareOverlay")?.addEventListener("click",event=>{if(event.target.matches("[data-spid-share-close]"))closeSpidShare();});
  $("spidShareSystem")?.addEventListener("click",shareSpidExternally);
  $("spidShareWhatsApp")?.addEventListener("click",()=>window.open(`https://wa.me/?text=${encodeURIComponent(spidShareText())}`,"_blank","noopener,noreferrer"));
  $("spidShareCopy")?.addEventListener("click",copySpidReferral);
  $("spidFriendSearch")?.addEventListener("input",renderSpidFriends);
  $("spidFriendList")?.addEventListener("change",event=>{
    const input=event.target.closest("[data-spid-friend]");if(!input)return;
    const id=input.dataset.spidFriend;
    if(input.checked){
      if(spidShareSelected.size>=50){input.checked=false;toast("You can select up to 50 friends.","warning");return;}
      spidShareSelected.add(id);
    }else spidShareSelected.delete(id);
    renderSpidFriends();updateSpidShareCount();
  });
  $("spidSelectVisible")?.addEventListener("click",()=>{
    const query=String($("spidFriendSearch")?.value||"").trim().toLowerCase();
    const visible=spidShareFriends.filter(friend=>!query||`${nameOf(friend)} ${friend.username||""}`.toLowerCase().includes(query));
    for(const friend of visible){const id=String(friend.user_id||friend.id||"");if(spidShareSelected.size>=50)break;spidShareSelected.add(id);}
    renderSpidFriends();updateSpidShareCount();
  });
  $("spidFriendList")?.addEventListener("click",event=>{if(event.target.closest("#spidFriendsRetry"))loadSpidShareFriends();});
  $("spidSendFriends")?.addEventListener("click",sendSpidToFriends);
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&$("spidShareOverlay")?.classList.contains("open"))closeSpidShare();});
}

function openShareProfile(){const text=`Check out ${nameOf(state.profile)} on SPIKE`;if(navigator.share)navigator.share({title:"SPIKE Profile",text,url:location.href}).catch(()=>{});else navigator.clipboard?.writeText(location.href).then(()=>toast("Profile link copied","success")).catch(()=>toast(location.href,"info"))}
function mediaItemsOf(p){
  const items=Array.isArray(p?.mediaItems)&&p.mediaItems.length
    ? p.mediaItems
    : (p?.mediaUrl?[{url:p.mediaUrl,type:p.mediaType||"image",watermarked:!!p.mediaWatermarked}]:[]);
  return items.map(x=>typeof x==="string"?{url:x,type:"image"}:x).filter(x=>x?.url);
}
function mediaTypeOfItem(item){
  const t=String(item?.type||item?.mediaType||"").toLowerCase();
  const u=String(item?.url||item?.mediaUrl||"");
  return t==="video"||/\.(mp4|webm|mov)(?:[?#].*)?$/i.test(u)?"video":"image";
}
function safeProfileMediaUrl(value){
  const raw=String(value||"").trim();
  if(!raw)return "";
  try{
    const url=new URL(raw,location.href);
    const localHttp=url.protocol==="http:"&&["localhost","127.0.0.1"].includes(location.hostname);
    if(url.protocol!=="https:"&&!localHttp)return "";
    return url.href;
  }catch(_){return "";}
}
function galleryMedia(){
  if(!state.canSeeMedia)return [];
  const out=[];
  state.posts.forEach(p=>{
    if(p.sensitive===true||p.is_sensitive===true)return;
    mediaItemsOf(p).forEach((item,index)=>{
      if(!safeProfileMediaUrl(item?.url||item?.mediaUrl))return;
      out.push({post:p,item,index});
    });
  });
  return out;
}
let profileMediaVideoObserver=null;
function renderMediaGallery(){
  profileMediaVideoObserver?.disconnect();profileMediaVideoObserver=null;
  const items=galleryMedia();
  $("mediaCountLabel").textContent=`${items.length} ${items.length===1?"item":"items"}`;
  if(!items.length){const hasSensitive=state.posts.some(p=>p.sensitive===true||p.is_sensitive===true);$("mediaPosts").innerHTML=`<div class="media-empty"><div style="font-size:26px;margin-bottom:8px">${spikeIcon(hasSensitive?'eye':'image','profile-inline-icon')}</div><b>${hasSensitive?'Sensitive media is protected':'No media yet'}</b><div style="margin-top:5px">${hasSensitive?'Open the Signal itself to review its content warning.':'Photos and videos shared on this profile will appear here.'}</div></div>`;return}
  $("mediaPosts").innerHTML=items.map((entry,i)=>{
    const item=entry.item, type=mediaTypeOfItem(item), url=esc(safeProfileMediaUrl(item.url||item.mediaUrl)), multi=mediaItemsOf(entry.post).length>1;
    return `<button class="media-tile" type="button" data-gallery-index="${i}" aria-label="Open ${type} ${i+1} of ${items.length}">${type==="video"?`<video data-gallery-video-src="${url}" muted playsinline preload="none"></video>`:`<img src="${url}" alt="" loading="lazy" decoding="async">`}${type==="video"?`<span class="media-tile-badge" aria-label="Video">${spikeIcon('play')}</span>`:""}${multi?`<span class="media-tile-badge media-tile-stack" aria-label="Multiple media">${spikeIcon('layers')}</span>`:""}</button>`;
  }).join("");
  const galleryVideos=$("mediaPosts").querySelectorAll("video[data-gallery-video-src]");
  const attachGalleryVideo=v=>{
    if(!v||v.getAttribute("src"))return;
    const source=v.dataset.galleryVideoSrc||"";
    if(!/^https?:\/\//i.test(source))return;
    v.preload="metadata";v.src=source;v.load();
  };
  if("IntersectionObserver" in window){
    profileMediaVideoObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      attachGalleryVideo(entry.target);profileMediaVideoObserver?.unobserve(entry.target);
    }),{rootMargin:"300px 0px",threshold:0});
    galleryVideos.forEach(v=>profileMediaVideoObserver.observe(v));
  }else galleryVideos.forEach(attachGalleryVideo);
}
function render(){renderMediaGallery();$("postCount").textContent=state.posts.length;renderFeatures();$("followerCount").textContent=state.canSeeFriends===false?"—":Number(state.followers||0);$("followingCount").textContent=state.canSeeFriends===false?"—":Number(state.profile?.following_count||0)}
// Social totals use the same server-authoritative RPC counts for own and other profiles.
function clamp(n,min,max){return Math.min(max,Math.max(min,n))}
function coverStyle(c=state.cover){const x=clamp(Number(c.position_x||0),-40,40),y=clamp(Number(c.position_y||0),-40,40),z=clamp(Number(c.zoom||1),1,2.5);return `object-position:50% 50%;transform:translate3d(${x}%,${y}%,0) scale(${z});`}
function applyCoverStyle(){const img=$("coverImg");if(img)img.style.cssText=coverStyle(state.cover)}
async function loadCoverSettings(){
  try{
    const r=await db.rpc("get_public_cover_settings",{p_user_ids:[state.uid]});
    if(r.error) throw r.error;
    const row=Array.isArray(r.data)?r.data[0]:null;
    if(row) state.cover={url:row.cover_url||"",position_x:Number(row.position_x||0),position_y:Number(row.position_y||0),zoom:Number(row.zoom||1),fit:row.fit||"cover"};
  }catch(err){console.warn("[SPIKE COVER SETTINGS]",err?.message||err)}
  const legacy=state.profile||{};
  if(!state.cover.url) state.cover.url=legacy.cover_url||legacy.coverUrl||legacy.banner_url||legacy.banner||"";
}
function renderCover(){const c=state.cover||{};const img=$("coverImg"),gen=$("generatedCover");if(!img)return;const has=!!c.url;if(gen){gen.innerHTML=has?"":(window.SPIKE_IDENTITY?.coverMarkup?.(state.profile)||"");gen.setAttribute("aria-hidden",has?"true":"false")}if(has){img.loading="eager";img.decoding="async";img.fetchPriority="high";if(img.getAttribute("src")!==c.url)img.src=c.url;img.classList.remove("hidden");applyCoverStyle()}else{if(img.hasAttribute("src"))img.removeAttribute("src");img.classList.add("hidden")};const own=state.uid===state.me.id;$("coverActions")?.classList.toggle("hidden",!own);$("coverAdjust")?.classList.toggle("hidden",!has||!own)}
function openCoverEditor(){
  if(!state.cover?.url){toast("Add a cover photo first.","info");return}
  const img=$("coverEditorImg");img.loading="eager";img.decoding="async";if(img.getAttribute("src")!==state.cover.url)img.src=state.cover.url;$("coverZoom").value=Math.round(clamp(Number(state.cover.zoom||1),1,2.5)*100);$("coverZoomValue").textContent=$("coverZoom").value+"%";updateCoverEditorTransform();open("coverEditorOverlay");$("coverEditorOverlay").setAttribute("aria-hidden","false")
}
function updateCoverEditorTransform(){const z=Number($("coverZoom")?.value||100)/100,x=clamp(Number(state.cover.position_x||0),-40,40),y=clamp(Number(state.cover.position_y||0),-40,40);const img=$("coverEditorImg");if(img)img.style.transform=`translate3d(${x}%,${y}%,0) scale(${z})`;if($("coverZoomValue"))$("coverZoomValue").textContent=Math.round(z*100)+"%"}
function resetCoverEditor(){state.cover.position_x=0;state.cover.position_y=0;state.cover.zoom=1;$("coverZoom").value=100;updateCoverEditorTransform()}
async function saveCoverSettings(){
  const btn=$("coverEditorSave");if(btn)btn.disabled=true;
  try{
    const payload={p_cover_url:state.cover.url,p_position_x:clamp(Number(state.cover.position_x||0),-40,40),p_position_y:clamp(Number(state.cover.position_y||0),-40,40),p_zoom:clamp(Number(state.cover.zoom||1),1,2.5),p_fit:"cover"};
    const r=await db.rpc("save_spike_cover_settings",payload);if(r.error)throw r.error;
    state.cover={url:payload.p_cover_url,position_x:payload.p_position_x,position_y:payload.p_position_y,zoom:payload.p_zoom,fit:"cover"};
    state.profile={...state.profile,cover_url:state.cover.url,cover_position_x:state.cover.position_x,cover_position_y:state.cover.position_y,cover_zoom:state.cover.zoom,cover_fit:"cover"};
    renderCover();close("coverEditorOverlay");$("coverEditorOverlay").setAttribute("aria-hidden","true");toast("Cover appearance saved","success");
  }catch(err){console.error("[SPIKE COVER SAVE]",err);toast(err.message||"Could not save cover appearance.","error")}finally{if(btn)btn.disabled=false}
}
function initCoverEditor(){
   // Keep the cover editor as a direct body child so transformed/scrolling profile ancestors cannot trap fixed positioning.
   const coverOverlay=$("coverEditorOverlay");
   if(coverOverlay && coverOverlay.parentElement!==document.body) document.body.appendChild(coverOverlay);
  $("coverZoom")?.addEventListener("input",()=>{state.cover.zoom=Number($("coverZoom").value)/100;updateCoverEditorTransform()});
  $("coverReset")?.addEventListener("click",resetCoverEditor);$("coverEditorSave")?.addEventListener("click",saveCoverSettings);$("coverEditorClose")?.addEventListener("click",()=>{close("coverEditorOverlay");$("coverEditorOverlay").setAttribute("aria-hidden","true")});$("coverEditorCancel")?.addEventListener("click",()=>{close("coverEditorOverlay");$("coverEditorOverlay").setAttribute("aria-hidden","true")});
  const area=$("coverEditorPreview");let drag=null;
  area?.addEventListener("pointerdown",e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:Number(state.cover.position_x||0),py:Number(state.cover.position_y||0)};area.classList.add("dragging");area.setPointerCapture?.(e.pointerId)});
  area?.addEventListener("pointermove",e=>{if(!drag||drag.id!==e.pointerId)return;const rect=area.getBoundingClientRect();state.cover.position_x=clamp(drag.px+(e.clientX-drag.x)/rect.width*100,-40,40);state.cover.position_y=clamp(drag.py+(e.clientY-drag.y)/rect.height*100,-40,40);updateCoverEditorTransform()});
  const end=()=>{drag=null;area.classList.remove("dragging")};area?.addEventListener("pointerup",end);area?.addEventListener("pointercancel",end);area?.addEventListener("wheel",e=>{e.preventDefault();state.cover.zoom=clamp(Number(state.cover.zoom||1)+(e.deltaY<0?.05:-.05),1,2.5);$("coverZoom").value=Math.round(state.cover.zoom*100);updateCoverEditorTransform()},{passive:false});
  $("coverEditorOverlay")?.addEventListener("click",e=>{if(e.target.id==="coverEditorOverlay"){$("coverEditorCancel").click()}});
}
function renderIdentity(){const p=state.profile||{},n=nameOf(p),a=avatarOf(p);$("headerTitle").textContent=n;$("displayName").textContent=n;const handle=String(p.username||"").replace(/^@/,"");$("username").textContent=handle?"@"+handle:"";$("bio").textContent=p.bio||p.about||"";$("verified").classList.toggle("hidden",p.verified!==true);$("verified").setAttribute("aria-label",p.verified===true?"Verified account":"");$("avatar").innerHTML=window.SPIKE_IDENTITY?.avatarMarkup?.(p,"profile-avatar",n)|| (a?`<img src="${esc(a)}" alt="${esc(n)}" loading="lazy" decoding="async">`:esc(n[0]||"U"));renderCover();const m=[];if(p.location)m.push(`<span>${spikeIcon("pin")} ${esc(p.location)}</span>`);if(p.website)m.push(`<span>${spikeIcon("link")} <a href="${esc(/^https?:\/\//i.test(p.website)?p.website:"https://"+p.website)}" target="_blank" rel="noopener noreferrer">${esc(p.website.replace(/^https?:\/\//i,""))}</a></span>`);if(p.created_at||p.createdAt)m.push(`<span>${spikeIcon("calendar")} Joined ${esc(dateLabel(p.created_at||p.createdAt))}</span>`);$("meta").innerHTML=m.join("");const sp=p.sp_id||"";$("spidValue").textContent=sp||"SP-••••••";$("copySpid").onclick=async()=>{if(!sp)return;try{await navigator.clipboard.writeText(sp);toast("SP ID copied","success")}catch{toast(sp,"info")}};$("shareSpid").onclick=()=>{if(!sp){toast("Your SPIKE ID is not available yet.","warning");return;}openSpidShare();}}
function renderActions(){const own=state.uid===state.me.id;$("spidWalletLink")?.classList.toggle("hidden",!own);const mutualLink=$("mutualConnectionsShortcut");if(mutualLink){mutualLink.hidden=own||state.canSeeFriends===false;mutualLink.href=`followers.html?kind=mutuals&uid=${encodeURIComponent(state.uid)}`;}$("actions").innerHTML=own?`<button type="button" class="btn primary" id="editBtn">Edit profile</button><a class="btn" href="feed.html">${spikeIcon("arrowLeft")} Feed</a>`:`<button type="button" class="btn primary" id="followBtn">${state.following?"Following":"Follow"}</button><button class="btn" id="shareProfileBtn" type="button">${spikeIcon("share")} Share</button>`;$("openBlockedList")?.classList.toggle("hidden",!own);$("coverActions")?.classList.toggle("hidden",!own);$("coverEdit")?.classList.toggle("hidden",!own);$("coverAdjust")?.classList.toggle("hidden",!own||!state.cover?.url);$("editBtn")?.addEventListener("click",fillEdit);$("followBtn")?.addEventListener("click",toggleFollow)}
function renderAbout(){const p=state.profile,items=[["Username",p.username?"@"+String(p.username).replace(/^@/,""):"Not set"],["Display name",nameOf(p)],["Location",p.location||"Not provided"],["Website",p.website||"Not provided"],["Joined",dateLabel(p.created_at||p.createdAt)||"Not available"],["Status",(p.disabled||p.suspended)?"Restricted":"Active"]];$("aboutGrid").innerHTML=items.map(x=>`<div class="about-item"><small>${esc(x[0])}</small><div>${esc(x[1])}</div></div>`).join("")}
function syncProfileToFeed(action,active,targetId=state.uid){
  const msg={id:String(targetId),action,active:!!active,at:Date.now()};
  try{localStorage.setItem('spike.profile.sync',JSON.stringify(msg));}catch(_){ }
  try{window.dispatchEvent(new CustomEvent('spike:profile-sync',{detail:msg}));}catch(_){ }
}
async function toggleFollow(){
  if(!state.me?.id||!state.uid||state.uid===state.me.id)return;
  const button=document.getElementById('followBtn');
  if(button){button.disabled=true;button.textContent='Please wait…';}
  try{
    const result=await window.SPIKE.social.setFollow(db,state.uid,!state.following);
    state.following=result.following;
    await loadSocial();
    syncProfileToFeed('follow',state.following,state.uid);
    renderActions();render();
    toast(state.following?'You are now following this member.':'You unfollowed this member.','success');
  }catch(err){
    console.error('[SPIKE FOLLOW]',err);
    try{await loadSocial();renderActions();render();}catch(refreshError){console.warn('[SPIKE FOLLOW REFRESH]',refreshError);}
    toast(err?.message||'Follow action failed. Please try again.','error');
  }finally{
    const current=document.getElementById('followBtn');
    if(current){current.disabled=false;current.textContent=state.following?'Following':'Follow';}
  }
}
function fillEdit(){const p=state.profile;const avatarFile=$("editAvatarFile"),coverFile=$("editCoverFile");if(avatarFile)avatarFile.value="";if(coverFile)coverFile.value="";$("editName").value=p.display_name||p.full_name||p.name||"";$("editUsername").value=p.username||"";$("editBio").value=p.bio||p.about||"";$("editWebsite").value=p.website||"";$("editLocation").value=p.location||"";$("editSocial").value=p.social_links||p.socialLinks||"";open("editOverlay")}
async function saveProfile(e){
  e.preventDefault();
  if(state.privacyLoadError){toast("Your privacy preferences could not be loaded, so profile changes are paused to protect them. Open Settings, reload, and try again.","error");return;}
  let profileSaved = false;
  const form=e.currentTarget;
  const username=$("editUsername").value.trim().replace(/^@/,"");
  if(username && !/^[A-Za-z0-9._-]{2,40}$/.test(username)){
    toast("Invalid username format","error");
    return;
  }

  const avatarFile=$("editAvatarFile")?.files?.[0]||null;
  const coverFile=$("editCoverFile")?.files?.[0]||null;
  if(avatarFile&&!validImage(avatarFile)) return;
  if(coverFile&&!validImage(coverFile)) return;

  const saveBtn=form.querySelector('button[type="submit"]');
  if(saveBtn){saveBtn.disabled=true;saveBtn.dataset.originalText=saveBtn.textContent;saveBtn.textContent="Saving…";}

  try{
    const current=state.profile||{};
    let avatarUrl=current.avatar_url||current.avatar||"";
    let coverUrl=state.cover?.url||current.cover_url||current.coverUrl||current.banner_url||current.banner||"";

    if(avatarFile){
      toast("Uploading profile picture…");
      avatarUrl=await uploadToCloudinary(avatarFile,`spike/profiles/${state.me.id}`);
    }
    if(coverFile){
      toast("Uploading cover photo…");
      coverUrl=await uploadToCloudinary(coverFile,`spike/profiles/${state.me.id}`);
    }

    const timestamp=now();
    const next={
      ...current,
      id:state.me.id,
      display_name:$("editName").value.trim(),
      username,
      bio:$("editBio").value.trim(),
      avatar_url:avatarUrl,
      cover_url:coverUrl,
      website:$("editWebsite").value.trim(),
      location:$("editLocation").value.trim(),
      social_links:$("editSocial").value.trim(),
      profile_visibility:state.privacy?.profile_visibility||current.profile_visibility||"public",
      updated_at:timestamp
    };

    // Identity fields belong in public.profiles. Never update verified here:
    // only the admin verification workflow may change that field.
    // Privacy is owned by settings.html. Preserve the loaded values when the profile editor saves identity fields.
    const privacyPatch={
      profile_visibility:state.privacy?.profile_visibility||current.profile_visibility||"public",
      posts_visibility:state.privacy?.posts_visibility||"public",
      media_visibility:state.privacy?.media_visibility||"public",
      friends_visibility:state.privacy?.friends_visibility||"public",
      allow_messages:state.privacy?.allow_messages||"friends",
      show_online_status:state.privacy?.show_online_status!==false,
      allow_profile_discovery:state.privacy?.allow_profile_discovery!==false,
      updated_at:state.privacy?.updated_at||timestamp
    };
    const old=await getDoc(`users/${state.me.id}`).catch(()=>({}));
    const userDoc={
      ...(old||{}),
      id:state.me.id,
      display_name:next.display_name,
      username:next.username,
      bio:next.bio,
      avatar_url:next.avatar_url,
      cover_url:next.cover_url,
      website:next.website,
      location:next.location,
      social_links:next.social_links,
      profile_visibility:next.profile_visibility,
      updated_at:timestamp
    };
    const rpcProfile={username:next.username,display_name:next.display_name,bio:next.bio,avatar_url:next.avatar_url,website:next.website};
    const rpcPrivacy={profile_visibility:privacyPatch.profile_visibility,posts_visibility:privacyPatch.posts_visibility,media_visibility:privacyPatch.media_visibility,friends_visibility:privacyPatch.friends_visibility,allow_messages:privacyPatch.allow_messages,show_online_status:privacyPatch.show_online_status,allow_profile_discovery:privacyPatch.allow_profile_discovery};
    const profileSave=await db.rpc("spike_update_profile_v1",{p_profile:rpcProfile,p_privacy:rpcPrivacy,p_user_doc:userDoc});
    if(profileSave.error) throw new Error("Profile could not be saved: "+profileSave.error.message);
    profileSaved = true;
    {
      const same=state.cover?.url===coverUrl;
      const cr=await db.rpc("save_spike_cover_settings",{p_cover_url:coverUrl,p_position_x:same?Number(state.cover.position_x||0):0,p_position_y:same?Number(state.cover.position_y||0):0,p_zoom:same?Number(state.cover.zoom||1):1,p_fit:"cover"});
      if(cr.error) throw cr.error;
      state.cover={url:coverUrl,position_x:same?Number(state.cover.position_x||0):0,position_y:same?Number(state.cover.position_y||0):0,zoom:same?Number(state.cover.zoom||1):1,fit:"cover"};
    }

    state.profile={...state.profile,...next,verified:state.profile.verified===true};
    state.privacy={...(state.privacy||{}),...privacyPatch};
    window.__SPIKE_ONLINE_ALLOWED__=state.uid===state.me.id && privacyPatch.show_online_status===true;
    if(window.__SPIKE_ONLINE_ALLOWED__) window.AppPresence?.start(db);
    else window.AppPresence?.stop?.();

    renderIdentity();
    renderActions();
    renderAbout();
    render();
    close("editOverlay");
    toast("Profile updated","success");
  }catch(err){
    console.error("[SPIKE PROFILE SAVE]",err);
    if(profileSaved){
      toast("Your profile details were saved, but the cover settings could not be saved. Reopen Edit profile and retry the cover update.","error");
    } else {
      toast(err.message||"Could not save your profile.","error");
    }
  }finally{
    if(saveBtn){saveBtn.disabled=false;saveBtn.textContent=saveBtn.dataset.originalText||"Save changes";}
    $("editAvatarFile").value="";
    $("editCoverFile").value="";
  }
}

async function likePost(id){
  const p=state.posts.find(x=>x.id===id); if(!p||!state.me?.id)return;
  const beforeReactions=p.reactions&&typeof p.reactions==="object"?structuredClone(p.reactions):{};
  const beforeLikes=Array.isArray(p.likes)?[...p.likes]:undefined;
  const users=likeUsers(p);
  const wasLiked=users.includes(state.me.id);
  const nextUsers=wasLiked?users.filter(x=>x!==state.me.id):[...users,state.me.id];
  p.reactions={...(p.reactions||{}),like_users:nextUsers,like:nextUsers.length};
  delete p.likes;
  render();
  try{
    const {data,error}=await db.rpc("mutate_post_interaction",{p_post_id:String(id),p_action:"like",p_emoji:null,p_comment:null});
    if(error)throw error;
    if(data&&typeof data==="object")Object.assign(p,data);
    render();
  }catch(err){p.reactions=beforeReactions;if(beforeLikes)p.likes=beforeLikes;else delete p.likes;render();throw err;}
}
async function savePost(id){const me=await getDoc(`users/${state.me.id}`).catch(()=>({}));const s=new Set(me?.savedPosts||me?.saved||[]);s.has(id)?s.delete(id):s.add(id);await putDoc(`users/${state.me.id}`,{...(me||{}),savedPosts:[...s]},"users");state.profile.savedPosts=[...s];render();toast(s.has(id)?"Saved":"Removed from saved")}
async function addComment(id,text,parentCommentId=null){
  const clean=String(text||"").trim();
  if(!clean)return;
  if(clean.length>500)throw new Error("Comment is limited to 500 characters.");
  const p=state.posts.find(x=>x.id===id); if(!p||!state.me?.id)return;
  const old=Array.isArray(p.comments)?[...p.comments]:[];
  const optimistic={id:`local-${Date.now()}`,postId:String(id),authorUid:state.me.id,authorName:nameOf(state.profile),authorAvatar:avatarOf(state.profile),text:clean,parentCommentId:parentCommentId?String(parentCommentId):null,createdAt:now(),__optimistic:true};
  p.comments=[...old,optimistic]; render();
  try{
    // Use the same canonical, transactional comment RPC as Feed for both new comments and replies.
    const {data,error}=await db.rpc("add_post_comment",{
      p_post_id:String(id),
      p_text:clean,
      p_parent_comment_id:parentCommentId?String(parentCommentId):null
    });
    if(error)throw error;
    const authoritative=data?.data&&typeof data.data==="object"?data.data:data;
    if(Array.isArray(authoritative?.comments))p.comments=authoritative.comments;
    else if(authoritative?.comment&&typeof authoritative.comment==="object")p.comments=[...old,authoritative.comment];
    else p.comments=[...old];
    render(); toast("Comment added","success");
    return data;
  }catch(err){p.comments=old;render();throw err;}
}

function bind(){
initCoverEditor();
$("coverAdjust")?.addEventListener("click",e=>{e.stopPropagation();if(state.uid===state.me.id)openCoverEditor()});
$("avatar")?.addEventListener("click",()=>state.uid===state.me.id&&openImagePicker("avatarFile"));
$("coverEdit")?.addEventListener("click",e=>{e.stopPropagation();state.uid===state.me.id&&openImagePicker("coverFile")});
$("coverArea")?.addEventListener("click",e=>{
if(state.uid===state.me.id && !e.target.closest("button")) openImagePicker("coverFile");
});
$("avatarFile")?.addEventListener("change",e=>{
const f=e.target.files?.[0];
if(f) uploadProfileImage(f,"avatar");
});
$("coverFile")?.addEventListener("change",e=>{
const f=e.target.files?.[0];
if(f) uploadProfileImage(f,"cover");
});
const profileMenu=$("menuOverlay"),profileMenuButton=$("menuBtn");
function openProfileMenu(){if(!profileMenu)return;open("menuOverlay");profileMenu.setAttribute("aria-hidden","false");profileMenuButton?.setAttribute("aria-expanded","true");}

profileMenuButton?.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();if(profileMenu?.classList.contains("open"))closeProfileMenu();else openProfileMenu();});
$("shareProfileAction")?.addEventListener("click",()=>{closeProfileMenu();if(state.uid===state.me?.id)openSpidShare();else openShareProfile();});
$("closeMenu")?.addEventListener("click",closeProfileMenu);
profileMenu?.addEventListener("click",e=>{if(e.target===profileMenu)closeProfileMenu();});
document.addEventListener("pointerdown",e=>{if(!profileMenu?.classList.contains("open"))return;if(profileMenu.contains(e.target)||profileMenuButton?.contains(e.target))return;closeProfileMenu();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&profileMenu?.classList.contains("open")){closeProfileMenu();profileMenuButton?.focus();}});
$("themeBtn")?.addEventListener("click",()=>{closeProfileMenu();const panel=$("profileThemeOverlay");if(panel){panel.hidden=false;panel.classList.add("open");syncProfileThemeChoices();$("profileThemeClose")?.focus();}});
$("profileThemeClose")?.addEventListener("click",closeProfileThemeChooser);
$("profileThemeOverlay")?.addEventListener("click",e=>{if(e.target===$("profileThemeOverlay"))closeProfileThemeChooser();});
document.querySelectorAll("[data-profile-theme]").forEach(btn=>btn.addEventListener("click",()=>{
  const id=Number(btn.dataset.profileTheme);
  if(window.SPIKE_THEME?.set){window.SPIKE_THEME.set(id);syncProfileThemeChoices();closeProfileThemeChooser();toast("Appearance changed to "+(window.SPIKE_THEMES?.[id-1]?.name||"your selected theme"),"success");}
  else toast("Theme service is unavailable. Please reload SPIKE.","error");
}));
function syncProfileThemeChoices(){const current=Number(window.SPIKE_THEME?.get?.()||document.documentElement.dataset.spikeStyle||1);document.querySelectorAll("[data-profile-theme]").forEach(btn=>{const active=Number(btn.dataset.profileTheme)===current;btn.classList.toggle("active",active);btn.setAttribute("aria-pressed",String(active));});}
function closeProfileThemeChooser(){const panel=$("profileThemeOverlay");if(panel){panel.classList.remove("open");panel.hidden=true;} $("themeBtn")?.focus();}
if($("cancelEdit"))$("cancelEdit").onclick=()=>close("editOverlay");$("closeEditProfile")?.addEventListener("click",()=>close("editOverlay"));$("editForm")?.addEventListener("submit",saveProfile);
// Raw image URL fields were intentionally removed; image uploads are handled by saveProfile().
$("shareProfileBtn")?.addEventListener("click",openShareProfile);if($("signOutBtn"))$("signOutBtn").onclick=async()=>{try{await window.AppPresence?.stop?.(true);try{await db.removeAllChannels?.()}catch(_){}const {error}=await db.auth.signOut({scope:"local"});if(error)throw error;location.replace("index.html?logged_out=1")}catch(e){console.error("[SPIKE PROFILE SIGNOUT]",e);toast(e.message||"Could not sign out. Please try again.","error")}};if($("copyProfile"))$("copyProfile").onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast("Profile link copied")}catch{toast(location.href)}};document.querySelectorAll(".overlay").forEach(o=>o.addEventListener("click",e=>{if(e.target===o)o.classList.remove("open")}));document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".overlay.open").forEach(x=>x.classList.remove("open"))});document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===t));$("mediaPanel")?.classList.toggle("hidden",t.dataset.tab!=="media");$("aboutPanel")?.classList.toggle("hidden",t.dataset.tab!=="about")});$("mediaPosts")?.addEventListener("click",e=>{const tile=e.target.closest("[data-gallery-index]");if(tile)openMediaViewer(Number(tile.dataset.galleryIndex))});}
let mediaViewerIndex=0;
function openMediaViewer(index){
  const items=galleryMedia();
  if(!items.length)return;
  mediaViewerIndex=Math.max(0,Math.min(index,items.length-1));
  $("mediaViewer").classList.add("open");
  $("mediaViewer").setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";
  renderMediaViewer();
}
function closeMediaViewer(){
  $("mediaViewer").classList.remove("open");
  $("mediaViewer").setAttribute("aria-hidden","true");
  $("mediaViewerStage").innerHTML="";
  document.body.style.overflow="";
}
function renderMediaViewer(){
  const items=galleryMedia(), entry=items[mediaViewerIndex];
  if(!entry)return;
  const p=entry.post,item=entry.item,type=mediaTypeOfItem(item),url=esc(safeProfileMediaUrl(item.url||item.mediaUrl));
  if(!url)return;
  $("mediaViewerCount").textContent=`${mediaViewerIndex+1} / ${items.length}`;
  $("mediaViewerPrev").disabled=mediaViewerIndex===0;
  $("mediaViewerNext").disabled=mediaViewerIndex===items.length-1;
  $("mediaViewerStage").innerHTML=type==="video"?`<video src="${url}" controls playsinline autoplay preload="metadata"></video>`:`<img src="${url}" alt="SPIKE media" loading="eager" decoding="async" fetchpriority="high">`;
  const n=esc(p.authorName||nameOf(state.profile)),a=avatarOf(state.profile);
  $("mediaViewerAuthor").textContent=p.authorName||nameOf(state.profile);
  $("mediaViewerTime").textContent=ago(p.createdAt||p.created_at);
  $("mediaViewerCaption").textContent=p.content||"";
  $("mediaViewerAvatar").innerHTML=a?`<img src="${esc(a)}" alt="" loading="lazy">`:esc((p.authorName||nameOf(state.profile)||"S")[0]);
  const likeBtn=$("mediaViewerLike"),saveBtn=$("mediaViewerSave");
  likeBtn.innerHTML=`${spikeIcon("heart")} <span>${likeCount(p)}</span>`;
  likeBtn.classList.toggle("active",liked(p));
  saveBtn.innerHTML=`${spikeIcon("bookmark")} <span>${saved(p)?"Saved":"Save"}</span>`;
  saveBtn.classList.toggle("active",saved(p));
  $("mediaViewerComment").innerHTML=`${spikeIcon("message")} <span>${Array.isArray(p.comments)?p.comments.length:0}</span>`;
  $("mediaViewerComment").onclick=()=>toast("Comments are available from the post in Feed.","info");
  likeBtn.onclick=async()=>{await likePost(p.id);renderMediaViewer()};
  saveBtn.onclick=async()=>{await savePost(p.id);renderMediaViewer()};
  $("mediaViewerShare").onclick=async()=>{const u=location.origin+profileLink(state.uid)+"#post-"+p.id;try{if(navigator.share)await navigator.share({title:"SPIKE media",text:p.content||"SPIKE media",url:u});else{await navigator.clipboard.writeText(u);toast("Media link copied","success")}}catch{}};
}
function moveMediaViewer(delta){
  const items=galleryMedia();
  if(!items.length)return;
  const next=mediaViewerIndex+delta;
  if(next<0||next>=items.length)return;
  mediaViewerIndex=next;renderMediaViewer();
}
// The media-viewer markup is intentionally placed near the end of profile.html.
// Bind only after the document has finished parsing so these nodes always exist.
function bindMediaViewerControls(){
  const closeBtn=$("mediaViewerClose"),prevBtn=$("mediaViewerPrev"),nextBtn=$("mediaViewerNext");
  const viewer=$("mediaViewer"),stage=$("mediaViewerStage");
  if(!viewer||!stage){console.warn("[SPIKE PROFILE] Media viewer markup is unavailable; viewer controls were not bound.");return;}
  closeBtn?.addEventListener("click",closeMediaViewer);
  prevBtn?.addEventListener("click",()=>moveMediaViewer(-1));
  nextBtn?.addEventListener("click",()=>moveMediaViewer(1));
  viewer.addEventListener("click",e=>{if(e.target.matches("[data-media-close]"))closeMediaViewer()});
  document.addEventListener("keydown",e=>{if(!viewer.classList.contains("open"))return;if(e.key==="Escape")closeMediaViewer();else if(e.key==="ArrowLeft")moveMediaViewer(-1);else if(e.key==="ArrowRight")moveMediaViewer(1)});
  let mediaSwipeX=0;
  stage.addEventListener("touchstart",e=>{mediaSwipeX=e.changedTouches[0]?.clientX||0},{passive:true});
  stage.addEventListener("touchend",e=>{const x=e.changedTouches[0]?.clientX||0,d=x-mediaSwipeX;if(Math.abs(d)>55)moveMediaViewer(d<0?1:-1)},{passive:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bindMediaViewerControls,{once:true});
else bindMediaViewerControls();

async function realtime(){
 if(state.realtime)await db.removeChannel(state.realtime);
 state.realtime=db.channel("profile:"+state.uid,{config:{private:true}}).on("broadcast",{event:"UPDATE"},p=>{const r=p.payload?.record||p.payload?.new;if(r?.path?.startsWith("posts/")||r?.path===`users/${state.uid}`)loadPosts().then(render).catch(()=>{})}).subscribe();
 try{
  const sr=await db.auth.getSession();const token=sr.data?.session?.access_token;if(token)await db.realtime.setAuth(token);
  const topics=new Set([state.me.id]);if(state.uid!==state.me.id&&state.canSeeFriends!==false)topics.add(state.uid);
  for(const uid of topics){
   const channel=db.channel(`user:${uid}:social`,{config:{private:true}})
    .on("broadcast",{event:"social_connection_changed"},()=>{loadSocial().then(()=>{renderActions();render();}).catch(err=>console.warn("[SPIKE PROFILE SOCIAL REALTIME]",err));})
    .subscribe(status=>{if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")console.warn("[SPIKE PROFILE SOCIAL REALTIME]",status)});
   state.socialRealtime.push(channel);
  }
 }catch(err){console.warn("[SPIKE PROFILE SOCIAL REALTIME] Subscription unavailable",err)}
}
window.addEventListener("pagehide",e=>{if(e.persisted)return;if(state.realtime){db.removeChannel(state.realtime);state.realtime=null;}for(const channel of state.socialRealtime||[]){try{db.removeChannel(channel)}catch(_){}}state.socialRealtime=[];});
// Keep Feed and Profile state coherent across navigation and same-browser tabs.
window.addEventListener('storage',e=>{
  if(e.key!=='spike.profile.sync'||!e.newValue)return;
  try{const m=JSON.parse(e.newValue);if(String(m.id)===String(state.uid)&&m.action==='follow'){state.following=!!m.active;renderActions();render();}}catch(_){ }
});
const profileLoaderElement=$("loader");
const profileLoaderController=window.SpikeLoader?.register(profileLoaderElement,{
  minVisibleMs:1200,
  subtitleElement:$('loaderSubtitle'),
  stallMs:30000,
  retryElement:$('profileLoaderRetry'),
  retry:'reload',
  stallMessage:'This is taking longer than usual. Check your connection and retry.'
});
function profileStage(promise,label,timeoutMs=18000){
  const title=$("loaderText"),stage=$("loaderStage"),subtitle=$("loaderSubtitle");
  const stageCopy={
    "Sign-in check":"Verifying your secure SPIKE session",
    "Profile identity":"Retrieving your profile information",
    "Cover settings":"Preparing your profile appearance",
    "Privacy settings":"Applying your privacy preferences",
    "Profile posts":"Loading your profile activity",
    "Social connections":"Synchronizing your connections",
    "Live profile updates":"Connecting live profile updates"
  };
  if(title)title.textContent=label;
  if(stage)stage.textContent=label.toUpperCase();
  if(subtitle)subtitle.textContent=stageCopy[label]||"Preparing your SPIKE experience securely";
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out. Check your connection and retry.`)),timeoutMs);})
  ]).finally(()=>clearTimeout(timer));
}
async function boot(){
  bind();
  let bootFailed=false;
  try{
    if(!(await profileStage(bootAuth(),"Sign-in check",16000)))return;
    initAdminHeader();
    const ownerView=state.uid===state.me.id;
    if($("showQr"))$("showQr").hidden=!ownerView;
    if($("copyProfile"))$("copyProfile").innerHTML=`${spikeIcon("link")} <span>${ownerView?"Copy profile link":"Share profile link"}</span>`;
    await profileStage(loadProfile(),"Profile identity");
    await profileStage(loadCoverSettings(),"Cover settings");
    await profileStage(loadPrivacy(),"Privacy settings");
    await profileStage(loadPosts(),"Profile posts",25000);
    window.__SPIKE_ONLINE_ALLOWED__=state.canSeeOnline;
    if(window.__SPIKE_ONLINE_ALLOWED__)window.AppPresence?.start(db);else window.AppPresence?.stop?.();
    await profileStage(loadSocial(),"Social connections");
    renderIdentity();renderCover();renderActions();renderAbout();render();
    await profileStage(realtime(),"Live profile updates",12000);
    if(new URLSearchParams(location.search).get("edit")==="1"&&state.uid===state.me.id){history.replaceState(history.state,"",location.pathname);fillEdit();}
  }catch(e){
    bootFailed=true;
    console.error("[SPIKE PROFILE]",e);
    const overlay=$("loader");
    overlay?.classList.add("is-error");
    const label=$("loaderText");if(label)label.textContent="We couldn't finish loading";
    const subtitle=$("loaderSubtitle");if(subtitle)subtitle.textContent=e?.message||"Check your connection and try again.";
    const stage=$("loaderStage");if(stage)stage.textContent="CONNECTION NEEDS ATTENTION";
    const retry=$("profileLoaderRetry");if(retry)retry.hidden=false;
    toast(e.message||"Profile initialization failed","error");
  }finally{
    if(!bootFailed){
      if(profileLoaderController)profileLoaderController.hide();
      else $("loader")?.classList.add("hide");
    }
  }
}

const profileLoaderRetry=document.getElementById("profileLoaderRetry");
if(profileLoaderRetry)profileLoaderRetry.addEventListener("click",()=>location.reload());

// SPIKE Connect QR — scanner without flashlight.
let qrStream=null,qrScanTimer=null,qrTargetUid=null,qrScanBusy=false,qrCanvas=null,qrCtx=null;

function spikeQrPayload(){
  return `${location.origin}${location.pathname}?uid=${encodeURIComponent(state.uid)}`;
}
function renderMyQr(){
  const box=$("qrCodeBox"); box.innerHTML="";
  if(!window.qrcode){box.textContent="QR generator unavailable. Please reload.";return}
  const qr=qrcode(0,"M"); qr.addData(spikeQrPayload()); qr.make();
  box.innerHTML=qr.createImgTag(6,0);
}
function openQr(){renderMyQr();open("qrOverlay")}

function stopScanner(){
  if(qrScanTimer)clearInterval(qrScanTimer);
  qrScanTimer=null; qrScanBusy=false;
  if(qrStream){qrStream.getTracks().forEach(t=>t.stop());qrStream=null}
  const v=$("scannerVideo"); if(v) v.srcObject=null;
  close("scannerOverlay");
}

function decodeVideoFrame(){
  if(qrScanBusy || !qrStream || !window.jsQR) return;
  const v=$("scannerVideo");
  if(!v || !v.videoWidth || !v.videoHeight) return;
  qrScanBusy=true;
  try{
    if(!qrCanvas) qrCanvas=document.createElement("canvas");
    // Downscale large camera frames for faster, more reliable mobile decoding.
    const max=1000, scale=Math.min(1,max/v.videoWidth);
    qrCanvas.width=Math.max(1,Math.round(v.videoWidth*scale));
    qrCanvas.height=Math.max(1,Math.round(v.videoHeight*scale));
    if(!qrCtx) qrCtx=qrCanvas.getContext("2d",{willReadFrequently:true});
    qrCtx.drawImage(v,0,0,qrCanvas.width,qrCanvas.height);
    const image=qrCtx.getImageData(0,0,qrCanvas.width,qrCanvas.height);
    const code=window.jsQR(image.data,image.width,image.height,{inversionAttempts:"attemptBoth"});
    if(code?.data) handleQrValue(code.data);
  }catch(e){
    console.warn("[SPIKE QR] frame decode failed",e);
  }finally{
    qrScanBusy=false;
  }
}

async function startScanner(){
  closeProfileMenu(); open("scannerOverlay");
  const v=$("scannerVideo");
  try{
    if(!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not supported in this browser.");
    qrStream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},
      audio:false
    });
    v.srcObject=qrStream;
    await v.play();

    // jsQR is the reliable fallback and also avoids browser-specific BarcodeDetector behavior.
    if(window.jsQR){
      qrScanTimer=setInterval(decodeVideoFrame,250);
    }else if("BarcodeDetector" in window){
      const detector=new BarcodeDetector({formats:["qr_code"]});
      qrScanTimer=setInterval(async()=>{
        if(qrScanBusy || !v.videoWidth)return;
        qrScanBusy=true;
        try{
          const codes=await detector.detect(v);
          if(codes?.[0]?.rawValue)handleQrValue(codes[0].rawValue);
        }catch(e){console.warn("[SPIKE QR] native detector failed",e)}
        finally{qrScanBusy=false}
      },350);
    }else{
      throw new Error("QR scanner could not be loaded. Please reload the page.");
    }
  }catch(e){
    toast(e.message||"Camera permission is required to scan QR codes.","error");
    stopScanner();
  }
}

function handleQrValue(raw){
  let uid=null;
  const value=String(raw||"").trim();
  try{
    const u=new URL(value);
    if(u.protocol==="spike:"&&u.searchParams.get("uid")) uid=u.searchParams.get("uid");
    else if(u.searchParams.get("uid")) uid=u.searchParams.get("uid");
    else if(u.pathname.includes("profile.html")) uid=u.searchParams.get("uid");
  }catch{}
  if(!uid && /^[-0-9a-f]{36}$/i.test(value)) uid=value;
  if(!uid||uid===state.uid){
    toast(uid===state.uid?"That's your own QR code.":"Invalid SPIKE QR code.","warning");
    return;
  }
  stopScanner(); prepareConnect(uid);
}

async function prepareConnect(uid){
  qrTargetUid=uid;
  try{
    const {data:profiles,error}=await db.rpc("get_qr_connect_profile",{p_user_id:uid});
    if(error)throw error;
    const data=Array.isArray(profiles)?profiles[0]:null;
    if(!data)throw new Error("SPIKE member not found");
    $("connectName").textContent=nameOf(data);
    $("connectSpId").textContent=data.sp_id?`SPIKE ID • ${data.sp_id}`:"SPIKE member";
    const a=avatarOf(data);
    $("connectAvatarWrap").innerHTML=a
      ?`<img class="connect-avatar" src="${esc(a)}" alt="" loading="lazy" decoding="async">`
      :`<div class="connect-avatar connect-avatar-fallback">${esc(nameOf(data)[0]||"U")}</div>`;
    open("connectPreview");
  }catch(e){
    toast(e.message||"Could not load this SPIKE profile","error");
  }
}

async function connectInstant(){
  if(!qrTargetUid)return;
  const b=$("connectConfirm"); b.disabled=true; b.textContent="Connecting…";
  try{
    const {data,error}=await db.rpc("connect_via_spike_qr",{p_user_id:qrTargetUid});
    if(error)throw error;
    if(data?.ok!==true) throw new Error("SPIKE could not confirm this connection. Please try again.");
    close("connectPreview");
    toast(data.already_friends?"You're already connected on SPIKE.":"Connected successfully on SPIKE!","success");
  }catch(e){
    toast(e.message||"Could not connect","error");
  }finally{
    b.disabled=false; b.textContent="SPIKE Connect instantly";
  }
}

$("showQr")?.addEventListener("click",()=>{closeProfileMenu();openQr()});
$("scanQr")?.addEventListener("click",startScanner);
$("qrClose")?.addEventListener("click",()=>close("qrOverlay"));
$("qrCopy")?.addEventListener("click",async()=>{
  try{
    await navigator.clipboard.writeText(spikeQrPayload());
    toast("SPIKE QR link copied","success");
  }catch{toast(spikeQrPayload(),"info")}
});
$("qrShare")?.addEventListener("click",async()=>{
  try{
    await navigator.share?.({
      title:"Connect with me on SPIKE",
      text:`Connect with ${nameOf(state.profile)} on SPIKE`,
      url:spikeQrPayload()
    });
  }catch{}
});
$("qrOverlay")?.addEventListener("click",e=>{if(e.target.id==="qrOverlay")close("qrOverlay")});
$("scannerClose")?.addEventListener("click",stopScanner);
$("galleryQr")?.addEventListener("click",()=>$("qrFile").click());

$("qrFile")?.addEventListener("change",async e=>{
  const f=e.target.files?.[0]; if(!f)return;
  try{
    if(!window.jsQR) throw new Error("QR scanner could not be loaded. Please reload the page.");
    const bitmap=await createImageBitmap(f);
    const max=1800,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
    const c=document.createElement("canvas");
    c.width=Math.max(1,Math.round(bitmap.width*scale));
    c.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=c.getContext("2d",{willReadFrequently:true});
    ctx.drawImage(bitmap,0,0,c.width,c.height);
    bitmap.close?.();
    const image=ctx.getImageData(0,0,c.width,c.height);
    const code=window.jsQR(image.data,image.width,image.height,{inversionAttempts:"attemptBoth"});
    if(code?.data) handleQrValue(code.data);
    else throw new Error("No QR code found in that image.");
  }catch(err){
    toast(err.message||"Could not scan that QR image.","error");
  }finally{e.target.value=""}
});

$("connectCancel")?.addEventListener("click",()=>{qrTargetUid=null;close("connectPreview")});
$("connectConfirm")?.addEventListener("click",connectInstant);
window.addEventListener("pagehide",stopScanner);
bindSpidShare();
boot();

