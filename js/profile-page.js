"use strict";
const CLOUDINARY_CONFIG = {
cloudName: 'vhmoz6a0',
uploadPreset: 'spike_present'
};
const SUPABASE_URL="https://cjqpyndceqyqsijihxbb.supabase.co";
const SUPABASE_KEY="sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:"pkce"}});
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
const nameOf=u=>u?.display_name||u?.full_name||u?.name||u?.email||"User",avatarOf=u=>u?.avatar_url||u?.avatar||"";
const profileLink=id=>`profile.html?uid=${encodeURIComponent(id)}`;
const state={me:null,uid:null,profile:null,posts:[],following:false,followers:0,followingIds:[],activePost:null,realtime:null,views:0,canSeePosts:true,canSeeMedia:true,canSeeOnline:false,canSeeFriends:true,privacyLoadError:false,socialRealtime:[],cover:{url:"",position_x:0,position_y:0,zoom:1,fit:"cover"}};
function syncThemeColor(){try{const meta=document.querySelector('meta[name="theme-color"]');if(meta){const bg=getComputedStyle(document.documentElement).getPropertyValue('--spike-bg').trim();if(bg)meta.setAttribute('content',bg)}}catch(_){}}
document.addEventListener('spike:theme-change',syncThemeColor);
function toast(s,type,ms){spikePremiumToast(s,type,ms||3200)}
function open(id){$(id).classList.add("open")}function close(id){$(id).classList.remove("open")}
function ago(v){const d=new Date(v);if(!v||isNaN(d))return"Just now";const s=(Date.now()-d)/1000;if(s<60)return"now";if(s<3600)return Math.floor(s/60)+"m";if(s<86400)return Math.floor(s/3600)+"h";if(s<604800)return Math.floor(s/86400)+"d";return d.toLocaleDateString(undefined,{month:"short",day:"numeric"})}
function dateLabel(v){const d=new Date(v);return v&&!isNaN(d)?d.toLocaleDateString(undefined,{month:"long",year:"numeric"}):""}
function docPath(p){return db.from("app_documents").select("*").eq("path",p).maybeSingle()}
async function getDoc(p){const r=await docPath(p);if(r.error)throw r.error;return r.data?.data||null}
async function putDoc(path,data,parent=""){const old=await docPath(path);const row={path,parent_path:(parent&&parent!==path.split("/")[0])?parent:"",collection_name:path.split("/").slice(0,-1).join("/")||path.split("/")[0],document_id:path.split("/").pop(),owner_id:state.me?.id||null,data,updated_at:now(),created_at:old.data?.created_at||now()};const r=await db.from("app_documents").upsert(row,{onConflict:"path"});if(r.error)throw r.error}
async function listCollection(c,p=""){let q=db.from("app_documents").select("*").eq("collection_name",c);if(p)q=q.eq("parent_path",p);const r=await q;if(r.error)throw r.error;return r.data||[]}
async function bootAuth(){const r=await Promise.race([db.auth.getSession(),new Promise((_,rej)=>setTimeout(()=>rej(new Error("Session check timed out.")),15000))]);if(r.error||!r.data.session?.user){location.replace("index.html?reauth=1");return false}state.me=r.data.session.user;window.__SPIKE_ONLINE_ALLOWED__=true;state.uid=new URLSearchParams(location.search).get("uid")||state.me.id;return true}
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
const privacy=state.privacy||{profile_visibility:"public",posts_visibility:"public",media_visibility:"public",friends_visibility:"public",allow_messages:"friends",allow_calls:"friends",show_online_status:true,allow_profile_discovery:true};
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
  const {data,error}=await db.rpc("get_public_profiles",{p_user_ids:[state.uid]});
  if(error) throw error;
  const relational=Array.isArray(data)?data[0]:null;
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

  state.profile={
    ...extras,
    ...relational,
    id:relational.id,
    verified:relational.verified===true
  };

}

