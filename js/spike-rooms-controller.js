(() => {
  'use strict';
  if (window.__SPIKE_ROOMS_CONTROLLER__) return;
  window.__SPIKE_ROOMS_CONTROLLER__ = true;
  const $ = (id) => document.getElementById(id);
  const state = { client: null, user: null, rooms: [], filter: 'all', category: 'all', query: '', following: new Set(), profiles: new Map(), loading: false };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const iconFor = (category) => ({Music:'♫',Entertainment:'✦',Education:'▤',Business:'◈',Technology:'⌘',Lifestyle:'☼',General:'◎',Sports:'⚽',Relationships:'♡'})[category] || '◎';
  function status(message) { const n=$('roomsStatus'); if(n) n.textContent=message; }
  function modal(open) { const n=$('createRoomModal'); if(!n)return; n.hidden=!open; n.setAttribute('aria-hidden',String(!open)); if(open) $('newRoomTitle')?.focus(); }
  function roomUrl(id) { return `room.html?id=${encodeURIComponent(id)}`; }
  async function load() {
    if (state.loading) return; state.loading=true; status('Loading rooms…');
    const grid=$('roomsGrid'); if(grid) grid.innerHTML='<div class="room-skeleton"></div><div class="room-skeleton"></div><div class="room-skeleton"></div>';
    try {
      const {data,error}=await state.client.from('rooms').select('id,owner_id,title,description,category,visibility,status,capacity,chat_enabled,scheduled_at,started_at,created_at').or(`visibility.eq.public,owner_id.eq.${state.user.id}`).in('status',['live','scheduled']).order('created_at',{ascending:false}).limit(100);
      if(error) throw error;
      state.rooms=data||[];
      const ids=[...new Set(state.rooms.map(r=>r.owner_id))];
      if(ids.length){const result=await state.client.rpc('get_public_profiles',{p_user_ids:ids});if(!result.error)(result.data||[]).forEach(p=>state.profiles.set(p.id,p));}
      render();
      window.__SPIKE_ROOMS_BOOT_STATE__='ready'; status(`${state.rooms.length} room${state.rooms.length===1?'':'s'} available`);
    } catch(error) {
      console.error('[SPIKE Rooms]',error); window.__SPIKE_ROOMS_BOOT_STATE__='failed'; status(error.message||'Rooms could not load.');
      if(grid) grid.innerHTML=''; $('roomsEmpty').hidden=false;
    } finally { state.loading=false; }
  }
  function visibleRooms() {
    return state.rooms.filter(room=>{
      if(state.filter==='live'&&room.status!=='live')return false;
      if(state.filter==='scheduled'&&room.status!=='scheduled')return false;
      if(state.filter==='mine'&&room.owner_id!==state.user.id)return false;
      if(state.filter==='following'&&!state.following.has(room.owner_id))return false;
      if(state.category!=='all'&&String(room.category).toLowerCase()!==state.category.toLowerCase())return false;
      const host=state.profiles.get(room.owner_id)||{};
      const haystack=`${room.title} ${room.description} ${room.category} ${host.display_name||''} ${host.username||''}`.toLowerCase();
      return !state.query||haystack.includes(state.query);
    });
  }
  function render() {
    const rows=visibleRooms(),grid=$('roomsGrid'); if(!grid)return;
    grid.innerHTML=rows.map(room=>{
      const p=state.profiles.get(room.owner_id)||{}, host=p.display_name||p.username||'SPIKE host';
      const live=room.status==='live';
      const timing=live?'LIVE NOW':room.scheduled_at?new Date(room.scheduled_at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'UPCOMING';
      const href=roomUrl(room.id);
      return `<article class="room-card"><a class="room-card-cover" href="${href}" aria-label="Open ${esc(room.title)}"><span class="room-category-label">${esc(room.category||'General')}</span><span class="cover-icon">${iconFor(room.category)}</span>${live?'<span class="room-live-badge"><i></i> LIVE</span>':''}</a><div class="room-card-body"><a class="room-card-title-link" href="${href}"><h3 class="room-card-title">${esc(room.title)}</h3></a><p class="room-card-desc">${esc(room.description||'Join the conversation.')}</p><div class="room-card-host"><span class="room-host-avatar">${esc(host.trim().charAt(0).toUpperCase()||'S')}</span><span class="room-host-name">${esc(host)}</span></div><div class="room-card-meta"><span>${live?'<span class="live-status">● Live</span>':esc(timing)}</span><span>♙ ${Number(room.capacity)} max</span><a class="room-card-join" href="${href}">Join ↗</a></div></div></article>`;
    }).join('');
    $('roomsEmpty').hidden=rows.length>0;
    if(!rows.length) status('No rooms match these filters.');
  }
  function setFilter(value) { state.filter=value; document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===value)); render(); }
  function setCategory(value) { state.category=value; document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category===value)); render(); }
  async function createRoom(event) {
    event.preventDefault(); const form=event.currentTarget, button=$('createRoomSubmit'), error=$('createRoomError');
    error.hidden=true; button.disabled=true;
    try {
      const title=$('newRoomTitle').value.trim(), description=$('newRoomDescription').value.trim();
      const scheduled=$('newRoomStart').value==='schedule';
      const scheduledAt=scheduled?new Date($('newRoomScheduledAt').value):null;
      if(scheduled&&(!scheduledAt||Number.isNaN(scheduledAt.getTime())||scheduledAt<=new Date())) throw new Error('Choose a future date and time.');
      const payload={owner_id:state.user.id,title,description,category:$('newRoomCategory').value,visibility:$('newRoomVisibility').value,capacity:Number($('newRoomLimit').value),chat_enabled:$('newRoomChat').checked,status:scheduled?'scheduled':'live',scheduled_at:scheduled?scheduledAt.toISOString():null,started_at:scheduled?null:new Date().toISOString()};
      const {data,error:insertError}=await state.client.from('rooms').insert(payload).select('id').single();
      if(insertError)throw insertError;
      location.assign(roomUrl(data.id));
    } catch(err) { error.textContent=err.message||'Room could not be created.'; error.hidden=false; }
    finally { button.disabled=false; }
  }
  async function boot() {
    state.client=window.SPIKE_PLATFORM?.getClient?.();
    if(!state.client){window.__SPIKE_ROOMS_BOOT_STATE__='failed';status('Supabase did not initialize. Check your connection.');return;}
    try {
      const session=await window.SPIKE_PLATFORM.getSession();
      if(!session?.user){location.replace('/');return;}
      state.user=session.user;
      const following=await state.client.from('follows').select('following_id').eq('follower_id',state.user.id).eq('status','accepted').limit(5000);
      if(!following.error)state.following=new Set((following.data||[]).map(x=>x.following_id));
      $('openCreateRoom')?.addEventListener('click',()=>modal(true));
      $('emptyCreateRoom')?.addEventListener('click',()=>modal(true));
      $('hostCreateRoom')?.addEventListener('click',()=>modal(true));
      document.querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',()=>modal(false)));
      $('createRoomForm')?.addEventListener('submit',createRoom);
      $('newRoomStart')?.addEventListener('change',()=>{$('scheduledAtWrap').hidden=$('newRoomStart').value!=='schedule';});
      $('refreshRooms')?.addEventListener('click',load);
      $('roomSearch')?.addEventListener('input',e=>{state.query=e.target.value.trim().toLowerCase();render();});
      document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.filter)));
      document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>setCategory(b.dataset.category)));
      await load();
    } catch(error) { window.__SPIKE_ROOMS_BOOT_STATE__='failed';status(error.message||'Unable to initialize rooms.'); }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
})();
