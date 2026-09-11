// @ts-check
(function(){
'use strict';
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const db=window.supabaseClient||window.db;
let snap={};
const $=(id)=>document.getElementById(id);
function toast(msg){if(typeof window.toast==='function')window.toast(msg);else alert(msg)}
function scoreBar(label,value){const n=Math.max(0,Math.min(100,Number(value)||0));return `<div class="intel-bar"><span>${esc(label)}</span><div class="intel-track"><div class="intel-fill" style="width:${n}%"></div></div><b>${n}</b></div>`}
async function load(){
 if(!db)return;
 try{const {data,error}=await db.rpc('get_spike_intelligence_snapshot_v1');if(error)throw error;snap=data||{};render()}catch(e){console.error('[SPIKE INTELLIGENCE]',e);toast('Unable to load SPIKE Intelligence right now.')}
}
function render(){
 const r=snap.reputation||{};
 $('intelReputation').innerHTML=`<div class="intel-score">${Number(r.score||0)}</div><div class="intel-note">Meaningful participation score</div><div class="intel-bars">${scoreBar('Helpful',r.helpful)}${scoreBar('Community',r.community)}${scoreBar('Creator',r.creator)}${scoreBar('Reliability',r.reliability)}</div><div class="intel-note" style="margin-top:10px">${Number(r.contributions||0)} tracked contributions · ${Number(r.streak_days||0)} day streak</div>`;
 $('intelActivity').innerHTML=`<div class="intel-tags"><span class="intel-tag">${Number(snap.activity_24h||0)} activity / 24h</span><span class="intel-tag">${Number(snap.comments_7d||0)} comments / 7d</span><span class="intel-tag">${Number(snap.room_messages_7d||0)} Room messages / 7d</span><span class="intel-tag">${Number(snap.friend_count||0)} connections</span><span class="intel-tag">${Number(snap.predictions_30d||0)} predictions / 30d</span></div>`;
 const rooms=snap.active_rooms||[];$('intelRooms').innerHTML=rooms.length?`<div class="intel-list">${rooms.map(x=>`<div class="intel-item"><b>${esc(x.emoji||'🏠')} ${esc(x.name)}</b><small>${esc(x.category||'Community')} · ${esc(x.description||'Active SPIKE Room')}</small></div>`).join('')}</div>`:'<div class="intel-empty">No active Rooms are available.</div>';
 const events=snap.upcoming_events||[];$('intelEvents').innerHTML=events.length?`<div class="intel-list">${events.map(x=>`<div class="intel-item"><b>📅 ${esc(x.title)}</b><small>${new Date(x.starts_at).toLocaleString()} · ${esc(x.description||'')}</small></div>`).join('')}</div>`:'<div class="intel-empty">No upcoming events.</div>';
 const acts=snap.recent_activity||[];$('intelMemoryList').innerHTML=acts.length?`<div class="intel-list">${acts.map(x=>`<div class="intel-item"><b>${esc(String(x.event_type||'Activity').replaceAll('_',' '))}</b><small>${new Date(x.created_at).toLocaleString()}${x.source_id?' · '+esc(x.source_id):''}</small></div>`).join('')}</div>`:'<div class="intel-empty">No recent activity to revisit.</div>';
 $('intelRecap').innerHTML=`<div class="intel-list"><div class="intel-item"><b>24-hour pulse</b><small>${Number(snap.activity_24h||0)} activities recorded across your SPIKE journey.</small></div><div class="intel-item"><b>7-day conversation</b><small>${Number(snap.comments_7d||0)} comments and ${Number(snap.room_messages_7d||0)} Room messages.</small></div><div class="intel-item"><b>30-day prediction activity</b><small>${Number(snap.predictions_30d||0)} predictions recorded in SPIKE Predictor.</small></div></div>`;
}
async function saveMemory(){
 const title=$('memoryTitle').value.trim(),note=$('memoryNote').value.trim();if(!title||!note){toast('Add a title and note first.');return}
 try{const {data:{user}}=await db.auth.getUser();if(!user)throw new Error('Sign in required');const {error}=await db.from('spike_memories').insert({user_id:user.id,title,note,source_type:'manual'});if(error)throw error;$('memoryTitle').value='';$('memoryNote').value='';toast('Memory saved.');}catch(e){console.error(e);toast('Could not save memory.')}
}
function init(){
 $('intelRefresh')?.addEventListener('click',load);$('memorySave')?.addEventListener('click',saveMemory);
 $('intelHome')?.addEventListener('click',()=>location.href='feed.html');
 $('intelDiscover')?.addEventListener('click',()=>location.href='feed.html#discover');
 load();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
