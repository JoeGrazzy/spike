(() => {
  'use strict';
  const URL = 'https://cjqpyndceqyqsijihxbb.supabase.co';
  const KEY = 'sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw';
  const db = window.__SPIKE_SUPABASE__ || window.supabase?.createClient?.(URL, KEY);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast = message => { const el = $('roomToast'); if (!el) return; el.textContent = message; el.dataset.show = 'true'; clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.dataset.show = 'false'; }, 3200); };
  const params = new URLSearchParams(location.search);
  const roomId = params.get('id');
  let user = null;
  let room = null;
  let channel = null;
  let messageCache = new Map();
  let profiles = new Map();
  let subscription = null;
  let memberSubscription = null;
  let realtimeRecoveryTimer = null;
  let realtimeRecoveryBusy = false;
  let realtimeConnected = false;
  let isStaff = false;
  let messageReactions = new Map();
  let pinnedMessages = new Set();
  let roomSettings = { chat_locked: false, slow_mode_seconds: 0 };
  let replyTarget = null;
  // Keep the same request ID while a draft is unresolved. A retry therefore
  // addresses the same server-side message instead of creating a duplicate.
  let pendingMessageRequestId = null;
  let messageSendInFlight = false;
  let messageAttachments = new Map();
  let voiceRecorder = null;
  let voiceStream = null;
  let voiceChunks = [];
  let memberRows = [];
  let memberOffset = 0;
  let memberHasMore = false;

  async function joinRoom() {
    const { data, error } = await db.rpc('room_public_join', { p_room_id: roomId });
    if (error) throw error;
    if (!data?.active) throw new Error('Room membership could not be confirmed.');
    return data;
  }

  async function boot() {
    if (!db || !roomId) {
      $('roomTitle').textContent = 'Room unavailable'; $('roomDescription').textContent = 'This Room link is missing or invalid.'; $('chatLayout').classList.add('rv-hidden'); return;
    }
    const auth = await db.auth.getUser(); user = auth.data?.user;
    if (!user) { location.href = 'index.html'; return; }
    const roomResult = await db.from('rooms').select('id,name,description,emoji,category,rules,owner_id,active').eq('id', roomId).maybeSingle();
    if (roomResult.error || !roomResult.data || !roomResult.data.active) {
      $('roomTitle').textContent = 'Room unavailable'; $('roomDescription').textContent = 'This community may have been closed or removed.'; $('chatLayout').classList.add('rv-hidden'); return;
    }
    room = roomResult.data;
    $('roomTitle').textContent = `${room.emoji || '🌐'} ${room.name}`;
    $('roomDescription').textContent = room.description || 'A SPIKE community.';
    $('roomRules').textContent = room.rules || 'Be respectful, keep conversations welcoming, and follow SPIKE community guidelines.';

    const membership = await db.from('room_members').select('role,active').eq('room_id', roomId).eq('user_id', user.id).maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data?.active) {
      $('chatLayout').classList.add('rv-hidden');
      $('joinBackdrop').dataset.open = 'true'; $('joinBackdrop').setAttribute('aria-hidden', 'false');
      $('joinRoom').addEventListener('click', async () => {
        const button = $('joinRoom'); button.disabled = true; button.textContent = 'Joining…';
        try { await joinRoom(); location.reload(); }
        catch (error) { button.disabled = false; button.textContent = 'Join Room'; toast(error.message || 'Could not join this Room.'); }
      });
      return;
    }

    $('roomAction').textContent = 'Copy link';
    const channelResult = await db.from('room_channels').select('id,name').eq('room_id', roomId).order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (channelResult.error || !channelResult.data) { toast('The conversation channel is not available yet.'); return; }
    channel = channelResult.data; $('channelTitle').textContent = `# ${channel.name}`;
    isStaff = ['owner','admin','moderator'].includes(membership.data.role) || room.owner_id === user.id;
    // Room group calling is permanently retired; keep Rooms text/media features only.
    $('roomStaffTools').hidden = !isStaff;
    await Promise.all([loadMessages(), loadMembers(), loadAnnouncements(), loadPolls(), loadEvents(), loadRoomSettings()]);
    await initRoomControls();
    subscribe();
    $('messageForm').addEventListener('submit', sendMessage);
    $('messageInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('messageForm').requestSubmit(); } });
    $('leaveRoom').addEventListener('click', () => { $('leaveBackdrop').dataset.open = 'true'; $('leaveBackdrop').setAttribute('aria-hidden', 'false'); });
    $('cancelLeave').addEventListener('click', () => { $('leaveBackdrop').dataset.open = 'false'; $('leaveBackdrop').setAttribute('aria-hidden', 'true'); });
    $('confirmLeave').addEventListener('click', leaveRoom);
    $('roomAction').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); toast('Room link copied.'); } catch (_) { toast(location.href); } });
    $('leaveRoom').hidden = membership.data.role === 'owner' || room.owner_id === user.id;
    window.addEventListener('pagehide', cleanup, { once: true });
    window.addEventListener('online', recoverRealtime);
    window.addEventListener('offline', () => setConnectionState('OFFLINE'));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) recoverRealtime(); });
  }

  async function loadProfiles(ids) {
    const missing = [...new Set(ids)].filter(id => id && !profiles.has(id));
    if (!missing.length) return;
    const { data, error } = await db.rpc('get_public_profiles', { p_user_ids: missing });
    if (error) { missing.forEach(id => profiles.set(id, {})); return; }
    (data || []).forEach(profile => profiles.set(profile.id, profile));
    missing.forEach(id => { if (!profiles.has(id)) profiles.set(id, {}); });
  }

  function renderMessages() {
    const rows = [...messageCache.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    $('messageList').innerHTML = '';
    if (!rows.length) { $('messageList').innerHTML = '<div class="rv-auth-state">This is the beginning of the conversation. Say hello 👋</div>'; return; }
    rows.forEach(message => {
      const profile = profiles.get(message.user_id) || {};
      const name = message.user_id === user.id ? 'You' : (profile.display_name || profile.username || 'SPIKE Member');
      const counts = messageReactions.get(message.id) || {};
      const own = messageReactions.get(`${message.id}:own`) || new Set();
      const article = document.createElement('article');
      article.className = 'rv-message' + (message.user_id === user.id ? ' mine' : '');
      article.dataset.messageId = message.id;
      const reactions = ['❤️','😂','🔥','👍','👏','😮','🚀'].map(emoji => {
        const count = counts[emoji] || 0;
        return `<button type="button" class="rv-reaction${own.has(emoji) ? ' is-active' : ''}" data-react="${emoji}" data-message="${esc(message.id)}" aria-pressed="${own.has(emoji)}">${emoji}${count ? ` <span>${count}</span>` : ''}</button>`;
      }).join('');
      const pin = pinnedMessages.has(message.id) ? 'Pinned' : 'Pin';
      const parent = message.reply_to_id ? messageCache.get(message.reply_to_id) : null;
      const reply = message.reply_to_id ? `<div class="rv-reply-quote">↳ ${esc(parent?.body || 'Earlier message')}</div>` : '';
      const media = (messageAttachments.get(message.id) || []).map(item => {
        const src = esc(item.signed_url || '');
        if (!src) return '';
        if (item.mime_type.startsWith('image/')) return `<img class="rv-message-media" src="${src}" alt="Room attachment" loading="lazy">`;
        if (item.mime_type.startsWith('video/')) return `<video class="rv-message-media" src="${src}" controls playsinline preload="metadata"></video>`;
        if (item.mime_type.startsWith('audio/')) return `<audio class="rv-message-audio" src="${src}" controls preload="metadata"></audio>`;
        return '';
      }).join('');
      article.innerHTML = `<div class="rv-message-author">${esc(name)}</div>${reply}<div class="rv-message-body">${esc(message.body)}</div>${media}<div class="rv-message-time">${new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div><div class="rv-message-actions"><button type="button" class="rv-reply-button" data-reply="${esc(message.id)}">Reply</button>${message.user_id !== user.id ? `<button type="button" class="rv-reply-button" data-report-room-message="${esc(message.id)}">Report</button>` : ''}${reactions}${isStaff ? `<button type="button" class="rv-pin-button" data-pin="${esc(message.id)}">${pin}</button>` : ''}</div>`;
      $('messageList').append(article);
    });
    scrollBottom();
  }

  async function reportRoomMessage(messageId) {
    const message = messageCache.get(messageId);
    if (!message || message.user_id === user.id) return;
    const reason = await window.SPIKEPremiumDialog?.input?.({
      title: 'Report Room message',
      message: 'Tell SPIKE Safety why this Room message should be reviewed.',
      placeholder: 'Describe the issue…',
      confirmText: 'Submit report', cancelText: 'Cancel', kicker: 'SPIKE SAFETY', maxLength: 500
    });
    if (!reason || !String(reason).trim()) return;
    const { error } = await db.from('spike_abuse_cases').insert({
      reporter_id: user.id,
      subject_user_id: message.user_id,
      source: 'room_message',
      source_id: String(message.id),
      category: 'other',
      details: `Room: ${room?.name || roomId}\nReason: ${String(reason).trim().slice(0, 500)}`,
      status: 'open', severity: 1
    });
    if (error) { toast(error.message || 'Report could not be submitted.'); return; }
    toast('Report submitted to SPIKE Safety.');
  }

  async function toggleVoiceRecording() {
    const button = $('recordVoice');
    if (voiceRecorder && voiceRecorder.state === 'recording') { voiceRecorder.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('Voice recording is not supported in this browser.'); return; }
    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ['audio/webm','audio/mp4','audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
      voiceRecorder = preferred ? new MediaRecorder(voiceStream, { mimeType: preferred }) : new MediaRecorder(voiceStream);
      voiceChunks = [];
      voiceRecorder.addEventListener('dataavailable', event => { if (event.data?.size) voiceChunks.push(event.data); });
      voiceRecorder.addEventListener('stop', async () => {
        const actual = voiceRecorder?.mimeType || 'audio/webm';
        const normalized = actual.startsWith('audio/mp4') ? 'audio/mp4' : actual.startsWith('audio/ogg') ? 'audio/ogg' : 'audio/webm';
        const blob = new Blob(voiceChunks, { type: normalized });
        voiceChunks = [];
        voiceStream?.getTracks().forEach(track => track.stop()); voiceStream = null;
        voiceRecorder = null; button.textContent = '🎙'; button.setAttribute('aria-label','Record voice message');
        if (blob.size) {
          const file = new File([blob], `voice-${Date.now()}.${normalized==='audio/mp4'?'m4a':normalized==='audio/ogg'?'ogg':'webm'}`, { type: normalized });
          await uploadRoomMedia(file);
        } else toast('No audio was recorded.');
      }, { once: true });
      voiceRecorder.start(); button.textContent = '■'; button.setAttribute('aria-label','Stop voice recording');
      toast('Recording… tap stop when finished.');
    } catch (error) {
      voiceStream?.getTracks().forEach(track => track.stop()); voiceStream = null; voiceRecorder = null;
      toast(error.message || 'Microphone access was not available.');
    }
  }

  async function loadMessageAttachments() {
    const ids = [...messageCache.keys()]; messageAttachments = new Map();
    if (!ids.length) return;
    const { data, error } = await db.from('room_message_attachments').select('message_id,storage_path,mime_type,size_bytes').in('message_id', ids);
    if (error || !data?.length) return;
    const paths = [...new Set(data.map(item => item.storage_path))];
    const signed = await db.storage.from('spike-room-media').createSignedUrls(paths, 3600);
    if (signed.error) { console.warn('[SPIKE Rooms] Media URLs unavailable', signed.error); return; }
    const urls = new Map((signed.data || []).map(item => [item.path, item.signedUrl]));
    data.forEach(item => {
      const list = messageAttachments.get(item.message_id) || [];
      list.push({ ...item, signed_url: urls.get(item.storage_path) || '' });
      messageAttachments.set(item.message_id, list);
    });
  }

  async function uploadRoomMedia(file) {
    const allowed = ['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/ogg','audio/mpeg','audio/mp4'];
    if (!allowed.includes(file.type)) { toast('Choose a supported image, video or audio file.'); return; }
    if (!file.size || file.size > 26214400) { toast('Media must be 25 MB or smaller.'); return; }
    const button = $('attachMedia'); button.disabled = true; button.textContent = '…';
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'attachment';
    const path = `${roomId}/${user.id}/${crypto.randomUUID()}-${safeName}`;
    try {
      const upload = await db.storage.from('spike-room-media').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
      if (upload.error) throw upload.error;
      const { error } = await db.rpc('room_public_send_media_message', {
        p_room_id: roomId, p_channel_id: channel.id, p_caption: $('messageInput').value.trim(),
        p_reply_to_id: replyTarget?.id || null, p_storage_path: path, p_mime_type: file.type, p_size_bytes: file.size
      });
      if (error) {
        const verify = await db.from('room_message_attachments').select('id').eq('storage_path', path).maybeSingle();
        if (!verify.data) await db.storage.from('spike-room-media').remove([path]);
        throw error;
      }
      $('messageInput').value = ''; replyTarget = null; $('replyPreview').hidden = true; $('replyPreviewText').textContent = '';
      await loadMessages(); toast('Media shared with the Room.');
    } catch (error) { toast(error.message || 'Media could not be shared.'); }
    finally { button.disabled = false; button.textContent = '＋'; $('roomMediaInput').value = ''; }
  }

  async function loadMessageExtras() {
    const ids = [...messageCache.keys()];
    messageReactions = new Map(); pinnedMessages = new Set();
    if (!ids.length) return;
    const [reactionResult, pinResult] = await Promise.all([
      db.from('room_message_reactions').select('message_id,user_id,reaction').in('message_id', ids),
      db.from('room_message_pins').select('message_id').eq('room_id', roomId).in('message_id', ids)
    ]);
    const ownByMessage = new Map();
    (reactionResult.data || []).forEach(row => {
      const counts = messageReactions.get(row.message_id) || {};
      counts[row.reaction] = (counts[row.reaction] || 0) + 1;
      messageReactions.set(row.message_id, counts);
      if (row.user_id === user.id) {
        const own = ownByMessage.get(row.message_id) || new Set(); own.add(row.reaction); ownByMessage.set(row.message_id, own);
      }
    });
    ownByMessage.forEach((set, id) => messageReactions.set(`${id}:own`, set));
    (pinResult.data || []).forEach(row => pinnedMessages.add(row.message_id));
  }


  async function loadMessages() {
    const { data, error } = await db.from('room_messages')
      .select('id,room_id,channel_id,user_id,body,created_at,reply_to_id')
      .eq('room_id', roomId).eq('channel_id', channel.id)
      .order('created_at', { ascending: false }).limit(120);
    if (error) { $('messageList').innerHTML = `<div class="rv-auth-state">${esc(error.message || 'Could not load messages.')}</div>`; return; }
    await loadProfiles((data || []).map(message => message.user_id));
    messageCache.clear();
    (data || []).forEach(message => messageCache.set(message.id, message));
    await Promise.all([loadMessageExtras(), loadMessageAttachments()]);
    renderMessages();
  }

  async function loadMembers(append = false) {
    if (!append) { memberOffset = 0; memberRows = []; $('memberList').innerHTML = '<p>Loading community…</p>'; }
    const { data, error } = await db.rpc('room_public_members_page', { p_room_id: roomId, p_limit: 100, p_offset: memberOffset });
    if (error) { $('memberList').innerHTML = `<p>${esc(error.message || 'Member list is unavailable.')}</p>`; return; }
    const page = data || [];
    await loadProfiles(page.map(member => member.user_id));
    memberRows = append ? memberRows.concat(page) : page;
    memberOffset += page.length;
    memberHasMore = page.length === 100;
    $('roomMemberCount').textContent = `${memberRows.length}${memberHasMore ? '+' : ''} visible members`;
    $('memberList').innerHTML = memberRows.map(member => {
      const profile = profiles.get(member.user_id) || {};
      const name = profile.display_name || profile.username || 'SPIKE Member';
      const avatar = profile.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="" loading="lazy">` : esc(name.slice(0, 1).toUpperCase());
      const role = member.role === 'owner' ? ' · owner' : member.role === 'admin' ? ' · admin' : member.role === 'moderator' ? ' · moderator' : '';
      return `<div class="rv-member"><span class="rv-avatar">${avatar}</span><span>${esc(name)}${role}</span></div>`;
    }).join('') || '<p>No members yet.</p>';
    $('loadMoreMembers').hidden = !memberHasMore;
  }


  async function loadStaffMembers() {
    if (!isStaff) return;
    const { data, error } = await db.rpc('room_members_list', {
      p_room_id: roomId, p_search: $('memberSearch')?.value.trim() || '', p_filter: 'all', p_limit: 100, p_offset: 0
    });
    if (error) { $('staffMemberList').innerHTML = `<p>${esc(error.message || 'Member controls unavailable.')}</p>`; return; }
    const members = data || [];
    $('staffMemberList').innerHTML = members.map(member => {
      const role = member.role || 'member';
      const controls = member.role === 'owner' ? '' : `<div class="rv-staff-member-actions">${member.is_muted ? `<button type="button" data-member-action="unmute" data-user="${esc(member.user_id)}">Unmute</button>` : `<button type="button" data-member-action="mute" data-user="${esc(member.user_id)}">Mute 10m</button>`}<button type="button" data-member-action="remove" data-user="${esc(member.user_id)}">Remove</button><button type="button" data-member-action="ban" data-user="${esc(member.user_id)}">Ban</button></div>`;
      return `<article class="rv-staff-member"><div><strong>${esc(member.display_name || member.username || 'SPIKE Member')}</strong><small>@${esc(member.username || 'member')} · ${esc(role)} · ${member.message_count_30d || 0} messages</small></div>${controls}</article>`;
    }).join('') || '<p>No matching active members.</p>';
  }

  async function handleStaffMemberAction(event) {
    const button = event.target.closest('[data-member-action]'); if (!button) return;
    const action = button.dataset.memberAction; const target = button.dataset.user;
    const rpcByAction = {
      mute: ['room_moderation_mute', { p_room_id: roomId, p_user_id: target, p_duration_seconds: 600, p_reason: 'Room staff action' }],
      unmute: ['room_moderation_unmute', { p_room_id: roomId, p_user_id: target, p_reason: 'Room staff action' }],
      remove: ['room_moderation_remove', { p_room_id: roomId, p_user_id: target, p_reason: 'Room staff action' }],
      ban: ['room_moderation_ban', { p_room_id: roomId, p_user_id: target, p_reason: 'Room staff action' }]
    };
    const selected = rpcByAction[action]; if (!selected) return;
    button.disabled = true;
    const { error } = await db.rpc(selected[0], selected[1]);
    button.disabled = false;
    if (error) { toast(error.message || 'Member action was not completed.'); return; }
    toast(`Member ${action} action completed.`); await loadStaffMembers(); await loadMembers();
  }

  async function loadEvents() {
    const { data, error } = await db.from('room_events').select('id,title,description,starts_at,ends_at,ticket_price_minor').eq('room_id', roomId).eq('ticket_price_minor', 0).order('starts_at', { ascending: true }).limit(12);
    if (error || !data?.length) { $('roomEvents').hidden = true; return; }
    $('eventList').innerHTML = data.map(item => `<article class="rv-event"><div><strong>${esc(item.title)}</strong><p>${esc(item.description || 'Community gathering')}</p><small>${new Date(item.starts_at).toLocaleString()}${item.ends_at ? ` – ${new Date(item.ends_at).toLocaleString()}` : ''}</small></div><span class="rv-event-free">Free</span></article>`).join('');
    $('roomEvents').hidden = false;
  }

  async function loadRoomSettings() {
    const { data } = await db.from('room_settings').select('chat_locked,slow_mode_seconds').eq('room_id', roomId).maybeSingle();
    roomSettings = data || { chat_locked: false, slow_mode_seconds: 0 };
    if ($('slowModeSelect')) $('slowModeSelect').value = String(roomSettings.slow_mode_seconds || 0);
    if ($('toggleChatLock')) $('toggleChatLock').textContent = roomSettings.chat_locked ? 'Unlock chat' : 'Lock chat';
    if ($('messageInput')) $('messageInput').disabled = !!roomSettings.chat_locked && !isStaff;
    if ($('sendMessage')) $('sendMessage').disabled = !!roomSettings.chat_locked && !isStaff;
    if ($('attachMedia')) $('attachMedia').disabled = !!roomSettings.chat_locked && !isStaff;
    if ($('recordVoice')) $('recordVoice').disabled = !!roomSettings.chat_locked && !isStaff;
    if (roomSettings.chat_locked && !isStaff) $('messageInput').placeholder = 'Chat is currently locked by Room staff';
  }

  async function initRoomControls() {
    $('loadMoreMembers').addEventListener('click', async () => { $('loadMoreMembers').disabled = true; await loadMembers(true); $('loadMoreMembers').disabled = false; });
    $('messageList').addEventListener('click', async event => {
      const reaction = event.target.closest('[data-react]');
      const pin = event.target.closest('[data-pin]');
      const reply = event.target.closest('[data-reply]');
      const report = event.target.closest('[data-report-room-message]');
      if (report) { report.disabled = true; await reportRoomMessage(report.dataset.reportRoomMessage); report.disabled = false; }
      else if (reply) {
        replyTarget = messageCache.get(reply.dataset.reply) || null;
        $('replyPreviewText').textContent = replyTarget ? `Replying to: ${replyTarget.body.slice(0,120)}` : 'Replying to an earlier message';
        $('replyPreview').hidden = false; $('messageInput').focus();
      } else if (reaction) {
        reaction.disabled = true;
        const { error } = await db.rpc('room_toggle_reaction', { p_message_id: reaction.dataset.message, p_reaction: reaction.dataset.react });
        reaction.disabled = false;
        if (error) { toast(error.message || 'Reaction could not be saved.'); return; }
        await loadMessageExtras(); renderMessages();
      } else if (pin) {
        pin.disabled = true;
        const { error } = await db.rpc('room_toggle_pin', { p_room_id: roomId, p_message_id: pin.dataset.pin });
        pin.disabled = false;
        if (error) { toast(error.message || 'Pin action could not be completed.'); return; }
        await loadMessageExtras(); renderMessages();
      }
    });
    $('cancelReply').addEventListener('click', () => { replyTarget = null; $('replyPreview').hidden = true; $('replyPreviewText').textContent = ''; });
    $('attachMedia').addEventListener('click', () => $('roomMediaInput').click());
    $('recordVoice').addEventListener('click', toggleVoiceRecording);
    $('roomMediaInput').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) uploadRoomMedia(file); });
    $('pollList').addEventListener('click', async event => {
      const option = event.target.closest('[data-vote-option]'); if (!option) return;
      option.disabled = true;
      const { error } = await db.rpc('room_poll_vote', { p_poll_id: option.dataset.votePoll, p_option_id: option.dataset.voteOption });
      if (error) toast(error.message || 'Your vote could not be saved.');
      await loadPolls();
    });
    if (!isStaff) return;
    $('eventForm').addEventListener('submit', async event => {
      event.preventDefault();
      const title = $('eventTitle').value.trim(); const starts = $('eventStartsAt').value;
      const ends = $('eventEndsAt').value;
      if (!starts || new Date(starts) <= new Date() || (ends && new Date(ends) <= new Date(starts))) { toast('Choose a future start time and a valid end time.'); return; }
      const button = event.submitter; button.disabled = true;
      const { error } = await db.rpc('room_event_create', { p_room_id: roomId, p_title: title, p_description: $('eventDescription').value.trim(), p_starts_at: new Date(starts).toISOString(), p_ends_at: ends ? new Date(ends).toISOString() : null });
      button.disabled = false;
      if (error) { toast(error.message || 'Event could not be published.'); return; }
      $('eventTitle').value = ''; $('eventDescription').value = ''; $('eventStartsAt').value = ''; $('eventEndsAt').value = '';
      await loadEvents(); toast('Free event published.');
    });
    $('announcementForm').addEventListener('submit', async event => {
      event.preventDefault(); const body = $('announcementBody').value.trim(); if (!body) return;
      const button = event.submitter; button.disabled = true;
      const { error } = await db.rpc('room_announcement_create', { p_room_id: roomId, p_body: body });
      button.disabled = false;
      if (error) { toast(error.message || 'Announcement could not be published.'); return; }
      $('announcementBody').value = ''; await loadAnnouncements(); toast('Announcement published.');
    });
    $('pollForm').addEventListener('submit', async event => {
      event.preventDefault(); const question = $('pollQuestion').value.trim();
      const options = $('pollOptions').value.split(',').map(x => x.trim()).filter(Boolean).slice(0,8);
      if (options.length < 2) { toast('Add at least two poll options, separated by commas.'); return; }
      const button = event.submitter; button.disabled = true;
      const { error } = await db.rpc('room_poll_create', { p_room_id: roomId, p_question: question, p_options: options, p_ends_at: null });
      button.disabled = false;
      if (error) { toast(error.message || 'Poll could not be created.'); return; }
      $('pollQuestion').value = ''; $('pollOptions').value = ''; await loadPolls(); toast('Poll published.');
    });
    $('saveSlowMode').addEventListener('click', async () => {
      const seconds = Number($('slowModeSelect').value);
      const { error } = await db.rpc('room_moderation_set_slow_mode', { p_room_id: roomId, p_seconds: seconds });
      if (error) { toast(error.message || 'Slow mode could not be updated.'); return; }
      await loadRoomSettings(); toast('Slow mode updated.');
    });
    $('toggleChatLock').addEventListener('click', async () => {
      const { error } = await db.rpc('room_moderation_lock_chat', { p_room_id: roomId, p_locked: !roomSettings.chat_locked });
      if (error) { toast(error.message || 'Chat lock could not be updated.'); return; }
      await loadRoomSettings(); toast(roomSettings.chat_locked ? 'Chat locked.' : 'Chat unlocked.');
    });
    let memberSearchTimer;
    $('memberSearch').addEventListener('input', () => { clearTimeout(memberSearchTimer); memberSearchTimer = setTimeout(loadStaffMembers, 220); });
    $('staffMemberList').addEventListener('click', handleStaffMemberAction);
    await loadStaffMembers();
  }

  function scrollBottom() { const el = $('messageList'); el.scrollTop = el.scrollHeight; }

  async function sendMessage(event) {
    event.preventDefault();
    const input = $('messageInput'); const body = input.value.trim(); if (!body || messageSendInFlight) return;
    const button = $('sendMessage');
    // A UUID is created once per draft and deliberately retained on timeout,
    // offline errors, and server errors. The database migration makes this key
    // unique per sender, so a retry after an ambiguous response is safe.
    pendingMessageRequestId ||= crypto.randomUUID();
    messageSendInFlight = true; button.disabled = true; button.textContent = 'Sending…';
    try {
      const { data, error } = await db.rpc('room_public_send_message_idempotent', {
        p_room_id: roomId,
        p_channel_id: channel.id,
        p_body: body,
        p_reply_to_id: replyTarget?.id || null,
        p_client_message_id: pendingMessageRequestId
      });
      if (error) throw error;
      if (!data?.id) throw new Error('The server did not confirm this message. Your draft is safe; tap Send to retry.');
      pendingMessageRequestId = null;
      input.value = ''; input.style.height = 'auto'; replyTarget = null; $('replyPreview').hidden = true; $('replyPreviewText').textContent = '';
      toast('Message sent.');
    } catch (error) {
      toast(error?.message || 'Message could not be confirmed. Your draft has been kept; tap Send to retry.');
    } finally {
      messageSendInFlight = false; button.disabled = false; button.textContent = 'Send';
    }
  }

  function setConnectionState(state) {
    const indicator = $('connectionState');
    if (indicator) indicator.textContent = state;
  }

  async function refreshAfterReconnect() {
    if (realtimeRecoveryBusy || !user || !channel) return;
    realtimeRecoveryBusy = true;
    try {
      await Promise.all([loadMessages(), loadMembers(), loadAnnouncements(), loadPolls(), loadEvents(), loadRoomSettings()]);
      if (isStaff) await loadStaffMembers();
    } catch (error) {
      console.warn('[SPIKE Rooms] Reconnect refresh failed', error);
      setConnectionState('RETRY NEEDED');
    } finally { realtimeRecoveryBusy = false; }
  }

  function recoverRealtime() {
    if (!user || document.hidden || !navigator.onLine || realtimeConnected) return;
    setConnectionState('RECONNECTING');
    clearTimeout(realtimeRecoveryTimer);
    realtimeRecoveryTimer = setTimeout(async () => {
      if (subscription) { await db.removeChannel(subscription); subscription = null; }
      if (memberSubscription) { await db.removeChannel(memberSubscription); memberSubscription = null; }
      subscribe();
    }, 350);
  }

  function subscribe() {
    setConnectionState('CONNECTING');
    subscription = db.channel(`room-live-${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` }, async payload => {
        const message = payload.new;
        if (message.channel_id !== channel.id || messageCache.has(message.id)) return;
        await loadProfiles([message.user_id]); messageCache.set(message.id, message);
        if (messageCache.size > 120) { const oldest = [...messageCache.values()].sort((a,b) => new Date(a.created_at)-new Date(b.created_at))[0]; if (oldest) messageCache.delete(oldest.id); }
        await Promise.all([loadMessageExtras(), loadMessageAttachments()]); renderMessages();
      })
      .subscribe(status => {
        realtimeConnected = status === 'SUBSCRIBED';
        setConnectionState(realtimeConnected ? 'LIVE' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'RECONNECTING' : 'CONNECTING');
        if (realtimeConnected) refreshAfterReconnect();
      });
    memberSubscription = db.channel(`room-members-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, async () => { const current = await db.from('room_members').select('active').eq('room_id', roomId).eq('user_id', user.id).maybeSingle(); if (!current.data?.active) { location.href = 'rooms.html'; return; } await loadMembers(); if (isStaff) await loadStaffMembers(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_announcements', filter: `room_id=eq.${roomId}` }, loadAnnouncements)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_polls', filter: `room_id=eq.${roomId}` }, loadPolls)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_events', filter: `room_id=eq.${roomId}` }, loadEvents)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_message_reactions' }, async () => { await loadMessageExtras(); renderMessages(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_message_pins', filter: `room_id=eq.${roomId}` }, async () => { await loadMessageExtras(); renderMessages(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_poll_votes' }, loadPolls)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_settings', filter: `room_id=eq.${roomId}` }, loadRoomSettings)
      .subscribe();
  }

  async function leaveRoom() {
    const button = $('confirmLeave'); button.disabled = true; button.textContent = 'Leaving…';
    const { error } = await db.rpc('room_public_leave', { p_room_id: roomId });
    button.disabled = false; button.textContent = 'Leave Room';
    if (error) { toast(error.message || 'Could not leave this Room.'); return; }
    location.href = 'rooms.html';
  }

  function cleanup() {
    clearTimeout(realtimeRecoveryTimer);
    window.removeEventListener('online', recoverRealtime);
    if (subscription) db.removeChannel(subscription);
    if (memberSubscription) db.removeChannel(memberSubscription);
    voiceStream?.getTracks().forEach(track => track.stop());
  }

  $('messageInput')?.addEventListener('input', event => { event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`; });
  boot().catch(error => { console.error('[SPIKE Rooms]', error); toast(error.message || 'Something went wrong.'); });
})();