async function loadPrivacy(){
 if(!state.me?.id) return;
 const own=state.uid===state.me.id;
 let privacy=null;
 if(own){
   const r=await db.from("profile_privacy").select("user_id,profile_visibility,posts_visibility,media_visibility,friends_visibility,allow_messages,allow_calls,show_online_status,allow_profile_discovery").eq("user_id",state.uid).maybeSingle();
   state.privacyLoadError=!!r.error || !r.data;
   if(r.error) console.warn("[SPIKE PRIVACY LOAD]",r.error.message);
   privacy=r.data;
 }
 state.privacy=privacy||{user_id:state.uid,profile_visibility:"private",posts_visibility:"private",media_visibility:"private",friends_visibility:"private",allow_messages:"friends",allow_calls:"friends",show_online_status:false,allow_profile_discovery:false};
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
     document.body.innerHTML='<div style="min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui;background:#07110d;color:#fff;text-align:center"><div><div style="font-size:42px">🔒</div><h2>Private profile</h2><p style="color:#9aa7a0">You do not have permission to view this profile.</p><a href="feed.html" style="color:#58f29c">Back to Feed</a></div></div>';
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
  state.views=state.uid===state.me.id?Number(meDoc?.profileViews||0):0;
}

async function loadPosts(){
  if(!state.canSeePosts){ state.posts=[]; return; }
  if(state.uid!==state.me.id){
    const r=await db.rpc('get_public_profile_posts',{p_owner:state.uid,p_limit:12});
    if(r.error) throw r.error;
    state.posts=(r.data||[]).map(x=>({
      id:x.id, authorUid:state.uid, content:x.content||'',
      createdAt:x.created_at, mediaUrl:x.media_url||'', mediaType:x.media_type||''
    }));
    return;
  }
  // Filter at the database instead of downloading every user's post documents.
  const r=await db.from("app_documents").select("document_id,data,updated_at")
    .eq("collection_name","posts")
    .eq("data->>authorUid",state.uid)
    .order("updated_at",{ascending:false});
  if(r.error) throw r.error;
  state.posts=(r.data||[]).map(row=>({id:row.document_id,...(row.data||{})}))
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
function renderFeatures(){const own=state.uid===state.me.id,p=state.profile||{},media=state.posts.filter(x=>x.mediaUrl).length;$("activityPosts").textContent=state.canSeePosts===false?'—':state.posts.length;$("activityMedia").textContent=state.canSeeMedia===false?'—':media;$("activityFollowers").textContent=state.canSeeFriends===false?'—':state.followers;$("insightPosts").textContent=state.posts.length;$("insightMedia").textContent=media;$("insightViews").textContent=own?(state.views||0):"—";$("insightsCard").classList.toggle("hidden",!own);const visibleOnline=state.uid===state.me.id ? state.privacy?.show_online_status!==false : state.canSeeOnline!==false; const online=visibleOnline && String(p.presence_status||p.presence||"").toLowerCase()==="online";$("profilePresenceDot").classList.toggle("online",online);$("profilePresenceText").textContent=visibleOnline?(online?"Online":"Offline"):"Offline";}function openShareProfile(){const text=`Check out ${nameOf(state.profile)} on SPIKE`;if(navigator.share)navigator.share({title:"SPIKE Profile",text,url:location.href}).catch(()=>{});else navigator.clipboard?.writeText(location.href).then(()=>toast("Profile link copied","success")).catch(()=>toast(location.href,"info"))}
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
function galleryMedia(){
  if(!state.canSeeMedia)return [];
  const out=[];
  state.posts.forEach(p=>mediaItemsOf(p).forEach((item,index)=>out.push({post:p,item,index})));
  return out;
}
function renderMediaGallery(){
  const items=galleryMedia();
  $("mediaCountLabel").textContent=`${items.length} ${items.length===1?"item":"items"}`;
  if(!items.length){$("mediaPosts").innerHTML='<div class="media-empty"><div style="font-size:26px;margin-bottom:8px">▧</div><b>No media yet</b><div style="margin-top:5px">Photos and videos shared on this profile will appear here.</div></div>';return}
  $("mediaPosts").innerHTML=items.map((entry,i)=>{
    const item=entry.item, type=mediaTypeOfItem(item), url=esc(item.url||item.mediaUrl), multi=mediaItemsOf(entry.post).length>1;
    return `<button class="media-tile" type="button" data-gallery-index="${i}" aria-label="Open ${type} ${i+1} of ${items.length}">${type==="video"?`<video src="${url}" muted playsinline preload="metadata"></video>`:`<img src="${url}" alt="" loading="lazy" decoding="async">`}${type==="video"?'<span class="media-tile-badge">▶</span>':""}${multi?'<span class="media-tile-badge media-tile-stack">▣</span>':""}</button>`;
  }).join("");
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
function renderCover(){const c=state.cover||{};const img=$("coverImg"),gen=$("generatedCover");if(!img)return;const has=!!c.url;if(gen){gen.innerHTML=has?"":(window.SPIKE_IDENTITY?.coverMarkup?.(state.profile)||"");gen.setAttribute("aria-hidden",has?"true":"false")}if(has){img.src=c.url;img.classList.remove("hidden");applyCoverStyle()}else{img.removeAttribute("src");img.classList.add("hidden")};const own=state.uid===state.me.id;$("coverActions")?.classList.toggle("hidden",!own);$("coverAdjust")?.classList.toggle("hidden",!has||!own)}
function openCoverEditor(){
  if(!state.cover?.url){toast("Add a cover photo first.","info");return}
  const img=$("coverEditorImg");img.src=state.cover.url;$("coverZoom").value=Math.round(clamp(Number(state.cover.zoom||1),1,2.5)*100);$("coverZoomValue").textContent=$("coverZoom").value+"%";updateCoverEditorTransform();open("coverEditorOverlay");$("coverEditorOverlay").setAttribute("aria-hidden","false")
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
  $("coverZoom")?.addEventListener("input",()=>{state.cover.zoom=Number($("coverZoom").value)/100;updateCoverEditorTransform()});
  $("coverReset")?.addEventListener("click",resetCoverEditor);$("coverEditorSave")?.addEventListener("click",saveCoverSettings);$("coverEditorClose")?.addEventListener("click",()=>{close("coverEditorOverlay");$("coverEditorOverlay").setAttribute("aria-hidden","true")});$("coverEditorCancel")?.addEventListener("click",()=>{close("coverEditorOverlay");$("coverEditorOverlay").setAttribute("aria-hidden","true")});
  const area=$("coverEditorPreview");let drag=null;
  area?.addEventListener("pointerdown",e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:Number(state.cover.position_x||0),py:Number(state.cover.position_y||0)};area.classList.add("dragging");area.setPointerCapture?.(e.pointerId)});
  area?.addEventListener("pointermove",e=>{if(!drag||drag.id!==e.pointerId)return;const rect=area.getBoundingClientRect();state.cover.position_x=clamp(drag.px+(e.clientX-drag.x)/rect.width*100,-40,40);state.cover.position_y=clamp(drag.py+(e.clientY-drag.y)/rect.height*100,-40,40);updateCoverEditorTransform()});
  const end=()=>{drag=null;area.classList.remove("dragging")};area?.addEventListener("pointerup",end);area?.addEventListener("pointercancel",end);area?.addEventListener("wheel",e=>{e.preventDefault();state.cover.zoom=clamp(Number(state.cover.zoom||1)+(e.deltaY<0?.05:-.05),1,2.5);$("coverZoom").value=Math.round(state.cover.zoom*100);updateCoverEditorTransform()},{passive:false});
  $("coverEditorOverlay")?.addEventListener("click",e=>{if(e.target.id==="coverEditorOverlay"){$("coverEditorCancel").click()}});
}
function renderIdentity(){const p=state.profile||{},n=nameOf(p),a=avatarOf(p);$("headerTitle").textContent=n;$("displayName").textContent=n;const handle=String(p.username||"").replace(/^@/,"");$("username").textContent=handle?"@"+handle:"";$("bio").textContent=p.bio||p.about||"";$("verified").classList.toggle("hidden",p.verified!==true);$("verified").setAttribute("aria-label",p.verified===true?"Verified account":"");$("avatar").innerHTML=window.SPIKE_IDENTITY?.avatarMarkup?.(p,"profile-avatar",n)|| (a?`<img src="${esc(a)}" alt="${esc(n)}" loading="lazy" decoding="async">`:esc(n[0]||"U"));renderCover();const m=[];if(p.location)m.push(`<span>📍 ${esc(p.location)}</span>`);if(p.website)m.push(`<span>🔗 <a href="${esc(/^https?:\/\//i.test(p.website)?p.website:"https://"+p.website)}" target="_blank" rel="noopener noreferrer">${esc(p.website.replace(/^https?:\/\//i,""))}</a></span>`);if(p.created_at||p.createdAt)m.push(`<span>◷ Joined ${esc(dateLabel(p.created_at||p.createdAt))}</span>`);$("meta").innerHTML=m.join("");const sp=p.sp_id||"";$("spidValue").textContent=sp||"SP-••••••";$("copySpid").onclick=async()=>{if(!sp)return;try{await navigator.clipboard.writeText(sp);toast("SP ID copied","success")}catch{toast(sp,"info")}};$("shareSpid").onclick=async()=>{if(!sp)return;const text=`${n} • ${sp}`;try{if(navigator.share)await navigator.share({title:"SPIKE Profile",text,url:location.href});else{await navigator.clipboard.writeText(location.href);toast("Profile link copied","success")}}catch{}}}
function renderActions(){const own=state.uid===state.me.id;const mutualLink=$("mutualConnectionsShortcut");if(mutualLink){mutualLink.hidden=own||state.canSeeFriends===false;mutualLink.href=`mutuals.html?uid=${encodeURIComponent(state.uid)}`;}$("actions").innerHTML=own?`<button class="btn primary" id="editBtn">Edit profile</button><a class="btn" href="feed.html">← Feed</a>`:`<button class="btn primary" id="followBtn">${state.following?"Following":"Follow"}</button><button class="btn" id="shareProfileBtn" type="button">↗ Share</button>`;$("openBlockedList")?.classList.toggle("hidden",!own);$("coverActions")?.classList.toggle("hidden",!own);$("coverEdit")?.classList.toggle("hidden",!own);$("coverAdjust")?.classList.toggle("hidden",!own||!state.cover?.url);$("editBtn")?.addEventListener("click",fillEdit);$("followBtn")?.addEventListener("click",toggleFollow)}
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
function fillEdit(){const p=state.profile;$("editName").value=p.display_name||p.full_name||p.name||"";$("editUsername").value=p.username||"";$("editBio").value=p.bio||p.about||"";$("editAvatar").value=p.avatar_url||p.avatar||"";$("editCover").value=state.cover?.url||p.cover_url||p.coverUrl||p.banner_url||p.banner||"";$("editWebsite").value=p.website||"";$("editLocation").value=p.location||"";$("editSocial").value=p.social_links||p.socialLinks||"";open("editOverlay")}
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
    let avatarUrl=$("editAvatar").value.trim();
    let coverUrl=$("editCover").value.trim();

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
      allow_calls:state.privacy?.allow_calls||"friends",
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
    const rpcPrivacy={profile_visibility:privacyPatch.profile_visibility,posts_visibility:privacyPatch.posts_visibility,media_visibility:privacyPatch.media_visibility,friends_visibility:privacyPatch.friends_visibility,allow_messages:privacyPatch.allow_messages,allow_calls:privacyPatch.allow_calls,show_online_status:privacyPatch.show_online_status,allow_profile_discovery:privacyPatch.allow_profile_discovery};
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
async function addComment(id,text){
  const clean=String(text||"").trim();
  if(!clean)return;
  if(clean.length>500)throw new Error("Comment is limited to 500 characters.");
  const p=state.posts.find(x=>x.id===id); if(!p||!state.me?.id)return;
  const old=Array.isArray(p.comments)?[...p.comments]:[];
  const comment={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),postId:String(id),authorUid:state.me.id,authorName:nameOf(state.profile),authorAvatar:avatarOf(state.profile),text:clean,createdAt:now()};
  p.comments=[...old,comment]; render();
  try{
    const {data,error}=await db.rpc("mutate_post_interaction",{p_post_id:String(id),p_action:"comment",p_emoji:null,p_comment:comment});
    if(error)throw error;
    if(data&&typeof data==="object")Object.assign(p,data);
    render(); toast("Comment added","success");
  }catch(err){p.comments=old;render();throw err;}
}

