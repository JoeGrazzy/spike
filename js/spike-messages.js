/* SPIKE messages: inbox, contact picker, conversation thread, realtime and call context. */
(() => {
  'use strict';
  const db = () => window.SPIKE_SUPABASE || window.db;
  const $ = id => document.getElementById(id);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const HEART = '❤️';
  const MESSAGE_FIELDS = 'id,conversation_id,sender_id,body,reply_to_id,attachment_path,attachment_type,is_edited,deleted_at,created_at';
  const COMPOSER_IDS = ['body', 'send', 'mediaPlus', 'voiceNote'];

  let user = null;
  let conversationId = null;
  let currentConversationIsGroup = false;
  let currentPeerId = null;
  let currentPeer = null;
  let peerLastReadAt = null;
  let oldest = null; // Stable pagination cursor: { created_at, id }.
  let presenceRefreshTimer = null;
  let presenceVisibilityHandler = null;
  let busy = false;
  let replyToId = null;
  let selectedMessage = null;
  let threadChannel = null; // Private Broadcast channel for typing only.
  let threadDbChannel = null; // Postgres Changes channel; table RLS protects rows.
  let inboxChannel = null;
  let typingChannelReady = false;
  let typingStopTimer = null;
  let peerTypingTimer = null;
  let lastTypingSentAt = 0;
  let peerTypingUntil = 0;
  let newIncomingCount = 0;
  let pendingIncomingConversationId = null;
  let contactMode = 'all';
  let contactRows = [];
  let messagingStartPromise = null;
  const selectedContacts = new Set();
  const rowsById = new Map();

  const initials = value => String(value || 'S').trim().slice(0, 1).toUpperCase() || 'S';
  const personName = person => person?.display_name || person?.username || 'SPIKE member';
  const dateKey = value => (value ? new Date(value).toLocaleDateString() : '');
  const clock = value => (value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
  const dayLabel = value => {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === now.toDateString()) return clock(value);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
  const presenceLabel = presence => {
    if (!presence) return 'Presence unavailable';
    if (presence.online) return 'Online now';
    return presence.lastSeenAt ? `Last seen ${dayLabel(presence.lastSeenAt)}` : 'Offline';
  };
  const previewText = last => {
    if (!last) return 'Start the conversation';
    if (last.deleted_at) return 'Message deleted';
    if (last.attachment_type) return `📎 ${last.attachment_type}`;
    return last.body || 'Message';
  };
  const avatarUrl = path => {
    const raw = String(path || '').trim();
    if (!raw) return '';
    if (/^https:\/\//i.test(raw)) return raw;
    try { return db().storage.from('avatars').getPublicUrl(raw).data.publicUrl || ''; } catch { return ''; }
  };

  let noticeTimer = 0;
  const say = (message, type = false) => {
    // type: true | 'error' → error, 'success', 'warning', 'cautious', 'info', or false/empty → neutral
    const node = $('notice');
    if (!node) return;
    if (noticeTimer) { clearTimeout(noticeTimer); noticeTimer = 0; }
    node.textContent = message || '';
    node.classList.remove('error', 'success', 'warning', 'cautious', 'info');
    if (!message) {
      node.hidden = true;
      return;
    }
    const kind = type === true || type === 'error' ? 'error'
      : (type === 'success' || type === 'warning' || type === 'cautious' || type === 'info') ? type
      : '';
    if (kind) node.classList.add(kind);
    node.hidden = false;
    // Success and info auto-dismiss after a short beautiful pause
    if (kind === 'success' || kind === 'info') {
      noticeTimer = window.setTimeout(() => {
        node.hidden = true;
        node.textContent = '';
        node.classList.remove('success', 'info');
        noticeTimer = 0;
      }, 3200);
    }
  };
  const emptyNode = (message, isError = false) => {
    const node = document.createElement('div');
    node.className = isError ? 'msg-empty error' : 'msg-empty';
    node.textContent = message;
    return node;
  };
  const setCallButtonsReady = ready => {
    ['voiceCallBtn', 'videoCallBtn'].forEach(id => {
      const button = $(id);
      if (!button) return;
      button.disabled = !ready;
      button.setAttribute('aria-disabled', String(!ready));
    });
  };
  const setComposerEnabled = enabled => { COMPOSER_IDS.forEach(id => { const node = $(id); if (node) node.disabled = !enabled; }); };

  function fillAvatar(node, person, label) {
    node.replaceChildren();
    const url = avatarUrl(person?.avatar_path);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      node.append(img);
    } else {
      node.textContent = initials(label);
    }
  }
  function avatarNode(person, label) {
    const node = document.createElement('div');
    node.className = 'msg-avatar';
    fillAvatar(node, person, label);
    return node;
  }

  async function loadPresence() {
    let rows;
    if (window.SPIKE_PRESENCE) {
      rows = window.SPIKE_PRESENCE.getSnapshot();
      if (!window.SPIKE_PRESENCE.isLoaded?.()) rows = await window.SPIKE_PRESENCE.refresh();
    } else {
      const { data, error } = await db().rpc('spike_get_messaging_presence');
      if (error) throw error;
      rows = data;
    }
    return new Map((rows || []).map(row => [String(row.user_id), { online: row.is_online === true, lastSeenAt: row.last_seen_at || null }]));
  }

  async function loadProfiles(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return {};
    const { data, error } = await db().from('profiles').select('id,username,display_name,avatar_path,spike_id').in('id', unique);
    if (error) throw error;
    return Object.fromEntries((data || []).map(profile => [profile.id, profile]));
  }

  async function fetchInBatches(values, query) {
    const rows = [];
    for (let i = 0; i < values.length; i += 100) {
      const { data, error } = await query(values.slice(i, i + 100));
      if (error) throw error;
      rows.push(...(data || []));
    }
    return rows;
  }

  async function canMessage(recipientId) {
    const { data, error } = await db().rpc('can_message_spike_user', { p_sender: user.id, p_recipient: recipientId });
    if (error) throw error;
    return data === true;
  }

  async function createConversation(participantIds, title) {
    const { data, error } = await db().rpc('create_conversation', { participant_ids: participantIds, conversation_title: title });
    if (error) throw error;
    if (!uuidRe.test(String(data || ''))) throw new Error('The conversation service did not return a valid chat ID. Please retry.');
    return data;
  }

  function watchPresence(refresh) {
    if (window.SPIKE_PRESENCE) {
      window.addEventListener('spike:presence-update', refresh);
    } else if (!presenceRefreshTimer) {
      presenceRefreshTimer = window.setInterval(refresh, 60000);
    }
    window.addEventListener('online', refresh);
    if (!presenceVisibilityHandler) {
      presenceVisibilityHandler = () => { if (!document.hidden) refresh(); };
      document.addEventListener('visibilitychange', presenceVisibilityHandler);
    }
  }

  /* Inbox */

  async function loadLatestMessages(conversationIds) {
    const latest = new Map();
    for (let i = 0; i < conversationIds.length; i += 100) {
      const batch = conversationIds.slice(i, i + 100);
      for (let page = 0; page < 20; page++) {
        const { data, error } = await db().from('messages')
          .select('conversation_id,body,attachment_type,sender_id,created_at,deleted_at')
          .in('conversation_id', batch)
          .order('created_at', { ascending: false })
          .range(page * 100, page * 100 + 99);
        if (error) throw error;
        (data || []).forEach(message => { if (!latest.has(message.conversation_id)) latest.set(message.conversation_id, message); });
        if ((data || []).length < 100 || batch.every(id => latest.has(id))) break;
      }
    }
    return latest;
  }

  function isUnread(row) {
    return !!row.last && row.last.sender_id !== user.id && (!row.membership?.last_read_at || new Date(row.last.created_at) > new Date(row.membership.last_read_at));
  }

  async function loadInbox() {
    const { data: memberships, error } = await db().from('conversation_members').select('conversation_id,last_read_at').eq('user_id', user.id);
    if (error) throw error;
    const ids = (memberships || []).map(row => row.conversation_id);
    const { data: conversations, error: conversationError } = ids.length
      ? await db().from('conversations').select('id,kind,title,updated_at').in('id', ids).order('updated_at', { ascending: false })
      : { data: [], error: null };
    if (conversationError) throw conversationError;
    const conversationIds = conversations.map(conv => conv.id);
    const [memberRows, latest, presence] = await Promise.all([
      fetchInBatches(conversationIds, batch => db().from('conversation_members').select('conversation_id,user_id').in('conversation_id', batch).neq('user_id', user.id)),
      loadLatestMessages(conversationIds),
      loadPresence().catch(() => new Map())
    ]);
    const peersByConversation = new Map();
    memberRows.forEach(row => peersByConversation.set(row.conversation_id, [...(peersByConversation.get(row.conversation_id) || []), row.user_id]));
    const membershipById = new Map((memberships || []).map(row => [row.conversation_id, row]));
    const people = await loadProfiles(memberRows.map(row => row.user_id));
    const rows = conversations.map(conv => ({
      conv,
      peerIds: peersByConversation.get(conv.id) || [],
      last: latest.get(conv.id) || null,
      membership: membershipById.get(conv.id) || null
    }));
    renderInbox(rows, people, presence);
  }

  function renderInbox(rows, people, presence) {
    const list = $('list');
    const needle = String($('search').value || '').trim().toLowerCase();
    const filter = document.querySelector('[data-filter].active')?.dataset.filter || 'all';
    const online = row => row.peerIds.some(id => presence.get(String(id))?.online === true);
    const byActivity = row => new Date(row.last?.created_at || row.conv.updated_at).getTime() || 0;
    const visible = rows
      .filter(row => {
        const names = row.peerIds.map(id => personName(people[id])).join(' ');
        const text = `${names} ${row.conv.title || ''} ${row.last?.body || ''}`.toLowerCase();
        if (needle && !text.includes(needle)) return false;
        if (filter === 'unread' && !isUnread(row)) return false;
        if (filter === 'online' && !online(row)) return false;
        return true;
      })
      .sort((a, b) => Number(online(b)) - Number(online(a)) || byActivity(b) - byActivity(a));
    list.replaceChildren();
    if (!visible.length) list.append(emptyNode(rows.length ? 'No conversations match this view.' : 'No conversations yet. Tap + to start one.'));
    visible.forEach(row => list.append(inboxItem(row, people, presence)));
    const unreadTotal = rows.filter(isUnread).length;
    ['unreadTotalBadge', 'unreadFilterBadge'].forEach(id => {
      const badge = $(id);
      badge.textContent = String(unreadTotal);
      badge.hidden = !unreadTotal;
    });
  }

  function inboxItem(row, people, presence) {
    const isGroup = row.conv.kind === 'group';
    const peerId = row.peerIds[0];
    const peer = people[peerId];
    const title = isGroup ? (row.conv.title || 'SPIKE Group') : personName(peer);
    const item = document.createElement('a');
    item.className = isUnread(row) && !row.last?.deleted_at ? 'msg-item unread' : 'msg-item';
    item.href = `message.html?conversation_id=${encodeURIComponent(row.conv.id)}`;
    if (!isGroup && peerId) item.dataset.peerId = String(peerId);

    const details = document.createElement('div');
    details.className = 'msg-item-body';
    const titleLine = document.createElement('div');
    titleLine.className = 'msg-item-title';
    const name = document.createElement('strong');
    name.textContent = title;
    const status = document.createElement('span');
    status.className = 'msg-presence';
    if (isGroup) {
      status.textContent = `${row.peerIds.length + 1} members`;
    } else {
      const state = presence.get(String(peerId));
      status.textContent = presenceLabel(state);
      status.classList.toggle('online', state?.online === true);
    }
    titleLine.append(name, status);
    const handle = document.createElement('small');
    handle.textContent = isGroup
      ? row.peerIds.map(id => personName(people[id])).slice(0, 3).join(', ')
      : (peer?.username ? `@${peer.username}` : 'SPIKE member');
    const preview = document.createElement('p');
    preview.className = 'msg-preview';
    preview.textContent = previewText(row.last);
    details.append(titleLine, handle, preview);

    const meta = document.createElement('div');
    meta.className = 'msg-item-meta';
    meta.textContent = dayLabel(row.last?.created_at || row.conv.updated_at);
    if (item.classList.contains('unread')) {
      const badge = document.createElement('span');
      badge.className = 'msg-new';
      badge.textContent = 'New';
      meta.append(badge);
    }
    item.append(avatarNode(isGroup ? null : peer, title), details, meta);
    return item;
  }

  async function refreshInboxPresence() {
    if (!user || document.hidden || !navigator.onLine) return;
    const presence = await loadPresence().catch(() => null);
    if (!presence) return;
    document.querySelectorAll('#list .msg-item[data-peer-id]').forEach(item => {
      const state = presence.get(item.dataset.peerId);
      const node = item.querySelector('.msg-presence');
      if (!node) return;
      node.classList.toggle('online', state?.online === true);
      node.textContent = presenceLabel(state);
    });
    if (!$('contactPicker').hidden && contactRows.length) {
      contactRows = contactRows.map(row => ({ ...row, presence: presence.get(row.id) || null }));
      renderContacts();
    }
  }

  async function showIncomingMessage(row) {
    if (!row || row.sender_id === user.id) return;
    const people = await loadProfiles([row.sender_id]).catch(() => ({}));
    $('incomingToastTitle').textContent = personName(people[row.sender_id]);
    $('incomingToastPreview').textContent = row.attachment_type ? `Shared ${row.attachment_type}` : (row.body || 'Sent you a message');
    $('incomingToast').hidden = false;
    pendingIncomingConversationId = row.conversation_id;
    newIncomingCount += 1;
    const badge = $('newMessagesBadge');
    badge.textContent = `${newIncomingCount} new`;
    badge.hidden = false;
    await loadInbox();
  }

  function subscribeInbox() {
    inboxChannel = db().channel(`spike-inbox-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        showIncomingMessage(payload.new).catch(error => say(error.message || 'Could not refresh the inbox.', true));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
        loadInbox().catch(error => say(error.message || 'The inbox could not be refreshed.', true));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => {
        loadInbox().catch(error => say(error.message || 'The inbox could not be refreshed.', true));
      })
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[SPIKE messages] inbox realtime unavailable', status, error || '');
        }
      });
  }

  /* Contact picker */

  async function fetchFollowIds(direction) {
    const isFollowers = direction === 'followers';
    const { data, error } = await db().from('follows')
      .select('follower_id,following_id,created_at')
      .eq(isFollowers ? 'following_id' : 'follower_id', user.id)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data || []).map(row => String(isFollowers ? row.follower_id : row.following_id)).filter(id => id && id !== user.id);
  }

  async function loadContacts(mode = contactMode) {
    contactMode = mode;
    $('contactList').replaceChildren(emptyNode('Loading people…'));
    const followingIds = mode === 'followers' ? [] : await fetchFollowIds('following');
    const followerIds = mode === 'following' ? [] : await fetchFollowIds('followers');
    const following = new Set(followingIds);
    const followers = new Set(followerIds);
    const ids = [...new Set([...followingIds, ...followerIds])];
    const [people, presence] = await Promise.all([loadProfiles(ids), loadPresence().catch(() => new Map())]);
    contactRows = ids.map(id => ({
      id,
      profile: people[id] || {},
      presence: presence.get(id) || null,
      relationship: following.has(id) && followers.has(id) ? 'Following · Follows you' : following.has(id) ? 'Following' : 'Follows you'
    }));
    renderContacts();
  }

  function renderContacts() {
    const host = $('contactList');
    const query = String($('contactSearch').value || '').trim().toLowerCase();
    const rows = contactRows
      .filter(row => `${row.profile.display_name || ''} ${row.profile.username || ''} ${row.profile.spike_id || ''}`.toLowerCase().includes(query))
      .sort((a, b) => Number(b.presence?.online === true) - Number(a.presence?.online === true));
    host.replaceChildren();
    if (!rows.length) host.append(emptyNode(query ? 'No matching people found.' : 'No followers or following yet.'));
    rows.forEach(row => host.append(contactNode(row)));
    renderSelectionFooter();
  }

  function contactNode({ id, profile, presence, relationship }) {
    const selected = selectedContacts.has(id);
    const item = document.createElement('div');
    item.className = 'msg-contact';
    const details = document.createElement('div');
    details.className = 'msg-contact-details';
    const name = document.createElement('strong');
    name.textContent = personName(profile);
    const handle = document.createElement('small');
    handle.textContent = profile.username ? `@${profile.username}` : 'SPIKE member';
    const relation = document.createElement('small');
    relation.textContent = relationship;
    const state = document.createElement('small');
    state.className = presence?.online ? 'msg-contact-presence online' : 'msg-contact-presence';
    state.textContent = presence?.online ? 'Online now' : presenceLabel(presence);
    details.append(name, handle, relation, state);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = selected ? 'msg-select selected' : 'msg-select';
    button.dataset.contactSelect = id;
    button.setAttribute('aria-pressed', String(selected));
    button.textContent = selected ? 'Selected' : 'Select';
    item.append(avatarNode(profile, personName(profile)), details, button);
    return item;
  }

  function renderSelectionFooter() {
    $('contactSelectionFooter').hidden = selectedContacts.size === 0;
    $('contactSelectionCount').textContent = String(selectedContacts.size);
    $('startSelectedConversation').textContent = selectedContacts.size > 1 ? 'Create group' : 'Start conversation';
    $('contactGroupTitle').closest('label').hidden = selectedContacts.size < 2;
  }

  async function startFromPicker() {
    const ids = [...selectedContacts];
    if (!ids.length) return;
    const button = $('startSelectedConversation');
    button.disabled = true;
    try {
      if (ids.length === 1) {
        location.href = `message.html?user_id=${encodeURIComponent(ids[0])}`;
        return;
      }
      const title = String($('contactGroupTitle').value || '').trim().slice(0, 100) || 'SPIKE Group';
      const createdId = await createConversation(ids, title);
      location.href = `message.html?conversation_id=${encodeURIComponent(createdId)}`;
    } catch (error) {
      say(error.message || 'Could not start this conversation.', true);
      button.disabled = false;
    }
  }

  function bindContactPicker() {
    const panel = $('contactPicker');
    const open = () => {
      panel.hidden = false;
      document.body.style.overflow = 'hidden';
      $('contactSearch').focus();
      loadContacts().catch(error => $('contactList').replaceChildren(emptyNode(error.message || 'Contacts could not be loaded.', true)));
    };
    const close = () => {
      panel.hidden = true;
      document.body.style.overflow = '';
      selectedContacts.clear();
      renderContacts();
    };
    $('openContactPicker').addEventListener('click', open);
    $('closeContactPicker').addEventListener('click', close);
    panel.addEventListener('click', event => {
      if (event.target === panel) { close(); return; }
      const tab = event.target.closest('[data-contact-tab]');
      if (tab) {
        panel.querySelectorAll('[data-contact-tab]').forEach(button => {
          const active = button === tab;
          button.classList.toggle('active', active);
          button.setAttribute('aria-selected', String(active));
        });
        loadContacts(tab.dataset.contactTab).catch(error => say(error.message, true));
        return;
      }
      const select = event.target.closest('[data-contact-select]');
      if (select) {
        const id = select.dataset.contactSelect;
        if (selectedContacts.has(id)) selectedContacts.delete(id);
        else selectedContacts.add(id);
        renderContacts();
      }
    });
    $('contactSearch').addEventListener('input', renderContacts);
    $('startSelectedConversation').addEventListener('click', startFromPicker);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) close(); });
  }

  function bindInboxPage() {
    bindContactPicker();
    let searchTimer = null;
    $('search').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => loadInbox().catch(error => say(error.message, true)), 180);
    });
    document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(node => node.classList.toggle('active', node === button));
      loadInbox().catch(error => say(error.message, true));
    }));
    $('incomingToastOpen').addEventListener('click', () => {
      if (pendingIncomingConversationId) location.href = `message.html?conversation_id=${encodeURIComponent(pendingIncomingConversationId)}`;
    });
    subscribeInbox();
    watchPresence(refreshInboxPresence);
  }

  /* Conversation thread */

  async function findDirectConversation(otherId) {
    const { data: mine, error } = await db().from('conversation_members').select('conversation_id').eq('user_id', user.id);
    if (error) throw error;
    const ids = (mine || []).map(row => row.conversation_id);
    if (!ids.length) return null;
    const { data: theirs, error: theirsError } = await db().from('conversation_members').select('conversation_id').eq('user_id', otherId).in('conversation_id', ids);
    if (theirsError) throw theirsError;
    const candidates = (theirs || []).map(row => row.conversation_id);
    if (!candidates.length) return null;
    const { data: direct, error: directError } = await db().from('conversations').select('id').in('id', candidates).eq('kind', 'direct').limit(1);
    if (directError) throw directError;
    return direct?.[0]?.id || null;
  }

  async function resolveConversation() {
    const params = new URLSearchParams(location.search);
    const requested = params.get('conversation_id');
    if (requested) {
      if (!uuidRe.test(requested)) throw new Error('This conversation link is invalid.');
      const { data, error } = await db().from('conversation_members').select('conversation_id').eq('conversation_id', requested).eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('You are not a member of this conversation.');
      conversationId = requested;
      return;
    }
    const target = params.get('user_id');
    if (!target || !uuidRe.test(target) || target === user.id) throw new Error('Open a conversation from Messages or choose a valid person to message.');
    if (!(await canMessage(target))) throw new Error('This member is not accepting messages from your account.');
    conversationId = (await findDirectConversation(target)) || (await createConversation([target], null));
    history.replaceState({}, '', `message.html?conversation_id=${encodeURIComponent(conversationId)}`);
  }

  function summarizeReactions(rows) {
    const summary = new Map();
    rows.forEach(({ message_id, user_id, reaction }) => {
      if (reaction !== HEART) return;
      const current = summary.get(message_id) || { count: 0, mine: false };
      current.count += 1;
      if (user_id === user.id) current.mine = true;
      summary.set(message_id, current);
    });
    return summary;
  }

  function reactionBadge(info) {
    const badge = document.createElement('span');
    badge.className = 'msg-reaction';
    badge.textContent = info.mine ? `${HEART} You${info.count > 1 ? ` + ${info.count - 1}` : ''}` : `${HEART} ${info.count}`;
    badge.setAttribute('aria-label', `${info.count} heart reaction(s)${info.mine ? ', including yours' : ''}`);
    return badge;
  }

  function dayDivider(value) {
    const node = document.createElement('div');
    node.className = 'msg-day';
    node.textContent = new Date(value).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    return node;
  }

  function renderBubble(row, person, reaction, replyInfo, showSender) {
    const mine = row.sender_id === user.id;
    rowsById.set(row.id, row);
    const bubble = document.createElement('article');
    bubble.className = mine ? 'bubble mine' : 'bubble';
    bubble.dataset.messageId = row.id;
    bubble.dataset.createdAt = row.created_at;
    if (!mine && showSender) {
      const sender = document.createElement('div');
      sender.className = 'msg-sender';
      sender.textContent = personName(person);
      bubble.append(sender);
    }
    if (row.deleted_at) {
      const gone = document.createElement('span');
      gone.className = 'msg-deleted';
      // Original Spike deleted icon (soft ban / eye-slash style)
      const icon = document.createElement('span');
      icon.className = 'spk-del-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/></svg>`;
      const label = document.createElement('span');
      label.textContent = 'Message deleted';
      gone.append(icon, label);
      bubble.append(gone);
    } else {
      if (replyInfo) {
        const quote = document.createElement('div');
        quote.className = 'msg-quote';
        quote.textContent = `↪ ${replyInfo.deleted_at ? 'Deleted message' : (replyInfo.body || 'Attachment').slice(0, 140)}`;
        if (replyInfo.deleted_at) quote.classList.add('msg-quote-deleted');
        bubble.append(quote);
      }
      if (row.body) {
        const text = document.createElement('div');
        text.textContent = row.body;
        bubble.append(text);
      }
      if (row.attachment_path) {
        const holder = document.createElement('div');
        holder.className = 'msg-attachment';
        holder.dataset.attachmentPath = row.attachment_path;
        holder.dataset.attachmentType = row.attachment_type || 'file';
        holder.textContent = 'Loading secure attachment…';
        bubble.append(holder);
      }
      if (reaction) bubble.append(reactionBadge(reaction));
    }
    const stamp = document.createElement('time');
    stamp.dateTime = row.created_at;
    stamp.textContent = clock(row.created_at) + (row.is_edited ? ' · edited' : '');
    bubble.append(stamp);
    if (!row.deleted_at) {
      const actions = document.createElement('button');
      actions.type = 'button';
      actions.className = 'msg-bubble-action';
      actions.dataset.messageActionOpen = row.id;
      actions.setAttribute('aria-label', 'Message options');
      actions.textContent = '⋯';
      bubble.append(actions);
    }
    return bubble;
  }

  function attachmentElement(kind, url) {
    if (kind === 'image') {
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Shared image';
      img.loading = 'lazy';
      img.decoding = 'async';
      return img;
    }
    if (kind === 'video') {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'none';
      return video;
    }
    if (kind === 'audio') {
      const audio = document.createElement('audio');
      audio.src = url;
      audio.controls = true;
      audio.preload = 'none';
      return audio;
    }
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open attachment';
    return link;
  }

  async function hydrateAttachments(root, rows) {
    const paths = new Set(rows.filter(row => !row.deleted_at && row.attachment_path).map(row => row.attachment_path));
    if (!paths.size) return;
    const holders = [...root.querySelectorAll('.msg-attachment[data-attachment-path]')].filter(holder => paths.has(holder.dataset.attachmentPath));
    try {
      const { data, error } = await db().storage.from('chat-attachments').createSignedUrls([...paths], 300);
      if (error) throw error;
      const urls = new Map((data || []).filter(item => item.path && item.signedUrl).map(item => [item.path, item.signedUrl]));
      holders.forEach(holder => {
        const url = urls.get(holder.dataset.attachmentPath);
        if (!url) { holder.textContent = 'Attachment unavailable'; return; }
        holder.replaceChildren(attachmentElement(holder.dataset.attachmentType, url));
      });
    } catch (error) {
      holders.forEach(holder => { holder.textContent = 'Attachment unavailable'; });
      console.warn('[SPIKE messages] attachments could not be loaded', error?.message || error);
    }
  }

  async function loadMessages({ older = false } = {}) {
    const thread = $('thread');
    const scroll = $('scroll');
    const pageSize = older ? 40 : 60;
    const previousHeight = scroll.scrollHeight;
    const previousTop = scroll.scrollTop;
    let query = db().from('messages').select(MESSAGE_FIELDS)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize);
    if (older && oldest) {
      const stamp = oldest.created_at;
      query = query.or(`created_at.lt.${stamp},and(created_at.eq.${stamp},id.lt.${oldest.id})`);
    }
    const { data, error } = await query;
    if (error) throw error;
    const existingIds = older ? new Set([...thread.querySelectorAll('.bubble[data-message-id]')].map(node => node.dataset.messageId)) : null;
    const rows = (data || []).reverse().filter(row => !existingIds || !existingIds.has(row.id));
    if (rows.length) oldest = { created_at: rows[0].created_at, id: rows[0].id };
    if (!older) rowsById.clear();
    const messageIds = rows.map(row => row.id);
    const replyIds = [...new Set(rows.map(row => row.reply_to_id).filter(Boolean))];
    const [people, reactionResult, replyResult] = await Promise.all([
      loadProfiles(rows.map(row => row.sender_id)),
      messageIds.length ? db().from('message_reactions').select('message_id,user_id,reaction').in('message_id', messageIds) : { data: [], error: null },
      replyIds.length ? db().from('messages').select('id,body,deleted_at').in('id', replyIds).eq('conversation_id', conversationId) : { data: [], error: null }
    ]);
    if (reactionResult.error) throw reactionResult.error;
    if (replyResult.error) throw replyResult.error;
    const reactions = summarizeReactions(reactionResult.data || []);
    const replies = new Map((replyResult.data || []).map(reply => [reply.id, reply]));
    if (!older) thread.replaceChildren();
    if (!rows.length && !older) thread.append(emptyNode('No messages yet. Say hello 👋'));
    const fragment = document.createDocumentFragment();
    const existingFirst = older ? thread.querySelector('.bubble[data-created-at]')?.dataset.createdAt : null;
    rows.forEach((row, index) => {
      const previous = rows[index - 1] || (existingFirst ? { created_at: existingFirst } : null);
      const key = dateKey(row.created_at);
      if (key && key !== dateKey(previous?.created_at)) fragment.append(dayDivider(row.created_at));
      const sameSender = previous && previous.sender_id === row.sender_id && dateKey(previous.created_at) === key;
      fragment.append(renderBubble(row, people[row.sender_id], reactions.get(row.id), replies.get(row.reply_to_id), !sameSender));
    });
    if (older) {
      thread.prepend(fragment);
      scroll.scrollTop = previousTop + (scroll.scrollHeight - previousHeight);
    } else {
      thread.append(fragment);
      scroll.scrollTo({ top: scroll.scrollHeight });
    }
    await hydrateAttachments(thread, rows);
    $('loadOlder').hidden = rows.length !== pageSize;
    await markRead();
    await refreshReadReceipt();
  }

  async function loadReply(replyId) {
    const { data, error } = await db().from('messages').select('id,body,deleted_at').eq('id', replyId).eq('conversation_id', conversationId).maybeSingle();
    if (error) {
      console.warn('[SPIKE messages] reply preview could not be loaded', error);
      return null;
    }
    return data;
  }

  async function appendMessage(row) {
    const thread = $('thread');
    if (!row || row.conversation_id !== conversationId || thread.querySelector(`[data-message-id="${row.id}"]`)) return;
    const people = await loadProfiles([row.sender_id]).catch(() => ({}));
    const replyInfo = row.reply_to_id ? await loadReply(row.reply_to_id) : null;
    thread.querySelector('.msg-empty')?.remove();
    const previousBubble = [...thread.querySelectorAll('.bubble[data-created-at]')].at(-1);
    if (!previousBubble || dateKey(previousBubble.dataset.createdAt) !== dateKey(row.created_at)) {
      thread.append(dayDivider(row.created_at));
    }
    thread.append(renderBubble(row, people[row.sender_id], null, replyInfo, true));
    if (row.attachment_path) await hydrateAttachments(thread, [row]);
    $('scroll').scrollTo({ top: $('scroll').scrollHeight, behavior: 'smooth' });
  }

  async function refreshReaction(messageId) {
    const article = $('thread').querySelector(`[data-message-id="${messageId}"]`);
    if (!article) return;
    const { data, error } = await db().from('message_reactions').select('message_id,user_id,reaction').eq('message_id', messageId);
    if (error) throw error;
    article.querySelector('.msg-reaction')?.remove();
    const info = summarizeReactions(data || []).get(messageId);
    if (info) article.querySelector('time').before(reactionBadge(info));
  }

  async function markRead() {
    const { error } = await db().from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('user_id', user.id);
    if (error) console.warn('[SPIKE messages] read receipt update failed', error);
  }

  async function refreshReadReceipt() {
    if (currentConversationIsGroup || !conversationId) return;
    const { data, error } = await db().from('conversation_members').select('last_read_at').eq('conversation_id', conversationId).neq('user_id', user.id).maybeSingle();
    if (error) {
      console.info('[SPIKE messages] read receipt unavailable', error.message || error);
      return;
    }
    peerLastReadAt = data?.last_read_at || null;
    renderReadReceipt();
  }

  function renderReadReceipt() {
    const thread = $('thread');
    thread.querySelectorAll('.msg-seen').forEach(node => node.remove());
    if (!peerLastReadAt) return;
    const own = thread.querySelectorAll('.bubble.mine[data-message-id]');
    const last = own[own.length - 1];
    if (last && new Date(peerLastReadAt) >= new Date(last.dataset.createdAt)) {
      const seen = document.createElement('small');
      seen.className = 'msg-seen';
      seen.textContent = 'Seen';
      last.append(seen);
    }
  }

  function openMessageMenu(row) {
    selectedMessage = row;
    $('menuSub').textContent = row.body || (row.attachment_type ? `Shared ${row.attachment_type}` : 'Message options');
    $('messageMenuDelete').hidden = row.sender_id !== user.id;
    $('messageMenuShade').classList.add('show');
  }
  function closeMessageMenu() { $('messageMenuShade').classList.remove('show'); }

  function setReply(row) {
    replyToId = row.id;
    $('replyText').textContent = `Replying to: ${(row.body || 'Attachment').slice(0, 120)}`;
    $('replyPreview').classList.add('show');
    $('body').focus();
  }
  function clearReply() {
    replyToId = null;
    $('replyPreview').classList.remove('show');
  }

  async function toggleHeart(messageId) {
    const { data: existing, error: readError } = await db().from('message_reactions').select('message_id').eq('message_id', messageId).eq('user_id', user.id).eq('reaction', HEART).maybeSingle();
    if (readError) throw readError;
    if (existing) {
      const { error } = await db().from('message_reactions').delete().eq('message_id', messageId).eq('user_id', user.id).eq('reaction', HEART);
      if (error) throw error;
      say('Reaction removed.', 'success');
    } else {
      const { error } = await db().from('message_reactions').insert({ message_id: messageId, user_id: user.id, reaction: HEART });
      if (error) throw error;
      say(`You reacted ${HEART}`, 'success');
    }
    await refreshReaction(messageId);
  }

  async function reportMessage(messageId) {
    const reason = await window.SPIKEPremiumDialog.prompt('Why are you reporting this message?', { title: 'Report message', confirmText: 'Submit report', cancelText: 'Cancel', icon: 'report', kicker: 'COMMUNITY SAFETY' });
    if (!reason) return;
    const trimmed = String(reason).trim();
    if (trimmed.length < 3) throw new Error('Please provide a reason of at least 3 characters.');
    const { error } = await db().from('reports').insert({ reporter_id: user.id, target_type: 'message', target_id: messageId, reason: trimmed.slice(0, 100), details: '' });
    if (error) throw error;
    say('Message report submitted.', 'success');
  }

  async function deleteMessage(row) {
    if (row.sender_id !== user.id) throw new Error('You can only delete messages you sent.');
    const confirmed = await window.SPIKEPremiumDialog.confirm({ title: 'Delete this message?', message: 'This message will be removed from your conversation.', confirmText: 'Delete message', cancelText: 'Cancel', danger: true, icon: 'delete' });
    if (!confirmed) return;
    const { data, error } = await db().from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', row.id).eq('sender_id', user.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Message was not deleted. Refresh the conversation and try again.');
    say('Message deleted.', 'success');
    await loadMessages();
  }

  async function runMessageAction(action) {
    const row = selectedMessage;
    if (!row) return;
    try {
      if (action === 'close') { closeMessageMenu(); return; }
      if (action === 'reply') { setReply(row); closeMessageMenu(); return; }
      if (action === 'copy') { await navigator.clipboard.writeText(row.body || ''); say('Message text copied.', 'success'); }
      if (action === 'share') {
        const text = row.body || 'Shared a message on SPIKE';
        if (navigator.share) await navigator.share({ title: 'SPIKE message', text });
        else { await navigator.clipboard.writeText(text); say('Message text copied for sharing.', 'success'); }
      }
      if (action === 'like') await toggleHeart(row.id);
      if (action === 'report') await reportMessage(row.id);
      if (action === 'delete') await deleteMessage(row);
      closeMessageMenu();
    } catch (error) {
      say(error.message || 'That message action could not be completed.', true);
    }
  }

  function receiveTyping(signal) {
    if (!signal.user_id || signal.user_id === user.id) return;
    peerTypingUntil = signal.typing === true ? Date.now() + 2600 : 0;
    renderPeerTyping();
    clearTimeout(peerTypingTimer);
    if (peerTypingUntil) peerTypingTimer = window.setTimeout(renderPeerTyping, 2700);
  }

  function renderPeerTyping() {
    const node = $('typingIndicator');
    const active = peerTypingUntil > Date.now();
    node.hidden = !active;
    node.textContent = active ? (currentConversationIsGroup ? 'A member is typing…' : `${personName(currentPeer)} is typing…`) : '';
  }

  async function sendTyping(typing) {
    if (!threadChannel || !typingChannelReady || !conversationId || document.hidden || !navigator.onLine) return;
    try {
      const result = await threadChannel.send({ type: 'broadcast', event: 'typing', payload: { user_id: user.id, typing, at: Date.now() } });
      if (result?.status !== 'ok') console.info('[SPIKE messages] typing broadcast was not acknowledged', result);
    } catch (error) {
      console.info('[SPIKE messages] typing signal unavailable', error?.message || error);
    }
  }

  function stopTyping() {
    clearTimeout(typingStopTimer);
    typingStopTimer = null;
    sendTyping(false);
  }

  function scheduleTyping() {
    const now = Date.now();
    if (now - lastTypingSentAt > 900) {
      lastTypingSentAt = now;
      sendTyping(true);
    }
    clearTimeout(typingStopTimer);
    typingStopTimer = window.setTimeout(stopTyping, 1600);
  }

  function bindComposer() {
    const input = $('body');
    const form = $('form');
    input.addEventListener('input', () => {
      if (input.value.trim()) scheduleTyping();
      else stopTyping();
    });
    form.addEventListener('submit', async event => {
      if (event.defaultPrevented || $('mediaInput')?.files?.length) return;
      event.preventDefault();
      const body = input.value.trim();
      if (busy || !body || !conversationId) return;
      busy = true;
      $('send').disabled = true;
      try {
        const { data, error } = await db().from('messages').insert({ conversation_id: conversationId, sender_id: user.id, body, reply_to_id: replyToId }).select(MESSAGE_FIELDS).single();
        if (error) throw error;
        input.value = '';
        stopTyping();
        clearReply();
        await appendMessage(data);
      } catch (error) {
        say(error.message || 'Message could not be sent.', true);
      } finally {
        busy = false;
        $('send').disabled = false;
      }
    });
  }

  function bindVoiceNote() {
    const button = $('voiceNote');
    const input = $('mediaInput');
    const tray = $('recordingTray');
    const label = $('voiceRecordingText');
    let recorder = null;
    let stream = null;
    let chunks = [];
    let discard = false;
    let startedAt = 0;
    let timer = null;
    const paint = recording => {
      button.classList.toggle('recording', recording);
      const text = recording ? 'Stop recording' : 'Record voice note';
      button.setAttribute('aria-label', text);
      button.title = text;
      button.innerHTML = recording ? '<i class="fa-solid fa-stop"></i>' : '<i class="fa-solid fa-microphone"></i>';
    };
    const cleanup = () => {
      clearInterval(timer);
      timer = null;
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      recorder = null;
      paint(false);
      tray.hidden = true;
    };
    const finish = () => {
      const type = recorder?.mimeType || chunks[0]?.type || 'audio/webm';
      const blob = new Blob(chunks, { type });
      chunks = [];
      cleanup();
      if (discard) { say('Voice recording cancelled.'); return; }
      if (!blob.size) { say('No audio was captured. Please try again.', true); return; }
      const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
      const file = new File([blob], `spike-voice-${Date.now()}.${extension}`, { type });
      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        say('Voice note ready. Tap Send to share it privately.', 'success');
      } catch (error) {
        console.warn('[SPIKE messages] voice note could not be attached', error);
        say('The recording is ready but could not be attached. Please try again.', true);
      }
    };
    button.addEventListener('click', async () => {
      if (recorder?.state === 'recording') { recorder.stop(); return; }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        say('Voice recording is not supported by this browser. Try an updated browser over HTTPS.', true);
        return;
      }
      button.disabled = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        const mimeType = ['audio/webm;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported?.(type));
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunks = [];
        discard = false;
        startedAt = Date.now();
        recorder.addEventListener('dataavailable', event => { if (event.data?.size) chunks.push(event.data); });
        recorder.addEventListener('stop', finish, { once: true });
        recorder.start(250);
        paint(true);
        tray.hidden = false;
        const update = () => {
          const elapsed = Math.floor((Date.now() - startedAt) / 1000);
          label.textContent = `Recording voice note · ${elapsed}s`;
          if (elapsed >= 180 && recorder?.state === 'recording') recorder.stop();
        };
        update();
        timer = window.setInterval(update, 500);
      } catch (error) {
        cleanup();
        say(error?.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow microphone access and try again.' : error?.message || 'Could not start voice recording.', true);
      } finally {
        button.disabled = false;
      }
    });
    $('voiceRecordingCancel').addEventListener('click', () => {
      if (recorder?.state !== 'recording') return;
      discard = true;
      recorder.stop();
    });
    window.addEventListener('pagehide', () => {
      discard = true;
      if (recorder?.state === 'recording') recorder.stop();
      cleanup();
    }, { once: true });
  }

  async function refreshThreadPresence() {
    if (!currentPeerId || document.hidden || !navigator.onLine) return;
    const presence = await loadPresence().catch(() => null);
    if (!presence) return;
    const state = presence.get(currentPeerId);
    $('sub').textContent = presenceLabel(state);
    $('presenceHost').dataset.presenceState = state?.online ? 'online' : 'offline';
  }

  function setConnectionState(status, error) {
    const node = $('connectionState');
    if (!node) return;
    if (status === 'SUBSCRIBED') {
      node.hidden = false;
      node.textContent = 'Live updates connected';
      node.dataset.state = 'connected';
      node.className = 'msg-connection';
      renderReadReceipt();
      refreshReadReceipt();
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      node.hidden = false;
      node.textContent = 'Live updates unavailable. Reconnecting…';
      node.dataset.state = 'error';
      node.className = 'msg-connection';
      console.warn('[SPIKE messages] realtime channel status', status, error || '');
      return;
    }
    // other states stay subtle
    if (status === 'JOINING' || status === 'CHANNEL_JOINED') {
      node.hidden = false;
      node.textContent = 'Connecting live updates…';
      node.dataset.state = 'cautious';
      node.className = 'msg-connection';
    }
  }

  function subscribeThread() {
    // Database changes use their own channel. Postgres Changes delivery is
    // authorized by RLS on messages, reactions and conversation_members.
    // Do not require realtime.messages private-topic authorization for these
    // table subscriptions.
    threadDbChannel = db().channel(`spike-dm-db:${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async payload => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') { await loadMessages(); return; }
        if (payload.eventType === 'INSERT' && payload.new.sender_id !== user.id) {
          try { await appendMessage(payload.new); }
          catch (error) {
            console.warn('[SPIKE messages] live message render failed; reloading thread', error);
            await loadMessages();
          } finally {
            await markRead();
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, payload => {
        const messageId = payload.new?.message_id || payload.old?.message_id;
        if (messageId) refreshReaction(messageId).catch(error => console.warn('[SPIKE messages] live reaction refresh failed', error));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${conversationId}` }, payload => {
        if (payload.new?.user_id === user.id) return;
        peerLastReadAt = payload.new?.last_read_at || null;
        renderReadReceipt();
      })
      .subscribe(setConnectionState);

    // Typing is ephemeral Broadcast data, so it remains on a private topic
    // with membership authorization in realtime.messages.
    threadChannel = db().channel(`spike-dm-typing:${conversationId}`, { config: { private: true, broadcast: { ack: true, self: false } } })
      .on('broadcast', { event: 'typing' }, payload => receiveTyping(payload?.payload || {}))
      .subscribe((status, error) => {
        typingChannelReady = status === 'SUBSCRIBED';
        if (!typingChannelReady && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')) {
          console.warn('[SPIKE messages] private typing channel unavailable', error || status);
        }
      });
  }

  async function setupThread() {
    await resolveConversation();
    const [membersResult, conversationResult] = await Promise.all([
      db().from('conversation_members').select('user_id,last_read_at').eq('conversation_id', conversationId),
      db().from('conversations').select('id,kind,title').eq('id', conversationId).maybeSingle()
    ]);
    if (membersResult.error) throw membersResult.error;
    if (conversationResult.error) throw conversationResult.error;
    const others = (membersResult.data || []).filter(row => row.user_id !== user.id);
    const isGroup = conversationResult.data?.kind === 'group';
    const peerId = !isGroup && others.length === 1 ? others[0].user_id : null;
    currentConversationIsGroup = isGroup;
    currentPeerId = !isGroup && peerId ? String(peerId) : null;
    peerLastReadAt = peerId ? others[0].last_read_at : null;

    $('voiceCallBtn').hidden = isGroup;
    $('videoCallBtn').hidden = isGroup;
    setCallButtonsReady(false);
    const people = await loadProfiles(others.map(row => row.user_id)).catch(() => ({}));
    currentPeer = peerId ? people[peerId] || null : null;
    $('name').textContent = isGroup ? (conversationResult.data?.title || 'SPIKE Group') : personName(currentPeer);
    $('sub').textContent = isGroup ? `${others.length + 1} members` : (currentPeer?.username ? `@${currentPeer.username}` : 'Direct message');
    fillAvatar($('avatar'), currentPeer, $('name').textContent);
    $('presenceHost').dataset.presenceUser = peerId ? String(peerId) : '';

    let composerOpen = true;
    if (peerId) {
      composerOpen = await canMessage(peerId);
      setCallButtonsReady(composerOpen);
      if (!composerOpen) say('This member is not accepting new messages from your account.', true);
    }
    setComposerEnabled(composerOpen);

    if (peerId) {
      await refreshThreadPresence();
      watchPresence(refreshThreadPresence);
    }
    subscribeThread();
    await loadMessages().catch(error => say(`Conversation is open, but message history could not load: ${error.message || 'Tap Refresh to retry.'}`, true));
  }

  function bindThreadPage() {
    $('refresh').addEventListener('click', () => {
      if (conversationId) loadMessages().catch(error => say(error.message || 'Conversation could not be refreshed.', true));
    });
    $('loadOlder').addEventListener('click', () => loadMessages({ older: true }).catch(error => say(error.message, true)));
    $('thread').addEventListener('click', event => {
      const trigger = event.target.closest('[data-message-action-open]');
      const row = trigger && rowsById.get(trigger.dataset.messageActionOpen);
      if (row) openMessageMenu(row);
    });
    $('messageMenuShade').addEventListener('click', event => { if (event.target.id === 'messageMenuShade') closeMessageMenu(); });
    $('messageMenuShade').querySelectorAll('[data-msg-action]').forEach(button => button.addEventListener('click', () => runMessageAction(button.dataset.msgAction)));
    $('cancelReply').addEventListener('click', clearReply);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMessageMenu(); });
    bindComposer();
    bindVoiceNote();
  }

  async function start() {
    if (messagingStartPromise) return messagingStartPromise;
    messagingStartPromise = (async () => {
      if (!db()) throw new Error('SPIKE database is not ready. Reload the page.');
      const { data, error } = await db().auth.getUser();
      if (error) throw error;
      if (!data.user) throw new Error('Please sign in again.');
      // Do not join a private Realtime topic until its authorization JWT is
      // installed. Supabase's auth listener updates this asynchronously; the
      // explicit await closes the startup race without changing RLS policies.
      const { data: sessionData, error: sessionError } = await db().auth.getSession();
      if (sessionError) throw sessionError;
      const session = sessionData?.session;
      if (!session?.access_token || session.user?.id !== data.user.id) {
        throw new Error('Your sign-in session is still synchronizing. Please retry.');
      }
      await db().realtime.setAuth(session.access_token);
      user = data.user;
      if (document.body.dataset.spikePage === 'message') {
        bindThreadPage();
        await setupThread();
      } else {
        bindInboxPage();
        await loadInbox();
      }
    })();
    try { return await messagingStartPromise; }
    catch (error) { messagingStartPromise = null; throw error; }
  }

  window.SPIKE_MESSAGING = Object.freeze({
    getReplyToId: () => replyToId,
    getCallContext: () => ({ conversationId, peerId: currentPeerId, isGroup: currentConversationIsGroup }),
    clearReply,
    appendMessage
  });

  window.addEventListener('pagehide', () => {
    clearTimeout(typingStopTimer);
    clearTimeout(peerTypingTimer);
    if (presenceRefreshTimer) { clearInterval(presenceRefreshTimer); presenceRefreshTimer = null; }
    if (presenceVisibilityHandler) { document.removeEventListener('visibilitychange', presenceVisibilityHandler); presenceVisibilityHandler = null; }
    window.removeEventListener('online', refreshInboxPresence);
    window.removeEventListener('online', refreshThreadPresence);
    window.removeEventListener('spike:presence-update', refreshInboxPresence);
    window.removeEventListener('spike:presence-update', refreshThreadPresence);
    if (threadChannel) { sendTyping(false); db().removeChannel(threadChannel); threadChannel = null; }
    typingChannelReady = false;
    if (threadDbChannel) { db().removeChannel(threadDbChannel); threadDbChannel = null; }
    if (inboxChannel) db().removeChannel(inboxChannel);
  });

  const boot = () => start().catch(error => say(error.message || 'Messages could not load. Reload the page.', true));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
