/* SPIKE direct messaging: inbox, conversation bootstrap, history, send, read state and realtime. */
(() => {
  'use strict';
  const db = () => window.SPIKE_SUPABASE || window.db;
  const $ = id => document.getElementById(id);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initials = value => String(value || 'S').trim().slice(0,1).toUpperCase() || 'S';
  const time = value => value ? new Date(value).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
  const day = value => value ? new Date(value).toLocaleDateString([], {month:'short',day:'numeric'}) : '';
  let user = null, conversationId = null, channel = null, inboxChannel = null, oldest = null, busy = false, currentPeer = null, inboxRefreshQueued = false;
  const say = (message, error = false) => { const node = $('status') || $('notice'); if (node) { node.textContent = message; node.classList.toggle('error', !!error); if (node.id === 'notice') node.hidden = false; } };
  const getUser = async () => { const {data,error} = await db().auth.getUser(); if (error) throw error; if (!data.user) throw new Error('Please sign in again.'); return data.user; };

  async function openOrCreateConversation() {
    const params = new URLSearchParams(location.search);
    conversationId = params.get('conversation_id') || params.get('conversation') || params.get('thread') || params.get('id');
    if (conversationId) {
      if (!uuidRe.test(conversationId)) throw new Error('This conversation link is invalid.');
      const {data,error} = await db().from('conversation_members').select('conversation_id,user_id').eq('conversation_id',conversationId).eq('user_id',user.id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('You are not a member of this conversation.');
      return;
    }
    const peerId = params.get('user_id') || params.get('uid') || params.get('to');
    if (!peerId || !uuidRe.test(peerId) || peerId === user.id) throw new Error('Open a conversation from Messages or choose a valid person to message.');
    const {data:existing,error:lookupError} = await db().from('conversation_members').select('conversation_id').eq('user_id',user.id);
    if (lookupError) throw lookupError;
    const ids = (existing || []).map(x=>x.conversation_id);
    if (ids.length) {
      const {data:peerRows,error} = await db().from('conversation_members').select('conversation_id').eq('user_id',peerId).in('conversation_id',ids);
      if (error) throw error;
      if (peerRows?.length) {
        const {data:convs,error:convError} = await db().from('conversations').select('id,kind').in('id',peerRows.map(x=>x.conversation_id)).eq('kind','direct');
        if (convError) throw convError;
        if (convs?.length) { conversationId = convs[0].id; return; }
      }
    }
    const {data:conv,error:createError} = await db().from('conversations').insert({created_by:user.id,kind:'direct'}).select('id').single();
    if (createError) throw createError;
    const {error:memberError} = await db().from('conversation_members').insert([{conversation_id:conv.id,user_id:user.id,member_role:'member'},{conversation_id:conv.id,user_id:peerId,member_role:'member'}]);
    if (memberError) { await db().from('conversations').delete().eq('id',conv.id); throw memberError; }
    conversationId = conv.id;
    const next = new URL(location.href); next.searchParams.set('conversation_id',conversationId); next.searchParams.delete('user_id'); next.searchParams.delete('uid'); next.searchParams.delete('to'); history.replaceState({},'',next);
  }

  async function profiles(ids) {
    const clean = [...new Set(ids.filter(Boolean))]; if (!clean.length) return {};
    const {data,error} = await db().from('profiles').select('id,username,display_name,avatar_path,spike_id,presence_visible').in('id',clean);
    if (error) throw error;
    return Object.fromEntries((data||[]).map(p=>[p.id,p]));
  }

  function renderBubble(row, profile = {}) {
    const mine = row.sender_id === user.id;
    const article = document.createElement('article'); article.className = `bubble${mine?' mine':''}`; article.dataset.messageId = row.id;
    if (row.deleted_at) { const gone = document.createElement('span'); gone.textContent = 'Message deleted'; article.append(gone); }
    else {
      if (row.body) { const body = document.createElement('div'); body.textContent = row.body; article.append(body); }
      if (row.attachment_path) {
        const holder = document.createElement('div'); holder.className = 'messageAttachment'; holder.textContent = 'Opening secure attachment…'; article.append(holder);
        db().storage.from('chat-attachments').createSignedUrl(row.attachment_path,300).then(({data,error})=>{
          if (error) throw error; holder.replaceChildren(); const url=data.signedUrl; const kind=row.attachment_type;
          if (kind==='image') { const img=document.createElement('img'); img.src=url; img.alt='Shared image'; img.loading='lazy'; img.style.maxWidth='min(260px,70vw)'; img.style.borderRadius='12px'; holder.append(img); }
          else if (kind==='video') { const video=document.createElement('video'); video.src=url; video.controls=true; video.playsInline=true; video.style.maxWidth='min(280px,75vw)'; holder.append(video); }
          else if (kind==='audio') { const audio=document.createElement('audio'); audio.src=url; audio.controls=true; holder.append(audio); }
          else { const link=document.createElement('a'); link.href=url; link.target='_blank'; link.rel='noopener'; link.textContent='Open attachment'; holder.append(link); }
        }).catch(()=>{holder.textContent='Attachment unavailable';});
      }
    }
    const stamp=document.createElement('time'); stamp.dateTime=row.created_at; stamp.textContent=time(row.created_at)+(row.is_edited?' · edited':''); article.append(stamp);
    if (!mine && profile.display_name) article.title=profile.display_name;
    return article;
  }

  async function markRead() {
    const {error} = await db().from('conversation_members').update({last_read_at:new Date().toISOString()}).eq('conversation_id',conversationId).eq('user_id',user.id);
    if (error) console.warn('[SPIKE messaging] read receipt update failed',error);
  }

  async function loadMessages({older=false}={}) {
    const query = db().from('messages').select('id,conversation_id,sender_id,body,reply_to_id,attachment_path,attachment_type,is_edited,deleted_at,created_at').eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(older?40:60);
    if (older && oldest) query.lt('created_at',oldest);
    const {data,error}=await query; if(error) throw error;
    const rows=(data||[]).reverse(); if(rows.length) oldest=rows[0].created_at;
    const ids=rows.map(x=>x.sender_id); const people=await profiles(ids);
    const thread=$('thread'); if(!thread)return;
    if(!older) thread.replaceChildren();
    if(!rows.length && !older){const empty=document.createElement('div');empty.className='empty';empty.textContent='No messages yet. Say hello 👋';thread.append(empty);}
    rows.forEach(row=>thread.append(renderBubble(row,people[row.sender_id]||{})));
    const olderButton=$('loadOlderMessages'); if(olderButton) olderButton.style.display=rows.length===40?'block':'none';
    if(!older) $('scroll')?.scrollTo({top:$('scroll').scrollHeight});
    await markRead();
  }

  async function setupThread() {
    await openOrCreateConversation();
    const {data:members,error}=await db().from('conversation_members').select('user_id').eq('conversation_id',conversationId);
    if(error) throw error;
    const peerId=(members||[]).find(x=>x.user_id!==user.id)?.user_id;
    const people=await profiles([peerId]); currentPeer=people[peerId]||{};
    if($('name')) $('name').textContent=currentPeer.display_name||currentPeer.username||'SPIKE member';
    if($('sub')) $('sub').textContent=currentPeer.username?`@${currentPeer.username}`:'Direct message';
    if($('avatar')) { $('avatar').replaceChildren(); if(currentPeer.avatar_path){const img=document.createElement('img');img.src=currentPeer.avatar_path;img.alt='';$('avatar').append(img);}else $('avatar').textContent=initials(currentPeer.display_name||currentPeer.username); }
    await loadMessages();
    const input=$('body'), form=$('form');
    form?.addEventListener('submit',async event=>{
      if(event.defaultPrevented || $('mediaInput')?.files?.length) return;
      event.preventDefault(); if(busy)return;
      const body=String(input?.value||'').trim(); if(!body)return;
      busy=true; const send=$('send'); if(send)send.disabled=true;
      try { const {data,error}=await db().from('messages').insert({conversation_id:conversationId,sender_id:user.id,body}).select('id,conversation_id,sender_id,body,reply_to_id,attachment_path,attachment_type,is_edited,deleted_at,created_at').single(); if(error)throw error; $('thread')?.querySelector('.empty')?.remove(); $('thread')?.append(renderBubble(data,{})); input.value=''; $('scroll')?.scrollTo({top:$('scroll').scrollHeight,behavior:'smooth'}); }
      catch(error){say(error.message||'Message could not be sent.',true);} finally{busy=false;if(send)send.disabled=false;}
    });
    $('refresh')?.addEventListener('click',()=>loadMessages().catch(e=>say(e.message,true)));
    $('loadOlderMessages')?.addEventListener('click',()=>loadMessages({older:true}).catch(e=>say(e.message,true)));
    $('cancelReply')?.addEventListener('click',()=> $('replyPreview')?.classList.remove('show'));
    channel=db().channel(`spike-dm-${conversationId}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`conversation_id=eq.${conversationId}`},async payload=>{
      if(payload.new.sender_id===user.id)return;
      const row=payload.new; $('thread')?.querySelector('.empty')?.remove(); $('thread')?.append(renderBubble(row,{})); $('scroll')?.scrollTo({top:$('scroll').scrollHeight,behavior:'smooth'}); await markRead();
    }).subscribe();
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)markRead();});
  }

  async function loadInbox() {
    const {data:members,error}=await db().from('conversation_members').select('conversation_id,last_read_at').eq('user_id',user.id);
    if(error)throw error;
    const ids=(members||[]).map(x=>x.conversation_id); const list=$('list'); if(!list)return;
    if(!ids.length){list.innerHTML='<div class="empty">No conversations yet. Find someone and start a chat.</div>';return;}
    const {data:convs,error:convError}=await db().from('conversations').select('id,kind,title,updated_at').in('id',ids).order('updated_at',{ascending:false}); if(convError)throw convError;
    const rows=[];
    for(const conv of convs||[]){
      const [{data:peerRows,error:peerError},{data:lastRows,error:lastError}]=await Promise.all([
        db().from('conversation_members').select('user_id').eq('conversation_id',conv.id).neq('user_id',user.id),
        db().from('messages').select('body,attachment_type,sender_id,created_at').eq('conversation_id',conv.id).order('created_at',{ascending:false}).limit(1)
      ]);
      if(peerError)throw peerError;if(lastError)throw lastError;
      rows.push({conv,peerId:peerRows?.[0]?.user_id,last:lastRows?.[0],member:(members||[]).find(m=>m.conversation_id===conv.id)});
    }
    const people=await profiles(rows.map(x=>x.peerId));
    rows.sort((a,b)=>new Date(b.last?.created_at||b.conv.updated_at)-new Date(a.last?.created_at||a.conv.updated_at));
    const needle=String($('search')?.value||'').trim().toLowerCase(); const filter=document.querySelector('.chip.active')?.dataset.filter||'all';
    const visible=rows.filter(row=>{const p=people[row.peerId]||{};const label=`${p.display_name||''} ${p.username||''} ${p.spike_id||''}`.toLowerCase();if(needle&&!label.includes(needle))return false;const unread=!!row.last&&row.last.sender_id!==user.id&&(!row.member?.last_read_at||new Date(row.last.created_at)>new Date(row.member.last_read_at));if(filter==='unread'&&!unread)return false;return true;});
    list.replaceChildren();
    if(!visible.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='No conversations match this view.';list.append(empty);}
    let unreadCount=0;
    visible.forEach(row=>{
      const p=people[row.peerId]||{};const unread=!!row.last&&row.last.sender_id!==user.id&&(!row.member?.last_read_at||new Date(row.last.created_at)>new Date(row.member.last_read_at));if(unread)unreadCount++;
      const a=document.createElement('a');a.className='item';a.href=`message.html?conversation_id=${encodeURIComponent(row.conv.id)}`;
      const avatar=document.createElement('div');avatar.className='avatar';if(p.avatar_path){const img=document.createElement('img');img.src=p.avatar_path;img.alt='';avatar.append(img);}else avatar.textContent=initials(p.display_name||p.username);
      const details=document.createElement('div');details.className='details';const name=document.createElement('div');name.className='name';name.textContent=p.display_name||p.username||row.conv.title||'SPIKE member';const preview=document.createElement('div');preview.className='preview';preview.textContent=row.last?(row.last.attachment_type?`📎 ${row.last.attachment_type}`:row.last.body||'Message'):'Start the conversation';details.append(name,preview);
      const meta=document.createElement('div');meta.className='meta';meta.textContent=day(row.last?.created_at||row.conv.updated_at);if(unread){const badge=document.createElement('span');badge.className='rowUnreadBadge';badge.textContent='New';meta.append(badge);}a.append(avatar,details,meta);list.append(a);
    });
    const badge=$('unreadTotalBadge');if(badge){badge.textContent=String(unreadCount);badge.hidden=!unreadCount;}
    const unreadBadge=$('unreadFilterBadge');if(unreadBadge){unreadBadge.textContent=String(unreadCount);unreadBadge.hidden=!unreadCount;}
  }

  async function start(){
    if(!db())throw new Error('SPIKE database is not ready. Reload the page.');
    user=await getUser();
    if(document.body.dataset.spikePage==='message') { $('voiceNote')?.setAttribute('disabled','disabled'); if($('voiceNote')) $('voiceNote').title='Voice notes are not enabled yet'; await setupThread(); }
    else { document.querySelectorAll('[data-filter="pinned"],[data-filter="archived"]').forEach(node=>node.hidden=true); await loadInbox(); inboxChannel=db().channel('spike-inbox-'+user.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},payload=>{ if(payload.new.sender_id===user.id || inboxRefreshQueued)return; inboxRefreshQueued=true; setTimeout(()=>{inboxRefreshQueued=false;loadInbox().catch(e=>say(e.message,true));},350); }).subscribe(); }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start().catch(e=>say(e.message,true)),{once:true});else start().catch(e=>say(e.message,true));
  if($('search')) $('search').addEventListener('input',()=>loadInbox().catch(e=>say(e.message,true)));
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===button));loadInbox().catch(e=>say(e.message,true));}));
  window.addEventListener('pagehide',()=>{if(channel)db().removeChannel(channel);if(inboxChannel)db().removeChannel(inboxChannel);});
})();
