/* SPIKE direct messaging: inbox, conversation bootstrap, history, send, read state and realtime. */
(() => {
  'use strict';
  const db = () => window.SPIKE_SUPABASE || window.db;
  const $ = id => document.getElementById(id);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initials = value => String(value || 'S').trim().slice(0,1).toUpperCase() || 'S';
  const avatarUrl = value => { const raw=String(value||'').trim(); if(!raw)return ''; if(/^https:\/\//i.test(raw))return raw; try{return db().storage.from('avatars').getPublicUrl(raw).data.publicUrl||'';}catch{return '';} };
  const time = value => value ? new Date(value).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
  const day = value => { if(!value)return ''; const d=new Date(value); if(Number.isNaN(d.getTime()))return ''; const now=new Date(); const same=d.toDateString()===now.toDateString(); const yesterday=new Date(now); yesterday.setDate(now.getDate()-1); return same?d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):d.toDateString()===yesterday.toDateString()?'Yesterday':d.toLocaleDateString([],{month:'short',day:'numeric'}); };
  const presenceLabel = row => { if(!row)return 'Presence unavailable'; if(row.online)return 'Online now'; if(row.lastSeenAt){const d=new Date(row.lastSeenAt);if(!Number.isNaN(d.getTime()))return `Last seen ${day(d)}`;} return 'Offline'; };
  let user = null, conversationId = null, channel = null, inboxChannel = null, oldest = null, busy = false, currentPeer = null, currentPeerId = null, inboxRefreshQueued = false, selectedMessage = null, replyToId = null, newIncomingCount = 0, pendingIncomingConversationId = null, threadPresenceTimer = null, typingStopTimer = null, peerTypingTimer = null, lastTypingSentAt = 0, peerTypingUntil = 0, currentConversationIsGroup = false, channelReady = false, peerLastReadAt = null;
  const say = (message, error = false) => { const node = $('status') || $('notice'); if (node) { node.textContent = message; node.classList.toggle('error', !!error); if (node.id === 'notice') node.hidden = false; } };
  const renderPeerTyping = () => { const node=$('typingIndicator'); if(!node)return; const active=peerTypingUntil>Date.now(); node.hidden=!active; node.textContent=active?(currentConversationIsGroup?'A member is typing…':`${currentPeer?.display_name||currentPeer?.username||'Someone'} is typing…`):''; };
  const sendTyping = async typing => { if(!channel || !channelReady || !conversationId || !user || document.hidden || !navigator.onLine)return false; try { const result=await channel.send({type:'broadcast',event:'typing',payload:{user_id:user.id,typing:!!typing,at:Date.now()}}); if(result?.status!=='ok'){console.info('[SPIKE messaging] typing broadcast was not acknowledged',result);return false;} return true; } catch(error) { console.info('[SPIKE messaging] typing signal unavailable',error?.message||error); return false; } };
  const scheduleTyping = () => { if(!channel)return; const now=Date.now(); if(now-lastTypingSentAt>900){lastTypingSentAt=now;void sendTyping(true);} if(typingStopTimer)clearTimeout(typingStopTimer); typingStopTimer=window.setTimeout(()=>{void sendTyping(false);typingStopTimer=null;},1600); };
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
    const {data:allowed,error:privacyError}=await db().rpc('can_message_spike_user',{p_sender:user.id,p_recipient:peerId});
    if(privacyError)throw privacyError; if(allowed!==true)throw new Error('This member is not accepting messages from your account.');
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
    // Use the deployed atomic RPC: it creates the conversation and both memberships
    // in one transaction while enforcing blocks, recipient privacy and active status.
    const {data:createdId,error:createError} = await db().rpc('create_conversation',{participant_ids:[peerId],conversation_title:null});
    if (createError) throw createError;
    if (!createdId || !uuidRe.test(String(createdId))) throw new Error('The conversation service did not return a valid chat ID. Please retry.');
    conversationId = createdId;
    const next = new URL(location.href); next.searchParams.set('conversation_id',conversationId); next.searchParams.delete('user_id'); next.searchParams.delete('uid'); next.searchParams.delete('to'); history.replaceState({},'',next);
  }

  async function getInboxPresence() {
    if(window.SPIKE_PRESENCE){let rows=window.SPIKE_PRESENCE.getSnapshot();if(!window.SPIKE_PRESENCE.isLoaded?.())rows=await window.SPIKE_PRESENCE.refresh();return new Map((rows||[]).map(row=>[String(row.user_id),{online:row.is_online===true,lastSeenAt:row.last_seen_at||null}]));}
    const result=await db().rpc('spike_get_messaging_presence');if(result.error){console.warn('[SPIKE inbox presence]',result.error.message||result.error);return new Map();}
    return new Map((result.data||[]).map(row=>[String(row.user_id),{online:row.is_online===true,lastSeenAt:row.last_seen_at||null}]));
  }

  async function refreshInboxPresence() {
    const list = $('list');
    if (!list || !user || document.hidden || !navigator.onLine) return;
    try {
      const presence = window.SPIKE_PRESENCE ? new Map(window.SPIKE_PRESENCE.getSnapshot().map(row=>[String(row.user_id),{online:row.is_online===true,lastSeenAt:row.last_seen_at||null}])) : await getInboxPresence();
      list.querySelectorAll('.item[data-peer-id]').forEach(item => {
        const peer = presence.get(item.dataset.peerId);
        const node = item.querySelector('.inbox-presence');
        if (!node) return;
        node.classList.toggle('online', peer?.online === true);
        node.textContent = presenceLabel(peer);
        node.setAttribute('aria-label', node.textContent);
      });
      if(contactRows.length){contactRows=contactRows.map(row=>({...row,presence:presence.get(String(row.id))||null})).sort((a,b)=>Number(b.presence?.online===true)-Number(a.presence?.online===true)||String(a.profile.display_name||a.profile.username||'').localeCompare(String(b.profile.display_name||b.profile.username||'')));renderContacts();}
    } catch (error) {
      console.info('[SPIKE inbox presence refresh]', error?.message || error);
    }
  }

  async function profiles(ids) {
    const clean = [...new Set(ids.filter(Boolean))]; if (!clean.length) return {};
    const {data,error} = await db().from('profiles').select('id,username,display_name,avatar_path,spike_id,presence_visible').in('id',clean);
    if (error) throw error;
    return Object.fromEntries((data||[]).map(p=>[p.id,p]));
  }

  let contactMode = 'all';
  let contactRows = [];
  const selectedContacts = new Set();
  async function loadContacts(mode = contactMode) {
    contactMode = mode;
    const host = $('contactList');
    if (!host) return;
    host.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    const fetchDirection = async direction => {
      const column = direction === 'followers' ? 'follower_id' : 'following_id';
      const filterColumn = direction === 'followers' ? 'following_id' : 'follower_id';
      const {data,error} = await db().from('follows').select('follower_id,following_id,created_at').eq(filterColumn,user.id).eq('status','accepted').order('created_at',{ascending:false}).limit(500);
      if (error) throw error;
      return (data||[]).map(row=>String(row[column])).filter(id=>id && id!==user.id);
    };
    let followingIds=[], followerIds=[];
    if (mode === 'all') [followingIds,followerIds] = await Promise.all([fetchDirection('following'),fetchDirection('followers')]);
    else if (mode === 'followers') followerIds = await fetchDirection('followers');
    else followingIds = await fetchDirection('following');
    const following = new Set(followingIds), followers = new Set(followerIds);
    const ids = [...new Set([...followingIds,...followerIds])];
    const [people,presence] = await Promise.all([profiles(ids),getInboxPresence()]);
    contactRows = ids.map(id=>({id,profile:people[id]||{},presence:presence.get(id)||null,relationship:following.has(id)&&followers.has(id)?'Following · Follows you':following.has(id)?'Following':'Follows you'}));
    contactRows.sort((a,b)=>Number(b.presence?.online===true)-Number(a.presence?.online===true) || String(a.profile.display_name||a.profile.username||'').localeCompare(String(b.profile.display_name||b.profile.username||'')));
    renderContacts();
  }
  function renderContacts() {
    const host=$('contactList'); if(!host)return;
    const query=String($('contactSearch')?.value||'').trim().toLowerCase();
    const rows=contactRows.filter(row=>`${row.profile.display_name||''} ${row.profile.username||''} ${row.profile.spike_id||''}`.toLowerCase().includes(query)).sort((a,b)=>Number(b.presence?.online===true)-Number(a.presence?.online===true));
    host.replaceChildren();
    if(!rows.length){const empty=document.createElement('div');empty.className='contact-empty';empty.textContent=query?'No matching people found.':contactMode==='all'?'No followers or following yet.':`No ${contactMode} yet.`;host.append(empty);return;}
    rows.forEach(contact=>{
      const {id,profile}=contact;
      const row=document.createElement('div');row.className='contact-row';
      const avatar=document.createElement('div');avatar.className='contact-avatar';
      const imageUrl=avatarUrl(profile.avatar_path);if(imageUrl){const img=document.createElement('img');img.src=imageUrl;img.alt='';img.loading='lazy';avatar.append(img);}else avatar.textContent=initials(profile.display_name||profile.username);
      const details=document.createElement('div');details.className='contact-details';
      const name=document.createElement('strong');name.textContent=profile.display_name||profile.username||'SPIKE member';
      const username=document.createElement('small');username.textContent=profile.username?`@${profile.username}`:'SPIKE member';
      const relation=document.createElement('small');relation.className='contact-relationship';relation.textContent=row.relationship;
      const presence=document.createElement('small');presence.className='contact-presence'+(row.presence?.online?' online':'');presence.textContent=row.presence?.online?'● Online now':row.presence?.lastSeenAt?`Last seen ${day(row.presence.lastSeenAt)}`:'Offline';
      details.append(name,username,relation,presence);
      const action=document.createElement('button');action.type='button';action.className='contact-message-button';action.textContent=selectedContacts.has(id)?'Selected':'Select';action.dataset.contactSelect=id;action.setAttribute('aria-pressed',String(selectedContacts.has(id)));
      if(selectedContacts.has(id))action.classList.add('selected');
      row.append(avatar,details,action);host.append(row);
    });
    const footer=$('contactSelectionFooter');
    if(footer){footer.hidden=selectedContacts.size===0;const count=$('contactSelectionCount');if(count)count.textContent=String(selectedContacts.size);const start=$('startSelectedConversation');if(start)start.textContent=selectedContacts.size>1?'Create group':'Start conversation';const groupTitle=$('contactGroupTitle')?.closest('.contact-group-title');if(groupTitle)groupTitle.hidden=selectedContacts.size<2;}
  }
  function bindContactPicker() {
    const panel=$('contactPicker'); if(!panel)return;
    const open=()=>{panel.hidden=false;document.body.style.overflow='hidden';$('contactSearch')?.focus();loadContacts(contactMode).catch(error=>{const host=$('contactList');if(host){host.replaceChildren();const empty=document.createElement('div');empty.className='contact-empty error';empty.textContent=error.message||'Contacts could not be loaded.';host.append(empty);}});};
    const close=()=>{panel.hidden=true;document.body.style.overflow='';selectedContacts.clear();renderContacts();};
    $('openContactPicker')?.addEventListener('click',open);$('openContactPickerHero')?.addEventListener('click',open);$('closeContactPicker')?.addEventListener('click',close);
    panel.addEventListener('click',event=>{if(event.target===panel)close();const tab=event.target.closest('[data-contact-tab]');if(tab){panel.querySelectorAll('[data-contact-tab]').forEach(button=>{const active=button===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});loadContacts(tab.dataset.contactTab).catch(error=>say(error.message,true));return;}const action=event.target.closest('[data-contact-select]');if(action){const id=action.dataset.contactSelect;if(!uuidRe.test(id)||id===user.id)return;if(selectedContacts.has(id))selectedContacts.delete(id);else selectedContacts.add(id);renderContacts();}});
    $('contactSearch')?.addEventListener('input',renderContacts);
    $('startSelectedConversation')?.addEventListener('click',async button=>{const ids=[...selectedContacts];if(!ids.length)return;const start=$('startSelectedConversation');if(start)start.disabled=true;try{if(ids.length===1){location.href=`message.html?user_id=${encodeURIComponent(ids[0])}`;return;}const title=String($('contactGroupTitle')?.value||'').trim().slice(0,100)||'SPIKE Group';const {data,error}=await db().rpc('create_conversation',{participant_ids:ids,conversation_title:title});if(error)throw error;if(!data||!uuidRe.test(String(data)))throw new Error('The group conversation could not be created.');location.href=`message.html?conversation_id=${encodeURIComponent(data)}`;}catch(error){say(error.message||'Could not start this conversation.',true);if(start)start.disabled=false;}});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden)close();});
  }

  function renderBubble(row, profile = {}, reactionInfo = null, replyInfo = null, showSender = true) {
    const mine = row.sender_id === user.id;
    const article = document.createElement('article'); article.className = `bubble${mine?' mine':''}`; article.dataset.messageId = row.id;
    if (showSender) {
      const sender = document.createElement('div'); sender.className = 'messageSender';
      sender.textContent = mine ? 'You' : (profile.display_name || profile.username || 'SPIKE member');
      article.append(sender);
    }
    if (row.deleted_at) { const gone = document.createElement('span'); gone.textContent = 'Message deleted'; article.append(gone); }
    else {
      if (replyInfo) { const reply = document.createElement('div'); reply.className = 'messageReplyContext'; reply.textContent = `↪ ${replyInfo.deleted_at ? 'Deleted message' : (replyInfo.body || 'Attachment').slice(0, 140)}`; article.append(reply); }
      if (row.body) { const body = document.createElement('div'); body.textContent = row.body; article.append(body); }
      if (row.attachment_path) {
        const holder = document.createElement('div'); holder.className = 'messageAttachment'; holder.dataset.attachmentPath=row.attachment_path; holder.dataset.attachmentType=row.attachment_type||'file'; holder.textContent = 'Loading secure attachment…'; article.append(holder);
      }
    }
    if (reactionInfo?.count) { const reaction = document.createElement('span'); reaction.className = 'msgReaction'; reaction.dataset.reactionMessageId = row.id; reaction.dataset.reactionCount = String(reactionInfo.count); reaction.dataset.reactionMine = reactionInfo.mine ? 'true' : 'false'; reaction.textContent = reactionInfo.mine ? `❤️ You${reactionInfo.count > 1 ? ` + ${reactionInfo.count - 1}` : ''}` : `❤️ ${reactionInfo.count}`; reaction.setAttribute('aria-label', `${reactionInfo.count} heart reaction(s)${reactionInfo.mine ? ', including yours' : ''}`); article.append(reaction); }
    const stamp=document.createElement('time'); stamp.dateTime=row.created_at; stamp.textContent=time(row.created_at)+(row.is_edited?' · edited':''); article.append(stamp);
    if (!row.deleted_at) { const actions=document.createElement('button'); actions.type='button'; actions.className='messageActions'; actions.dataset.messageActionOpen=row.id; actions.setAttribute('aria-label','Message options'); actions.textContent='⋯'; article.append(actions); }
    if (!mine && profile.display_name) article.title=profile.display_name;
    return article;
  }

  function closeMessageMenu() { $('messageMenuShade')?.classList.remove('show'); document.body.classList.remove('message-menu-open'); }
  function openMessageMenu(row) { selectedMessage=row; const shade=$('messageMenuShade'); if(!shade)return; const sub=shade.querySelector('.menuSub'); if(sub)sub.textContent=row.body || (row.attachment_type ? `Shared ${row.attachment_type}` : 'Message options'); shade.classList.add('show'); document.body.classList.add('message-menu-open'); }
  async function handleMessageAction(action) {
    const row=selectedMessage; if(!row)return;
    try {
      if(action==='close'){closeMessageMenu();return;}
      if(action==='reply'){replyToId=row.id; if($('replyText'))$('replyText').textContent=`Replying to: ${(row.body||'Attachment').slice(0,120)}`; $('replyPreview')?.classList.add('show'); $('body')?.focus(); closeMessageMenu(); return;}
      if(action==='copy'){await navigator.clipboard.writeText(row.body||''); say('Message text copied.'); closeMessageMenu(); return;}
      if(action==='share'){const text=row.body||'Shared a message on SPIKE'; if(navigator.share) await navigator.share({title:'SPIKE message',text}); else {await navigator.clipboard.writeText(text);say('Message text copied for sharing.');} closeMessageMenu(); return;}
      if(action==='like'){const {data:existing,error:readError}=await db().from('message_reactions').select('message_id').eq('message_id',row.id).eq('user_id',user.id).eq('reaction','❤️').maybeSingle(); if(readError)throw readError; if(existing){const {error}=await db().from('message_reactions').delete().eq('message_id',row.id).eq('user_id',user.id).eq('reaction','❤️');if(error)throw error;say('Reaction removed.');}else{const {error}=await db().from('message_reactions').insert({message_id:row.id,user_id:user.id,reaction:'❤️'});if(error)throw error;say('You reacted ❤️');} closeMessageMenu(); await refreshReactionBadge(row.id); return;}
      if(action==='report'){const reason=await window.SPIKEPremiumDialog.prompt('Why are you reporting this message?',{title:'Report message',confirmText:'Submit report',cancelText:'Cancel'}); if(!reason || reason.trim().length<3){say('Please provide a reason of at least 3 characters.',true);return;} const {error}=await db().from('reports').insert({reporter_id:user.id,target_type:'message',target_id:row.id,reason:reason.trim().slice(0,100),details:''});if(error)throw error;say('Message report submitted.');closeMessageMenu();return;}
      if(action==='delete'){if(row.sender_id!==user.id){say('You can only delete messages you sent.',true);return;} if(!await window.SPIKEPremiumDialog.confirm({title:'Delete this message?',message:'This message will be removed from your conversation.',confirmText:'Delete message',cancelText:'Cancel',danger:true}))return;const {data:deleted,error}=await db().from('messages').update({deleted_at:new Date().toISOString()}).eq('id',row.id).eq('sender_id',user.id).select('id').maybeSingle();if(error)throw error;if(!deleted)throw new Error('Message was not deleted. Refresh the conversation and try again.');say('Message deleted.');closeMessageMenu();await loadMessages();return;}
    } catch(error){say(error.message||'That message action could not be completed.',true);}
  }

  async function refreshReadReceipt() {
    if(!conversationId || !user || currentConversationIsGroup)return;
    try {
      const {data,error}=await db().from('conversation_members').select('last_read_at').eq('conversation_id',conversationId).neq('user_id',user.id).maybeSingle();
      if(error)throw error;
      peerLastReadAt=data?.last_read_at||null;
      const thread=$('thread'); if(!thread)return;
      thread.querySelectorAll('.messageReadReceipt').forEach(node=>node.remove());
      if(!peerLastReadAt)return;
      const own=[...thread.querySelectorAll('.bubble.mine[data-message-id]')];
      const last=own[own.length-1];
      const stamp=last?.querySelector('time');
      if(last && stamp && new Date(peerLastReadAt)>=new Date(stamp.dateTime)){
        const receipt=document.createElement('small');receipt.className='messageReadReceipt';receipt.textContent='Seen';receipt.setAttribute('aria-label','Message seen');last.append(receipt);
      }
    } catch(error) { console.info('[SPIKE messaging] read receipt refresh unavailable',error?.message||error); }
  }

  async function markRead() {
    const {error} = await db().from('conversation_members').update({last_read_at:new Date().toISOString()}).eq('conversation_id',conversationId).eq('user_id',user.id);
    if (error) console.warn('[SPIKE messaging] read receipt update failed',error);
  }

  async function hydrateMessageAttachments(rows, root) {
    const eligible=(rows||[]).filter(row=>row && !row.deleted_at && row.attachment_path);
    const paths=[...new Set(eligible.map(row=>row.attachment_path))];
    if(!paths.length || !root)return;
    const pathSet=new Set(paths);
    const holders=[...root.querySelectorAll('.messageAttachment[data-attachment-path]')].filter(holder=>pathSet.has(holder.dataset.attachmentPath));
    try {
      const {data,error}=await db().storage.from('chat-attachments').createSignedUrls(paths,300);
      if(error)throw error;
      const urls=new Map((data||[]).filter(item=>item.path&&item.signedUrl).map(item=>[item.path,item.signedUrl]));
      holders.forEach(holder=>{
        if(!holder.isConnected)return;
        const url=urls.get(holder.dataset.attachmentPath);
        if(!url){holder.textContent='Attachment unavailable';return;}
        holder.replaceChildren();
        const kind=holder.dataset.attachmentType;
        if(kind==='image'){const img=document.createElement('img');img.src=url;img.alt='Shared image';img.loading='lazy';img.decoding='async';img.style.maxWidth='min(260px,70vw)';img.style.borderRadius='12px';holder.append(img);}
        else if(kind==='video'){const video=document.createElement('video');video.src=url;video.controls=true;video.playsInline=true;video.preload='none';video.style.maxWidth='min(280px,75vw)';holder.append(video);}
        else if(kind==='audio'){const audio=document.createElement('audio');audio.src=url;audio.controls=true;audio.preload='none';holder.append(audio);}
        else{const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open attachment';holder.append(link);}
      });
    } catch(error) {
      holders.forEach(holder=>{if(holder.isConnected)holder.textContent='Attachment unavailable';});
      console.warn('[SPIKE messaging] secure attachment batch could not be loaded',error?.message||error);
    }
  }

  async function loadMessages({older=false}={}) {
    const pageSize = older ? 40 : 60;
    const scroll = $('scroll');
    const previousHeight = scroll?.scrollHeight || 0;
    const previousTop = scroll?.scrollTop || 0;
    const query = db().from('messages').select('id,conversation_id,sender_id,body,reply_to_id,attachment_path,attachment_type,is_edited,deleted_at,created_at').eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(pageSize);
    if (older && oldest) query.lt('created_at',oldest);
    const {data,error}=await query; if(error) throw error;
    const rows=(data||[]).reverse(); if(rows.length) oldest=rows[0].created_at;
    const thread=$('thread'); if(!thread)return;
    const ids=rows.map(x=>x.sender_id); const people=await profiles(ids);
    const messageIds=rows.map(x=>x.id);
    const replyIds=[...new Set(rows.map(x=>x.reply_to_id).filter(Boolean))];
    const [reactionResult,replyResult]=await Promise.all([
      messageIds.length ? db().from('message_reactions').select('message_id,user_id,reaction').in('message_id',messageIds) : Promise.resolve({data:[],error:null}),
      replyIds.length ? db().from('messages').select('id,body,deleted_at').in('id',replyIds).eq('conversation_id',conversationId) : Promise.resolve({data:[],error:null})
    ]);
    if(reactionResult.error)throw reactionResult.error;
    if(replyResult.error)throw replyResult.error;
    const reactionsByMessage=new Map();
    (reactionResult.data||[]).forEach(reaction=>{
      if(reaction.reaction!=='❤️')return;
      const current=reactionsByMessage.get(reaction.message_id)||{count:0,mine:false};
      current.count++; if(reaction.user_id===user.id)current.mine=true;
      reactionsByMessage.set(reaction.message_id,current);
    });
    const repliesById=new Map((replyResult.data||[]).map(reply=>[reply.id,reply]));
    if(!older) thread.replaceChildren();
    if(!rows.length && !older){const empty=document.createElement('div');empty.className='empty';empty.textContent='No messages yet. Say hello 👋';thread.append(empty);}
    const fragment=document.createDocumentFragment();
    rows.forEach((row,index)=>{
      const currentDate = new Date(row.created_at);
      const previous = rows[index-1];
      const previousDate = previous ? new Date(previous.created_at) : null;
      const dateKey = Number.isNaN(currentDate.getTime()) ? '' : currentDate.toLocaleDateString();
      const previousKey = previousDate && !Number.isNaN(previousDate.getTime()) ? previousDate.toLocaleDateString() : '';
      if (dateKey && dateKey !== previousKey) {
        const separator = document.createElement('div'); separator.className = 'day';
        separator.textContent = currentDate.toLocaleDateString([], {weekday:'long',month:'short',day:'numeric'});
        fragment.append(separator);
      }
      const sameSender = previous && previous.sender_id === row.sender_id && previousKey === dateKey;
      fragment.append(renderBubble(row,people[row.sender_id]||{},reactionsByMessage.get(row.id),repliesById.get(row.reply_to_id),!sameSender));
    });
    if(older){
      thread.insertBefore(fragment,thread.firstChild);
      if(scroll)scroll.scrollTop=previousTop+(scroll.scrollHeight-previousHeight);
    } else {
      thread.append(fragment);
      if(scroll)scroll.scrollTo({top:scroll.scrollHeight});
    }
    await hydrateMessageAttachments(rows,thread);
    const olderButton=$('loadOlderMessages');
    if(olderButton)olderButton.style.display=rows.length===pageSize?'block':'none';
    await markRead();
    await refreshReadReceipt();
  }

  async function refreshReactionBadge(messageId) {
    if (!messageId || !conversationId) return;
    const {data:message,error:messageError}=await db().from('messages').select('id').eq('id',messageId).eq('conversation_id',conversationId).maybeSingle();
    if(messageError)throw messageError;
    if(!message)return;
    const {data,error}=await db().from('message_reactions').select('user_id,reaction').eq('message_id',messageId);
    if(error)throw error;
    const hearts=(data||[]).filter(item=>item.reaction==='❤️');
    const article=$('thread')?.querySelector(`[data-message-id="${messageId}"]`);
    if(!article)return;
    let badge=article.querySelector('.msgReaction');
    if(!hearts.length){badge?.remove();return;}
    if(!badge){badge=document.createElement('span');badge.className='msgReaction';article.append(badge);}
    const mine=hearts.some(item=>item.user_id===user.id);
    badge.dataset.reactionMessageId=messageId;
    badge.dataset.reactionCount=String(hearts.length);
    badge.dataset.reactionMine=mine?'true':'false';
    badge.textContent=mine?`❤️ You${hearts.length>1?` + ${hearts.length-1}`:''}`:`❤️ ${hearts.length}`;
    badge.setAttribute('aria-label',`${hearts.length} heart reaction(s)${mine?', including yours':''}`);
  }

  async function appendMessage(row) {
    if(!row || row.conversation_id!==conversationId || $('thread')?.querySelector(`[data-message-id="${row.id}"]`))return;
    let people={};
    try { people=await profiles([row.sender_id]); } catch(error) { console.warn('[SPIKE messaging] sender profile could not be loaded',error); }
    let replyInfo=null;
    if(row.reply_to_id){try{const result=await db().from('messages').select('id,body,deleted_at').eq('id',row.reply_to_id).eq('conversation_id',conversationId).maybeSingle();if(!result.error)replyInfo=result.data;}catch(error){console.warn('[SPIKE messaging] reply preview could not be loaded',error);}}
    $('thread')?.querySelector('.empty')?.remove();
    const thread=$('thread');
    thread?.append(renderBubble(row,people[row.sender_id]||{},null,replyInfo));
    if(row.attachment_path)await hydrateMessageAttachments([row],thread);
    $('scroll')?.scrollTo({top:$('scroll').scrollHeight,behavior:'smooth'});
  }

  function bindVoiceNotes() {
    const button=$('voiceNote'), input=$('mediaInput'), tray=$('recordingTray'), cancel=$('voiceRecordingCancel'), label=$('voiceRecordingText');
    if(!button || !input || button.dataset.voiceBound==='1')return;
    button.dataset.voiceBound='1';
    let recorder=null,stream=null,chunks=[],discard=false,startedAt=0,timer=null;
    const paint=(recording)=>{button.classList.toggle('recording',recording);button.setAttribute('aria-label',recording?'Stop voice note recording':'Record voice note');button.title=recording?'Stop recording':'Record voice note';button.innerHTML=recording?'<i class="fa-solid fa-stop"></i>':'<i class="fa-solid fa-microphone"></i>';};
    const cleanup=()=>{if(timer)clearInterval(timer);timer=null;stream?.getTracks().forEach(track=>track.stop());stream=null;recorder=null;paint(false);if(tray)tray.hidden=true;};
    const cancelRecording=()=>{if(!recorder||recorder.state==='inactive')return;discard=true;recorder.stop();};
    button.addEventListener('click',async()=>{
      if(recorder?.state==='recording'){recorder.stop();return;}
      if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined'){say('Voice recording is not supported by this browser. Try an updated browser over HTTPS.',true);return;}
      button.disabled=true;
      try{
        stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
        const types=['audio/webm;codecs=opus','audio/mp4'];
        const mimeType=types.find(type=>MediaRecorder.isTypeSupported?.(type));
        recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);chunks=[];discard=false;startedAt=Date.now();
        recorder.addEventListener('dataavailable',event=>{if(event.data?.size)chunks.push(event.data);});
        recorder.addEventListener('stop',()=>{
          const finalType=recorder?.mimeType||chunks[0]?.type||'audio/webm';
          const blob=new Blob(chunks,{type:finalType});
          cleanup();
          if(discard){chunks=[];say('Voice recording cancelled.');return;}
          if(!blob.size){say('No audio was captured. Please try again.',true);return;}
          const ext=finalType.includes('ogg')?'ogg':finalType.includes('mp4')?'m4a':'webm';
          const file=new File([blob],`spike-voice-${Date.now()}.${ext}`,{type:finalType});
          try{const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));say('Voice note ready. Tap Send to share it privately.');}
          catch(error){say('The recording is ready but could not be attached. Please try again.',true);console.warn('[SPIKE voice note] file attach failed',error);}
          chunks=[];
        },{once:true});
        recorder.start(250);paint(true);if(tray)tray.hidden=false;
        const update=()=>{const elapsed=Math.floor((Date.now()-startedAt)/1000);if(label)label.textContent=`Recording voice note · ${elapsed}s`;if(elapsed>=180&&recorder?.state==='recording')recorder.stop();};update();timer=window.setInterval(update,500);
      }catch(error){cleanup();say(error?.name==='NotAllowedError'?'Microphone permission was denied. Allow microphone access and try again.':error?.message||'Could not start voice recording.',true);}
      finally{button.disabled=false;}
    });
    cancel?.addEventListener('click',cancelRecording);
    window.addEventListener('pagehide',()=>{discard=true;if(recorder&&recorder.state!=='inactive')recorder.stop();cleanup();},{once:true});
  }

  async function setupThread() {
    const refreshButton=$('refresh');
    if(refreshButton && refreshButton.dataset.messagingBound!=='1'){
      refreshButton.dataset.messagingBound='1';
      refreshButton.addEventListener('click',()=>{
        const task=conversationId?loadMessages():setupThread();
        Promise.resolve(task).catch(error=>say(error.message||'Conversation could not be refreshed. Please try again.',true));
      });
    }
    await openOrCreateConversation();
    const [{data:members,error},{data:conversation,error:conversationError}]=await Promise.all([
      db().from('conversation_members').select('user_id,last_read_at').eq('conversation_id',conversationId),
      db().from('conversations').select('id,kind,title').eq('id',conversationId).maybeSingle()
    ]);
    if(error) throw error;if(conversationError)throw conversationError;
    const peerMembers=(members||[]).filter(x=>x.user_id!==user.id);
    const peerIds=peerMembers.map(x=>x.user_id);
    peerLastReadAt=peerMembers.length===1?peerMembers[0].last_read_at:null;
    const isGroup=conversation?.kind==='group';
    if($('voiceCallBtn'))$('voiceCallBtn').hidden=isGroup;
    if($('videoCallBtn'))$('videoCallBtn').hidden=isGroup; currentConversationIsGroup=isGroup;
    const peerId=peerIds[0];
    // The call engine needs the resolved recipient ID, not only the profile object.
    // Groups deliberately have no one-to-one call recipient.
    currentPeerId = !isGroup && peerId ? String(peerId) : null;
    if(peerId&&!isGroup){
      const {data:allowed,error:privacyError}=await db().rpc('can_message_spike_user',{p_sender:user.id,p_recipient:peerId});
      if(privacyError)throw privacyError;
      if(allowed!==true){
        const composer=$('form');
        if(composer){composer.querySelectorAll('button,textarea').forEach(node=>node.disabled=true);}
        say('This member is not accepting new messages from your account.',true);
      }
    }
    let people={};
    try { people=await profiles(peerIds); }
    catch(error) { console.warn('[SPIKE messaging] participant profiles unavailable',error); }
    currentPeer=people[peerId]||{};
    const groupTitle=conversation?.title||'SPIKE Group';
    if($('name')) $('name').textContent=isGroup?groupTitle:(currentPeer.display_name||currentPeer.username||'SPIKE member');
    if($('sub')) $('sub').textContent=isGroup?`${peerIds.length+1} members`:(currentPeer.username?`@${currentPeer.username}`:'Direct message');
    const presenceHost=$('name')?.closest('[data-presence-user]');
    if(presenceHost){presenceHost.dataset.presenceUser=isGroup?'':String(peerId||'');}
    const refreshThreadPresence=async()=>{
      if(isGroup||!peerId||document.hidden||!navigator.onLine)return;
      try{
        const presence=await getInboxPresence();
        const peer=presence.get(String(peerId));
        const label=presenceLabel(peer);
        const sub=$('sub');if(sub)sub.textContent=label;
        const host=$('name')?.closest('[data-presence-user]');if(host)host.dataset.presenceState=peer?.online?'online':'offline';
      }catch(error){console.info('[SPIKE messaging] peer presence unavailable',error?.message||error);}
    };
    if(!isGroup&&peerId){await refreshThreadPresence();threadPresenceHandler=()=>{if(!document.hidden&&navigator.onLine)void refreshThreadPresence();};window.addEventListener('spike:presence-update',threadPresenceHandler);}
    if($('avatar')) { $('avatar').replaceChildren(); const imageUrl=!isGroup?avatarUrl(currentPeer.avatar_path):''; if(imageUrl){const img=document.createElement('img');img.src=imageUrl;img.alt='';$('avatar').append(img);}else $('avatar').textContent=isGroup?'G':initials(currentPeer.display_name||currentPeer.username); }

    // Bind the composer and controls before loading optional history metadata. A failed
    // history/reaction/profile query must never leave the entire composer inert.
    const input=$('body'), form=$('form');
    $('thread')?.addEventListener('click',event=>{const trigger=event.target.closest('[data-message-action-open]');if(!trigger)return;const id=trigger.dataset.messageActionOpen;db().from('messages').select('id,sender_id,body,attachment_type,created_at').eq('id',id).eq('conversation_id',conversationId).maybeSingle().then(({data,error})=>{if(error)throw error;if(data)openMessageMenu(data);}).catch(error=>say(error.message,true));});
    $('messageMenuShade')?.addEventListener('click',event=>{if(event.target.id==='messageMenuShade')closeMessageMenu();});
    $('messageMenuShade')?.querySelectorAll('[data-msg-action]').forEach(button=>button.addEventListener('click',()=>handleMessageAction(button.dataset.msgAction)));
    $('cancelReply')?.addEventListener('click',()=>{replyToId=null;$('replyPreview')?.classList.remove('show');});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMessageMenu();});
    input?.addEventListener('input',()=>{ if(String(input.value||'').trim())scheduleTyping(); else { if(typingStopTimer)clearTimeout(typingStopTimer); typingStopTimer=null; void sendTyping(false); } });
    bindVoiceNotes();
    form?.addEventListener('submit',async event=>{
      if(event.defaultPrevented || $('mediaInput')?.files?.length) return;
      event.preventDefault(); if(busy)return;
      const body=String(input?.value||'').trim(); if(!body)return;
      busy=true; const send=$('send'); if(send)send.disabled=true;
      try { const {data,error}=await db().from('messages').insert({conversation_id:conversationId,sender_id:user.id,body,reply_to_id:replyToId}).select('id,conversation_id,sender_id,body,reply_to_id,attachment_path,attachment_type,is_edited,deleted_at,created_at').single(); if(error)throw error; await appendMessage(data); input.value=''; if(typingStopTimer)clearTimeout(typingStopTimer); typingStopTimer=null; void sendTyping(false); replyToId=null; $('replyPreview')?.classList.remove('show'); }
      catch(error){say(error.message||'Message could not be sent.',true);} finally{busy=false;if(send)send.disabled=false;}
    });
    $('loadOlderMessages')?.addEventListener('click',()=>loadMessages({older:true}).catch(e=>say(e.message,true)));

    try {
      channelReady=false; channel=db().channel(`spike-dm:${conversationId}`,{config:{private:true,broadcast:{ack:true,self:false}}}).on('broadcast',{event:'typing'},payload=>{const signal=payload?.payload||{};if(!signal.user_id||signal.user_id===user.id)return;peerTypingUntil=signal.typing===true?Date.now()+2600:0;renderPeerTyping();if(peerTypingTimer)clearTimeout(peerTypingTimer);if(peerTypingUntil>Date.now())peerTypingTimer=window.setTimeout(renderPeerTyping,2700);}).on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:`conversation_id=eq.${conversationId}`},async payload=>{
        if(payload.eventType==='UPDATE'){await loadMessages();return;}
        if(payload.eventType!=='INSERT' || payload.new.sender_id===user.id)return;
        const row=payload.new; await appendMessage(row); await markRead();
      }).on('postgres_changes',{event:'*',schema:'public',table:'message_reactions'},payload=>{const messageId=payload.new?.message_id||payload.old?.message_id;if(messageId)refreshReactionBadge(messageId).catch(error=>console.warn('[SPIKE messaging] live reaction refresh failed',error));}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'conversation_members',filter:`conversation_id=eq.${conversationId}`},payload=>{if(payload.new?.user_id!==user.id){peerLastReadAt=payload.new?.last_read_at||null;void refreshReadReceipt();}}).subscribe((status,error)=>{const state=$('connectionState');if(status==='SUBSCRIBED'){channelReady=true;if(state){state.hidden=false;state.textContent='Live updates connected';state.dataset.state='connected';}void refreshReadReceipt();}else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){channelReady=false;if(state){state.hidden=false;state.textContent='Live updates unavailable. Reconnecting…';state.dataset.state='error';}console.warn('[SPIKE messaging] realtime channel status',status,error||'');}else if(status==='CLOSED'){channelReady=false;if(state){state.hidden=false;state.textContent='Live updates disconnected. Reconnecting…';state.dataset.state='error';}}});
    } catch(error) {
      console.warn('[SPIKE messaging] realtime setup failed; manual refresh remains available',error);
      const state=$('connectionState');if(state){state.hidden=false;state.textContent='Live updates unavailable. Use Refresh to check for new messages.';state.dataset.state='error';}
    }
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){markRead();if(typeof refreshThreadPresence==='function')refreshThreadPresence();}});
    try { await loadMessages(); }
    catch(error) { say(`Conversation is open, but message history could not load: ${error.message||'Please tap Refresh to retry.'}`,true); }
  }

  async function loadInbox() {
    const {data:members,error}=await db().from('conversation_members').select('conversation_id,last_read_at').eq('user_id',user.id);
    if(error)throw error;
    const ids=(members||[]).map(x=>x.conversation_id); const list=$('list'); if(!list)return;
    if(!ids.length){list.innerHTML='<div class="empty">No conversations yet. Find someone and start a chat.</div>';return;}
    const {data:convs,error:convError}=await db().from('conversations').select('id,kind,title,updated_at').in('id',ids).order('updated_at',{ascending:false}); if(convError)throw convError;
    const conversationIds=(convs||[]).map(row=>row.id);
    // Fetch peer memberships in batches instead of issuing one query per conversation.
    const memberRows=[];
    for(let offset=0;offset<conversationIds.length;offset+=100){
      const batch=conversationIds.slice(offset,offset+100);
      const result=await db().from('conversation_members').select('conversation_id,user_id').in('conversation_id',batch).neq('user_id',user.id);
      if(result.error)throw result.error;memberRows.push(...(result.data||[]));
    }
    const peerByConversation=new Map();
    memberRows.forEach(row=>{if(!peerByConversation.has(row.conversation_id))peerByConversation.set(row.conversation_id,[]);peerByConversation.get(row.conversation_id).push(row.user_id);});
    // Fetch latest message rows in batches and retain the newest row per conversation.
    // A bounded page loop stops as soon as every conversation with messages has a latest row.
    const latestByConversation=new Map();
    const messageBatches = [];
    for(let offset=0;offset<conversationIds.length;offset+=100) messageBatches.push(conversationIds.slice(offset,offset+100));
    // Each batch is independent. Run the first page together, then only fetch
    // older pages for batches that still have conversations without a preview.
    await Promise.all(messageBatches.map(async batch=>{
      let page=0;const found=new Set();
      while(page<20){
        const result=await db().from('messages').select('conversation_id,body,attachment_type,sender_id,created_at,deleted_at').in('conversation_id',batch).order('created_at',{ascending:false}).range(page*100,(page+1)*100-1);
        if(result.error)throw result.error;
        const records=result.data||[];
        for(const message of records){if(!latestByConversation.has(message.conversation_id)){latestByConversation.set(message.conversation_id,message);found.add(message.conversation_id);}}
        if(records.length<100 || found.size>=batch.length)break;
        page++;
      }
    }));
    const memberByConversation=new Map((members||[]).map(row=>[row.conversation_id,row]));
    const rows=(convs||[]).map(conv=>({conv,peerIds:peerByConversation.get(conv.id)||[],last:latestByConversation.get(conv.id),member:memberByConversation.get(conv.id)}));
    const [people,presence]=await Promise.all([profiles(rows.flatMap(row=>row.peerIds)),getInboxPresence()]);
    rows.sort((a,b)=>{const ap=a.peerIds.length===1&&presence.get(String(a.peerIds[0]))?.online===true;const bp=b.peerIds.length===1&&presence.get(String(b.peerIds[0]))?.online===true;return Number(bp)-Number(ap)||(new Date(b.last?.created_at||b.conv.updated_at)-new Date(a.last?.created_at||a.conv.updated_at));});
    const needle=String($('search')?.value||'').trim().toLowerCase(); const filter=document.querySelector('.chip.active')?.dataset.filter||'all';
    const isUnread=row=>!!row.last&&row.last.sender_id!==user.id&&(!row.member?.last_read_at||new Date(row.last.created_at)>new Date(row.member.last_read_at));
    const totalUnread=rows.filter(isUnread).length;
    const visible=rows.filter(row=>{const p=people[row.peerIds[0]]||{};const peerNames=row.peerIds.map(id=>{const person=people[id]||{};return `${person.display_name||''} ${person.username||''}`;}).join(' ');const label=`${peerNames} ${p.spike_id||''} ${row.conv.title||''} ${row.last?.body||''}`.toLowerCase();if(needle&&!label.includes(needle))return false;const unread=isUnread(row);if(filter==='unread'&&!unread)return false;if(filter==='online'&&!row.peerIds.some(id=>presence.get(String(id))?.online===true))return false;return true;});
    list.replaceChildren();
    if(!visible.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='No conversations match this view.';list.append(empty);}
    visible.forEach(row=>{
      const p=people[row.peerIds[0]]||{};const unread=isUnread(row)&&!row.last?.deleted_at;const a=document.createElement('a');a.className='item';a.href=`message.html?conversation_id=${encodeURIComponent(row.conv.id)}`;
      if(row.conv.kind!=='group' && row.peerIds[0]) a.dataset.peerId=String(row.peerIds[0]);
      const avatar=document.createElement('div');avatar.className='avatar';const imageUrl=avatarUrl(p.avatar_path);if(imageUrl){const img=document.createElement('img');img.src=imageUrl;img.alt='';img.loading='lazy';avatar.append(img);}else avatar.textContent=initials(p.display_name||p.username||row.conv.title);
      const details=document.createElement('div');details.className='details';
      const titleLine=document.createElement('div');titleLine.className='inbox-title-line';
      const name=document.createElement('div');name.className='name';name.textContent=row.conv.kind==='group'?(row.conv.title||'SPIKE Group'):(p.display_name||p.username||'SPIKE member');
      titleLine.append(name);
      const peerPresence=row.conv.kind==='group'?null:presence.get(String(row.peerIds[0]));
      const presenceNode=document.createElement('span');presenceNode.className='inbox-presence'+(peerPresence?.online?' online':'');presenceNode.textContent=row.conv.kind==='group'?`${row.peerIds.length+1} members`:presenceLabel(peerPresence);presenceNode.setAttribute('aria-label',presenceNode.textContent);titleLine.append(presenceNode);
      const handle=document.createElement('div');handle.className='presence-time-label';handle.textContent=row.conv.kind==='group'?row.peerIds.map(id=>{const person=people[id]||{};return person.display_name||person.username||'Member';}).slice(0,3).join(', ')+(row.peerIds.length>3?` +${row.peerIds.length-3}`:''):(p.username?`@${p.username}`:'SPIKE member');
      const preview=document.createElement('div');preview.className='preview';preview.textContent=row.last?(row.last.deleted_at?'Message deleted':(row.last.attachment_type?`📎 ${row.last.attachment_type}`:row.last.body||'Message')):'Start the conversation';
      details.append(titleLine,handle,preview);
      const meta=document.createElement('div');meta.className='meta';meta.textContent=day(row.last?.created_at||row.conv.updated_at);if(unread){const badge=document.createElement('span');badge.className='rowUnreadBadge';badge.textContent='New';meta.append(badge);}a.append(avatar,details,meta);list.append(a);
    });
    const badge=$('unreadTotalBadge');if(badge){badge.textContent=String(totalUnread);badge.hidden=!totalUnread;}
    const unreadBadge=$('unreadFilterBadge');if(unreadBadge){unreadBadge.textContent=String(totalUnread);unreadBadge.hidden=!totalUnread;}
  }

  async function showIncomingMessage(payload) {
    const row=payload?.new;
    if(!row?.conversation_id || !row?.sender_id || row.sender_id===user.id)return;
    const {data:membership,error}=await db().from('conversation_members').select('conversation_id').eq('conversation_id',row.conversation_id).eq('user_id',user.id).maybeSingle();
    if(error)throw error;if(!membership)return;
    const people=await profiles([row.sender_id]);
    const peer=people[row.sender_id]||{};
    const toast=$('incomingToast');
    if(toast){
      $('incomingToastTitle').textContent=peer.display_name||peer.username||'New message';
      $('incomingToastPreview').textContent=row.attachment_type?`Shared ${row.attachment_type}`:(row.body||'Sent you a message');
      toast.hidden=false;
    }
    pendingIncomingConversationId=row.conversation_id;
    newIncomingCount++;
    const badge=$('newMessagesBadge');if(badge){badge.textContent=`${newIncomingCount} new`;badge.hidden=false;}
    $('incomingToastOpen')?.setAttribute('aria-label',`Open new message from ${peer.display_name||peer.username||'SPIKE member'}`);
    loadInbox().catch(error=>say(error.message||'Could not refresh the inbox.',true));
  }

  let inboxPresenceTimer = null, threadPresenceHandler = null;
  let messagingStartPromise = null;
  async function start(){
    // A single page owns one messaging controller. This prevents duplicate
    // subscriptions and duplicate DOM listeners if the script is injected twice.
    if (messagingStartPromise) return messagingStartPromise;
    messagingStartPromise = (async () => {
    if(!db())throw new Error('SPIKE database is not ready. Reload the page.');
    user=await getUser();
    if(document.body.dataset.spikePage==='message') { await setupThread(); }
    else { bindContactPicker(); await loadInbox(); if(window.SPIKE_PRESENCE){window.addEventListener('spike:presence-update',refreshInboxPresence);void refreshInboxPresence();}else{inboxPresenceTimer=window.setInterval(refreshInboxPresence,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshInboxPresence();});window.addEventListener('online',refreshInboxPresence);} inboxChannel=db().channel('spike-inbox-'+user.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},payload=>{ if(payload.new.sender_id===user.id || inboxRefreshQueued)return; inboxRefreshQueued=true; setTimeout(()=>{inboxRefreshQueued=false;showIncomingMessage(payload).catch(e=>say(e.message,true));},250); }).subscribe();
      $('incomingToastOpen')?.addEventListener('click',()=>{if(!pendingIncomingConversationId)return;newIncomingCount=0;const badge=$('newMessagesBadge');if(badge)badge.hidden=true;location.href=`message.html?conversation_id=${encodeURIComponent(pendingIncomingConversationId)}`;}); }
    })();
    try { return await messagingStartPromise; }
    catch (error) { messagingStartPromise = null; throw error; }
  }
  window.SPIKE_MESSAGING = Object.freeze({ getReplyToId:()=>replyToId, getCallContext:()=>({conversationId,peerId:currentPeerId,isGroup:currentConversationIsGroup}), clearReply:()=>{replyToId=null;$('replyPreview')?.classList.remove('show');}, appendMessage });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start().catch(e=>say(e.message,true)),{once:true});else start().catch(e=>say(e.message,true));
  let inboxSearchTimer=null;
  if($('search')) $('search').addEventListener('input',()=>{clearTimeout(inboxSearchTimer);inboxSearchTimer=window.setTimeout(()=>loadInbox().catch(e=>say(e.message,true)),180);});
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===button));loadInbox().catch(e=>say(e.message,true));}));
  window.addEventListener('pagehide',()=>{if(typingStopTimer)clearTimeout(typingStopTimer);if(peerTypingTimer)clearTimeout(peerTypingTimer);if(channel)void sendTyping(false);if(inboxPresenceTimer)clearInterval(inboxPresenceTimer);if(threadPresenceTimer)clearInterval(threadPresenceTimer);window.removeEventListener('spike:presence-update',refreshInboxPresence);if(threadPresenceHandler)window.removeEventListener('spike:presence-update',threadPresenceHandler);if(channel)db().removeChannel(channel);if(inboxChannel)db().removeChannel(inboxChannel);});
})();
