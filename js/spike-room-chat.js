/* SPIKE Room Chat V2 — independent chat/member layer for the new room.html. */
(() => {
  'use strict';
  if (window.__SPIKE_ROOM_CHAT_V2__) return;
  window.__SPIKE_ROOM_CHAT_V2__ = 'starting';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { client:null, room:null, user:null, profile:new Map(), messages:[], reactions:[], members:[], reply:null, channel:null, poll:null, memberPoll:null, sending:false, stopped:false, refreshing:false, lastError:'', realtimeConnected:false, messageSignature:'' };
  const REACTIONS = ['👍','❤️','😂','🔥','👏'];
  function status(message, error=false) { const node=$('chatConnectionState'); if(node) node.textContent=message; if(error) console.warn('[SPIKE Room Chat]',message); }
  function timeout(promise, ms, label) { let timer; return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out.')),ms)})]).finally(()=>clearTimeout(timer)); }
  function profileName(id) { const p=state.profile.get(String(id))||{}; return p.display_name||p.username||'SPIKE member'; }
  function avatar(id) { const p=state.profile.get(String(id))||{}; const name=profileName(id); return p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span>${esc(name.trim().charAt(0).toUpperCase()||'S')}</span>`; }
  function time(value) { const d=new Date(value); return Number.isNaN(d.getTime())?'':d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }
  async function loadProfiles(ids) {
    const missing=[...new Set(ids.map(String).filter(id=>id&&!state.profile.has(id)))];
    if(!missing.length)return;
    try {
      const r=await timeout(state.client.rpc('get_public_profiles',{p_user_ids:missing}),8000,'Member profile lookup');
      if(r.error)throw r.error;
      (r.data||[]).forEach(p=>state.profile.set(String(p.id),p));
    } catch(e) { console.info('[SPIKE Room Chat] Profile details are temporarily unavailable:',e.message); }
  }
  async function loadMessages(initial=false, forceReactions=false) {
    const r=await timeout(state.client.from('room_messages').select('id,room_id,sender_id,body,created_at,edited_at,reply_to_message_id:reply_to_id,pinned_at').eq('room_id',state.room.id).is('deleted_at',null).order('created_at',{ascending:false}).limit(60),12000,'Message refresh');
    if(r.error)throw r.error;
    const rows=(r.data||[]).reverse();
    const signature=rows.map(m=>`${m.id}:${m.edited_at||''}:${m.pinned_at||''}:${m.body}`).join('|');
    const changed=signature!==state.messageSignature;
    const oldIds=new Set(state.messages.map(m=>m.id));
    const newRows=rows.filter(m=>!oldIds.has(m.id));
    if(changed){
      state.messages=rows; state.messageSignature=signature;
      await loadProfiles(rows.map(m=>m.sender_id));
    }
    const ids=rows.map(m=>m.id);
    if(ids.length && (forceReactions || changed)){
      const rr=await timeout(state.client.rpc('spike_room_get_reactions',{p_message_ids:ids}),10000,'Reaction refresh');
      if(!rr.error)state.reactions=rr.data||[];
    }
    if(changed || forceReactions)renderMessages(initial || newRows.length>0);
    status(navigator.onLine ? 'Chat is up to date' : 'You are offline — showing the latest messages',!navigator.onLine);
  }
  function renderMessages(scroll=false) {
    const host=$('chatMessageList'); if(!host)return;
    const nearBottom=host.scrollHeight-host.scrollTop-host.clientHeight<100;
    if(!state.messages.length){host.innerHTML='<div class="chat-empty-state"><span>✦</span><strong>Start the conversation</strong><p>There are no messages yet. Say hello to everyone in the room.</p></div>';return;}
    host.innerHTML=state.messages.map(m=>{
      const mine=m.sender_id===state.user.id, p=state.profile.get(String(m.sender_id))||{};
      const parent=m.reply_to_message_id?state.messages.find(x=>x.id===m.reply_to_message_id):null;
      const reactions=state.reactions.filter(x=>x.message_id===m.id);
      const reactionButtons=REACTIONS.map(emoji=>{const users=reactions.filter(x=>x.reaction===emoji);return `<button type="button" class="chat-reaction${users.some(x=>x.user_id===state.user.id)?' active':''}" data-reaction="${emoji}" data-message="${esc(m.id)}" aria-label="React ${emoji}, ${users.length} reactions">${emoji}<small>${users.length||''}</small></button>`}).join('');
      return `<article class="chat-message${mine?' mine':''}" data-message-id="${esc(m.id)}"><div class="chat-avatar">${avatar(m.sender_id)}</div><div class="chat-message-body"><div class="chat-message-meta"><strong>${esc(profileName(m.sender_id))}${p.verified?' <span class="chat-verified">✓</span>':''}</strong><time>${esc(time(m.created_at))}</time>${m.edited_at?'<small>edited</small>':''}</div>${parent?`<div class="chat-parent">Replying to ${esc(profileName(parent.sender_id))}: ${esc(parent.body).slice(0,110)}</div>`:''}<p>${esc(m.body).replace(/\n/g,'<br>')}</p><div class="chat-message-tools"><button type="button" data-reply="${esc(m.id)}">Reply</button>${reactionButtons}</div></div></article>`;
    }).join('');
    if(scroll||nearBottom)host.scrollTop=host.scrollHeight;
  }
  async function loadMembers() {
    const r=await timeout(state.client.from('room_members').select('room_id,user_id,member_role,joined_at,left_at').eq('room_id',state.room.id).is('left_at',null).order('joined_at',{ascending:true}).limit(200),12000,'Member list refresh');
    if(r.error)throw r.error;
    state.members=r.data||[];
    await loadProfiles(state.members.map(m=>m.user_id));
    renderMembers();
  }
  function renderMembers() {
    const host=$('roomMembersList'); if(!host)return;
    $('roomMemberCount').textContent=String(state.members.length);
    if(!state.members.length){host.innerHTML='<p class="members-loading">No active members are visible yet.</p>';return;}
    const order={host:0,moderator:1,cohost:2,member:3};
    host.innerHTML=[...state.members].sort((a,b)=>(order[a.member_role]??4)-(order[b.member_role]??4)).map(m=>`<div class="room-member-row"><div class="member-avatar">${avatar(m.user_id)}</div><div class="member-copy"><strong>${esc(profileName(m.user_id))}${m.user_id===state.user.id?' <small>(you)</small>':''}</strong><span>${esc(m.member_role||'listener')}</span></div><span class="member-state-dot" title="Active member"></span></div>`).join('');
  }
  function setReply(message) {
    const row=state.messages.find(m=>m.id===message); if(!row)return;
    state.reply=row;
    $('chatReplyLabel').textContent='Replying to '+profileName(row.sender_id)+': '+String(row.body).slice(0,90);
    $('chatReplyContext').hidden=false;
    $('chatMessageInput').focus();
  }
  function clearReply(){state.reply=null;$('chatReplyContext').hidden=true;}
  async function sendMessage(event) {
    event.preventDefault(); if(state.sending)return;
    const input=$('chatMessageInput'),button=$('chatSendButton'),body=input.value.trim();
    if(!body)return;
    if(state.room.status!=='live'){status('Chat is available when this room is live.',true);return;}
    if(!state.room.allow_chat){status('The host has disabled room chat.',true);return;}
    state.sending=true;button.disabled=true;
    try {
      const args={p_room_id:state.room.id,p_body:body};
      const r=state.reply?await timeout(state.client.rpc('spike_room_send_reply',{...args,p_reply_to_message_id:state.reply.id}),15000,'Send reply'):await timeout(state.client.rpc('spike_room_send_message',args),15000,'Send message');
      if(r.error)throw r.error;
      input.value='';clearReply();await loadMessages(true);status('Message sent.');try{await state.channel?.send({type:'broadcast',event:'room_message',payload:{room_id:state.room.id}});}catch(e){console.info('[SPIKE Room Chat] Message saved; live broadcast unavailable:',e.message);}
    } catch(e){status(e.message||'Message could not be sent. Your draft is still here.',true);}
    finally{state.sending=false;button.disabled=false;input.focus();}
  }
  async function react(message,reaction) {
    if(!REACTIONS.includes(reaction))return;
    try{const r=await timeout(state.client.rpc('spike_room_react_message',{p_message_id:message,p_reaction:reaction}),10000,'Reaction');if(r.error)throw r.error;await loadMessages(false);try{await state.channel?.send({type:'broadcast',event:'room_reaction',payload:{message_id:message}});}catch(_){ }}
    catch(e){status(e.message||'Reaction could not be saved.',true);}
  }
  async function refreshAll(initial=false, forceReactions=false) {
    if(state.stopped||document.hidden||!navigator.onLine||state.refreshing)return;
    state.refreshing=true;
    try{await loadMessages(initial,forceReactions);state.lastError='';}
    catch(e){state.lastError=e.message||'Chat refresh failed';status('Chat refresh delayed: '+state.lastError,true);}
    finally{state.refreshing=false;}
  }
  async function refreshMemberList(){if(state.stopped||document.hidden||!navigator.onLine)return;try{await loadMembers();}catch(e){const host=$('roomMembersList');if(host&&!state.members.length)host.innerHTML='<p class="members-loading">Member list is temporarily unavailable.</p>';console.info('[SPIKE Room Chat] Members:',e.message);}}
  async function refreshRoomMeta(){
    if(state.stopped||document.hidden||!navigator.onLine)return;
    try{
      const r=await timeout(state.client.from('rooms').select('title,status,allow_chat:chat_enabled,active_host_id').eq('id',state.room.id).maybeSingle(),10000,'Room status refresh');
      if(r.error)throw r.error; if(!r.data)return; Object.assign(state.room,r.data);
      const enabled=state.room.status==='live'&&state.room.allow_chat===true;
      $('chatMessageInput').disabled=!enabled; $('chatSendButton').disabled=!enabled;
      $('chatComposerNote').textContent=!state.room.allow_chat?'The host has disabled chat in this room.':state.room.status!=='live'?'Chat opens when this room is live':'Enter sends · Shift + Enter adds a new line';
      const label=$('roomStatusLabel'); if(label)label.textContent=state.room.status==='live'?'LIVE NOW':state.room.status==='scheduled'?'SCHEDULED':'ROOM';
      $('statusDot')?.classList.toggle('live',state.room.status==='live'); $('statusDot')?.classList.toggle('scheduled',state.room.status==='scheduled');
      if(state.room.status==='ended'){ $('chatMessageInput').disabled=true; $('chatSendButton').disabled=true; status('This room has ended. You can still review the conversation.'); }
    }catch(e){console.info('[SPIKE Room Chat] Room status refresh:',e.message);}
  }
  function connectPresence() {
    if(typeof state.client.channel!=='function')return;
    try{
      state.client.realtime?.setAuth?.().catch?.(e=>console.info('[SPIKE Room Chat] Realtime auth refresh:',e.message));
      // Reuse the existing room topic whose Realtime RLS policies require active membership.
      state.channel=state.client.channel('spike-room:'+state.room.id,{config:{private:true,presence:{key:state.user.id},broadcast:{ack:true}}});
      state.channel.on('broadcast',{event:'room_message'},()=>void refreshAll(true));
      state.channel.on('broadcast',{event:'room_message_update'},()=>void refreshAll(false));
      state.channel.on('broadcast',{event:'room_reaction'},()=>void refreshAll(false,true));
      state.channel.on('broadcast',{event:'room_gift'},event=>{const gift=event?.payload||{};if(gift.sender_id===state.user.id)return;const message=`${gift.gift_icon||'🎁'} ${gift.sender_name||'A member'} sent ${gift.gift_name||'a gift'} to ${gift.receiver_name||'a room member'}.`;if(typeof window.spikePremiumToast==='function')window.spikePremiumToast(message,'success');});
      state.channel.on('presence',{event:'sync'},()=>{const count=Object.keys(state.channel.presenceState()||{}).length;const node=$('chatConnectionState');if(node)node.textContent='Live updates connected · '+count+' online';});
      state.channel.subscribe(async result=>{if(result==='SUBSCRIBED'){state.realtimeConnected=true;try{await state.channel.track({user_id:state.user.id,display_name:profileName(state.user.id),joined_at:new Date().toISOString()});status('Live chat connected.');}catch(e){console.info('[SPIKE Room Chat] Presence tracking unavailable:',e.message);}}else if(result==='CHANNEL_ERROR'||result==='TIMED_OUT'||result==='CLOSED'){state.realtimeConnected=false;console.info('[SPIKE Room Chat] Realtime unavailable; automatic refresh remains active.');status('Live updates reconnecting · automatic refresh is active');}});
    }catch(e){console.info('[SPIKE Room Chat] Realtime unavailable:',e.message);}
  }
  function broadcastGift(payload){if(!state.channel||!state.room?.id)return Promise.resolve(false);return state.channel.send({type:'broadcast',event:'room_gift',payload:{...payload,room_id:state.room.id}})}
  function cleanup(){state.stopped=true;clearInterval(state.poll);clearInterval(state.memberPoll);clearInterval(state.metaPoll);if(state.channel&&state.client?.removeChannel)state.client.removeChannel(state.channel).catch(()=>{});}
  function bind(){
    $('chatComposer')?.addEventListener('submit',sendMessage);
    $('chatMessageInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chatComposer').requestSubmit();}});
    $('chatCancelReply')?.addEventListener('click',clearReply);
    $('chatRefreshButton')?.addEventListener('click',()=>void refreshAll(true));
    $('membersRefreshButton')?.addEventListener('click',refreshMemberList);
    $('chatMessageList')?.addEventListener('click',e=>{const reply=e.target.closest('[data-reply]');if(reply){setReply(reply.dataset.reply);return;}const reaction=e.target.closest('[data-reaction]');if(reaction)void react(reaction.dataset.message,reaction.dataset.reaction);});
    window.addEventListener('online',()=>{void refreshAll(true);void refreshMemberList();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){void refreshAll(true);void refreshMemberList();void refreshRoomMeta();}});
    window.addEventListener('pagehide',cleanup,{once:true});
  }
  async function start(context){
    if(window.__SPIKE_ROOM_CHAT_V2__==='ready'||!context?.client||!context?.room?.id||!context?.user?.id)return;
    state.client=context.client;state.room=context.room;state.user=context.user;
    $('roomChatWorkspace').hidden=false;
    $('chatComposerNote').textContent=state.room.allow_chat?(state.room.status==='live'?'Enter sends · Shift + Enter adds a new line':'Chat opens when this room is live'):'The host has disabled chat in this room.';
    $('chatMessageInput').disabled=!state.room.allow_chat||state.room.status!=='live';
    $('chatSendButton').disabled=!state.room.allow_chat||state.room.status!=='live';
    bind();
    const initial=await Promise.allSettled([loadMessages(true,true),loadMembers()]);
    if(initial[1].status==='rejected'){ $('roomMembersList').innerHTML='<p class="members-loading">The member list is temporarily unavailable. Use refresh to try again.</p>'; console.info('[SPIKE Room Chat] Initial member list:',initial[1].reason?.message); }
    if(initial[0].status==='rejected')status('Chat could not load yet: '+(initial[0].reason?.message||'please retry'),true);
    connectPresence();
    window.SPIKERoomChat={broadcastGift};
    // Realtime broadcasts are the primary update path. These slower checks are safety nets.
    state.poll=setInterval(()=>void refreshAll(false,false),30000);
    state.memberPoll=setInterval(refreshMemberList,45000);
    state.metaPoll=setInterval(refreshRoomMeta,30000);
    window.__SPIKE_ROOM_CHAT_V2__='ready';
  }
  window.addEventListener('spike:room-ready',e=>{void start(e.detail);});
  if(window.__SPIKE_ROOM_CONTEXT__)void start(window.__SPIKE_ROOM_CONTEXT__);
  window.addEventListener('spike:room-left',cleanup);
})();
