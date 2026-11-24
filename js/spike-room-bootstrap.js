(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const status = (title, message, error=false) => {
    if($('connectionTitle'))$('connectionTitle').textContent=title;
    if($('connectionMessage'))$('connectionMessage').textContent=message;
    if($('connectionEyebrow'))$('connectionEyebrow').textContent=error?'CONNECTION ISSUE':'SPIKE ROOMS';
  };
  async function boot(){
    const client=window.SPIKE_PLATFORM?.getClient?.();
    if(!client){status('Connection unavailable','Supabase did not initialize. Check your network and reload.',true);$('retryButton').hidden=false;return;}
    try{
      const session=await window.SPIKE_PLATFORM.getSession();
      if(!session?.user){location.replace('/');return;}
      const user=session.user;
      const params=new URLSearchParams(location.search), roomId=params.get('id')||params.get('room_id')||params.get('room');
      if(!roomId){status('Room not found','Open a room from the discovery page.',true);$('roomsButton').hidden=false;return;}
      let invite=null;
      const inviteResult=await client.from('room_invites').select('status').eq('room_id',roomId).eq('invitee_id',user.id).maybeSingle();
      if(!inviteResult.error)invite=inviteResult.data;
      let result=await client.from('rooms').select('id,owner_id,title,description,category,visibility,status,capacity,chat_enabled,scheduled_at,started_at,ended_at,active_host_id,appearance').eq('id',roomId).maybeSingle();
      if(result.error)throw result.error;
      if(!result.data&&invite?.status==='pending'){
        const accepted=await client.rpc('spike_room_accept_invite',{p_room_id:roomId});
        if(accepted.error)throw accepted.error;
        result=await client.from('rooms').select('id,owner_id,title,description,category,visibility,status,capacity,chat_enabled,scheduled_at,started_at,ended_at,active_host_id,appearance').eq('id',roomId).maybeSingle();
      }
      if(result.error)throw result.error;
      const row=result.data;
      if(!row)throw new Error('This room is unavailable or you do not have access.');
      if(row.status==='cancelled')throw new Error('This room has been cancelled.');
      const member=await client.from('room_members').select('room_id,user_id,member_role,left_at').eq('room_id',roomId).eq('user_id',user.id).maybeSingle();
      if(member.error)throw member.error;
      if(!member.data){
        if(row.visibility!=='public')throw new Error('This is a private room. Ask the host for an invitation.');
        const joined=await client.from('room_members').insert({room_id:roomId,user_id:user.id,member_role:'listener'});
        if(joined.error)throw joined.error;
      }else if(member.data.left_at){
        const rejoined=await client.from('room_members').update({left_at:null}).eq('room_id',roomId).eq('user_id',user.id);
        if(rejoined.error)throw rejoined.error;
      }
      const profiles=await client.rpc('get_public_profiles',{p_user_ids:[row.owner_id,row.active_host_id||row.owner_id]});
      const host=(profiles.data||[]).find(p=>p.id===(row.active_host_id||row.owner_id))||{};
      const room={...row,host_id:row.owner_id,active_host_id:row.active_host_id||row.owner_id,allow_chat:row.chat_enabled,max_participants:row.capacity};
      $('roomTitle').textContent=row.title;$('roomDescription').textContent=row.description||'A place to connect and share ideas.';
      $('roomCategory').textContent=row.category||'GENERAL';$('roomHost').textContent=host.display_name||host.username||'Room host';
      $('roomCapacity').textContent=`Up to ${row.capacity} people`;$('roomAccess').textContent=row.visibility==='private'?'Private room':'Public room';
      $('roomStatusLabel').textContent=row.status==='live'?'LIVE NOW':row.status==='scheduled'?'SCHEDULED':'ROOM';
      if(row.status==='scheduled'&&row.owner_id===user.id){$('startRoomButton').hidden=false;$('startRoomButton').addEventListener('click',async()=>{const b=$('startRoomButton');b.disabled=true;const r=await client.rpc('spike_rooms_start',{p_room_id:roomId});if(r.error){status('Could not start room',r.error.message,true);b.disabled=false;return;}location.reload();});}
      if(row.status==='ended'){status('This room has ended','You can review the room, but chat is closed.');}
      else if(row.status==='scheduled'){status('Room scheduled','The host has not started this room yet.');}
      else {status('You are connected', 'Room access verified. Loading chat and members…');}
      const context={client,room,user};window.__SPIKE_ROOM_CONTEXT__=context;
      window.dispatchEvent(new CustomEvent('spike:room-ready',{detail:context}));
      if(row.status==='live') $('connectionCard')?.setAttribute('hidden','');
    }catch(error){console.error('[SPIKE Room bootstrap]',error);status('Room could not open',error.message||'Try again later.',true);$('retryButton').hidden=false;$('roomsButton').hidden=false;$('retryButton').onclick=()=>location.reload();}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
})();
