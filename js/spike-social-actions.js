/* SPIKE social actions: likes, comments, saves and native sharing. RLS remains authoritative. */
(() => {
  'use strict';
  const db=()=>window.SPIKE_SUPABASE||window.db;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const actionButton=(icon,label)=>{const button=el('button','spike-social-button');button.type='button';const mark=el('span','spike-social-action-icon');mark.innerHTML=window.SPIKEIcons?.svg(icon,'spike-icon',16)||'';const text=el('span','spike-social-action-label',label);button.append(mark,text);return {button,text};};
  const feedback=(node,message)=>{node.textContent=message;node.hidden=false;};
  async function counts(postId,userId){
    const [likes,comments,saved]=await Promise.all([
      db().from('post_likes').select('user_id',{count:'exact',head:true}).eq('post_id',postId),
      db().from('comments').select('id',{count:'exact',head:true}).eq('post_id',postId).eq('status','published'),
      db().from('saved_posts').select('post_id').eq('post_id',postId).eq('user_id',userId).maybeSingle()
    ]);
    for(const r of [likes,comments,saved])if(r.error)throw r.error;
    const own=await db().from('post_likes').select('post_id').eq('post_id',postId).eq('user_id',userId).maybeSingle();if(own.error)throw own.error;
    return {likes:likes.count||0,comments:comments.count||0,saved:!!saved.data,liked:!!own.data};
  }
  async function renderComments(panel,postId,userId){
    panel.replaceChildren(el('p','spike-social-loading','Loading comments…'));
    const {data,error}=await db().from('comments').select('id,author_id,body,created_at').eq('post_id',postId).eq('status','published').order('created_at',{ascending:true}).limit(40);
    if(error)throw error;
    const rows=data||[];panel.replaceChildren();
    if(!rows.length)panel.append(el('p','spike-social-empty','No comments yet. Start the conversation.'));
    if(rows.length){const ids=[...new Set(rows.map(x=>x.author_id))];const people=await db().from('profiles').select('id,username,display_name,is_verified').in('id',ids);if(people.error)throw people.error;const map=Object.fromEntries((people.data||[]).map(x=>[x.id,x]));rows.forEach(row=>{const p=map[row.author_id]||{};const item=el('article','spike-social-comment');const author=el('strong','',p.display_name||p.username||'SPIKE member');if(p.is_verified===true){const badge=el('span','spike-verified-inline','✓');badge.setAttribute('role','img');badge.setAttribute('aria-label','SPIKE Verified');author.append(' ',badge);}item.append(author,el('p','',row.body),el('time','',new Date(row.created_at).toLocaleString()));panel.append(item);});}
    const form=el('form','spike-social-comment-form');const input=el('textarea','');input.maxLength=2000;input.rows=2;input.placeholder='Write a comment…';input.required=true;input.setAttribute('aria-label','Write a comment');const send=el('button','', 'Comment');send.type='submit';form.append(input,send);form.addEventListener('submit',async e=>{e.preventDefault();const body=input.value.trim();if(!body)return;send.disabled=true;try{const result=await db().from('comments').insert({post_id:postId,author_id:userId,body}).select('id').single();if(result.error)throw result.error;input.value='';await renderComments(panel,postId,userId);const count=panel.closest('[data-post-id]')?.querySelector('[data-social-count="comments"]');if(count)count.textContent=String(Number(count.textContent||0)+1);}catch(err){feedback(panel,err.message||'Comment could not be posted.');}finally{send.disabled=false;}});panel.append(form);
  }
  function attach(card,post,userId){
    const footer=card.querySelector('.spike-db-post-footer');if(!footer||footer.dataset.socialReady)return;footer.dataset.socialReady='1';
    const actions=el('div','spike-social-actions');const likeUI=actionButton('heart','Like'),like=likeUI.button;like.dataset.action='like';const likeCount=el('span','spike-social-count','…');likeCount.dataset.socialCount='likes';like.append(likeCount);
    const commentUI=actionButton('message','Comment'),comment=commentUI.button;comment.dataset.action='comments';const commentCount=el('span','spike-social-count','…');commentCount.dataset.socialCount='comments';comment.append(commentCount);
    const saveUI=actionButton('pin','Save'),save=saveUI.button;save.dataset.action='save';const shareUI=actionButton('share','Share'),share=shareUI.button;share.dataset.action='share';actions.append(like,comment,save,share);footer.append(actions);
    const panel=el('section','spike-social-comments');panel.hidden=true;panel.setAttribute('aria-label','Post comments');card.append(panel);
    let state={liked:false,saved:false,busy:false};
    counts(post.id,userId).then(s=>{state={...state,...s};likeCount.textContent=String(s.likes);commentCount.textContent=String(s.comments);like.classList.toggle('is-active',s.liked);likeUI.text.textContent=s.liked?'Unlike':'Like';saveUI.text.textContent=s.saved?'Saved':'Save';save.classList.toggle('is-active',s.saved);}).catch(e=>{likeCount.textContent='—';commentCount.textContent='—';console.warn('[SPIKE social counts]',e);});
    like.addEventListener('click',async()=>{if(state.busy)return;state.busy=true;like.disabled=true;try{if(state.liked){const r=await db().from('post_likes').delete().eq('post_id',post.id).eq('user_id',userId);if(r.error)throw r.error;state.liked=false;likeCount.textContent=String(Math.max(0,Number(likeCount.textContent)-1));}else{const r=await db().from('post_likes').insert({post_id:post.id,user_id:userId});if(r.error)throw r.error;state.liked=true;likeCount.textContent=String(Number(likeCount.textContent||0)+1);}like.classList.toggle('is-active',state.liked);likeUI.text.textContent=state.liked?'Unlike':'Like';}catch(e){void window.SPIKEPremiumDialog?.alert(e.message||'Like action failed.',{title:'Like could not be updated',kind:'error'});}finally{state.busy=false;like.disabled=false;}});
    save.addEventListener('click',async()=>{if(state.busy)return;state.busy=true;save.disabled=true;try{if(state.saved){const r=await db().from('saved_posts').delete().eq('post_id',post.id).eq('user_id',userId);if(r.error)throw r.error;state.saved=false;}else{const r=await db().from('saved_posts').insert({post_id:post.id,user_id:userId});if(r.error)throw r.error;state.saved=true;}saveUI.text.textContent=state.saved?'Saved':'Save';save.classList.toggle('is-active',state.saved);}catch(e){void window.SPIKEPremiumDialog?.alert(e.message||'Could not save this post.',{title:'Post could not be saved',kind:'error'});}finally{state.busy=false;save.disabled=false;}});
    comment.addEventListener('click',async()=>{panel.hidden=!panel.hidden;if(!panel.hidden){try{await renderComments(panel,post.id,userId);}catch(e){panel.replaceChildren(el('p','spike-social-error',e.message||'Comments could not load.'));}}});
    share.addEventListener('click',async()=>{const url=new URL('share.html',location.href);url.searchParams.set('post',post.id);try{if(navigator.share)await navigator.share({title:'SPIKE Signal',text:post.body||'Check out this Signal on SPIKE',url:url.href});else if(navigator.clipboard){await navigator.clipboard.writeText(url.href);shareUI.text.textContent='Link copied';setTimeout(()=>shareUI.text.textContent='Share',1800);}else location.href=url.href;}catch(e){if(e.name!=='AbortError')void window.SPIKEPremiumDialog?.alert('Could not share this post.',{title:'Sharing unavailable',kind:'error'});}});
  }
  window.SPIKE_SOCIAL_ACTIONS={attach};
})();
