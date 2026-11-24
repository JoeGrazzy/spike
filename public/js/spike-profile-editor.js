/* SPIKE own-profile loader and editor, backed by the authenticated profiles row. */
(() => {
  'use strict';
  const db=()=>window.SPIKE_SUPABASE||window.db;
  const $=id=>document.getElementById(id);
  let user=null,profile=null,saving=false,booting=false;
  const notify=(message,kind='info')=>{if(typeof window.spikePremiumToast==='function')window.spikePremiumToast(message,kind,5200);else console.info('[SPIKE profile]',message);};
  const text=(id,value)=>{const n=$(id);if(n)n.textContent=value??'';};
  function finishLoader(error){
    const loader=$('loader');
    if(loader){loader.classList.add('hide');loader.classList.remove('is-error');loader.setAttribute('aria-hidden','true');}
    const retry=$('profileLoaderRetry');if(retry)retry.hidden=!error;
    if(error){loader?.classList.remove('hide');loader?.classList.add('is-error');text('loaderText','Profile could not load');text('loaderSubtitle',error.message||'Check your connection and try again.');text('loaderStage','NEEDS ATTENTION');}
  }
  function openEditor(){if(!profile)return; $('editName').value=profile.display_name||'';$('editUsername').value=profile.username||'';$('editBio').value=profile.bio||'';$('editWebsite').value=profile.website||'';$('editLocation').value=profile.location||'';$('editOverlay').classList.add('open');$('editOverlay').setAttribute('aria-hidden','false');$('editName').focus();}
  function closeEditor(){$('editOverlay')?.classList.remove('open');$('editOverlay')?.setAttribute('aria-hidden','true');}
  function paint(){
    text('displayName',profile.display_name||profile.username||'SPIKE member');text('username','@'+(profile.username||'member'));text('bio',profile.bio||'');text('spidValue',profile.spike_id?String(profile.spike_id).replace(/^SP-/i,'SPK-'):'');
    const meta=$('meta');if(meta){meta.replaceChildren();if(profile.location){const span=document.createElement('span');span.textContent='⌖ '+profile.location;meta.append(span);}if(profile.website){const a=document.createElement('a');a.href=profile.website;a.target='_blank';a.rel='noopener noreferrer';a.textContent='↗ '+profile.website.replace(/^https?:\/\//,'');meta.append(a);}}
    const avatar=$('avatar');if(avatar){avatar.replaceChildren();if(profile.avatar_path){const img=document.createElement('img');img.src=profile.avatar_path;img.alt='Profile photo';avatar.append(img);}else avatar.textContent=(profile.display_name||profile.username||'S').slice(0,1).toUpperCase();}
    const cover=$('coverImg');if(cover){if(profile.cover_path){cover.src=profile.cover_path;cover.classList.remove('hidden');}else{cover.removeAttribute('src');cover.classList.add('hidden');}}
    const about=$('aboutGrid');if(about){about.replaceChildren();[['About',profile.bio],['Location',profile.location],['Website',profile.website],['SPK ID',profile.spike_id?String(profile.spike_id).replace(/^SP-/i,'SPK-'):'']].forEach(([label,value])=>{if(!value)return;const item=document.createElement('div');item.className='about-item';const strong=document.createElement('strong');strong.textContent=label;const valueNode=document.createElement('span');valueNode.textContent=value;item.append(strong,valueNode);about.append(item);});}
  }
  async function loadStats(){
    text('postCount','—');text('followerCount','—');text('followingCount','—');
    const postPromise=db().from('posts').select('id',{count:'exact',head:true}).eq('author_id',user.id).eq('status','published');
    const countPromise=window.SPIKE?.social?.getCounts?window.SPIKE.social.getCounts(db(),user.id):Promise.resolve({followers:0,following:0});
    const [posts,counts]=await Promise.allSettled([postPromise,countPromise]);
    if(posts.status==='fulfilled'&&!posts.value.error)text('postCount',String(posts.value.count||0));
    else console.warn('[SPIKE profile] Post count unavailable:',posts.reason||posts.value?.error);
    if(counts.status==='fulfilled'){text('followerCount',String(counts.value?.followers||0));text('followingCount',String(counts.value?.following||0));}
    else console.warn('[SPIKE profile] Follow counts unavailable:',counts.reason);
  }
  async function save(event){event.preventDefault();if(saving)return;saving=true;const button=$('saveProfileBtn');if(button){button.disabled=true;button.textContent='Saving…';}
    try{
      const display_name=$('editName').value.trim();const username=$('editUsername').value.trim().toLowerCase();const bio=$('editBio').value.trim();const website=$('editWebsite').value.trim();const location=$('editLocation').value.trim();
      if(display_name.length<1||display_name.length>80)throw new Error('Display name must be between 1 and 80 characters.');
      if(!/^[a-z0-9._-]{2,40}$/.test(username))throw new Error('Username must be 2–40 characters using letters, numbers, dots, underscores or hyphens.');
      if(bio.length>500)throw new Error('Your bio is too long.');if(location.length>100)throw new Error('Location must be 100 characters or fewer.');
      if(website){const parsed=new URL(website);if(!['http:','https:'].includes(parsed.protocol))throw new Error('Website must use http or https.');}
      const patch={display_name,username,bio,website:website||null,location:location||null,updated_at:new Date().toISOString()};
      const {data,error}=await db().from('profiles').update(patch).eq('id',user.id).select('id,username,display_name,spike_id,bio,avatar_path,cover_path,website,location').single();
      if(error){if(error.code==='23505')throw new Error('That username is already taken. Choose another one.');throw error;}
      profile=data;paint();window.dispatchEvent(new CustomEvent('spike:profile-updated',{detail:{profile:data}}));closeEditor();notify('Your profile has been updated.','success');
    }catch(error){console.error('[SPIKE profile save]',error);notify(error.message||'Could not save your profile.','error');}
    finally{saving=false;if(button){button.disabled=false;button.textContent='Save changes';}}
  }
  async function boot(){
    if(booting)return;booting=true;const loader=$('loader');if(loader){loader.classList.remove('is-hidden','hide','hidden');loader.removeAttribute('aria-hidden');}
    try{
      const client=db();if(!client?.auth?.getUser)throw new Error('SPIKE database is not ready. Refresh the page and try again.');
      const auth=await client.auth.getUser();if(auth.error)throw auth.error;if(!auth.data.user)throw new Error('Sign in to view your profile.');user=auth.data.user;
      const result=await client.from('profiles').select('id,username,display_name,spike_id,bio,avatar_path,cover_path,website,location').eq('id',user.id).maybeSingle();
      if(result.error)throw result.error;if(!result.data)throw new Error('Your SPIKE profile record was not found. Please contact support.');profile=result.data;paint();
      const actions=$('actions');if(actions){const edit=document.createElement('button');edit.type='button';edit.className='btn primary';edit.id='openProfileEditor';edit.textContent='Edit profile';edit.addEventListener('click',openEditor);actions.replaceChildren(edit);}
      $('editForm')?.addEventListener('submit',save);$('cancelEdit')?.addEventListener('click',closeEditor);$('closeEditProfile')?.addEventListener('click',closeEditor);$('editOverlay')?.addEventListener('click',e=>{if(e.target.id==='editOverlay')closeEditor();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeEditor();});
      finishLoader(null);void loadStats();
    }catch(error){console.error('[SPIKE profile boot]',error);finishLoader(error);notify(error.message||'Profile could not load.','error');}
    finally{booting=false;}
  }
  const retry=$('profileLoaderRetry');retry?.addEventListener('click',()=>{if(retry)retry.hidden=true;void boot();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});else void boot();
})();
