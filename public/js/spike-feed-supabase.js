/* SPIKE feed data + a small, real Supabase publishing surface. */
(() => {
  'use strict';
  const db=()=>window.SPIKE_SUPABASE||window.db, $=id=>document.getElementById(id);
  let user=null, mode='forYou', loading=false, reloadQueued=false, publishing=false, feedOffset=0, feedHasMore=true;
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
    const locationLabel=node('label','spike-native-location-label');const locationToggle=node('input','');locationToggle.type='checkbox';locationToggle.id='spikeNativeShareLocation';const locationText=node('span','','Attach my approximate location to this public post (optional)');locationLabel.append(locationToggle,locationText);
    const note=node('p','spike-native-compose-note','Up to 8 media files · 6 MB each · Location sharing is optional and only available on public posts');
    const feedback=node('p','spike-native-compose-status','');feedback.id='spikeNativeComposeStatus';feedback.setAttribute('role','status');
    controls.append(file,visibility,submit,cancel);form.append(text,controls,locationLabel,note,feedback);root.append(open,form);
    $('posts')?.before(root);
    open.addEventListener('click',()=>{form.hidden=false;open.hidden=true;text.focus();});
    cancel.addEventListener('click',()=>{form.reset();form.hidden=true;open.hidden=false;feedback.textContent='';});
    form.addEventListener('submit',async e=>{e.preventDefault();if(publishing)return;publishing=true;submit.disabled=true;feedback.textContent='Publishing…';
      try{let locationData=null;if(locationToggle.checked){if(visibility.value!=='public')throw new Error('Location can only be attached to a public post.');if(!navigator.geolocation)throw new Error('This browser does not support location sharing.');feedback.textContent='Waiting for your location permission…';locationData=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(pos=>resolve({latitude:pos.coords.latitude,longitude:pos.coords.longitude}),err=>reject(new Error(err.code===1?'Location permission was denied. You can publish without location.':'Could not get your location. Try again or publish without it.')),{enableHighAccuracy:false,timeout:12000,maximumAge:300000}));}const result=await window.SPIKE_POSTS.publishPost({body:text.value,files:[...file.files],visibility:visibility.value,shareLocation:locationToggle.checked,location:locationData});feedback.textContent='Published successfully.';form.reset();form.hidden=true;open.hidden=false;await loadFeed();}
      catch(err){feedback.textContent=err.message||'Could not publish this post.';}
      finally{publishing=false;submit.disabled=false;}
    });
  };
  function renderPost(post,profile,media){
    const card=node('article','spike-db-post');card.dataset.postId=post.id;
    const head=node('header','spike-db-post-head');const avatar=node('span','spike-db-post-avatar',(profile.display_name||profile.username||'S').slice(0,1).toUpperCase());
    if(profile.avatar_path){const img=node('img');img.src=profile.avatar_path;img.alt='';img.loading='lazy';img.decoding='async';avatar.replaceChildren(img);}
    const identity=node('div','spike-db-post-identity');const author=node('strong','',profile.display_name||profile.username||'SPIKE member');if(profile.is_verified===true){const badge=node('span','spike-verified-inline','✓');badge.setAttribute('role','img');badge.setAttribute('aria-label','SPIKE Verified');author.append(' ',badge);}identity.append(author,node('small','',`@${profile.username||'member'} · ${new Date(post.created_at).toLocaleString()}`));head.append(avatar,identity);
    const body=node('p','spike-db-post-body',post.body||'');card.append(head);if(post.body)card.append(body);
    const gallery=node('div','spike-db-post-media');
    media.forEach(item=>{const url=item.signedUrl;if(item.media_type==='image'){const img=node('img');img.src=url;img.alt='Post image';img.loading='lazy';img.decoding='async';gallery.append(img);}else if(item.media_type==='video'){const video=node('video');video.src=url;video.controls=true;video.playsInline=true;video.preload='none';gallery.append(video);}else{const audio=node('audio');audio.src=url;audio.controls=true;gallery.append(audio);}});
    if(media.length)card.append(gallery);
    const footer=node('footer','spike-db-post-footer');footer.append(node('span','',post.visibility==='public'?'🌐 Public':post.visibility==='followers'?'👥 Followers':'🔒 Only me'));card.append(footer);window.SPIKE_SOCIAL_ACTIONS?.attach(card,post,user?.id);return card;
  }
  async function loadFeed(reset=true){
    const host=$('posts');if(!host)return;if(loading){reloadQueued=true;return;}if(reset){feedOffset=0;feedHasMore=true;host.replaceChildren();}else if(!feedHasMore)return;loading=true;host.setAttribute('aria-busy','true');
    try{
      let query=db().from('posts').select('id,author_id,body,visibility,comments_enabled,status,created_at').eq('status','published').order('created_at',{ascending:false}).range(feedOffset,feedOffset+19); // Fast first paint: fetch 20 posts per page instead of 60.
      let followingIds=null;
      const prefs=feedPrefs();
      if(mode==='following'||prefs.feedFollowingOnly===true){
        const {data,error}=await db().from('follows').select('following_id').eq('follower_id',user.id).eq('status','accepted').limit(2000);if(error)throw error;
        followingIds=(data||[]).map(x=>x.following_id);followingIds.push(user.id);query=query.in('author_id',followingIds);
      }
      const {data:posts,error}=await query;if(error)throw error;
      const fetched=posts||[];feedOffset+=fetched.length;feedHasMore=fetched.length===20;
      const muted=String(prefs.feedMutedKeywords||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
      let rows=fetched.filter(post=>!muted.some(term=>String(post.body||'').toLowerCase().includes(term)));
      if(mode==='forYou'&&rows.length>1){try{const ids=rows.map(x=>x.id);const [likes,comments,saves]=await Promise.all([db().from('post_likes').select('post_id').in('post_id',ids),db().from('comments').select('post_id').in('post_id',ids).eq('status','published'),db().from('saved_posts').select('post_id').in('post_id',ids)]);for(const r of [likes,comments,saves])if(r.error)throw r.error;const counts=new Map();for(const r of likes.data||[])counts.set(r.post_id,(counts.get(r.post_id)||0)+1);for(const r of comments.data||[])counts.set(r.post_id,(counts.get(r.post_id)||0)+2);for(const r of saves.data||[])counts.set(r.post_id,(counts.get(r.post_id)||0)+2.5);const now=Date.now();rows.sort((a,b)=>{const score=p=>{const age=Math.max(0,(now-new Date(p.created_at).getTime())/3600000);return .55*Math.exp(-Math.LN2*age/36)+.45*Math.min(1,Math.log1p(counts.get(p.id)||0)/Math.log(51));};return score(b)-score(a);});}catch(rankError){console.warn('[SPIKE feed ranking] Using chronological order:',rankError);}}
      if(!rows.length){if(reset)host.append(node('div','spike-db-feed-empty',(mode==='following'||feedPrefs().feedFollowingOnly===true)?'No posts from people you follow yet.':'No posts match your current feed preferences.'));else if(!feedHasMore)host.append(node('div','spike-db-feed-empty','You are all caught up.'));status('Feed connected');return;}
      const ids=[...new Set(rows.map(x=>x.author_id))],postIds=rows.map(x=>x.id);
      const [{data:profiles,error:profileError},{data:media,error:mediaError}]=await Promise.all([
        db().from('profiles').select('id,username,display_name,avatar_path,is_verified').in('id',ids),
        db().from('post_media').select('id,post_id,object_path,media_type,position').in('post_id',postIds).order('position')
      ]);
      if(profileError)throw profileError;if(mediaError)throw mediaError;
      const people=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
      // Sign all private media paths in one Storage request instead of one request per attachment.
      const mediaRows=media||[];
      const signedByPath=new Map();
      if(mediaRows.length){
        const paths=[...new Set(mediaRows.map(item=>item.object_path).filter(Boolean))];
        const {data:signedRows,error:signedError}=await db().storage.from('post-media').createSignedUrls(paths,300);
        if(signedError)throw signedError;
        (signedRows||[]).forEach(row=>{if(row?.path&&row?.signedUrl)signedByPath.set(row.path,row.signedUrl);});
      }
      const signed=mediaRows.map(item=>{const signedUrl=signedByPath.get(item.object_path);if(!signedUrl)throw new Error('A secure media link could not be created.');return {...item,signedUrl};});
      const byPost={};signed.forEach(item=>(byPost[item.post_id]??=[]).push(item));
      rows.forEach(post=>host.append(renderPost(post,people[post.author_id]||{},byPost[post.id]||[])));
      status(`Feed connected · ${feedOffset} posts loaded`);
    }catch(err){console.error('[SPIKE feed]',err);const panel=node('div','spike-db-feed-empty');panel.append(node('p','',err.message||'Feed could not be loaded.'));const retry=node('button','spike-native-compose-open','Retry feed');retry.type='button';retry.addEventListener('click',()=>loadFeed(true));panel.append(retry);if(reset)host.replaceChildren(panel);else host.append(panel);status('Feed connection issue',true);}
    finally{loading=false;host.setAttribute('aria-busy','false');if(reloadQueued){reloadQueued=false;queueMicrotask(()=>loadFeed(true));}}
  }
  window.SPIKE_FEED = Object.freeze({ refresh: loadFeed, getUser: () => user });
  async function boot(){
    try{
      if(!db()||!window.SPIKE_POSTS)throw new Error('SPIKE services did not finish loading. Check your connection and refresh.');
      const {data,error}=await withTimeout(db().auth.getUser(),12000,'Your secure session check timed out. Check your connection and try again.');
      if(error)throw error;if(!data.user)throw new Error('Your session could not be found. Please sign in again.');user=data.user;
      showComposer();
      await withTimeout(loadFeed(),18000,'The feed is taking too long to respond. You can retry when your connection is stable.');
      $('filters')?.addEventListener('click',e=>{const button=e.target.closest('[data-filter]');if(!button)return;mode=button.dataset.filter==='following'?'following':'forYou';$('filters').querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===button));loadFeed(true);});
      const sentinel=$('infiniteScrollSentinel');if(sentinel&&'IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&feedHasMore&&!loading)loadFeed(false);},{rootMargin:'500px 0px'});observer.observe(sentinel);window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});}
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