function bind(){
initCoverEditor();
$("coverAdjust")?.addEventListener("click",e=>{e.stopPropagation();if(state.uid===state.me.id)openCoverEditor()});
$("avatar").addEventListener("click",()=>state.uid===state.me.id&&openImagePicker("avatarFile"));
$("coverEdit").addEventListener("click",e=>{e.stopPropagation();state.uid===state.me.id&&openImagePicker("coverFile")});
$("coverArea").addEventListener("click",e=>{
if(state.uid===state.me.id && !e.target.closest("button")) openImagePicker("coverFile");
});
$("avatarFile").addEventListener("change",e=>{
const f=e.target.files?.[0];
if(f) uploadProfileImage(f,"avatar");
});
$("coverFile").addEventListener("change",e=>{
const f=e.target.files?.[0];
if(f) uploadProfileImage(f,"cover");
});
$("backBtn").onclick=()=>{
  if(history.length>1) history.back(); else location.href='feed.html';
};
$("menuBtn").onclick=()=>open("menuOverlay");$("closeMenu").onclick=()=>close("menuOverlay");
$("themeBtn")?.addEventListener("click",()=>{close("menuOverlay");const panel=$("profileThemeOverlay");if(panel){panel.hidden=false;panel.classList.add("open");syncProfileThemeChoices();$("profileThemeClose")?.focus();}});
$("profileThemeClose")?.addEventListener("click",closeProfileThemeChooser);
$("profileThemeOverlay")?.addEventListener("click",e=>{if(e.target===$("profileThemeOverlay"))closeProfileThemeChooser();});
document.querySelectorAll("[data-profile-theme]").forEach(btn=>btn.addEventListener("click",()=>{
  const id=Number(btn.dataset.profileTheme);
  if(window.SPIKE_THEME?.set){window.SPIKE_THEME.set(id);syncProfileThemeChoices();closeProfileThemeChooser();toast("Appearance changed to "+(window.SPIKE_THEMES?.[id-1]?.name||"your selected theme"),"success");}
  else toast("Theme service is unavailable. Please reload SPIKE.","error");
}));
function syncProfileThemeChoices(){const current=Number(window.SPIKE_THEME?.get?.()||document.documentElement.dataset.spikeStyle||1);document.querySelectorAll("[data-profile-theme]").forEach(btn=>{const active=Number(btn.dataset.profileTheme)===current;btn.classList.toggle("active",active);btn.setAttribute("aria-pressed",String(active));});}
function closeProfileThemeChooser(){const panel=$("profileThemeOverlay");if(panel){panel.classList.remove("open");panel.hidden=true;} $("themeBtn")?.focus();}
$("cancelEdit").onclick=()=>close("editOverlay");$("editForm").addEventListener("submit",saveProfile);
// File upload and URL entry are alternative sources; keep them mutually exclusive.
$("editAvatarFile").addEventListener("change",()=>{if($("editAvatarFile").files?.length) $("editAvatar").value="";});
$("editAvatar").addEventListener("input",()=>{if($("editAvatar").value.trim()) $("editAvatarFile").value="";});
$("editCoverFile").addEventListener("change",()=>{if($("editCoverFile").files?.length) $("editCover").value="";});
$("editCover").addEventListener("input",()=>{if($("editCover").value.trim()) $("editCoverFile").value="";});$("shareProfileBtn")?.addEventListener("click",openShareProfile);$("signOutBtn").onclick=async()=>{try{await window.AppPresence?.stop?.(true);try{await db.removeAllChannels?.()}catch(_){}const {error}=await db.auth.signOut({scope:"local"});if(error)throw error;location.replace("index.html?logged_out=1")}catch(e){console.error("[SPIKE PROFILE SIGNOUT]",e);toast(e.message||"Could not sign out. Please try again.","error")}};$("copyProfile").onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast("Profile link copied")}catch{toast(location.href)}};document.querySelectorAll(".overlay").forEach(o=>o.addEventListener("click",e=>{if(e.target===o)o.classList.remove("open")}));document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".overlay.open").forEach(x=>x.classList.remove("open"))});document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===t));$("mediaPanel").classList.toggle("hidden",t.dataset.tab!=="media");$("aboutPanel").classList.toggle("hidden",t.dataset.tab!=="about")});$("mediaPosts").addEventListener("click",e=>{const tile=e.target.closest("[data-gallery-index]");if(tile)openMediaViewer(Number(tile.dataset.galleryIndex))});}
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
  const p=entry.post,item=entry.item,type=mediaTypeOfItem(item),url=esc(item.url||item.mediaUrl);
  $("mediaViewerCount").textContent=`${mediaViewerIndex+1} / ${items.length}`;
  $("mediaViewerPrev").disabled=mediaViewerIndex===0;
  $("mediaViewerNext").disabled=mediaViewerIndex===items.length-1;
  $("mediaViewerStage").innerHTML=type==="video"?`<video src="${url}" controls playsinline autoplay preload="metadata"></video>`:`<img src="${url}" alt="SPIKE media" decoding="async">`;
  const n=esc(p.authorName||nameOf(state.profile)),a=avatarOf(state.profile);
  $("mediaViewerAuthor").textContent=p.authorName||nameOf(state.profile);
  $("mediaViewerTime").textContent=ago(p.createdAt||p.created_at);
  $("mediaViewerCaption").textContent=p.content||"";
  $("mediaViewerAvatar").innerHTML=a?`<img src="${esc(a)}" alt="" loading="lazy">`:esc((p.authorName||nameOf(state.profile)||"S")[0]);
  const likeBtn=$("mediaViewerLike"),saveBtn=$("mediaViewerSave");
  likeBtn.innerHTML=`♥ <span>${likeCount(p)}</span>`;
  likeBtn.classList.toggle("active",liked(p));
  saveBtn.textContent=saved(p)?"🔖 Saved":"🔖 Save";
  saveBtn.classList.toggle("active",saved(p));
  $("mediaViewerComment").innerHTML=`💬 <span>${Array.isArray(p.comments)?p.comments.length:0}</span>`;
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
$("mediaViewerClose").onclick=closeMediaViewer;
$("mediaViewerPrev").onclick=()=>moveMediaViewer(-1);
$("mediaViewerNext").onclick=()=>moveMediaViewer(1);
$("mediaViewer").addEventListener("click",e=>{if(e.target.matches("[data-media-close]"))closeMediaViewer()});

