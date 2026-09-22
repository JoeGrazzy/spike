/* SPIKE Identity System — theme-safe identity media + gender-aware avatar fallback. */
(function(){
  'use strict';
  const AVATAR_PATHS={male:['assets/avatars/male.png','assets/male.png'],female:['assets/avatars/female.png','assets/female.png']};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names=u=>String(u?.display_name||u?.full_name||u?.name||u?.username||u?.email||'User').trim()||'User';
  const initials=u=>{const n=names(u).replace(/@.*$/,'').trim();const parts=n.split(/\s+/).filter(Boolean);return esc(((parts[0]?.[0]||'S')+(parts.length>1?parts[parts.length-1][0]||'':'')).slice(0,2).toUpperCase());};
  const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
  const theme=()=>Number(window.SPIKE_THEME?.get?.()||document.documentElement.dataset.spikeThemeId||1)||1;
  function avatarData(u){const id=String(u?.id||u?.user_id||u?.uid||names(u));const t=theme(),h=hash(id+'|'+t);return {seed:h,theme:t,a:String((h%12)+8),b:String(((h>>>8)%12)+8),rot:(h%360)};}
  function genderOf(p){const x=p||{};const raw=x.gender??x.sex??x.user_metadata?.gender??x.userMetadata?.gender??x.profile?.gender??'';const g=String(raw||'').trim().toLowerCase();if(['male','m','man','boy'].includes(g))return'male';if(['female','f','woman','girl'].includes(g))return'female';return'';}
  function imageOf(p){const x=p||{};const u=x.avatar_url??x.avatarUrl??x.profile_image_url??x.profileImageUrl??x.photo_url??x.photoUrl??x.image_url??x.imageUrl??x.picture??x.avatar??'';return typeof u==='string'&&/^(https?:)?\/\//i.test(u.trim())?u.trim():'';}
  function coverStyle(u){const id=String(u?.id||u?.user_id||u?.uid||names(u)),d=avatarData({id});return `--spike-cover-r:${d.rot}deg;--spike-cover-a:${d.a}%;--spike-cover-b:${d.b}%;`;}
  function coverMarkup(u,cls='spike-generated-cover'){return `<div class="${esc(cls)}" data-spike-identity="cover" data-spike-theme="${theme()}" style="${coverStyle(u)}" role="img" aria-label="SPIKE ambient cover for ${esc(names(u))}"><span></span><i></i><b></b></div>`;}
  function generatedAvatar(u,cls,label){const d=avatarData(u),ini=initials(u),name=esc(label||names(u));return `<span class="${esc(cls)} spike-generated-avatar" data-spike-identity="avatar" data-spike-theme="${d.theme}" style="--spike-id-a:${d.a};--spike-id-b:${d.b};--spike-id-r:${d.rot}deg" role="img" aria-label="${name} SPIKE avatar"><span class="spike-id-mark">${ini}</span><i aria-hidden="true"></i></span>`;}
  function fallbackMarkup(g,cls,alt){const p=AVATAR_PATHS[g]||[];if(!p.length)return'';return `<img class="${esc(cls||'spike-avatar')} spike-avatar-fallback" src="${esc(p[0])}" data-spike-fallback-next="${esc(p[1]||'')}" data-spike-avatar-fallback="${g}" alt="${esc(alt||'')}" loading="lazy" decoding="async">`;}
  function avatarMarkup(u,cls='spike-generated-avatar',label){
    const c=cls||'spike-generated-avatar',name=label||names(u),src=imageOf(u),g=genderOf(u);
    if(src)return `<img class="${esc(c)}" src="${esc(src)}"${g?` data-spike-avatar-gender="${g}"`:''} alt="${esc(name)}" loading="lazy" decoding="async">`;
    if(g)return fallbackMarkup(g,c,name);
    return generatedAvatar(u,c,name);
  }
  function installImageFallbacks(root=document){
    root.querySelectorAll('img[data-spike-avatar-fallback],img[data-spike-avatar-gender]').forEach(img=>{
      if(img.dataset.spikeBound==='1')return;
      img.dataset.spikeBound='1';
      img.addEventListener('error',function(){
        const g=this.dataset.spikeAvatarGender||this.dataset.spikeAvatarFallback||'';
        const next=this.dataset.spikeFallbackNext;
        if(next&&!this.dataset.spikeFallbackTried){this.dataset.spikeFallbackTried='1';this.src=next;return;}
        if(g&&AVATAR_PATHS[g]?.[0]&&!this.dataset.spikeFallbackTried){this.dataset.spikeFallbackTried='1';this.src=AVATAR_PATHS[g][0];return;}
        const holder=document.createElement('span');
        holder.className=this.className.replace(/spike-avatar-fallback|spike-avatar-broken/g,'')+' spike-avatar-initials';
        holder.setAttribute('aria-label',this.alt||'SPIKE User');holder.textContent=(this.alt||'S').trim().charAt(0).toUpperCase()||'S';
        this.replaceWith(holder);
      });
    });
  }
  window.SPIKE_IDENTITY=Object.freeze({avatarMarkup,coverMarkup,avatarData,initials,hash,genderOf,imageOf,installImageFallbacks,avatarFallbackPaths:AVATAR_PATHS});
  const refresh=()=>document.querySelectorAll('[data-spike-identity="avatar"],[data-spike-identity="cover"]').forEach(el=>{el.dataset.spikeTheme=String(theme())});
  document.addEventListener('spike:theme-change',refresh,{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>installImageFallbacks(),{once:true});else installImageFallbacks();
  new MutationObserver(()=>installImageFallbacks()).observe(document.documentElement,{childList:true,subtree:true});
})();
