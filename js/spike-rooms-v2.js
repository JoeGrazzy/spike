(() => {
  'use strict';
  const URL = 'https://cjqpyndceqyqsijihxbb.supabase.co';
  const KEY = 'sb_publishable_Tqz0TbLLRLwu4XirPTVuiw_sSC9o4Jw';
  const db = window.__SPIKE_SUPABASE__ || window.supabase?.createClient?.(URL, KEY);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeMediaUrl = value => { try { const url = new URL(String(value || ''), location.href); return ['https:','http:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; } };
  const toast = message => {
    const el = $('roomsToast'); if (!el) return;
    el.textContent = message; el.dataset.show = 'true';
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.dataset.show = 'false'; }, 3200);
  };
  const setBusy = (button, busy, label) => {
    if (!button) return;
    button.disabled = busy;
    if (busy) { button.dataset.label = button.textContent; button.textContent = label || 'Please wait…'; }
    else if (button.dataset.label) { button.textContent = button.dataset.label; delete button.dataset.label; }
  };
  const currentUser = async () => {
    if (!db) throw new Error('SPIKE could not connect. Refresh and try again.');
    const { data, error } = await db.auth.getUser();
    if (error || !data?.user) { location.href = 'index.html'; throw new Error('Sign in to continue.'); }
    return data.user;
  };

  async function joinRoom(roomId) {
    const { data, error } = await db.rpc('room_public_join', { p_room_id: roomId });
    if (error) throw error;
    if (!data?.active) throw new Error('Room membership could not be confirmed.');
    return data;
  }

  async function loadRooms(query, category, user) {
    const result = await db.rpc('rooms_discover', {
      p_query: query || null,
      p_category: category || null,
      p_limit: 60,
      p_before: null
    });
    if (!result.error) return result.data || [];
    const fallback = await db.from('rooms')
      .select('id,name,description,emoji,category,tags,avatar_url,cover_url,created_at,featured,owner_id')
      .eq('active', true).order('created_at', { ascending: false }).limit(60);
    if (fallback.error) throw result.error;
    return fallback.data || [];
  }

  async function initDirectory() {
    const grid = $('roomGrid'); if (!grid) return;
    let category = '';
    let query = '';
    let user;
    try { user = await currentUser(); }
    catch (error) { grid.innerHTML = `<div class="rv-empty">${esc(error.message)}</div>`; return; }

    async function load() {
      grid.setAttribute('aria-busy', 'true');
      grid.innerHTML = '<div class="rv-loading"><span class="rv-loading-orb">✦</span><strong>Finding your communities…</strong><span>Good things take a moment.</span></div>';
      try {
        const [rooms, membershipResult] = await Promise.all([
          loadRooms(query, category, user),
          db.from('room_members').select('room_id').eq('user_id', user.id).eq('active', true)
        ]);
        if (membershipResult.error) throw membershipResult.error;
        const joined = new Set((membershipResult.data || []).map(row => row.room_id));
        if (!rooms.length) {
          grid.setAttribute('aria-busy', 'false');
          grid.innerHTML = '<div class="rv-empty"><div style="font-size:34px">✦</div><strong>No Rooms found yet</strong><br>Try another search or create the first community.</div>';
          return;
        }
        grid.innerHTML = rooms.map(room => {
          const isMember = joined.has(room.id);
          const cover = safeMediaUrl(room.cover_url);
          const tags = (Array.isArray(room.tags) ? room.tags : []).slice(0, 3).map(tag => `<span>${esc(tag)}</span>`).join('');
          return `<article class="rv-card"><div class="rv-card-cover">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" decoding="async">` : ''}${room.featured ? '<span class="rv-featured-tag">✦ Featured</span>' : ''}</div><div class="rv-card-content"><div class="rv-card-head"><div class="rv-room-icon">${esc(room.emoji || '🌐')}</div><div><h3>${esc(room.name)}</h3><div class="rv-meta"><span>${esc(room.category || 'General')}</span><span>·</span><span>${room.featured ? 'Featured community' : 'SPIKE community'}</span></div></div></div><p>${esc(room.description || 'A new community on SPIKE.')}</p>${tags ? `<div class="rv-card-tags">${tags}</div>` : ''}<div class="rv-card-actions">${isMember ? `<a class="rv-primary" href="room.html?id=${encodeURIComponent(room.id)}">Enter Room</a>` : `<button class="rv-primary" type="button" data-join="${esc(room.id)}">Join Room</button>`}<button class="rv-secondary" type="button" data-preview="${esc(room.id)}">Details</button></div></div></article>`;
        }).join('');
        grid.setAttribute('aria-busy', 'false');

        grid.querySelectorAll('[data-join]').forEach(button => button.addEventListener('click', async () => {
          setBusy(button, true, 'Joining…');
          try {
            await joinRoom(button.dataset.join);
            location.href = `room.html?id=${encodeURIComponent(button.dataset.join)}`;
          } catch (error) {
            setBusy(button, false); toast(error.message || 'Could not join this Room.');
          }
        }));
        grid.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', () => {
          const room = rooms.find(item => item.id === button.dataset.preview);
          if (room) toast(`${room.name} · ${room.category || 'General'} community`);
        }));
      } catch (error) {
        grid.setAttribute('aria-busy', 'false');
        grid.innerHTML = `<div class="rv-empty">${esc(error.message || 'Could not load Rooms. Please try again.')}</div>`;
      }
    }

    $('roomSearch')?.addEventListener('input', event => {
      query = event.target.value.trim(); clearTimeout(load.timer); load.timer = setTimeout(load, 240);
    });
    $('roomFilters')?.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
      category = button.dataset.category || '';
      $('roomFilters').querySelectorAll('[data-category]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      load();
    }));

    const backdrop = $('createBackdrop');
    let hasRoomAccount = false;
    try {
      const account = await db.from('room_accounts').select('user_id').eq('user_id', user.id).maybeSingle();
      if (account.error) throw account.error;
      hasRoomAccount = !!account.data;
    } catch (error) { toast('Room Account status could not be checked.'); }
    const accountFields = $('roomAccountFields');
    if (accountFields) accountFields.hidden = hasRoomAccount;
    const close = () => { backdrop.dataset.open = 'false'; backdrop.setAttribute('aria-hidden', 'true'); };
    $('openCreate')?.addEventListener('click', () => { backdrop.dataset.open = 'true'; backdrop.setAttribute('aria-hidden', 'false'); $('newRoomName')?.focus(); });
    $('closeCreate')?.addEventListener('click', close);
    $('closeCreateSecondary')?.addEventListener('click', close);
    backdrop?.addEventListener('click', event => { if (event.target === backdrop) close(); });
    $('createForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('createSubmit'); setBusy(button, true, 'Creating…');
      const { data, error } = await db.rpc('room_public_create', {
        p_name: $('newRoomName').value.trim(),
        p_description: $('newRoomDescription').value.trim(),
        p_emoji: $('newRoomEmoji').value.trim() || '🌐',
        p_category: $('newRoomCategory').value,
        p_tags: [],
        p_avatar_url: null,
        p_cover_url: null,
        p_rules: $('newRoomRules').value.trim(),
        p_handle: $('newRoomHandle')?.value.trim() || '',
        p_display_name: $('newRoomDisplayName')?.value.trim() || '',
        p_bio: ''
      });
      setBusy(button, false);
      if (error) {
        toast(error.message || 'Room creation is unavailable. Please try again.');
        return;
      }
      const created = Array.isArray(data) ? data[0] : data;
      const id = typeof created === 'string' ? created : created?.id;
      if (!id) { toast('Room created, but its link could not be opened.'); return; }
      location.href = `room.html?id=${encodeURIComponent(id)}`;
    });
    await load();
  }

  initDirectory();
})();