document.addEventListener("keydown",e=>{if(!$("mediaViewer").classList.contains("open"))return;if(e.key==="Escape")closeMediaViewer();else if(e.key==="ArrowLeft")moveMediaViewer(-1);else if(e.key==="ArrowRight")moveMediaViewer(1)});
let mediaSwipeX=0;
$("mediaViewerStage").addEventListener("touchstart",e=>{mediaSwipeX=e.changedTouches[0]?.clientX||0},{passive:true});
$("mediaViewerStage").addEventListener("touchend",e=>{const x=e.changedTouches[0]?.clientX||0,d=x-mediaSwipeX;if(Math.abs(d)>55)moveMediaViewer(d<0?1:-1)},{passive:true});

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
async function boot(){bind();try{if(!(await bootAuth()))return;initAdminHeader();
  // QR identity controls are owner-only; a viewer must never be able to present
  // another member's connect QR as if it were their own.
  const ownerView=state.uid===state.me.id;
  if($('showQr')) $('showQr').hidden=!ownerView;
  if($('copyProfile')) $('copyProfile').textContent=ownerView?'🔗 Copy profile link':'🔗 Share profile link';
await loadProfile();await loadCoverSettings();await loadPrivacy();await loadPosts();window.__SPIKE_ONLINE_ALLOWED__=state.canSeeOnline;if(window.__SPIKE_ONLINE_ALLOWED__) window.AppPresence?.start(db); else window.AppPresence?.stop?.();await loadSocial();renderIdentity();renderCover();renderActions();renderAbout();render();await realtime();$("loader").classList.add("hide");if(new URLSearchParams(location.search).get("edit")==="1"&&state.uid===state.me.id){history.replaceState(history.state,"",location.pathname);fillEdit()}}catch(e){console.error("[SPIKE PROFILE]",e);$("loaderText").textContent="SPIKE could not load this profile.";$("loader").classList.add("hide");toast(e.message||"Profile initialization failed") }}

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
  close("menuOverlay"); open("scannerOverlay");
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

$("showQr")?.addEventListener("click",()=>{close("menuOverlay");openQr()});
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
boot();

