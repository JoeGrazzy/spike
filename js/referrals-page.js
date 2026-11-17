'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const db = window.SPIKE_PLATFORM?.getClient?.();
  let dashboard = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Number(value || 0).toLocaleString();
  function toast(message) { const el=$('refToast'); if(!el)return; el.textContent=message;el.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.display='none',2600); }
  function referralUrl(code) { const url=new URL('index.html',location.href);url.searchParams.set('ref',code);return url.toString(); }
  function invitationText() { return `Join me on SPIKE! Use my personal referral link to create your account: ${referralUrl(dashboard.referral_code)}`; }
  async function copyLink() { const value=referralUrl(dashboard.referral_code);try { if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);else{const field=document.createElement('textarea');field.value=value;field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();if(!document.execCommand('copy'))throw new Error('Copy failed');field.remove();}toast('Referral link copied'); } catch { toast('Copy is unavailable in this browser'); } }
  function renderRecent(rows) {
    const host=$('refRecent'); if(!Array.isArray(rows)||!rows.length){host.innerHTML='<div class="ref-empty">No invitations yet. Share your link to get started.</div>';return;}
    host.innerHTML=rows.map(r=>`<div class="ref-row"><div><b>${esc(r.invitee_name||'SPIKE member')}</b><small>${r.qualified_at?'Verified '+new Date(r.qualified_at).toLocaleDateString(): 'Invited '+new Date(r.created_at).toLocaleDateString()}</small></div><span class="ref-status ${esc(r.status)}">${esc(r.status)}</span></div>`).join('');
  }
  function renderHistory(rows) {
    const host=$('refHistory'); if(!Array.isArray(rows)||!rows.length){host.innerHTML='<div class="ref-empty">No SP Points activity yet.</div>';return;}
    host.innerHTML=rows.map(r=>`<div class="ref-row"><div><b>${esc(r.reason||'Referral points')}</b><small>${new Date(r.created_at).toLocaleDateString()}</small></div><span class="ref-points">${Number(r.amount)>0?'+':''}${number(r.amount)} SP</span></div>`).join('');
  }
  function renderLeaderboard(rows) {
    const host=$('refLeaderboard'); if(!Array.isArray(rows)||!rows.length){host.innerHTML='<div class="ref-empty">The public leaderboard is not available yet.</div>';return;}
    host.innerHTML=rows.map((r,i)=>`<div class="ref-row"><div style="display:flex;align-items:center;gap:10px"><span class="ref-rank">${i+1}</span><div><b>${esc(r.display_name||'SPIKE member')}</b><small>${esc(r.username?'@'+String(r.username).replace(/^@/,''):'SPIKE member')} · ${number(r.successful_referrals)} successful</small></div></div><span class="ref-points">${number(r.points_earned)} SP</span></div>`).join('');
  }
  async function init() {
    if(!db) { $('refRecent').innerHTML='<div class="ref-error">SPIKE connection is unavailable. Refresh and try again.</div>';return; }
    const {data:{session},error:sessionError}=await db.auth.getSession();
    if(sessionError)throw sessionError;
    if(!session?.user){location.replace('index.html?next='+encodeURIComponent('referrals.html'));return;}
    const [dash,board]=await Promise.all([
      db.rpc('spike_referral_dashboard'),
      db.rpc('spike_referral_leaderboard',{p_limit:50})
    ]);
    if(dash.error)throw dash.error;
    dashboard=dash.data||{};
    $('refCode').textContent=dashboard.referral_code||'Unavailable';
    if(dashboard.program_enabled===false){$('refHeading').textContent='Invite your people. Your link is ready.';$('refIntro').textContent='Your personal invitation link is ready, but referral rewards are temporarily paused by SPIKE. Invitations can still be shared.';}else{$('refIntro').textContent=`Share your personal referral link. When a new member confirms their email or phone and completes their profile, your referral becomes successful. You earn ${number(dashboard.inviter_points)} SP Points and they receive ${number(dashboard.invitee_points)} welcome points.`;}
    $('refLink').textContent=dashboard.referral_code?referralUrl(dashboard.referral_code):'Referral link unavailable';
    $('refTotal').textContent=number(dashboard.total_invites);
    $('refQualified').textContent=number(dashboard.successful_referrals);
    $('refPending').textContent=number(dashboard.pending_referrals);
    $('refPoints').textContent=number(dashboard.points_balance);
    renderRecent(dashboard.recent_referrals);renderHistory(dashboard.points_history);
    if(dashboard.leaderboard_enabled===false){$('refLeaderboard').innerHTML='<div class="ref-empty">The public leaderboard is temporarily disabled.</div>'; }
    else if(board.error){console.warn('[SPIKE REFERRALS] Leaderboard unavailable',board.error);$('refLeaderboard').innerHTML='<div class="ref-empty">Leaderboard could not be loaded. Your referral dashboard is still available.</div>';}
    else renderLeaderboard(board.data);
  }
  $('copyRefLink')?.addEventListener('click',copyLink);
  $('shareRefLink')?.addEventListener('click',async()=>{if(!dashboard?.referral_code)return;const text=invitationText();try{if(navigator.share)await navigator.share({title:'Join me on SPIKE',text,url:referralUrl(dashboard.referral_code)});else await copyLink();}catch(e){if(e?.name!=='AbortError')toast('Sharing could not be opened');}});
  $('whatsAppRef')?.addEventListener('click',()=>{if(dashboard?.referral_code)window.open('https://wa.me/?text='+encodeURIComponent(invitationText()),'_blank','noopener,noreferrer');});
  init().catch(error=>{console.error('[SPIKE REFERRALS]',error);$('refCode').textContent='Unable to load';$('refRecent').innerHTML=`<div class="ref-error">${esc(error?.message||'Referral services are unavailable. Apply the included Supabase migration and try again.')}</div>`;});
})();
