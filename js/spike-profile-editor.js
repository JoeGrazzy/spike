/* SPIKE own-profile loader and editor, backed by the authenticated profiles row. */
(() => {
  'use strict';
  const db=()=>window.SPIKE_SUPABASE||window.db;
  const $=id=>document.getElementById(id);
  let user=null,profile=null,saving=false;
  const notify=(message,kind='info')=>{if(typeof window.spikePremiumToast==='function')window.spikePremiumToast(message,kind,4200);else console.info('[SPIKE profile]',message);};
  const text=(id,value)=>{const n=$(id);if(n)n.textContent=value??'';};
  function openEditor(){if(!profile)return; $('editName').value=profile.display_name||'';$('editUsername').value=profile.username||'';$('editBio').value=profile.bio||'';$('editWebsite').value=profile.website||'';$('editLocation').value=profile.location||'';$('editOverlay').classList.add('open');$('editOverlay').setAttribute('aria-hidden','false');$('editName').focus();}
  function closeEditor(){$('editOverlay')?.classList.remove('open');$('editOverlay')?.setAttribute('aria-hidden','true');}
  function paint(){
    text('displayName',profile.display_name||profile.username||'SPIKE member');text('username','@'+(profile.username||'member'));text('bio',profile.bio||'');text('spidValue',profile.spike_id||'');
    const meta=$('meta');if(meta){meta.replaceChildren();if(profile.location){const span=document.createElement('span');span.textContent='⌖ '+profile.location;meta.append(span);}if(profile.website){const a=document.createElement('a');a.href=profile.website;a.target='_blank';a.rel='noopener noreferrer';a.textContent='↗ '+profile.website.replace(/^https?:\/\//,'');meta.append(a);}}
    const avatar=$('avatar');if(avatar){avatar.replaceChildren();if(profile.avatar_path){const img=document.createElement('img');img.src=profile.avatar_path;img.alt='Profile photo';avatar.append(img);}else avatar.textContent=(profile.display_name||profile.username||'S').slice(0,1).toUpperCase();}
    const cover=$('coverImg');if(cover&&profile.cover_path){cover.src=profile.cover_path;cover.classList.remove('hidden');}
    const about=$('aboutGrid');if(about){about.replaceChildren();[['About',profile.bio],['Location',profile.location],['Website',profile.website],['SPIKE ID',profile.spike_id]].forEach(([label,value])=>{if(!value)return;const item=document.createElement('div');item.className='about-item';const strong=document.createElement('strong');strong.textContent=label;const valueNode=document.createElement('span');valueNode.textContent=value;item.append(strong,valueNode);about.append(item);});}
  }
  async function loadStats(){
    const [posts,counts]=await Promise.all([
      db().from('posts').select('id',{count:'exact',head:true}).eq('author_id',user.id).eq('status','published'),
      window.SPIKE?.social?.getCounts?window.SPIKE.social.getCounts(db(),user.id):Promise.resolve({followers:0,following:0})
    ]);
    if(posts.error)throw posts.error;text('postCount',String(posts.count||0));text('followerCount',String(counts.followers||0));text('followingCount',String(counts.following||0));
  }
  async function save(event){event.preventDefault();if(saving)return;saving=true;const button=$('saveProfileBtn');button.disabled=true;button.textContent='Saving…';
    try{
      const display_name=$('editName').value.trim();const username=$('editUsername').value.trim().toLowerCase();const bio=$('editBio').value.trim();const website=$('editWebsite').value.trim();const location=$('editLocation').value.trim();
      if(display_name.length<1||display_name.length>80)throw new Error('Display name must be between 1 and 80 characters.');
      if(!/^[a-z0-9._-]{2,40}$/.test(username))throw new Error('Username must be 2–40 characters using letters, numbers, dots, underscores or hyphens.');
      if(bio.length>500)throw new Error('Your bio is too long.');if(location.length>100)throw new Error('Location must be 100 characters or fewer.');
      if(website){const parsed=new URL(website);if(!['http:','https:'].includes(parsed.protocol))throw new Error('Website must use http or https.');}
      const patch={display_name,username,bio,website:website||null,location:location||null,updated_at:new Date().toISOString()};
      const {data,error}=await db().from('profiles').update(patch).eq('id',user.id).select('id,username,display_name,spike_id,bio,avatar_path,cover_path,website,location').single();
      if(error){if(error.code==='23505')throw new Error('That username is already taken. Choose another one.');throw error;}
      profile=data;paint();closeEditor();notify('Your profile has been updated.','success');
    }catch(error){console.error('[SPIKE profile save]',error);notify(error.message||'Could not save your profile.','error');}
    finally{saving=false;button.disabled=false;button.textContent='Save changes';}
  }
  async function boot(){if(!db())throw new Error('SPIKE database is not ready.');const auth=await db().auth.getUser();if(auth.error)throw auth.error;if(!auth.data.user)throw new Error('Sign in to edit your profile.');user=auth.data.user;
    const result=await db().from('profiles').select('id,username,display_name,spike_id,bio,avatar_path,cover_path,website,location').eq('id',user.id).single();if(result.error)throw result.error;profile=result.data;paint();
    const actions=$('actions');if(actions){const edit=document.createElement('button');edit.type='button';edit.className='btn primary';edit.id='openProfileEditor';edit.textContent='Edit profile';edit.addEventListener('click',openEditor);actions.replaceChildren(edit);}
    $('editForm')?.addEventListener('submit',save);$('cancelEdit')?.addEventListener('click',closeEditor);$('closeEditProfile')?.addEventListener('click',closeEditor);$('editOverlay')?.addEventListener('click',e=>{if(e.target.id==='editOverlay')closeEditor();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeEditor();});
    await loadStats();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot().catch(e=>notify(e.message||'Profile could not load.','error')),{once:true});else boot().catch(e=>notify(e.message||'Profile could not load.','error'));
})();
