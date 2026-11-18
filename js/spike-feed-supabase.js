/* SPIKE feed data + a small, real Supabase publishing surface. */
(() => {
  'use strict';
  const db=()=>window.SPIKE_SUPABASE||window.db, $=id=>document.getElementById(id);
  let user=null, mode='forYou', loading=false, publishing=false;
  const feedPrefs=()=>{try{return JSON.parse(localStorage.getItem('spike-settings-local-v1')||'{}')}catch(_){return {}}};
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const status=(message,error=false)=>{const n=$('onlineStatus');if(n){n.textContent=message;n.dataset.state=error?'error':'ready';}};
  const withTimeout=(promise,ms,message)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=window.setTimeout(()=>reject(new Error(message)),ms)})]).finally(()=>window.clearTimeout(timer));};
  const showComposer=()=>{
    if($('spikeNativeComposer'))return;
    const root=node('section','spike-native-composer');root.id='spikeNativeComposer';
    const open=node('button','spike-native-compose-open','Share an update');open.type='button';
    const form=node('form','spike-native-compose-form');form.hidden=true;
    const text=node('textarea','');text.id='spikeNativePostBody';text.maxLength=10000;text.placeholder='What would you like to share?';text.rows=3;text.setAttribute('aria-label','Post text');
    const controls=node('div','spike-native-compose-controls');
    const file=node('input','');file.type='file';file.id='spikeNativePostFiles';file.multiple=true;file.accept='image/jpeg,image/png,image/webp,image/avif,video/mp4,audio/mpeg,audio/mp4,audio/webm';file.setAttribute('aria-label','Attach photos, video or audio');
    const visibility=node('select','');visibility.id='spikeNativePostVisibility';visibility.setAttribute('aria-label','Post visibility');
    [['public','Public'],['followers','Followers'],['private','Only me']].forEach(([v,l])=>{const o=node('option','',l);o.value=v;visibility.append(o);});
    const submit=node('button','spike-native-publish','Publish');submit.type='submit';const cancel=node('button','spike-native-cancel','Cancel');cancel.type='button';
    const note=node('p','spike-native-compose-note','Up to 8 media files · 6 MB each · Private media is access-controlled');
    const feedback=node('p','spike-native-compose-status','');feedback.id='spikeNativeComposeStatus';feedback.setAttribute('role','status');
    controls.append(file,visibility,submit,cancel);form.append(text,controls,note,feedback);root.append(open,form);
    $('posts')?.before(root);
    open.addEventListener('click',()=>{form.hidden=false;open.hidden=true;text.focus();});
    cancel.addEventListener('click',()=>{form.reset();form.hidden=true;open.hidden=false;feedback.textContent='';});
    form.addEventListener('submit',async e=>{e.preventDefault();if(publishing)return;publishing=true;submit.disabled=true;feedback.textContent='Publishing…';
      try{const result=await window.SPIKE_POSTS.publishPost({body:text.value,files:[...file.files],visibility:visibility.value});feedback.textContent='Published successfully.';form.reset();form.hidden=true;open.hidden=false;await loadFeed();}
      catch(err){feedback.textContent=err.message||'Could not publish this post.';}
      finally{publishing=false;submit.disabled=false;}
    });
  };
  function renderPost(post,profile,media){
    const card=node('article','spike-db-post');card.dataset.postId=post.id;
    const head=node('header','spike-db-post-head');const avatar=node('span','spike-db-post-avatar',(profile.display_name||profile.username||'S').slice(0,1).toUpperCase());
    if(profile.avatar_path){const img=node('img');img.src=profile.avatar_path;img.alt='';avatar.replaceChildren(img);}
    const identity=node('div','spike-db-post-identity');identity.append(node('strong','',profile.display_name||profile.username||'SPIKE member'),node('small','',`@${profile.username||'member'} · ${new Date(post.created_at).toLocaleString()}`));head.append(avatar,identity);
    const body=node('p','spike-db-post-body',post.body||'');card.append(head);if(post.body)card.append(body);
    const gallery=node('div','spike-db-post-media');
    media.forEach(item=>{const url=item.signedUrl;if(item.media_type==='image'){const img=node('img');img.src=url;img.alt='Post image';img.loading='lazy';gallery.append(img);}else if(item.media_type==='video'){const video=node('video');video.src=url;video.controls=true;video.playsInline=true;gallery.append(video);}else{const audio=node('audio');audio.src=url;audio.controls=true;gallery.append(audio);}});
    if(media.length)card.append(gallery);
    const footer=node('footer','spike-db-post-footer');footer.append(node('span','',post.visibility==='public'?'🌐 Public':post.visibility==='followers'?'👥 Followers':'🔒 Only me'));card.append(footer);window.SPIKE_SOCIAL_ACTIONS?.attach(card,post,user?.id);return card;
  }
  async function loadFeed(){
    const host=$('posts');if(!host||loading)return;loading=true;host.setAttribute('aria-busy','true');
    try{
      let query=db().from('posts').select('id,author_id,body,visibility,comments_enabled,status,created_at').eq('status','published').order('created_at',{ascending:false}).limit(60);
      let followingIds=null;
      const prefs=feedPrefs();
      if(mode==='following'||prefs.feedFollowingOnly===true){
        const {data,error}=await db().from('follows').select('following_id').eq('follower_id',user.id).eq('status','accepted').limit(2000);if(error)throw error;
        followingIds=(data||[]).map(x=>x.following_id);followingIds.push(user.id);query=query.in('author_id',followingIds);
      }
      const {data:posts,error}=await query;if(error)throw error;
      const muted=String(prefs.feedMutedKeywords||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
      const rows=(posts||[]).filter(post=>!muted.some(term=>String(post.body||'').toLowerCase().includes(term)));host.replaceChildren();
      if(!rows.length){host.append(node('div','spike-db-feed-empty',(mode==='following'||feedPrefs().feedFollowingOnly===true)?'No posts from people you follow yet.':'No posts match your current feed preferences.'));status('Feed connected');return;}
      const ids=[...new Set(rows.map(x=>x.author_id))],postIds=rows.map(x=>x.id);
      const [{data:profiles,error:profileError},{data:media,error:mediaError}]=await Promise.all([
        db().from('profiles').select('id,username,display_name,avatar_path').in('id',ids),
        db().from('post_media').select('id,post_id,object_path,media_type,position').in('post_id',postIds).order('position')
      ]);
      if(profileError)throw profileError;if(mediaError)throw mediaError;
      const people=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
      const signed=await Promise.all((media||[]).map(async item=>{const {data,error}=await db().storage.from('post-media').createSignedUrl(item.object_path,300);if(error)throw error;return {...item,signedUrl:data.signedUrl};}));
      const byPost={};signed.forEach(item=>(byPost[item.post_id]??=[]).push(item));
      rows.forEach(post=>host.append(renderPost(post,people[post.author_id]||{},byPost[post.id]||[])));
      status(`Feed connected · ${rows.length} posts`);
    }catch(err){console.error('[SPIKE feed]',err);host.replaceChildren(node('div','spike-db-feed-empty',err.message||'Feed could not be loaded. Pull to retry.'));status('Feed connection issue',true);}
    finally{loading=false;host.setAttribute('aria-busy','false');}
  }
  async function boot(){
    try{
      if(!db()||!window.SPIKE_POSTS)throw new Error('SPIKE services did not finish loading. Check your connection and refresh.');
      const {data,error}=await withTimeout(db().auth.getUser(),12000,'Your secure session check timed out. Check your connection and try again.');
      if(error)throw error;if(!data.user)throw new Error('Your session could not be found. Please sign in again.');user=data.user;
      showComposer();
      await withTimeout(loadFeed(),18000,'The feed is taking too long to respond. You can retry when your connection is stable.');
      $('filters')?.addEventListener('click',e=>{const button=e.target.closest('[data-filter]');if(!button)return;mode=button.dataset.filter==='following'?'following':'forYou';$('filters').querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===button));loadFeed();});
      const channel=db().channel('spike-feed-posts').on('postgres_changes',{event:'INSERT',schema:'public',table:'posts'},()=>{if(!document.hidden)loadFeed();}).subscribe();
      window.addEventListener('pagehide',()=>db().removeChannel(channel),{once:true});
    }catch(error){
      console.error('[SPIKE feed boot]',error);
      status(error?.message||'SPIKE could not finish loading. Please refresh.',true);
      const host=$('posts');if(host&&!host.childNodes.length)host.append(node('div','spike-db-feed-empty',error?.message||'SPIKE could not finish loading.'));
    }finally{
      // The feed overlay must never depend on a successful data request to disappear.
      window.SPIKE_HIDE_FEED_LOADER?.();
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
