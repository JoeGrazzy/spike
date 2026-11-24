/* SPIKE profile runtime: authenticated own-profile data, social lists and actions. */
(() => {
  'use strict';
  const db = () => window.SPIKE_SUPABASE || window.db;
  const $ = id => document.getElementById(id);
  const state = { user: null, profile: null, posts: [], media: [], likes: new Set(), saves: new Set(), loading: false, channels: [], hiddenCounts: false, viewerEntries: [], viewerIndex: 0, suppressStatClick: false };
  const notify = (message, type = 'info') => window.spikePremiumToast?.(message, type, 4500) || console.info('[SPIKE profile]', message);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const profileUrl = id => `profile.html?uid=${encodeURIComponent(id)}`;
  const profileLibraryPromises = new Map();
  function loadProfileLibrary(name) {
    const libraries = {
      qrcode: { src: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js', ready: () => typeof window.qrcode === 'function' },
      jsqr: { src: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js', ready: () => typeof window.jsQR === 'function' }
    };
    const library = libraries[name];
    if (!library) return Promise.reject(new Error('Unknown profile utility.'));
    if (library.ready()) return Promise.resolve();
    if (profileLibraryPromises.has(name)) return profileLibraryPromises.get(name);
    const pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = library.src;
      script.async = true;
      script.onload = () => library.ready() ? resolve() : reject(new Error('Profile utility did not initialize.'));
      script.onerror = () => reject(new Error('Could not load the QR utility. Check your connection and retry.'));
      document.head.append(script);
    }).catch(error => { profileLibraryPromises.delete(name); throw error; });
    profileLibraryPromises.set(name, pending);
    return pending;
  }
  const nameOf = p => p?.display_name || p?.username || 'SPIKE member';
  const mediaUrl = async item => {
    if (!item?.object_path) return '';
    const { data, error } = await db().storage.from('post-media').createSignedUrl(item.object_path, 600);
    if (error) throw error;
    return data.signedUrl;
  };
  function loader(error) {
    const el = $('loader'); if (!el) return;
    el.classList.add('hide'); el.setAttribute('aria-hidden', 'true');
    $('profileLoaderRetry') && ($('profileLoaderRetry').hidden = !error);
    if (error) { el.classList.remove('hide'); el.classList.add('is-error'); $('loaderText').textContent = 'Profile could not load'; $('loaderSubtitle').textContent = error.message || 'Check your connection and retry.'; $('loaderStage').textContent = 'NEEDS ATTENTION'; }
  }
  function setText(id, value) { const el = $(id); if (el) el.textContent = value ?? ''; }
  function paintProfile() {
    const p = state.profile; if (!p) return;
    setText('displayName', nameOf(p)); setText('username', `@${p.username || 'member'}`); setText('bio', p.bio || ''); setText('spidValue', p.spike_id ? String(p.spike_id).replace(/^SP-/i, 'SPK-') : 'Not assigned');
    const verified = $('verified'); if (verified) verified.classList.toggle('hidden', p.verified !== true);
    const meta = $('meta'); if (meta) { meta.replaceChildren(); if (p.location) { const s=document.createElement('span'); s.textContent=`⌖ ${p.location}`; meta.append(s); } if (p.website) { const a=document.createElement('a'); a.href=p.website; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=`↗ ${p.website.replace(/^https?:\/\//,'')}`; meta.append(a); } }
    const avatar = $('avatar'); if (avatar) { avatar.replaceChildren(); if (p.avatar_path) { const img=document.createElement('img'); img.src=p.avatar_path; img.alt='Profile photo'; avatar.append(img); } else avatar.textContent=nameOf(p).trim().charAt(0).toUpperCase() || 'S'; }
    const cover = $('coverImg'); if (cover) { if (p.cover_path) { cover.src=p.cover_path; cover.classList.remove('hidden'); } else { cover.removeAttribute('src'); cover.classList.add('hidden'); } }
    const about = $('aboutGrid'); if (about) { about.replaceChildren(); [['About',p.bio],['Location',p.location],['Website',p.website],['SPK ID',p.spike_id ? String(p.spike_id).replace(/^SP-/i, 'SPK-') : '']].forEach(([label,value])=>{ if(!value)return; const item=document.createElement('div');item.className='about-item';const b=document.createElement('strong');b.textContent=label;const v=document.createElement('span');v.textContent=value;item.append(b,v);about.append(item); }); if(!about.children.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='Add a bio, location or website to tell people more about you.';about.append(empty);} }
    const actions=$('actions'); if(actions && !$('openProfileEditor')) { const b=document.createElement('button');b.type='button';b.id='openProfileEditor';b.className='btn primary';b.textContent='Edit profile';b.addEventListener('click',()=>document.getElementById('editOverlay')?.classList.add('open'));actions.replaceChildren(b); }
    const coverActions=$('coverActions'); if(coverActions) coverActions.classList.remove('hidden');
    const spidCard=$('spidCard'); if(spidCard) spidCard.hidden=!p.spike_id;
  }
  async function loadStats() {
    const tasks = await Promise.allSettled([
      db().from('posts').select('id',{count:'exact',head:true}).eq('author_id',state.user.id).eq('status','published'),
      window.SPIKE.social.listMutualFriends(db(),{limit:2000,offset:0})
    ]);
    const posts=tasks[0]; if(posts.status==='fulfilled'&&!posts.value.error)setText('postCount',String(posts.value.count||0));else setText('postCount','—');
    const friends=tasks[1]; if(friends.status==='fulfilled'){setText('friendCount',String(Array.isArray(friends.value)?friends.value.length:0));}else{setText('friendCount','—');console.warn('[SPIKE profile friend count]',friends.reason);}
  }
  async function loadPosts() {
    const {data,error}=await db().from('posts').select('id,author_id,body,visibility,comments_enabled,status,created_at').eq('author_id',state.user.id).eq('status','published').order('created_at',{ascending:false}).limit(100);
    if(error)throw error; state.posts=data||[];
    const ids=state.posts.map(p=>p.id); state.media=[];
    if(ids.length){const result=await db().from('post_media').select('id,post_id,object_path,media_type,position').in('post_id',ids).order('position',{ascending:true});if(result.error)throw result.error;state.media=await Promise.all((result.data||[]).map(async item=>({...item,url:await mediaUrl(item)})));}
    if(ids.length){const [likes,comments,saves]=await Promise.all([db().from('post_likes').select('post_id,user_id').in('post_id',ids),db().from('comments').select('post_id').in('post_id',ids).eq('status','published'),db().from('saved_posts').select('post_id').eq('user_id',state.user.id).in('post_id',ids)]);if(likes.error)throw likes.error;if(comments.error)throw comments.error;if(saves.error)throw saves.error;state.likes=new Set((likes.data||[]).filter(x=>x.user_id===state.user.id).map(x=>x.post_id));state.saves=new Set((saves.data||[]).map(x=>x.post_id));const likeCounts=new Map(),commentCounts=new Map();(likes.data||[]).forEach(x=>likeCounts.set(x.post_id,(likeCounts.get(x.post_id)||0)+1));(comments.data||[]).forEach(x=>commentCounts.set(x.post_id,(commentCounts.get(x.post_id)||0)+1));state.posts.forEach(post=>{post.likeCount=likeCounts.get(post.id)||0;post.commentCount=commentCounts.get(post.id)||0;});}
    renderGallery();
  }
  function renderGallery() {
    const host=$('mediaPosts'); if(!host)return; host.replaceChildren();
    const mediaByPost=new Map();state.media.forEach(m=>{if(!mediaByPost.has(m.post_id))mediaByPost.set(m.post_id,[]);mediaByPost.get(m.post_id).push(m);});
    const entries=[];state.posts.forEach(post=>(mediaByPost.get(post.id)||[]).forEach(item=>entries.push({post,item})));
    setText('mediaCountLabel',`${entries.length} item${entries.length===1?'':'s'}`);
    if(!entries.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Your published photos and videos will appear here.';host.append(empty);return;}
    entries.forEach(({post,item},index)=>{const button=document.createElement('button');button.type='button';button.className='profile-media-item';button.setAttribute('aria-label',`Open ${item.media_type} from post ${index+1}`);if(item.media_type==='video'){const video=document.createElement('video');video.src=item.url;video.muted=true;video.playsInline=true;video.preload='metadata';button.append(video);}else{const img=document.createElement('img');img.src=item.url;img.alt='Profile media';img.loading='lazy';button.append(img);}button.addEventListener('click',()=>openMedia(index,entries));host.append(button);});
  }
  function openMedia(index,entries){state.viewerEntries=entries;state.viewerIndex=index;const entry=entries[index],item=entry?.item;if(!item)return;const overlay=$('mediaViewer');if(!overlay)return;const stage=$('mediaViewerStage');stage.replaceChildren();if(item.media_type==='video'){const v=document.createElement('video');v.src=item.url;v.controls=true;v.autoplay=true;v.playsInline=true;stage.append(v);}else{const img=document.createElement('img');img.src=item.url;img.alt='Profile media';stage.append(img);}setText('mediaViewerCount',`${index+1} / ${entries.length}`);setText('mediaViewerAuthor',nameOf(state.profile));setText('mediaViewerTime',new Date(entry.post.created_at).toLocaleString());setText('mediaViewerCaption',entry.post.body||'');const post=entry.post;const like=$('mediaViewerLike'),save=$('mediaViewerSave');if(like){like.querySelector('span').textContent=String(post.likeCount||0);like.onclick=()=>toggleLike(post).then(()=>openMedia(index,entries)).catch(e=>notify(e.message,'error'));}if(save){save.textContent=state.saves.has(post.id)?'Saved':'Save';save.onclick=()=>toggleSave(post).then(()=>openMedia(index,entries)).catch(e=>notify(e.message,'error'));}$('mediaViewerComment')?.addEventListener('click',()=>location.href=`feed.html#post-${encodeURIComponent(post.id)}`,{once:true});$('mediaViewerShare')?.addEventListener('click',()=>share(`${location.origin}${profileUrl(state.user.id)}#post-${encodeURIComponent(post.id)}`,'SPIKE post'),{once:true});overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
  function closeMedia(){const v=$('mediaViewer');if(v){v.classList.remove('open');v.setAttribute('aria-hidden','true');v.querySelector('video')?.pause();}document.body.style.overflow='';}
  function showTab(tab){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('mediaPanel')?.classList.toggle('hidden',tab!=='media');$('aboutPanel')?.classList.toggle('hidden',tab!=='about');}
  function openList(kind){const overlay=$('socialListOverlay'),items=$('socialListItems');if(!overlay||!items)return;setText('socialListTitle',kind==='posts'?'Posts':kind==='blocked'?'Blocked members':kind);setText('socialListSubtitle',kind==='posts'?'Your published posts':'Manage your SPIKE connections');if($('socialListSearch'))$('socialListSearch').value='';items.replaceChildren();overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';if(kind==='posts'){renderPostsList(items);return;}items.textContent='Loading…';loadPeople(kind,items).catch(e=>{items.textContent=e.message||'Could not load this list.';});}
  async function loadPeople(kind,host){let rows=[];if(kind==='blocked'){const {data,error}=await db().from('blocks').select('blocked_id').eq('blocker_id',state.user.id).order('created_at',{ascending:false}).limit(200);if(error)throw error;const ids=(data||[]).map(x=>x.blocked_id);if(ids.length){const p=await db().from('profiles').select('id,username,display_name,avatar_path').in('id',ids);if(p.error)throw p.error;rows=p.data||[];}}else{rows=await window.SPIKE.social.getList(db(),state.user.id,kind,{limit:100,offset:0});}host.replaceChildren();if(!rows.length){host.textContent=`No ${kind} to show yet.`;return;}rows.forEach(person=>{const row=document.createElement('article');row.className='spike-social-person-row';row.dataset.socialSearch=`${nameOf(person)} ${person.username||''}`.toLowerCase();const a=document.createElement('a');a.className='spike-social-person';a.href=profileUrl(person.id);const avatar=document.createElement('span');avatar.className='spike-social-avatar';if(person.avatar_path||person.avatar_url){const img=document.createElement('img');img.src=person.avatar_path||person.avatar_url;img.alt='';avatar.append(img);}else avatar.textContent=(nameOf(person)[0]||'S').toUpperCase();const copyNode=document.createElement('span');const strong=document.createElement('strong');strong.textContent=nameOf(person);const small=document.createElement('small');small.textContent=person.username?`@${person.username}`:'SPIKE member';copyNode.append(strong,small);a.append(avatar,copyNode);row.append(a);if(kind==='blocked'){const b=document.createElement('button');b.type='button';b.textContent='Unblock';b.addEventListener('click',async()=>{b.disabled=true;try{const r=await db().rpc('dm_unblock_user',{p_other_user_id:person.id});if(r.error)throw r.error;row.remove();notify('Member unblocked.','success');}catch(e){notify(e.message||'Could not unblock member.','error');b.disabled=false;}});row.append(b);}host.append(row);});}
  function renderPostsList(host){host.replaceChildren();if(!state.posts.length){host.textContent='No published posts yet.';return;}state.posts.forEach(post=>{const article=document.createElement('article');article.className='spike-post-preview';article.dataset.postId=post.id;article.dataset.socialSearch=String(post.body||'').toLowerCase();const meta=document.createElement('small');meta.textContent=new Date(post.created_at).toLocaleString();const p=document.createElement('p');p.className='spike-post-preview-copy';p.textContent=post.body||'(Media post)';const actions=document.createElement('div');actions.className='spike-post-preview-actions';const make=(label,fn,active=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.classList.toggle('active',active);b.addEventListener('click',fn);actions.append(b);};make(`${state.likes.has(post.id)?'♥':'♡'} ${post.likeCount||0}`,()=>toggleLike(post));make(`${state.saves.has(post.id)?'Saved':'Save'}`,()=>toggleSave(post),state.saves.has(post.id));make(`Comments ${post.commentCount||0}`,()=>location.href=`feed.html#post-${encodeURIComponent(post.id)}`);make('Share',()=>share(`${location.origin}${profileUrl(state.user.id)}#post-${encodeURIComponent(post.id)}`, 'SPIKE post').catch(e=>{if(e.name!=='AbortError')notify(e.message,'error');}));make('Edit',()=>editPost(post));make('Delete',()=>deletePost(post));const first=state.media.find(m=>m.post_id===post.id);if(first){const media=document.createElement(first.media_type==='video'?'video':'img');media.src=first.url;if(media.tagName==='VIDEO'){media.controls=true;media.playsInline=true;}else{media.alt='Post media';media.loading='lazy';}article.append(meta,p,media,actions);}else article.append(meta,p,actions);host.append(article);});}
  async function toggleLike(post){const liked=state.likes.has(post.id);const result=liked?await db().from('post_likes').delete().eq('post_id',post.id).eq('user_id',state.user.id):await db().from('post_likes').insert({post_id:post.id,user_id:state.user.id});if(result.error)throw result.error;if(liked){state.likes.delete(post.id);post.likeCount=Math.max(0,(post.likeCount||0)-1);}else{state.likes.add(post.id);post.likeCount=(post.likeCount||0)+1;}renderPostsList($('socialListItems'));}
  async function toggleSave(post){const saved=state.saves.has(post.id);const result=saved?await db().from('saved_posts').delete().eq('post_id',post.id).eq('user_id',state.user.id):await db().from('saved_posts').insert({post_id:post.id,user_id:state.user.id});if(result.error)throw result.error;if(saved)state.saves.delete(post.id);else state.saves.add(post.id);renderPostsList($('socialListItems'));notify(saved?'Post removed from saved items.':'Post saved.','success');}
  async function editPost(post){const value=await window.SPIKEPremiumDialog.prompt('Edit your post',{title:'Edit your post',value:post.body||'',confirmText:'Save changes',cancelText:'Cancel'});if(value===null)return;if(value.length>10000){notify('Post text is too long.','error');return;}const {error}=await db().from('posts').update({body:value.trim(),updated_at:new Date().toISOString()}).eq('id',post.id).eq('author_id',state.user.id);if(error){notify(error.message,'error');return;}post.body=value.trim();renderPostsList($('socialListItems'));notify('Post updated.','success');}
  async function deletePost(post){if(!await window.SPIKEPremiumDialog.confirm({title:'Delete this post?',message:'This action cannot be undone.',confirmText:'Delete post',cancelText:'Keep post',danger:true}))return;const {error}=await db().rpc('delete_own_post',{p_post_id:post.id});if(error){notify(error.message,'error');return;}state.posts=state.posts.filter(p=>p.id!==post.id);state.media=state.media.filter(m=>m.post_id!==post.id);renderGallery();await loadStats();renderPostsList($('socialListItems'));notify('Post deleted.','success');}
  function closeList(){const o=$('socialListOverlay');o?.classList.remove('open');o?.setAttribute('aria-hidden','true');document.body.style.overflow='';}
  async function copy(text){if(!text)throw new Error('Nothing to copy.');if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{const t=document.createElement('textarea');t.value=text;document.body.append(t);t.select();document.execCommand('copy');t.remove();}}
  async function share(url,title){if(navigator.share)await navigator.share({title,url});else{await copy(url);notify('Link copied.','success');}}
  function openMenu(){const o=$('menuOverlay');o?.classList.add('open');o?.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
  function closeMenu(){const o=$('menuOverlay');o?.classList.remove('open');o?.setAttribute('aria-hidden','true');document.body.style.overflow='';}
  async function openQr(){const overlay=$('qrOverlay'),box=$('qrCodeBox');if(!overlay||!box)return;try{await loadProfileLibrary('qrcode');box.replaceChildren();const value=location.origin+profileUrl(state.user.id)+'&connect=1';const qr=window.qrcode(0,'M');qr.addData(value);qr.make();const wrap=document.createElement('div');wrap.innerHTML=qr.createSvgTag(5,2);box.append(wrap.firstElementChild);overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');}catch(error){notify(error.message||'Could not create your QR code.','error');}}

  let pendingConnectId = null;
  let scannerStream = null;
  let scannerHandled = false;
  let scannerRaf = 0;

  function parseSpikeUserIdFromPayload(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    let match = text.match(/[?&](?:uid|user_id)=([0-9a-f-]{36})/i);
    if (match) return match[1].toLowerCase();
    match = text.match(/\/(?:profile\.html|u\/|user\/)[^?\s]*[?&](?:uid|user_id)=([0-9a-f-]{36})/i);
    if (match) return match[1].toLowerCase();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
      return text.toLowerCase();
    }
    try {
      const url = new URL(text, location.origin);
      const id = url.searchParams.get('uid') || url.searchParams.get('user_id');
      if (id && /^[0-9a-f-]{36}$/i.test(id)) return id.toLowerCase();
    } catch (_) {}
    return null;
  }

  function stopScanner() {
    scannerHandled = true;
    if (scannerRaf) {
      try { cancelAnimationFrame(scannerRaf); } catch (_) {}
      scannerRaf = 0;
    }
    try {
      if (scannerStream) {
        scannerStream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
        scannerStream = null;
      }
    } catch (_) {}
    const video = $('scannerVideo');
    if (video) {
      try { video.pause(); } catch (_) {}
      try { video.srcObject = null; } catch (_) {}
    }
    const overlay = $('scannerOverlay');
    if (overlay) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
  }

  function avatarPublicUrl(path) {
    const raw = String(path || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    try {
      return db().storage.from('avatars').getPublicUrl(raw).data.publicUrl || '';
    } catch (_) {
      return '';
    }
  }

  async function openConnectPreview(userId) {
    if (!userId) throw new Error('Invalid SPIKE member.');
    stopScanner();
    if (state.user?.id && String(userId).toLowerCase() === String(state.user.id).toLowerCase()) {
      notify('That is your own SPIKE QR.', 'info');
      return;
    }
    const { data: blocked, error: blockError } = await db().rpc('spike_is_member_blocked', {
      p_target_user_id: userId
    });
    if (blockError) throw blockError;
    if (blocked === true) {
      notify('You cannot connect with this member.', 'info');
      return;
    }
    pendingConnectId = userId;
    const preview = $('connectPreview');
    if (!preview) {
      location.href = profileUrl(userId) + '&connect=1';
      return;
    }

    setText('connectName', 'Loading member…');
    setText('connectSpId', '');
    const wrap = $('connectAvatarWrap');
    if (wrap) {
      wrap.replaceChildren();
      const loading = document.createElement('div');
      loading.className = 'connect-avatar-fallback';
      loading.textContent = '…';
      wrap.append(loading);
    }

    // Show sheet immediately so the camera never stays on screen
    preview.classList.add('open');
    preview.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    try {
      let person = {};
      if (window.SPIKE?.social?.getPublicProfiles) {
        const profiles = await window.SPIKE.social.getPublicProfiles(db(), [userId]);
        person = profiles?.[0] || {};
      } else {
        const { data, error } = await db().from('profiles')
          .select('id,username,display_name,spike_id,avatar_path')
          .eq('id', userId).maybeSingle();
        if (error) throw error;
        person = data || {};
      }

      const name = person.display_name || person.username || 'SPIKE member';
      setText('connectName', name);
      const sp = person.spike_id ? String(person.spike_id).replace(/^SP-/i, 'SPK-') : '';
      setText('connectSpId', sp ? `SPK ID · ${sp}` : 'SPIKE member');

      if (wrap) {
        wrap.replaceChildren();
        const url = person.avatar_url || avatarPublicUrl(person.avatar_path);
        if (url) {
          const img = document.createElement('img');
          img.className = 'connect-avatar';
          img.alt = name;
          img.src = url;
          img.onerror = () => {
            wrap.replaceChildren();
            const div = document.createElement('div');
            div.className = 'connect-avatar connect-avatar-fallback';
            div.textContent = name.slice(0, 1).toUpperCase();
            wrap.append(div);
          };
          wrap.append(img);
        } else {
          const div = document.createElement('div');
          div.className = 'connect-avatar connect-avatar-fallback';
          div.textContent = name.slice(0, 1).toUpperCase();
          wrap.append(div);
        }
      }
    } catch (e) {
      console.warn('[SPIKE connect preview]', e);
      setText('connectName', 'SPIKE member');
      setText('connectSpId', 'Could not load full profile details');
    }
  }

  function closeConnectPreview() {
    pendingConnectId = null;
    const preview = $('connectPreview');
    preview?.classList.remove('open');
    preview?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  async function confirmConnect() {
    const targetId = pendingConnectId;
    if (!targetId) return;
    const btn = $('connectConfirm');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending request…';
    }
    try {
      const send = window.SPIKE?.social?.sendFriendRequest || window.SPIKE?.social?.connectViaQr;
      if (!send) {
        throw new Error('SPIKE friend request service is not ready. Reload and try again.');
      }
      const result = await send.call(window.SPIKE.social, db(), targetId);
      notify(result.message || 'Friend request sent.', (result.state === 'friends') ? 'success' : 'success');
      closeConnectPreview();
    } catch (error) {
      notify(error.message || 'Could not connect on SPIKE.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send friend request';
      }
    }
  }

  async function handleScannedPayload(raw) {
    const userId = parseSpikeUserIdFromPayload(raw);
    if (userId) {
      await openConnectPreview(userId);
      return;
    }
    stopScanner();
    notify('This QR code is not a SPIKE profile link. Ask them to open Profile → Show QR code.', 'warning');
  }

  function decodeQrFromImageData(imageData, width, height) {
    if (!window.jsQR || !imageData) return null;
    try {
      return window.jsQR(imageData, width, height, { inversionAttempts: 'attemptBoth' });
    } catch (e) {
      console.warn('[SPIKE jsQR]', e);
      return null;
    }
  }

  async function decodeQrFromFile(file) {
    await loadProfileLibrary('jsqr');
    if (!file || !String(file.type || '').startsWith('image/')) {
      throw new Error('Choose an image containing a SPIKE QR code.');
    }

    let source = null;
    let width = 0;
    let height = 0;
    let cleanup = () => {};

    // Prefer ImageBitmap for speed, but retain an HTMLImageElement fallback
    // for mobile browsers that do not implement createImageBitmap for Files.
    if (typeof createImageBitmap === 'function') {
      try {
        source = await createImageBitmap(file);
        width = source.width;
        height = source.height;
        cleanup = () => { try { source.close?.(); } catch (_) {} };
      } catch (bitmapError) {
        console.info('[SPIKE QR gallery] ImageBitmap decode unavailable; trying image element.', bitmapError);
      }
    }

    if (!source) {
      const objectUrl = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.decoding = 'async';
        img.src = objectUrl;
        if (typeof img.decode === 'function') {
          await img.decode();
        } else {
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('This image format could not be opened. Try a JPG or PNG.'));
          });
        }
        source = img;
        width = img.naturalWidth || img.width;
        height = img.naturalHeight || img.height;
        cleanup = () => URL.revokeObjectURL(objectUrl);
      } catch (imageError) {
        URL.revokeObjectURL(objectUrl);
        throw new Error('This image could not be opened. Try a clear JPG or PNG of the SPIKE QR.');
      }
    }

    try {
      if (!width || !height) throw new Error('The selected image has no readable dimensions.');
      // Downscale large photos for reliable mobile decode and lower memory use.
      const maxSide = 1200;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Your browser could not prepare this image. Try another photo.');
      ctx.drawImage(source, 0, 0, w, h);
      const pixels = ctx.getImageData(0, 0, w, h);
      const code = decodeQrFromImageData(pixels.data, w, h);
      if (!code?.data) {
        throw new Error('No SPIKE QR code was found in that image. Try a clearer, well-lit photo of their QR.');
      }
      return code.data;
    } finally {
      cleanup();
    }
  }

  async function scanQr() {
    if (!navigator.mediaDevices?.getUserMedia) {
      notify('Camera scanning is not supported here. Use Gallery to upload their QR image instead.', 'warning');
      $('qrFile')?.click();
      return;
    }
    const overlay = $('scannerOverlay');
    const video = $('scannerVideo');
    if (!overlay || !video) {
      notify('Scanner is not available on this page.', 'error');
      return;
    }
    stopScanner();
    scannerHandled = false;
    try {
      await loadProfileLibrary('jsqr');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      scannerStream = stream;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      await video.play();
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      const tick = () => {
        if (scannerHandled || !overlay.classList.contains('open')) return;
        try {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          if (vw && vh) {
            // Downscale for speed on phones
            const maxSide = 640;
            const scale = Math.min(1, maxSide / Math.max(vw, vh));
            const w = Math.max(1, Math.round(vw * scale));
            const h = Math.max(1, Math.round(vh * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(video, 0, 0, w, h);
            const result = decodeQrFromImageData(ctx.getImageData(0, 0, w, h).data, w, h);
            if (result?.data) {
              scannerHandled = true;
              stopScanner();
              handleScannedPayload(result.data).catch(e =>
                notify(e.message || 'Could not read that QR.', 'error')
              );
              return;
            }
          }
        } catch (e) {
          console.warn('[SPIKE QR scan frame]', e);
        }
        scannerRaf = requestAnimationFrame(tick);
      };
      scannerRaf = requestAnimationFrame(tick);
    } catch (e) {
      stopScanner();
      const msg = e?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access, or use Gallery to upload their QR image.'
        : (e.message || 'Could not open the camera.');
      notify(msg, 'error');
    }
  }

  function bind(){
    $('profileLoaderRetry')?.addEventListener('click',boot);
    $('menuBtn')?.addEventListener('click',openMenu);$('closeMenu')?.addEventListener('click',closeMenu);$('menuOverlay')?.addEventListener('click',e=>{if(e.target===$('menuOverlay'))closeMenu();});
    $('copyProfile')?.addEventListener('click',async()=>{try{await copy(location.origin+profileUrl(state.user.id));notify('Profile link copied.','success');}catch(e){notify(e.message,'error');}});
    $('shareProfileAction')?.addEventListener('click',()=>share(location.origin+profileUrl(state.user.id),`${nameOf(state.profile)} on SPIKE`).catch(e=>{if(e.name!=='AbortError')notify(e.message,'error');}));
    $('showQr')?.addEventListener('click',openQr);$('qrClose')?.addEventListener('click',()=>{$('qrOverlay')?.classList.remove('open');$('qrOverlay')?.setAttribute('aria-hidden','true');});$('qrCopy')?.addEventListener('click',()=>copy(location.origin+profileUrl(state.user.id)).then(()=>notify('Profile link copied.','success')).catch(e=>notify(e.message,'error')));$('qrShare')?.addEventListener('click',()=>share(location.origin+profileUrl(state.user.id),'SPIKE profile').catch(e=>{if(e.name!=='AbortError')notify(e.message,'error');}));$('galleryQr')?.addEventListener('click',()=>{$('qrFile')?.click();});
    $('qrFile')?.addEventListener('change',async e=>{
      const file=e.target.files?.[0];
      if(!file)return;
      try{
        stopScanner();
        notify('Reading QR image…','info');
        const payload=await decodeQrFromFile(file);
        await handleScannedPayload(payload);
      }catch(err){
        notify(err.message||'Could not read that QR image.','error');
      }finally{
        e.target.value='';
      }
    });
    $('scanQr')?.addEventListener('click',scanQr);
    $('connectConfirm')?.addEventListener('click',()=>confirmConnect());
    $('connectCancel')?.addEventListener('click',closeConnectPreview);
    $('connectPreview')?.addEventListener('click',e=>{if(e.target===$('connectPreview'))closeConnectPreview();});
    $('scannerClose')?.addEventListener('click',()=>stopScanner());
    $('findPeopleAction')?.addEventListener('click',()=>location.href='friends.html');$('copySpid')?.addEventListener('click',()=>copy(state.profile?.spike_id ? String(state.profile.spike_id).replace(/^SP-/i, 'SPK-') : '').then(()=>notify('SPK ID copied.','success')).catch(e=>notify(e.message,'error')));$('shareSpid')?.addEventListener('click',()=>share(location.origin+profileUrl(state.user.id),`Connect with ${nameOf(state.profile)} on SPIKE`).catch(e=>{if(e.name!=='AbortError')notify(e.message,'error');}));
    document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
    const stats=$('profileStats');if(stats){let hold=null;try{state.hiddenCounts=localStorage.getItem(`spike-profile-counts-hidden:${state.user.id}`)==='1';}catch(_){}const paintCounts=()=>{stats.querySelectorAll('.stat-action').forEach(b=>{b.classList.toggle('is-count-hidden',state.hiddenCounts);b.setAttribute('aria-label',`${b.dataset.stat} ${state.hiddenCounts?'count hidden':'count visible'}; tap to open, hold to ${state.hiddenCounts?'show':'hide'} counts`);const n=b.querySelector('b');if(n)n.classList.toggle('stat-count-hidden',state.hiddenCounts);});};paintCounts();stats.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-stat]');if(!b)return;state.suppressStatClick=false;hold=setTimeout(()=>{state.hiddenCounts=!state.hiddenCounts;state.suppressStatClick=true;try{localStorage.setItem(`spike-profile-counts-hidden:${state.user.id}`,state.hiddenCounts?'1':'0');}catch(_){}paintCounts();},520);});const cancel=()=>{if(hold){clearTimeout(hold);hold=null;}};['pointerup','pointercancel','pointerleave'].forEach(type=>stats.addEventListener(type,cancel));stats.addEventListener('click',e=>{const b=e.target.closest('[data-stat]');if(!b)return;if(state.suppressStatClick){e.preventDefault();state.suppressStatClick=false;return;}const kind=b.dataset.stat;if(kind==='posts')openList('posts');else if(kind==='friends'||kind==='add')location.href='friends.html';else location.href=`${kind}.html?uid=${encodeURIComponent(state.user.id)}`;});}
    $('socialListSearch')?.addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();$('socialListItems')?.querySelectorAll('[data-social-search]').forEach(row=>{row.hidden=!!q&&!row.dataset.socialSearch.includes(q);});});
    $('openBlockedList')?.addEventListener('click',()=>openList('blocked'));$('socialListClose')?.addEventListener('click',closeList);$('socialListOverlay')?.addEventListener('click',e=>{if(e.target===$('socialListOverlay')||e.target.matches('[data-social-close]'))closeList();});
    $('mediaViewerClose')?.addEventListener('click',closeMedia);$('mediaViewerPrev')?.addEventListener('click',()=>{if(state.viewerEntries.length)openMedia((state.viewerIndex-1+state.viewerEntries.length)%state.viewerEntries.length,state.viewerEntries);});$('mediaViewerNext')?.addEventListener('click',()=>{if(state.viewerEntries.length)openMedia((state.viewerIndex+1)%state.viewerEntries.length,state.viewerEntries);});$('mediaViewer')?.addEventListener('click',e=>{if(e.target.matches('[data-media-close]'))closeMedia();});
    $('themeBtn')?.addEventListener('click',()=>{$('profileThemeOverlay')?.removeAttribute('hidden');closeMenu();});$('profileThemeClose')?.addEventListener('click',()=>$('profileThemeOverlay')?.setAttribute('hidden',''));document.querySelectorAll('[data-profile-theme]').forEach(b=>b.addEventListener('click',()=>{const n=String(b.dataset.profileTheme);try{localStorage.setItem('spike-theme-choice-v3',n);localStorage.setItem('spike-theme-version','5');}catch(_){}document.documentElement.dataset.spikeStyle=n;document.documentElement.dataset.theme=({1:'dark',2:'light',3:'dark',4:'light',5:'dark'})[n];document.documentElement.style.colorScheme=document.documentElement.dataset.theme;$('profileThemeOverlay')?.setAttribute('hidden','');notify('Appearance updated on this device.','success');}));
    // The photo itself opens its framing editor; no separate avatar Adjust button.
    $('avatar')?.addEventListener('click',()=>{if(state.profile?.avatar_path)openAvatarEditor();else $('avatarFile')?.click();});
    $('avatarEditorClose')?.addEventListener('click',closeAvatarEditor);$('avatarCancel')?.addEventListener('click',closeAvatarEditor);
    $('avatarReset')?.addEventListener('click',()=>{state.avatarFrame={zoom:100,x:50,y:50};updateAvatarPreview();});
    bindDirectImageGestures($('avatarEditorPreview'),'avatarFrame',updateAvatarPreview,300);
    $('avatarSave')?.addEventListener('click',saveAvatarCrop);
    $('coverAdjust')?.addEventListener('click',openCoverEditor);$('coverEditorClose')?.addEventListener('click',closeCoverEditor);$('coverEditorCancel')?.addEventListener('click',closeCoverEditor);$('coverReset')?.addEventListener('click',()=>{state.coverFrame={zoom:100,x:50,y:50};updateCoverPreview();});
    bindDirectImageGestures($('coverEditorPreview'),'coverFrame',updateCoverPreview,250);$('coverEditorSave')?.addEventListener('click',saveCoverCrop);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeList();closeMedia();closeMenu();closeCoverEditor();closeAvatarEditor();}});
  }
  function bindDirectImageGestures(stage,key,paint,maxZoom){
    if(!stage||stage.dataset.spikeGesturesBound==='1')return;
    stage.dataset.spikeGesturesBound='1';
    stage.style.touchAction='none';
    stage.style.webkitUserSelect='none';
    stage.style.userSelect='none';
    const gestureImage=stage.querySelector('img');
    if(gestureImage){gestureImage.style.pointerEvents='none';gestureImage.style.webkitUserDrag='none';gestureImage.draggable=false;}
    const active=new Map();let base=null;
    const frame=()=>state[key]||(state[key]={zoom:100,x:50,y:50});
    const points=()=>[...active.values()];
    const distance=pts=>pts.length<2?0:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
    const midpoint=pts=>pts.length<2?pts[0]:{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
    const begin=e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      e.preventDefault();
      try{stage.setPointerCapture(e.pointerId);}catch(_){}
      active.set(e.pointerId,{x:e.clientX,y:e.clientY});
      const pts=points(),f=frame();
      base={zoom:f.zoom,x:f.x,y:f.y,dist:distance(pts),mid:midpoint(pts),points:pts.map(p=>({...p}))};
      stage.classList.add('dragging');
    };
    const move=e=>{
      if(!active.has(e.pointerId))return;
      e.preventDefault();active.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(!base)return;
      const pts=points(),f=frame(),rect=stage.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      if(pts.length>=2&&base.dist>0){
        const mid=midpoint(pts),d=distance(pts);
        f.zoom=Math.max(100,Math.min(maxZoom,base.zoom*d/base.dist));
        // Dragging the fingers moves the image in the same direction on screen.
        f.x=Math.max(0,Math.min(100,base.x-(mid.x-base.mid.x)/rect.width*100));
        f.y=Math.max(0,Math.min(100,base.y-(mid.y-base.mid.y)/rect.height*100));
      }else if(pts.length===1){
        const origin=base.points[0];
        f.x=Math.max(0,Math.min(100,base.x-(pts[0].x-origin.x)/rect.width*100));
        f.y=Math.max(0,Math.min(100,base.y-(pts[0].y-origin.y)/rect.height*100));
      }
      state[key]=f;paint();
    };
    const end=e=>{
      if(!active.has(e.pointerId))return;
      active.delete(e.pointerId);
      if(active.size===0){base=null;stage.classList.remove('dragging');}
      else{const pts=points(),f=frame();base={zoom:f.zoom,x:f.x,y:f.y,dist:distance(pts),mid:midpoint(pts),points:pts.map(p=>({...p}))};}
    };
    stage.addEventListener('pointerdown',begin,{passive:false});
    stage.addEventListener('pointermove',move,{passive:false});
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>stage.addEventListener(type,end));
    stage.addEventListener('contextmenu',e=>e.preventDefault());
    stage.addEventListener('dragstart',e=>e.preventDefault());
  }
  function openAvatarEditor(){
    if(!state.profile?.avatar_path){notify('Choose a profile picture first, then you can adjust it.','warning');return;}
    const overlay=$('avatarEditorOverlay'),img=$('avatarEditorImg');if(!overlay||!img)return;
    state.avatarFrame={zoom:100,x:50,y:50};
    img.crossOrigin='anonymous';img.src=state.profile.avatar_path;
    img.onload=()=>updateAvatarPreview();
    updateAvatarPreview();overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');
  }
  function paintFramedImage(stageId,imageId,frame,maxZoom){
    const stage=$(stageId),img=$(imageId);if(!stage||!img)return;
    const f=frame||{zoom:100,x:50,y:50};
    f.zoom=Math.max(100,Math.min(maxZoom,Number(f.zoom)||100));
    f.x=Math.max(0,Math.min(100,Number(f.x??50)));f.y=Math.max(0,Math.min(100,Number(f.y??50)));
    const rect=stage.getBoundingClientRect(),nw=img.naturalWidth||rect.width,nh=img.naturalHeight||rect.height;
    if(!rect.width||!rect.height)return;
    // Match object-fit:cover, then pan the actual rendered image. object-position
    // alone cannot move square images inside a square frame.
    const fit=Math.max(rect.width/nw,rect.height/nh),z=f.zoom/100;
    const maxX=Math.max(0,(nw*fit*z-rect.width)/2),maxY=Math.max(0,(nh*fit*z-rect.height)/2);
    const dx=((50-f.x)/50)*maxX,dy=((50-f.y)/50)*maxY;
    img.style.objectPosition='50% 50%';
    img.style.transform=`translate3d(${dx}px,${dy}px,0) scale(${z})`;
  }
  function updateAvatarPreview(){
    const f=state.avatarFrame||(state.avatarFrame={zoom:100,x:50,y:50});
    f.zoom=Math.max(100,Math.min(300,Number(f.zoom)||100));
    paintFramedImage('avatarEditorPreview','avatarEditorImg',f,300);
  }
  function closeAvatarEditor(){const o=$('avatarEditorOverlay');o?.classList.remove('open');o?.setAttribute('aria-hidden','true');}
  async function saveAvatarCrop(){
    const button=$('avatarSave');if(!state.profile?.avatar_path||!state.user||!button)return;
    button.disabled=true;button.textContent='Saving…';
    try{
      const image=new Image();image.crossOrigin='anonymous';image.src=state.profile.avatar_path;
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Could not load your current profile picture. Try uploading it again.'));});
      const f=state.avatarFrame||{zoom:100,x:50,y:50};const side=Math.min(image.naturalWidth,image.naturalHeight)/(Number(f.zoom||100)/100);
      const maxX=image.naturalWidth-side,maxY=image.naturalHeight-side;
      const sx=Math.max(0,Math.min(maxX,(maxX*(Number(f.x??50)/100))));const sy=Math.max(0,Math.min(maxY,(maxY*(Number(f.y??50)/100))));
      const canvas=document.createElement('canvas');canvas.width=900;canvas.height=900;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image editor is unavailable in this browser.');
      ctx.drawImage(image,sx,sy,side,side,0,0,900,900);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));if(!blob)throw new Error('Could not prepare the cropped picture.');
      const file=new File([blob],`spike-avatar-${Date.now()}.jpg`,{type:'image/jpeg'});
      if(!window.SPIKE_CLOUDINARY?.uploadImage)throw new Error('Image upload service is not ready.');
      const asset=await window.SPIKE_CLOUDINARY.uploadImage(file,{userId:state.user.id,folder:'profiles'});
      const {error}=await db().from('profiles').update({avatar_path:asset.secure_url,updated_at:new Date().toISOString()}).eq('id',state.user.id);if(error)throw error;
      state.profile.avatar_path=asset.secure_url;paintProfile();window.dispatchEvent(new CustomEvent('spike:profile-media-updated',{detail:{column:'avatar_path',url:asset.secure_url}}));closeAvatarEditor();notify('Your adjusted profile picture is saved and updated.','success');
    }catch(error){console.error('[SPIKE avatar crop]',error);notify(error.message||'Could not save your adjusted picture.','error');}
    finally{button.disabled=false;button.textContent='Save picture';}
  }
  function openCoverEditor(){
    if(!state.profile?.cover_path){notify('Choose a cover photo first, then you can adjust it.','warning');return;}
    const overlay=$('coverEditorOverlay'),img=$('coverEditorImg');if(!overlay||!img)return;
    state.coverFrame={zoom:100,x:50,y:50};img.crossOrigin='anonymous';img.src=state.profile.cover_path;
    img.onload=()=>updateCoverPreview();updateCoverPreview();
    overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');$('coverEditorClose')?.focus({preventScroll:true});
  }
  function updateCoverPreview(){
    const f=state.coverFrame||(state.coverFrame={zoom:100,x:50,y:50});
    f.zoom=Math.max(100,Math.min(250,Number(f.zoom)||100));
    paintFramedImage('coverEditorPreview','coverEditorImg',f,250);
  }
  function closeCoverEditor(){const o=$('coverEditorOverlay');o?.classList.remove('open');o?.setAttribute('aria-hidden','true');}
  async function saveCoverCrop(){
    const button=$('coverEditorSave');if(!state.profile?.cover_path||!state.user||!button)return;
    button.disabled=true;button.textContent='Saving…';
    try{
      const image=new Image();image.crossOrigin='anonymous';image.src=state.profile.cover_path;
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Could not load your current cover photo. Try uploading it again.'));});
      const f=state.coverFrame||{zoom:100,x:50,y:50};const aspect=2.5;
      let cropW=Math.min(image.naturalWidth,image.naturalHeight*aspect),cropH=cropW/aspect;
      cropW/=Number(f.zoom||100)/100;cropH/=Number(f.zoom||100)/100;
      const maxX=image.naturalWidth-cropW,maxY=image.naturalHeight-cropH;
      const sx=Math.max(0,Math.min(maxX,maxX*(Number(f.x??50)/100)));const sy=Math.max(0,Math.min(maxY,maxY*(Number(f.y??50)/100)));
      const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=720;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image editor is unavailable in this browser.');
      ctx.drawImage(image,sx,sy,cropW,cropH,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));if(!blob)throw new Error('Could not prepare the cropped cover.');
      const file=new File([blob],`spike-cover-${Date.now()}.jpg`,{type:'image/jpeg'});if(!window.SPIKE_CLOUDINARY?.uploadImage)throw new Error('Image upload service is not ready.');
      const asset=await window.SPIKE_CLOUDINARY.uploadImage(file,{userId:state.user.id,folder:'profiles'});
      const {error}=await db().from('profiles').update({cover_path:asset.secure_url,updated_at:new Date().toISOString()}).eq('id',state.user.id);if(error)throw error;
      state.profile.cover_path=asset.secure_url;paintProfile();window.dispatchEvent(new CustomEvent('spike:profile-media-updated',{detail:{column:'cover_path',url:asset.secure_url}}));closeCoverEditor();notify('Your adjusted cover photo is saved and updated.','success');
    }catch(error){console.error('[SPIKE cover crop]',error);notify(error.message||'Could not save your adjusted cover.','error');}
    finally{button.disabled=false;button.textContent='Save cover';}
  }
  async function boot(){
    // Deep link: profile.html?uid=...&connect=1 opens friend connect sheet
    try {
      const params = new URLSearchParams(location.search);
      const connectUid = params.get('uid') || params.get('user_id');
      if (params.get('connect') === '1' && connectUid && /^[0-9a-f-]{36}$/i.test(connectUid)) {
        setTimeout(() => openConnectPreview(connectUid).catch(()=>{}), 600);
      }
    } catch (_) {}

      if (location.hash === '#scan') {
        setTimeout(() => { try { scanQr(); } catch (_) {} }, 500);
      }
if(state.loading)return;state.loading=true;try{const client=db();if(!client?.auth?.getUser)throw new Error('SPIKE database is not ready.');const {data,error}=await client.auth.getUser();if(error)throw error;if(!data.user)throw new Error('Sign in to view your profile.');state.user=data.user;const result=await client.from('profiles').select('id,username,display_name,spike_id,bio,avatar_path,cover_path,website,location,is_private,presence_visible,role,account_status').eq('id',state.user.id).maybeSingle();if(result.error)throw result.error;if(!result.data)throw new Error('Your SPIKE profile record was not found.');state.profile=result.data;try{const pub=await client.rpc('get_public_profiles',{p_user_ids:[state.user.id]});if(!pub.error&&pub.data?.[0])state.profile.verified=pub.data[0].verified===true;}catch(_){}paintProfile();bind();loader(null);await Promise.allSettled([loadStats(),loadPosts()]);const presence=$('profilePresenceDot');const visible=state.profile.presence_visible===true&&state.profile.account_status==='active';if(presence)presence.classList.toggle('online',visible);setText('profilePresenceText',visible?'Presence sharing is enabled':'You appear offline to other members'); }catch(error){console.error('[SPIKE profile runtime]',error);loader(error);notify(error.message||'Profile could not load.','error');}finally{state.loading=false;}}
  window.addEventListener('spike:profile-updated',e=>{if(e.detail?.profile){state.profile=e.detail.profile;paintProfile();}});
  window.addEventListener('spike:profile-media-updated',e=>{const {column,url}=e.detail||{};if(state.profile&&column&&url){state.profile[column]=url;paintProfile();}});
  window.SPIKE_PROFILE=Object.freeze({refresh:boot,getState:()=>({user:state.user,profile:state.profile,posts:state.posts,media:state.media})});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
