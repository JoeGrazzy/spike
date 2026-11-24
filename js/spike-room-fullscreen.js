/* SPIKE Room full-screen shell: presentation-only relocation; existing room controllers retain ownership. */
(() => {
  'use strict';
  if (window.__SPIKE_ROOM_FULLSCREEN_V36__) return;
  window.__SPIKE_ROOM_FULLSCREEN_V36__ = true;
  const $ = id => document.getElementById(id);
  const menu = $('roomMenu'), toggle = $('roomMenuToggle');
  const drawer = $('roomMembersDrawer'), mount = $('roomMembersMount');
  const members = document.querySelector('.room-members-column');
  const tools = $('roomMenuTools'), info = $('roomMenuInfo');
  const hero = document.querySelector('.room-hero');
  const actions = $('connectionActions');
  if (hero && info) {
    const facts = hero.querySelector('.room-facts');
    if (facts) info.append(...Array.from(facts.children).map(node => { const span=document.createElement('span'); span.textContent=node.textContent.trim(); return span; }));
  }
  const connectionCopy = document.querySelector('.connection-copy');
  if (connectionCopy && info) info.append(connectionCopy);
  if (actions && tools) {
    ['retryButton','leaveButton','walletButton','roomsButton'].forEach(id => { const node=$(id); if(node) tools.append(node); });
  }
  if (members && mount) mount.append(members);
  const title = $('roomTitle'), category = $('roomCategory'), status = $('roomStatusLabel');
  function syncRoomTitle(){ if($('roomLiveTitle') && title) $('roomLiveTitle').textContent=title.textContent || 'SPIKE Room'; if($('chatRoomHeading') && title) $('chatRoomHeading').textContent=title.textContent || 'Room chat'; if($('roomLiveSubtitle') && status) $('roomLiveSubtitle').textContent=status.textContent || 'Room options'; if($('chatRoomCategory') && category) $('chatRoomCategory').textContent=category.textContent || 'SPIKE ROOMS'; }
  [title,category,status].filter(Boolean).forEach(node=>new MutationObserver(syncRoomTitle).observe(node,{childList:true,subtree:true,characterData:true}));
  syncRoomTitle();
  function setMenu(open){ menu.hidden=!open; toggle.setAttribute('aria-expanded',String(open)); toggle.setAttribute('aria-label',open?'Close room menu':'Open room menu'); }
  function setDrawer(open){ drawer.hidden=!open; if(open){setMenu(false); $('drawerMembersRefresh')?.focus();} else $('chatMembersOpen')?.focus(); }
  toggle?.addEventListener('click',()=>setMenu(menu.hidden));
  $('roomMembersOpen')?.addEventListener('click',()=>setDrawer(true));
  $('chatMembersOpen')?.addEventListener('click',()=>setDrawer(true));
  $('roomMembersClose')?.addEventListener('click',()=>setDrawer(false));
  $('roomMembersDismiss')?.addEventListener('click',()=>setDrawer(false));
  $('drawerMembersRefresh')?.addEventListener('click',()=>$('membersRefreshButton')?.click());
  $('roomLeaveAction')?.remove();
  document.addEventListener('click',event=>{ if(!menu.hidden && !menu.contains(event.target) && !toggle.contains(event.target))setMenu(false); });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){setMenu(false);if(!drawer.hidden)setDrawer(false);}});
  const count=$('roomMemberCount');
  if(count){const syncCount=()=>{ $('roomMenuMemberCount').textContent=count.textContent; $('drawerMemberCount').textContent=count.textContent; };new MutationObserver(syncCount).observe(count,{childList:true,characterData:true,subtree:true});syncCount();}
})();
