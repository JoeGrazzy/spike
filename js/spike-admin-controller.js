import { supabase } from './spike-supabase-client.js';

const $ = (id) => document.getElementById(id);
const withTimeout = (promise, ms = 12000, message = 'The admin request timed out. Check your connection and try again.') => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), ms); })])
    .finally(() => window.clearTimeout(timer));
};
const state = { overviewTimer: null, user: null, rows: [], reporters: new Map(), offset: 0, limit: 40, loadingUsers: false, loadingReports: false, hasMore: false, activeView: 'overview', users: [], userOffset: 0, userHasMore: false, selectedUser: null, suspensionCountdownTimer: null };
const statusLabels = { open: 'Pending', reviewing: 'Investigating', resolved: 'Resolved', dismissed: 'Dismissed' };
const typeLabels = { profile: 'Profile', post: 'Feed post', comment: 'Comment', message: 'Message', room: 'Room' };
const escapeLike = (value) => String(value).replace(/[^\p{L}\p{N}\s._@-]/gu, ' ').trim();

function setStatus(message, isError = false) {
  const node = $('adminStatus');
  if (!node) return;
  node.textContent = message;
  node.dataset.state = isError ? 'error' : 'ok';
}

function showView(name) {
  const supported = ['overview', 'users', 'verification', 'reports', 'purchases', 'monetization', 'enforcement', 'audit'];
  if (!supported.includes(name)) {
    setStatus('This admin section is not connected to a supported backend workflow yet. No changes were made.');
    return;
  }
  state.activeView = name;
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('.admin-view').forEach((view) => {
    view.hidden = view.id !== `view${name[0].toUpperCase()}${name.slice(1)}`;
  });
  if (name === 'reports') loadReports(false).catch((error) => setStatus(error.message || 'Could not load reports.', true));
  if (name === 'users') loadUsers(false).catch((error) => setStatus(error.message || 'Could not load users.', true));
  if (name === 'verification') { loadVerificationUsers().catch((error) => setVerificationStatus(error.message || 'Could not load verification management.', true)); loadFinancialRequests().catch((error) => setFinancialStatus(error.message || 'Could not load financial requests.', true)); loadVerifiedActivity().catch((error) => setVerifiedActivityStatus(error.message || 'Could not load verified activity.', true)); }
  if (name === 'purchases') loadPurchases().catch((error) => setPurchaseStatus(error.message || 'Could not load purchase requests.', true));
  if (name === 'monetization') loadPhase14Admin().catch((error) => setPhase14Status(error.message || 'Could not load owner gift controls.', true));
  if (name === 'enforcement') loadEnforcementDashboard().catch((error) => setEnforcementStatus(error.message || 'Could not load enforcement records.', true));
  if (name === 'audit') loadAuditCentre().catch((error) => setAuditStatus(error.message || 'Could not load audit records.', true));
}


function setAuditStatus(message, isError=false) {
  const node=$('auditStatus'); if(!node)return; node.textContent=message; node.dataset.state=isError?'error':'ok';
}
function renderAuditCentre(payload) {
  const summary=payload?.summary||{};
  Object.entries(summary).forEach(([key,value])=>{const node=document.querySelector(`[data-astat="${key}"]`);if(node)node.textContent=Number(value||0).toLocaleString('en-NG');});
  const permissions=payload?.permissions||{};
  $('auditPermissionStatus').textContent=permissions.owner_guard_active?'OWNER-ONLY GUARD ACTIVE':'GUARD STATUS UNCONFIRMED';
  $('auditPermissionDescription').textContent=permissions.description||'Permission description was not returned by the server.';
  $('auditPermissionModel').textContent=permissions.model==='owner_only'?'Owner only':String(permissions.model||'Unknown');
  $('auditDelegatedStatus').textContent=permissions.delegated_administrators_enabled===false?'Disabled':'Not confirmed';
  $('auditOwnerGuard').textContent=permissions.owner_guard_active===true?'Active':'Not confirmed';
  const rows=Array.isArray(payload?.events)?payload.events:[];
  const list=$('auditEventList'); if(!list)return; list.replaceChildren();
  rows.forEach(row=>{
    const item=document.createElement('article');item.className='user-action-block';
    const heading=document.createElement('div');heading.className='admin-detail-heading';
    const action=document.createElement('strong');action.textContent=String(row.action||'Recorded event').replaceAll('_',' ');
    const source=document.createElement('span');source.className='admin-kicker';source.textContent=String(row.source||'event').replaceAll('_',' ');heading.append(action,source);
    const when=row.occurred_at?new Date(row.occurred_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'medium'}):'Timestamp not recorded';
    const actor=document.createElement('small');actor.textContent=`Actor: ${row.actor_label||'Unknown'}${row.actor_username?' (@'+row.actor_username+')':''} · ${when}`;
    const target=document.createElement('p');target.textContent=`Affected account: ${row.target_label||'Not linked'}${row.target_username?' (@'+row.target_username+')':''}${row.target_spike_id?' · SP ID: '+row.target_spike_id:''}`;
    const stateLine=document.createElement('p');
    const transitions=[row.previous_state?`Previous: ${row.previous_state}`:'',row.new_state?`Recorded result: ${row.new_state}`:''].filter(Boolean).join(' · ');
    stateLine.textContent=transitions||'No before/after state was stored for this event.';
    const reason=document.createElement('p');reason.textContent=`Reason / context: ${row.reason||'No reason was recorded.'}`;
    item.append(heading,actor,target,stateLine,reason);list.append(item);
  });
  const total=Number(payload?.total_count||0);$('auditCountLabel').textContent=`${rows.length.toLocaleString()} shown · ${total.toLocaleString()} matching event(s) · maximum 250 per request`;
  if(!rows.length)list.textContent='No recorded events match this filter. This does not prove that no activity occurred outside the configured event sources.';
}
async function loadAuditCentre(){
  const button=$('auditRefresh');if(button)button.disabled=true;setAuditStatus('Loading owner-protected audit records…');
  try{
    const {data,error}=await withTimeout(supabase.rpc('spike_admin_get_audit_centre',{p_source:$('auditSource')?.value||'all',p_search:$('auditSearch')?.value?.trim()||'',p_days:Number($('auditDays')?.value||90),p_limit:250}));
    if(error)throw error;if(!data||typeof data!=='object'||!Array.isArray(data.events))throw new Error('Audit service returned an invalid response.');
    renderAuditCentre(data);setAuditStatus('Audit records loaded from the existing protected event ledgers.');
  }finally{if(button)button.disabled=false;}
}


function setEnforcementStatus(message, isError=false) {
  const node=$('enforcementStatus'); if(!node)return; node.textContent=message; node.dataset.state=isError?'error':'ok';
}
function renderEnforcementDashboard(payload) {
  const summary=payload?.summary||{};
  Object.entries(summary).forEach(([key,value])=>{const node=document.querySelector(`[data-estat="${key}"]`);if(node)node.textContent=Number(value||0).toLocaleString('en-NG');});
  const rows=Array.isArray(payload?.accounts)?payload.accounts:[];
  const list=$('enforcementList'); if(!list)return; list.replaceChildren();
  rows.forEach(row=>{
    const item=document.createElement('article'); item.className='user-action-block';
    const heading=document.createElement('div'); heading.className='admin-detail-heading';
    const name=document.createElement('strong'); name.textContent=row.display_name||row.username||'SPIKE member';
    const status=document.createElement('span'); status.className='admin-kicker'; status.textContent=String(row.account_status||'unknown').replaceAll('_',' '); heading.append(name,status);
    const meta=document.createElement('small'); meta.textContent=`@${row.username||'unknown'} · SP ID: ${row.spike_id||'—'}`;
    const details=document.createElement('p');
    if(row.account_status==='suspended'){
      const started=row.suspension_started_at?new Date(row.suspension_started_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos'}):'Not recorded';
      const expiry=row.suspension_expires_at?new Date(row.suspension_expires_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos'}):'No expiry recorded';
      details.textContent=`Started: ${started} · Expires: ${expiry} · Reason: ${row.suspension_reason||'Not supplied'}${row.expiry_processing_overdue?' · Expiry reached; waiting for scheduled server processing.':''}`;
    } else details.textContent=`Account created: ${row.created_at?new Date(row.created_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos'}):'—'}`;
    const open=document.createElement('button');open.type='button';open.className='admin-refresh';open.textContent='Open account controls';open.addEventListener('click',()=>{showView('users');const target=state.users.find(x=>x.id===row.id);if(target){renderUserDetail(target).catch(e=>setStatus(e.message,true));}else{loadUsers(false).then(()=>{const found=state.users.find(x=>x.id===row.id);if(found)renderUserDetail(found);else setStatus('Account is not in the current directory page. Search it in User Management.',true);}).catch(e=>setStatus(e.message,true));}});
    item.append(heading,meta,details,open);list.append(item);
  });
  $('enforcementCount').textContent=`${rows.length.toLocaleString()} record(s) · maximum 250 per request`;
  if(!rows.length)list.textContent='No accounts match the selected filters.';
}
async function loadEnforcementDashboard(){
  const button=$('enforcementRefresh');if(button)button.disabled=true;setEnforcementStatus('Loading owner-protected enforcement records…');
  try{
    const {data,error}=await withTimeout(supabase.rpc('spike_admin_get_enforcement_dashboard',{p_status:$('enforcementStatusFilter')?.value||'all',p_search:$('enforcementSearch')?.value?.trim()||'',p_expiring_hours:Number($('enforcementWindow')?.value||72),p_limit:250}));
    if(error)throw error;if(!data||typeof data!=='object')throw new Error('Enforcement service returned an invalid response.');
    renderEnforcementDashboard(data);setEnforcementStatus('Live enforcement records loaded. Counts and account statuses are sourced from the database.');
  }finally{if(button)button.disabled=false;}
}

async function countRows(table, configure = () => {}) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  query = configure(query);
  const result = await withTimeout(query);
  // Supabase/PostgREST normally resolves to { count, data, error }. Guard the
  // response before destructuring so an empty transport response cannot crash admin.html.
  if (!result || typeof result !== 'object') {
    throw new Error(`The ${table} count service returned no response.`);
  }
  const { count, error } = result;
  if (error) throw error;
  if (count === null || count === undefined || !Number.isFinite(Number(count))) {
    throw new Error(`The ${table} count is unavailable from the backend.`);
  }
  return Number(count);
}

const metricDetails = {
  total_registered_users: { title:'Total registered users', description:'Every profile currently registered in SPIKE. This is a live exact count from public.profiles, returned through the owner-only statistics RPC.', source:'Source: profiles table · exact count', view:'users', viewLabel:'Open user management' },
  active_users: { title:'Active users', description:'Unique active accounts seen during the last 30 days. Activity is recorded by the authenticated SPIKE heartbeat and excludes suspended or deleted accounts.', source:'Source: private.spike_user_activity · last 30 days', view:'users', viewLabel:'Open user management' },
  online_users: { title:'Online users', description:'Unique active accounts with a heartbeat in the last 90 seconds. Stale sessions automatically stop counting.', source:'Source: private.spike_user_activity · 90-second heartbeat window', view:'users', viewLabel:'Open user management' },
  new_registrations_today: { title:'New registrations', description:'Profiles created inside the selected local-time period. Change the registration period selector to inspect another range.', source:'Source: profiles.created_at · local calendar range', view:'users', viewLabel:'Open user management' },
  verified_users: { title:'Verified users', description:'Profiles with the SPIKE verified badge currently active. This is badge status, not an identity-document application count.', source:'Source: profiles.is_verified = true', view:'verification', viewLabel:'Open verification directory' },
  unverified_users: { title:'Unverified users', description:'Profiles without an active SPIKE verified badge.', source:'Source: profiles.is_verified = false', view:'verification', viewLabel:'Open verification directory' },
  suspended_accounts: { title:'Suspended accounts', description:'Profiles whose account_status is suspended. This count does not include deleted accounts.', source:'Source: profiles.account_status = suspended', view:'users', viewLabel:'Open user management' },
  total_active_rooms: { title:'Active rooms', description:'Rooms whose current status is live. Scheduled, ended and other room states are excluded.', source:'Source: rooms.status = live' },
  total_gifts_sent: { title:'Total gifts sent', description:'Successfully settled gift events only. Reversed gifts are excluded; each settled event is counted once.', source:'Source: private.spike_gift_events · status = settled', view:'monetization', viewLabel:'Open gifts & earnings' },
  total_sp_coins_in_circulation: { title:'SP Coins in circulation', description:'Sum of available SPIKE_COIN wallet balances. Pending balances are deliberately excluded. This is a coin quantity, not a naira valuation.', source:'Source: wallet_accounts.available_balance · currency SPIKE_COIN', view:'users', viewLabel:'Inspect user wallets' },
  total_creator_earnings: { title:'Creator earnings', description:'Finalized creator earnings in NGN from the private creator earnings ledger, joined to settled gifts. Reversed entries and reversed gifts are excluded.', source:'Source: private.spike_creator_earnings + spike_gift_events · NGN', view:'monetization', viewLabel:'Open gifts & earnings' },
  pending_withdrawals: { title:'Pending withdrawals', description:'Creator payout requests awaiting owner review. Funds are reserved server-side while a request is pending; payment is only complete after the owner records a payment reference.', source:'Source: private.spike_withdrawal_requests · status = pending_review', view:'verification', viewLabel:'Open financial request review' },
  pending_verification_requests: { title:'Pending verification requests', description:'Identity-document applications awaiting owner review. Documents remain in a private storage bucket and are opened through short-lived signed links.', source:'Source: private.spike_identity_verification_requests · status = pending_review', view:'verification', viewLabel:'Open identity review queue' }
};

function getOverviewRange() {
  const period = $('overviewPeriod')?.value || 'today';
  // SPIKE's reporting calendar is fixed to Nigeria time, regardless of device timezone.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value;
  const today = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00+01:00`);
  const end = new Date(today.getTime() + 86400000);
  let start = today;
  if (period === '7d') start = new Date(end.getTime() - 7 * 86400000);
  if (period === '30d') start = new Date(end.getTime() - 30 * 86400000);
  if (period === '365d') start = new Date(end.getTime() - 365 * 86400000);
  return { start: start.toISOString(), end: end.toISOString(), label: period === 'today' ? 'today (Africa/Lagos)' : period === '7d' ? 'last 7 days' : period === '30d' ? 'last 30 days' : 'last 12 months' };
}

function openMetricDetails(key) {
  const detail = metricDetails[key];
  const card = document.querySelector(`[data-metric="${key}"]`);
  const dialog = $('adminMetricDialog');
  if (!detail || !dialog) return;
  const liveTitle = key === 'new_registrations_today' ? (card?.querySelector('.admin-stat-label')?.textContent || detail.title) : detail.title;
  $('adminMetricDialogTitle').textContent = liveTitle;
  $('adminMetricDialogValue').textContent = card?.querySelector('[data-value]')?.textContent || 'Unavailable';
  $('adminMetricDialogDescription').textContent = detail.description;
  $('adminMetricDialogSource').textContent = detail.source;
  const open = $('adminMetricDialogOpen');
  open.hidden = !detail.view;
  open.textContent = detail.viewLabel || 'Open related records';
  open.dataset.view = detail.view || '';
  dialog.dataset.metric = key;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open','');
}

async function loadOverview() {
  const metrics = $('adminMetrics');
  const refresh = $('adminRefresh');
  if (metrics) metrics.setAttribute('aria-busy', 'true');
  if (refresh) refresh.disabled = true;
  setStatus('Loading secure platform statistics…');
  try {
    const range = getOverviewRange();
    const todayStart = range.start;
    const todayEnd = range.end;
    const { data, error } = await withTimeout(
      supabase.rpc('spike_admin_get_platform_overview', { p_today_start: todayStart, p_today_end: todayEnd }),
      15000,
      'Platform statistics timed out. Check your connection and refresh.'
    );
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('The statistics service returned an invalid response.');

    const registrationLabel = range.label === 'today' ? 'New registrations today' : `New registrations · ${range.label}`;
    const registrationLabelNode = document.querySelector('[data-metric="new_registrations_today"] .admin-stat-label');
    if (registrationLabelNode) registrationLabelNode.textContent = registrationLabel;
    const supported = {
      total_registered_users: { value: data.total_registered_users, note: 'Live total · profiles table' },
      new_registrations_today: { value: data.new_registrations_today, note: `During ${range.label} · profiles table` },
      verified_users: { value: data.verified_users, note: 'Live total · verified profile badges' },
      unverified_users: { value: data.unverified_users, note: 'Live total · profiles without a verified badge' },
      suspended_accounts: { value: data.suspended_accounts, note: 'Live total · suspended accounts' },
      total_active_rooms: { value: data.total_active_rooms, note: 'Live total · rooms with status “live”' },
      active_users: { value: data.active_users, note: 'Active in the last 30 days · authenticated heartbeat' },
      online_users: { value: data.online_users, note: 'Online · heartbeat within the last 90 seconds' },
      total_gifts_sent: { value: data.total_gifts_sent, note: 'Settled gifts only · reversed gifts excluded' },
      total_creator_earnings: { value: data.total_creator_earnings, note: 'Finalized creator earnings · NGN' },
      total_sp_coins_in_circulation: { value: data.total_sp_coins_in_circulation, note: 'Available SPIKE_COIN wallet balances; excludes pending balances' },
      pending_withdrawals: { value: data.pending_withdrawals, note: 'Awaiting owner review · reserved creator earnings' },
      pending_verification_requests: { value: data.pending_verification_requests, note: 'Awaiting identity-document review · private document storage' }
    };
    const unavailable = {};
    document.querySelectorAll('[data-value]').forEach((node) => {
      const key = node.dataset.value;
      const card = node.closest('article');
      const note = card?.querySelector('[data-metric-note]');
      if (Object.hasOwn(supported, key)) {
        const value = supported[key].value;
        if (value === null || value === undefined || !Number.isFinite(Number(value))) {
          node.textContent = 'Unavailable';
          if (note) note.textContent = 'Backend did not return a valid value.';
        } else {
          node.textContent = key === 'total_creator_earnings'
            ? `₦${Number(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
          if (note) note.textContent = supported[key].note;
        }
        node.title = 'Owner-only live statistic returned by the Supabase server function';
      } else {
        node.textContent = 'Unavailable';
        if (note) note.textContent = unavailable[key] || 'Unavailable · no authoritative backend source.';
        node.title = 'Backend functionality is not configured; no figure is estimated.';
      }
      card?.removeAttribute('hidden');
    });
    if (metrics) metrics.setAttribute('aria-busy', 'false');
    if ($('adminUpdated')) $('adminUpdated').textContent = `Updated ${new Date().toLocaleTimeString()} · ${range.label}`;
    setStatus('Platform overview refreshed. Unsupported metrics are clearly marked unavailable.');
    return data;
  } catch (error) {
    document.querySelectorAll('#adminMetrics [data-value]').forEach((node) => {
      node.textContent = '—';
      const note = node.closest('article')?.querySelector('[data-metric-note]');
      if (note) note.textContent = 'Could not load · use Refresh to retry.';
      node.closest('article')?.removeAttribute('hidden');
    });
    if (metrics) metrics.setAttribute('aria-busy', 'false');
    setStatus(error.message || 'Could not load platform statistics.', true);
    throw error;
  } finally {
    if (refresh) refresh.disabled = false;
  }
}

function renderUserRow(user) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'report-queue-item';
  button.dataset.userId = user.id;
  const title = document.createElement('strong');
  title.textContent = user.display_name || user.username || 'SPIKE member';
  const meta = document.createElement('small');
  meta.textContent = `@${user.username || 'unknown'} · ${user.spike_id || 'No SP ID'} · ${user.role} · ${user.is_verified ? 'Verified' : 'Not verified'}`;
  const status = document.createElement('small');
  status.textContent = `${user.account_status} · Joined ${new Date(user.created_at).toLocaleDateString()}`;
  button.append(title, meta, status);
  return button;
}

async function loadUsers(append = false) {
  if (state.loadingUsers) return;
  state.loadingUsers = true;
  const list = $('userList');
  const status = $('userListStatus');
  if (!append) { state.userOffset = 0; state.users = []; list?.replaceChildren(); }
  if (status) status.textContent = 'Loading account directory…';
  try {
    let query = supabase.from('profiles')
      .select('id,username,display_name,spike_id,role,account_status,is_verified,created_at,updated_at,bio,avatar_path,cover_path,website,location,suspension_started_at,suspension_expires_at,suspension_reason,suspension_issued_by')
      .order('created_at', { ascending: false })
      .range(state.userOffset, state.userOffset + state.limit - 1);
    const filter = $('userFilter')?.value || 'all';
    if (['active', 'suspended', 'banned', 'deletion_pending'].includes(filter)) query = query.eq('account_status', filter);
    if (filter === 'admin' || filter === 'moderator') query = query.eq('role', filter);
    const term = escapeLike($('userSearch')?.value || '');
    if (term) query = query.or(`username.ilike.%${term}%,display_name.ilike.%${term}%,spike_id.ilike.%${term}%`);
    const { data, error } = await withTimeout(query);
    if (error) throw error;
    const rows = data || [];
    state.users = append ? [...state.users, ...rows] : rows;
    rows.forEach((user) => list?.append(renderUserRow(user)));
    state.userOffset += rows.length;
    state.userHasMore = rows.length === state.limit;
    if ($('userLoadMore')) $('userLoadMore').hidden = !state.userHasMore;
    if (status) {
      const accountWord = state.users.length === 1 ? 'account' : 'accounts';
      status.textContent = `${state.users.length.toLocaleString()} ${accountWord} loaded`;
      const onlyOwnerAccount = state.users.length === 1 && String(state.users[0]?.id || '') === String(state.user?.id || '');
      if (onlyOwnerAccount && !term && filter === 'all' && !state.userHasMore) {
        status.textContent += ' · Only your owner account currently has a profile. Other members’ account controls will appear here as soon as their profiles are registered.';
      }
    }
    if ($('userCountLabel')) $('userCountLabel').textContent = `${state.users.length.toLocaleString()} ${state.users.length === 1 ? 'account' : 'accounts'}`;
    if (!state.users.length && status) status.textContent = term || filter !== 'all' ? 'No accounts match this search or filter.' : 'No member profiles are available yet.';
  } catch (error) { if (status) status.textContent = error.message || 'Could not load account directory.'; throw error; }
  finally { state.loadingUsers = false; }
}

async function renderUserDetail(user) {
  if (state.suspensionCountdownTimer) { window.clearInterval(state.suspensionCountdownTimer); state.suspensionCountdownTimer = null; }
  state.selectedUser = user;
  const panel = $('userDetail');
  if (!panel) return;
  panel.replaceChildren();
  const heading = document.createElement('h3'); heading.textContent = user.display_name || user.username || 'SPIKE member';
  const headRow = document.createElement('div'); headRow.className = 'admin-detail-heading';
  const closeDetail = document.createElement('button'); closeDetail.type = 'button'; closeDetail.className = 'admin-close-button'; closeDetail.textContent = '× Close user'; closeDetail.addEventListener('click', () => { if(state.suspensionCountdownTimer){window.clearInterval(state.suspensionCountdownTimer);state.suspensionCountdownTimer=null;} state.selectedUser = null; panel.closest('.user-workspace')?.classList.remove('has-selected-user'); panel.innerHTML = '<div class="user-empty"><span class="user-empty-icon">👤</span><strong>Select a user</strong><p>Choose an account to inspect its profile, wallet and moderation context.</p></div>'; });
  headRow.append(heading, closeDetail);
  panel.closest('.user-workspace')?.classList.add('has-selected-user');
  const identity = document.createElement('p'); identity.className='user-detail-identity'; identity.textContent = `@${user.username || 'unknown'} · SP ID: ${user.spike_id || 'Not assigned'}`;
  const status = document.createElement('p'); status.textContent = `Account: ${user.account_status} · Role: ${user.role} · Verification: ${user.is_verified ? 'Verified' : 'Not verified'} · Joined: ${new Date(user.created_at).toLocaleString()}${user.account_status === 'suspended' && user.suspension_started_at ? ` · Suspended: ${new Date(user.suspension_started_at).toLocaleString()}` : ''}${user.account_status === 'suspended' && user.suspension_expires_at ? ` · Expires: ${new Date(user.suspension_expires_at).toLocaleString()}` : ''}`;
  const actions = document.createElement('div'); actions.className = 'report-detail-actions';
  const isOwner = String(state.user?.email || '').trim().toLowerCase() === 'eletexjoeytex@gmail.com';
  const addAction = (label, fn, extraClass='') => { const b=document.createElement('button'); b.type='button'; b.className=`admin-refresh ${extraClass}`.trim(); b.textContent=label; b.addEventListener('click',fn); actions.append(b); return b; };
  const isSelectedOwnerAccount = String(user.id || '').toLowerCase() === String(state.user?.id || '').toLowerCase();
  if (isOwner && !isSelectedOwnerAccount) {
    if (user.is_verified || user.account_status === 'active') addAction(user.is_verified ? 'Remove verified badge' : 'Mark as verified', async (event) => {
      const reason=await window.spikeDialog.prompt(`${user.is_verified?'Reason for removing verification':'Reason for granting verification'} (required):`,{title:user.is_verified?'Remove verification':'Grant verification',placeholder:'Enter the reason (at least 3 characters)',required:true,confirmText:'Continue'});
      if(!reason || reason.trim().length<3) return;
      const button=event.currentTarget; button.disabled=true;
      try { const {data,error}=await withTimeout(supabase.rpc('spike_admin_set_user_verified',{p_user_id:user.id,p_verified:!user.is_verified,p_reason:reason.trim()})); if(error) throw error; if(data?.ok!==true) throw new Error('The server did not confirm the verification change.'); user.is_verified=!user.is_verified; status.textContent=`Account: ${user.account_status} · Role: ${user.role} · Verification: ${user.is_verified?'Verified':'Not verified'} · Joined: ${new Date(user.created_at).toLocaleString()}`; button.textContent=user.is_verified?'Remove verified badge':'Mark as verified'; setStatus(`User ${user.is_verified?'verified':'verification removed'} successfully.`); await loadOverview(); } catch(e){setStatus(e.message||'Verification update failed.',true);button.disabled=false;}
    });
    const changeAccountStatus = async (next, label, button) => {
      let durationHours = null;
      if (next === 'suspended') {
        const rawDuration = await window.spikeDialog.prompt('Enter suspension duration in hours (1–720). Example: 168 = 7 days.',{title:'Suspension duration',placeholder:'168',required:true,confirmText:'Continue',tone:'danger'});
        if (rawDuration === null || !String(rawDuration).trim()) return;
        durationHours = Number(rawDuration);
        if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 720) {
          setStatus('Suspension duration must be a whole number between 1 and 720 hours.',true);
          return;
        }
      }
      const reason=await window.spikeDialog.prompt(`Reason for ${label.toLowerCase()} (required):`,{title:label,placeholder:'Explain the policy or safety reason',required:true,confirmText:label,tone:next==='active'?'success':'danger'});
      if(!reason || !reason.trim()) return;
      button.disabled=true;
      try {
        const {data,error}=await withTimeout(supabase.rpc('spike_admin_set_account_status',{p_user_id:user.id,p_status:next,p_reason:reason.trim(),p_duration_hours:durationHours}));
        if(error) throw error;
        if(data?.ok!==true) throw new Error('The server did not confirm the account change.');
        user.account_status=next;
        user.suspension_started_at=data.suspension_started_at || null;
        user.suspension_expires_at=data.suspension_expires_at || null;
        user.suspension_reason=next==='suspended'?reason.trim():null;
        status.textContent=`Account: ${next} · Role: ${user.role} · Verification: ${user.is_verified?'Verified':'Not verified'} · Joined: ${new Date(user.created_at).toLocaleString()}${next==='suspended' && data.suspension_expires_at ? ` · Expires: ${new Date(data.suspension_expires_at).toLocaleString()}` : ''}`;
        setStatus(`Account status updated: ${next.replaceAll('_',' ')}${next==='suspended'?' with a '+durationHours+'-hour expiry':''}.`);
        await loadUsers(false); await loadOverview();
      } catch(e){setStatus(e.message||'Account action failed.',true);button.disabled=false;}
    };
    if (user.account_status === 'active') {
      addAction('Suspend account', (event) => changeAccountStatus('suspended','Suspend account',event.currentTarget),'danger-button');
      addAction('Permanently ban', (event) => changeAccountStatus('banned','Permanently ban account',event.currentTarget),'danger-button');
    } else if (user.account_status === 'suspended' || user.account_status === 'banned') {
      addAction(user.account_status === 'banned' ? 'Review ban / restore account' : 'Revoke suspension / restore account', (event) => changeAccountStatus('active','Restore account',event.currentTarget));
      if (user.account_status === 'suspended') addAction('Convert suspension to permanent ban', (event) => changeAccountStatus('banned','Permanently ban account',event.currentTarget),'danger-button');
    } else if (user.account_status === 'deletion_pending') {
      const pending=document.createElement('p'); pending.className='user-hint'; pending.textContent='Deletion is pending. The account is restricted while financial, legal-retention and storage cleanup checks are completed.'; actions.append(pending);
    }
    if (user.account_status !== 'deletion_pending') {
      addAction('Start permanent deletion review', async (event) => {
        const reason=await window.spikeDialog.prompt('This starts a deletion review and restricts the account. It does NOT immediately erase authentication, storage or legally retained financial records. Reason required:',{title:'Start permanent deletion review',placeholder:'Reason for deletion',required:true,confirmText:'Start deletion review',tone:'danger'});
        if(!reason || reason.trim().length<5) return;
        const button=event.currentTarget;button.disabled=true;
        try { const {data,error}=await withTimeout(supabase.rpc('spike_admin_request_account_deletion',{p_user_id:user.id,p_reason:reason.trim()})); if(error)throw error;if(data?.ok!==true)throw new Error('The server did not confirm the deletion review.');user.account_status='deletion_pending';status.textContent=`Account: deletion pending · Role: ${user.role} · Verification: No`;setStatus('Deletion review started. Permanent erasure has not yet occurred.');await loadUsers(false);await loadOverview(); }
        catch(e){setStatus(e.message||'Could not start deletion review.',true);button.disabled=false;}
      },'danger-button');
    }
  }
  const profileLink=document.createElement('a'); profileLink.className='admin-refresh'; profileLink.href=`user-profile.html?uid=${encodeURIComponent(user.id)}`; profileLink.textContent='Open public profile'; actions.append(profileLink);
  const tabs=document.createElement('div'); tabs.className='detail-tabs';
  const content=document.createElement('div'); content.className='user-detail-content';
  const tabNames=['Overview','Activity timeline','Subscriptions','Wallet','Moderation','Account controls'];
  const panels={};
  tabNames.forEach((name,i)=>{const b=document.createElement('button');b.type='button';b.className=`detail-tab${i===0?' is-active':''}`;b.textContent=name;b.addEventListener('click',()=>{tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('is-active',x===b));Object.entries(panels).forEach(([k,v])=>v.hidden=k!==name);});tabs.append(b);const section=document.createElement('section');section.hidden=i!==0;panels[name]=section;content.append(section);});
  const addInfo=(parent,label,value)=>{const d=document.createElement('div');const sm=document.createElement('small');sm.textContent=label;const st=document.createElement('strong');st.textContent=value??'—';d.append(sm,st);parent.append(d);};
  const overview=panels.Overview; const grid=document.createElement('div');grid.className='user-info-grid';
  addInfo(grid,'Display name',user.display_name);addInfo(grid,'Username',`@${user.username||'unknown'}`);addInfo(grid,'SP ID',user.spike_id);addInfo(grid,'Account status',user.account_status);addInfo(grid,'Role',user.role);addInfo(grid,'Verified badge',user.is_verified?'Yes':'No');addInfo(grid,'Location',user.location);addInfo(grid,'Website',user.website);addInfo(grid,'Bio',user.bio);addInfo(grid,'User ID',user.id);addInfo(grid,'Joined',new Date(user.created_at).toLocaleString());overview.append(grid);
  const activity=panels['Activity timeline']; activity.textContent='Loading complete activity timeline…';
  const subscriptionPanel=panels.Subscriptions; subscriptionPanel.textContent='Loading subscription status…';
  const walletPanel=panels.Wallet; walletPanel.textContent='Loading wallet and ledger…';
  const moderation=panels.Moderation; moderation.textContent='Loading moderation context…';
  const controls=panels['Account controls'];
  if (user.account_status === 'suspended' && user.suspension_started_at && user.suspension_expires_at) {
    const suspensionCard=document.createElement('div');suspensionCard.className='user-action-block';
    const suspensionTitle=document.createElement('strong');suspensionTitle.textContent='Active temporary suspension';
    const started=document.createElement('p');started.textContent=`Started: ${new Date(user.suspension_started_at).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Lagos'})}`;
    const expires=document.createElement('p');expires.textContent=`Scheduled expiry: ${new Date(user.suspension_expires_at).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Lagos'})}`;
    const countdown=document.createElement('p');countdown.className='user-hint';countdown.setAttribute('aria-live','polite');
    const updateCountdown=()=>{const remaining=new Date(user.suspension_expires_at).getTime()-Date.now();if(!Number.isFinite(remaining)){countdown.textContent='Expiry countdown unavailable.';return;}if(remaining<=0){countdown.textContent='Expiry time reached · waiting for server-side expiry processing.';return;}const total=Math.floor(remaining/1000);const days=Math.floor(total/86400);const hours=Math.floor((total%86400)/3600);const minutes=Math.floor((total%3600)/60);const seconds=total%60;countdown.textContent=`Time remaining: ${days}d ${hours}h ${minutes}m ${seconds}s`;};
    updateCountdown();state.suspensionCountdownTimer=window.setInterval(updateCountdown,1000);
    const reason=document.createElement('p');reason.textContent=`Reason: ${user.suspension_reason||'Not supplied'}`;
    suspensionCard.append(suspensionTitle,started,expires,countdown,reason);controls.append(suspensionCard);
  }
  const controlNote=document.createElement('p');controlNote.className='user-hint';
  if (!isOwner) {
    controlNote.textContent='Restricted: account suspension, bans, restoration, verification changes and deletion reviews are available only to the designated SPIKE owner. No account changes can be made from this session.';
  } else if (isSelectedOwnerAccount) {
    controlNote.textContent='Owner account protection is active. You are viewing your own administrator account, so self-suspension, self-ban, self-restoration, verification changes and deletion review are disabled. Select another member from the account directory to manage their account.';
  } else {
    controlNote.textContent='Owner controls for this member. Choose an action below and provide a reason. Each successful status or verification decision is recorded in the protected audit trail.';
  }
  controls.append(controlNote,actions);
  const backToDirectory=document.createElement('button');backToDirectory.type='button';backToDirectory.className='admin-close-button user-back-directory';backToDirectory.textContent='← Back to user list';backToDirectory.addEventListener('click',()=>{if(state.suspensionCountdownTimer){window.clearInterval(state.suspensionCountdownTimer);state.suspensionCountdownTimer=null;}state.selectedUser=null;panel.closest('.user-workspace')?.classList.remove('has-selected-user');panel.innerHTML='<div class="user-empty"><span class="user-empty-icon">👤</span><strong>Select a user</strong><p>Choose an account to inspect its profile, wallet and moderation context.</p></div>';});
  panel.append(backToDirectory,headRow,identity,status,tabs,content);
  const [posts,comments,messages,roomMessages,wallet,ledger,reported,reportsAgainst,audit,verificationHistory,timeline,suspensionHistory,subscription]=await withTimeout(Promise.all([
    supabase.rpc('spike_admin_get_user_activity',{p_user_id:user.id}),
    Promise.resolve({data:null,error:null}),
    Promise.resolve({data:null,error:null}),
    Promise.resolve({data:null,error:null}),
    supabase.from('wallet_accounts').select('currency,available_balance,pending_balance').eq('user_id',user.id).maybeSingle(),
    supabase.from('wallet_ledger').select('entry_type,amount,currency,status,description,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(15),
    supabase.from('reports').select('id',{count:'exact',head:true}).eq('reporter_id',user.id),
    supabase.from('reports').select('id',{count:'exact',head:true}).eq('target_id',user.id),
    supabase.rpc('spike_admin_get_account_actions',{p_user_id:user.id}),
    supabase.rpc('spike_admin_get_verification_actions',{p_user_id:user.id}),
    supabase.rpc('spike_admin_get_user_timeline',{p_user_id:user.id,p_limit:150}),
    supabase.rpc('spike_admin_get_suspension_history',{p_user_id:user.id,p_limit:50}),
    supabase.from('spike_verified_subscriptions').select('plan_sku,status,starts_at,valid_until,updated_at').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(1).maybeSingle()
  ]));
  const activityGrid=document.createElement('div');activityGrid.className='user-info-grid';
  const activityData=posts.data||{};
  [['Posts',activityData.posts],['Comments',activityData.comments],['Direct messages sent',activityData.direct_messages],['Room messages sent',activityData.room_messages]].forEach(([label,value])=>addInfo(activityGrid,label,posts.error?'Unavailable':Number(value||0).toLocaleString()));
  const timelineHead=document.createElement('div');timelineHead.className='admin-detail-heading';const timelineTitle=document.createElement('h4');timelineTitle.textContent='Latest account events';const timelineRefresh=document.createElement('button');timelineRefresh.type='button';timelineRefresh.className='admin-refresh';timelineRefresh.textContent='↻ Refresh';timelineRefresh.addEventListener('click',async()=>{timelineRefresh.disabled=true;try{const {data,error}=await withTimeout(supabase.rpc('spike_admin_get_user_timeline',{p_user_id:user.id,p_limit:150}));if(error)throw error;renderTimeline(data);}catch(e){timelineStatus.textContent=e.message||'Timeline refresh failed.';timelineStatus.dataset.state='error';}finally{timelineRefresh.disabled=false;}});timelineHead.append(timelineTitle,timelineRefresh);
  const timelineStatus=document.createElement('p');timelineStatus.className='verify-note';const timelineList=document.createElement('div');timelineList.className='verify-history spike-user-timeline';
  const renderTimeline=(rows)=>{timelineList.replaceChildren();const events=Array.isArray(rows)?rows:[];if(!events.length){timelineList.textContent='No recorded timeline events for this account yet.';timelineStatus.textContent=timeline.error?'Timeline unavailable.':'Showing the latest recorded events. New events appear as they are recorded.';return;}events.forEach(e=>{const item=document.createElement('article');item.className='verify-history-item spike-timeline-item';const top=document.createElement('div');top.className='admin-detail-heading';const who=document.createElement('strong');who.textContent=`@${user.username||'unknown'}`;top.append(who);if(user.is_verified){const badge=document.createElement('span');badge.className='spike-activity-verified';badge.textContent='✓ Verified';top.append(badge);}const title=document.createElement('p');title.textContent=e.title||'Account activity';const meta=document.createElement('small');meta.textContent=`${String(e.category||'activity').replaceAll('_',' ')} · ${new Date(e.created_at).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'})}${e.status?` · ${String(e.status).replaceAll('_',' ')}`:''}`;item.append(top,title,meta);timelineList.append(item);});timelineStatus.textContent=`${events.length} latest recorded event(s). Activity capture starts with this rollout; older events that were never logged cannot be reconstructed. Private message contents, identity documents and payout details are never shown.`;};
  renderTimeline(timeline.data);activity.replaceChildren(activityGrid,timelineHead,timelineStatus,timelineList);
  if(subscription.error){subscriptionPanel.textContent=`Subscription status unavailable: ${subscription.error.message}`;}else if(!subscription.data){subscriptionPanel.textContent='No verified subscription record is stored for this account.';}else{const sub=subscription.data;const subGrid=document.createElement('div');subGrid.className='user-info-grid';addInfo(subGrid,'Plan',String(sub.plan_sku||'—').replaceAll('_',' '));addInfo(subGrid,'Status',sub.status||'—');addInfo(subGrid,'Starts',sub.starts_at?new Date(sub.starts_at).toLocaleString('en-NG'):'—');addInfo(subGrid,'Expires',sub.valid_until?new Date(sub.valid_until).toLocaleString('en-NG'):'—');const remaining=document.createElement('p');remaining.className='verify-note';const days=Math.max(0,Math.ceil((new Date(sub.valid_until).getTime()-Date.now())/86400000));remaining.textContent=sub.status==='active'&&sub.valid_until?`${days} day(s) remaining on this subscription.`:'This subscription is not currently active.';subscriptionPanel.replaceChildren(subGrid,remaining);}
  if(wallet.error) walletPanel.textContent=`Wallet unavailable: ${wallet.error.message}`; else if(!wallet.data) walletPanel.textContent='No wallet account exists.'; else {const balance=document.createElement('div');balance.className='user-balance-card';const small=document.createElement('small');small.textContent=wallet.data.currency;const strong=document.createElement('strong');strong.textContent=Number(wallet.data.available_balance).toLocaleString();const span=document.createElement('span');span.textContent=`Available · ${Number(wallet.data.pending_balance).toLocaleString()} pending`;balance.append(small,strong,span);const table=document.createElement('div');table.className='user-table-wrap';const rows=ledger.data||[];const tableEl=document.createElement('table');tableEl.className='user-table';tableEl.innerHTML='<thead><tr><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>';const tbody=document.createElement('tbody');rows.forEach(r=>{const tr=document.createElement('tr');[r.entry_type,`${r.currency} ${Number(r.amount).toLocaleString()}`,r.status,new Date(r.created_at).toLocaleString()].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td)});tbody.append(tr)});tableEl.append(tbody);table.append(tableEl);walletPanel.replaceChildren(balance,document.createElement('h4'),table);walletPanel.querySelector('h4').textContent='Recent ledger activity';}
  const modGrid=document.createElement('div');modGrid.className='user-info-grid';addInfo(modGrid,'Reports submitted',posts.error?'Unavailable':String(activityData.reports_submitted||0));addInfo(modGrid,'Reports targeting this user',posts.error?'Unavailable':String(activityData.reports_targeting_user||0));moderation.replaceChildren(modGrid);
  const history=document.createElement('div');history.className='verify-history';const events=Array.isArray(audit.data)?audit.data:[];events.forEach(e=>{const item=document.createElement('div');item.className='verify-history-item';const t=document.createElement('strong');t.textContent=`${String(e.action||'').replaceAll('_',' ')} · ${e.previous_status} → ${e.new_status}`;const d=document.createElement('small');d.textContent=`${e.reason} · ${new Date(e.created_at).toLocaleString()}`;item.append(t,d);history.append(item)});if(!events.length)history.textContent=audit.error?'Account action history unavailable.':'No account status actions recorded.';moderation.append(document.createElement('h4'));moderation.querySelector('h4').textContent='Account action history';moderation.append(history);
  const suspensionHeading=document.createElement('h4');suspensionHeading.textContent='Suspension history';moderation.append(suspensionHeading);
  const suspensionHistoryList=document.createElement('div');suspensionHistoryList.className='verify-history';
  const suspensionEvents=Array.isArray(suspensionHistory.data)?suspensionHistory.data:[];
  suspensionEvents.forEach(e=>{const item=document.createElement('div');item.className='verify-history-item';const title=document.createElement('strong');title.textContent=String(e.event_type||'suspension event').replaceAll('_',' ');const details=document.createElement('small');const start=e.started_at?new Date(e.started_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos'}):'—';const expiry=e.expires_at?new Date(e.expires_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos'}):'—';details.textContent=`${e.reason} · Started: ${start} · Expires: ${expiry} · Recorded: ${new Date(e.created_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos'})} · By: ${e.actor_email||'Unknown'}`;item.append(title,details);suspensionHistoryList.append(item);});
  if(!suspensionEvents.length)suspensionHistoryList.textContent=suspensionHistory.error?'Suspension history unavailable.':'No suspension events recorded for this account.';
  moderation.append(suspensionHistoryList);
  const vHistory=document.createElement('div');vHistory.className='verify-history';(Array.isArray(verificationHistory.data)?verificationHistory.data:[]).forEach(e=>{const item=document.createElement('div');item.className='verify-history-item';const t=document.createElement('strong');t.textContent=e.action==='verified'?'Verified':'Verification removed';const d=document.createElement('small');d.textContent=`${e.reason} · ${new Date(e.created_at).toLocaleString()}`;item.append(t,d);vHistory.append(item)});if(!vHistory.children.length)vHistory.textContent='No verification decisions recorded.';moderation.append(document.createElement('h4'));moderation.lastChild.textContent='Verification history';moderation.append(vHistory);
}

function setVerifiedActivityStatus(message,isError=false){const n=$('verifiedActivityStatus');if(n){n.textContent=message;n.dataset.state=isError?'error':'ok';}}
async function loadVerifiedActivity(){
  setVerifiedActivityStatus('Loading verified-user activity…');
  const {data,error}=await withTimeout(supabase.rpc('spike_admin_get_verified_activity',{p_limit:150,p_search:escapeLike($('verifiedActivitySearch')?.value||''),p_category:$('verifiedActivityCategory')?.value||'all'}));
  if(error)throw error;
  const rows=Array.isArray(data)?data:[];const host=$('verifiedActivityFeed');if(!host)return;host.replaceChildren();
  if(!rows.length){const empty=document.createElement('p');empty.className='report-empty';empty.textContent='No recorded activity found for currently verified accounts.';host.append(empty);setVerifiedActivityStatus('0 activity events found. Events begin recording after the migration is applied.');return;}
  rows.forEach(row=>{
    const item=document.createElement('article');item.className='verify-history-item';
    const head=document.createElement('div');head.className='admin-detail-heading';
    const user=document.createElement('strong');user.textContent=`@${row.username||'unknown'}`;
    const badge=document.createElement('span');badge.className='spike-activity-verified';badge.textContent='✓ Verified';
    head.append(user,badge);
    const activity=document.createElement('p');activity.textContent=row.event_type||'Account activity';
    const category=document.createElement('small');category.className='verify-note';category.textContent=({content:'Content',social:'Social',membership:'Membership',profile:'Profile'}[row.category]||'Activity');
    const when=document.createElement('small');when.textContent=new Date(row.created_at).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'});
    item.append(head,activity,category,when);host.append(item);
  });
  setVerifiedActivityStatus(`${rows.length} recent activity event(s) · only currently verified, active accounts are shown.`);
}

function setVerificationStatus(message,isError=false){const n=$('verifyListStatus');if(n){n.textContent=message;n.dataset.state=isError?'error':'ok';}}
let verificationUsers=[];
async function loadVerificationUsers(){
  setVerificationStatus('Loading account verification records…');
  const {data,error}=await withTimeout(supabase.rpc('spike_admin_list_verification_users',{p_filter:$('verifyFilter')?.value||'all',p_search:escapeLike($('verifySearch')?.value||'')}));
  if(error) throw error;
  verificationUsers=Array.isArray(data?.users)?data.users:[];
  const list=$('verifyList');list?.replaceChildren();
  verificationUsers.forEach(user=>{const b=document.createElement('button');b.type='button';b.className='user-row';b.dataset.verifyUserId=user.id;const av=document.createElement('span');av.className='user-avatar';av.textContent=(user.display_name||user.username||'S').slice(0,1).toUpperCase();const main=document.createElement('span');main.className='user-row-main';const name=document.createElement('strong');name.textContent=user.display_name||user.username||'SPIKE member';const meta=document.createElement('small');meta.textContent=`@${user.username||'unknown'} · ${user.spike_id||'No SP ID'}`;const stateLabel=document.createElement('small');stateLabel.textContent=user.is_verified?'Verified badge active':'Not verified';main.append(name,meta,stateLabel);b.append(av,main);list?.append(b)});
  const [allCount,verifiedCount,unverifiedCount]=await Promise.all([countRows('profiles'),countRows('profiles',q=>q.eq('is_verified',true)),countRows('profiles',q=>q.eq('is_verified',false))]);
  document.querySelectorAll('[data-vstat]').forEach(n=>{const k=n.dataset.vstat;n.textContent=String(k==='all'?allCount:k==='verified'?verifiedCount:k==='unverified'?unverifiedCount:0)});
  if($('verifyCountLabel'))$('verifyCountLabel').textContent=`${verificationUsers.length} accounts`;
  setVerificationStatus(verificationUsers.length?`${verificationUsers.length} accounts loaded. Select an account to grant or remove its verified badge.`:'No accounts match this filter.');
  const detail=$('verifyDetail');if(detail&&!verificationUsers.some(x=>x.id===detail.dataset.userId)){detail.dataset.userId='';detail.innerHTML='<div class="user-empty"><span class="user-empty-icon">🛡️</span><strong>Select an account</strong><p>Review the account and record a reason before granting or removing its verified badge.</p></div>';}
}
function renderVerificationDetail(user){
  const panel=$('verifyDetail');if(!panel)return;panel.dataset.userId=user.id;panel.replaceChildren();
  const h=document.createElement('h3');h.textContent=user.display_name||user.username||'SPIKE member';const close=document.createElement('button');close.type='button';close.className='admin-close-button';close.textContent='× Close details';close.addEventListener('click',()=>{panel.dataset.userId='';panel.innerHTML='<div class="user-empty"><span class="user-empty-icon">🛡️</span><strong>Select an account</strong><p>Review an account verification record.</p></div>';});const meta=document.createElement('p');meta.textContent=`@${user.username||'unknown'} · ${user.spike_id||'No SP ID'} · ${user.account_status}`;const stateLabel=document.createElement('p');stateLabel.textContent=`Verified badge: ${user.is_verified?'Active':'Not active'}`;const head=document.createElement('div');head.className='admin-detail-heading';head.append(h,close);panel.append(head,meta,stateLabel);
  const note=document.createElement('p');note.className='verify-note';note.textContent='This control changes the public SPIKE profile badge. Review submitted identity documents in the private Identity application queue before approving a user identity.';panel.append(note);
  if(user.id===state.user?.id||user.email==='eletexjoeytex@gmail.com'){const p=document.createElement('p');p.textContent='The owner account is protected from verification changes.';panel.append(p);return;}
  const b=document.createElement('button');b.type='button';b.className='admin-refresh';b.textContent=user.is_verified?'Remove verified badge':'Grant verified badge';b.addEventListener('click',async()=>{const reason=await window.spikeDialog.prompt(`${user.is_verified?'Reason for removing the verified badge':'Reason for granting the verified badge'} (required):`,{title:user.is_verified?'Remove verified badge':'Grant verified badge',placeholder:'Enter the reason (at least 3 characters)',required:true,confirmText:'Continue'});if(!reason||reason.trim().length<3)return;b.disabled=true;try{const {data,error}=await withTimeout(supabase.rpc('spike_admin_set_user_verified',{p_user_id:user.id,p_verified:!user.is_verified,p_reason:reason.trim()}));if(error)throw error;if(data?.ok!==true)throw new Error('Server did not confirm this decision.');user.is_verified=!user.is_verified;stateLabel.textContent=`Verified badge: ${user.is_verified?'Active':'Not active'}`;b.textContent=user.is_verified?'Remove verified badge':'Grant verified badge';setStatus(`Verification ${user.is_verified?'granted':'removed'} for @${user.username}.`);await loadVerificationUsers();await loadOverview();}catch(e){setVerificationStatus(e.message||'Verification action failed.',true);b.disabled=false;}});panel.append(b);
}

let financialRows = { identity_verification: [], withdrawals: [] };
function setFinancialStatus(message, isError=false) { const n=$('financialQueueStatus'); if(n){n.textContent=message;n.dataset.state=isError?'error':'ok';} }
async function loadFinancialRequests() {
  setFinancialStatus('Loading private identity and payout queues…');
  const filter=$('financialStatusFilter')?.value||'pending_review';
  const {data,error}=await withTimeout(supabase.rpc('spike_admin_list_financial_requests',{p_kind:'all',p_status:filter}),15000);
  if(error) throw error;
  financialRows={identity_verification:Array.isArray(data?.identity_verification)?data.identity_verification:[],withdrawals:Array.isArray(data?.withdrawals)?data.withdrawals:[]};
  renderFinancialLists();
  setFinancialStatus(`${financialRows.identity_verification.length} identity request(s) · ${financialRows.withdrawals.length} withdrawal request(s) loaded. Sensitive details are visible only in this owner session.`);
}
function renderFinancialLists(){
  const identity=$('identityRequestList'),withdrawals=$('withdrawalRequestList');
  for(const [host,rows,kind] of [[identity,financialRows.identity_verification,'identity'],[withdrawals,financialRows.withdrawals,'withdrawal']]){
    if(!host)continue;host.replaceChildren();
    if(!rows.length){const empty=document.createElement('p');empty.className='report-empty';empty.textContent='No requests in this status.';host.append(empty);continue;}
    rows.forEach(row=>{const b=document.createElement('button');b.type='button';b.className='report-queue-item';b.dataset.financialId=row.id;b.dataset.financialKind=kind;const title=document.createElement('strong');title.textContent=kind==='identity'?`${row.document_type.replaceAll('_',' ')} · Identity application`:`₦${Number(row.amount_ngn).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})} · Withdrawal`;const meta=document.createElement('small');meta.textContent=`${row.user_id} · ${row.status.replaceAll('_',' ')} · ${new Date(row.created_at).toLocaleString()}`;b.append(title,meta);host.append(b);});
  }
  const ic=$('identityRequestCount'),wc=$('withdrawalRequestCount');if(ic)ic.textContent=String(financialRows.identity_verification.length);if(wc)wc.textContent=String(financialRows.withdrawals.length);
}
async function renderFinancialDetail(kind,id){
  const row=(kind==='identity'?financialRows.identity_verification:financialRows.withdrawals).find(x=>x.id===id);const panel=$('financialRequestDetail');if(!row||!panel)return;panel.replaceChildren();
  const close=document.createElement('button');close.type='button';close.className='admin-close-button';close.textContent='× Close details';close.addEventListener('click',()=>{panel.replaceChildren();const e=document.createElement('p');e.className='report-empty';e.textContent='Select a request to inspect its details.';panel.append(e);});panel.append(close);
  const h=document.createElement('h3');h.textContent=kind==='identity'?'Identity verification application':'Creator withdrawal request';panel.append(h);
  const add=(label,value)=>{const p=document.createElement('p');p.textContent=`${label}: ${value??'—'}`;panel.append(p);};
  add('Request ID',row.id);add('User ID',row.user_id);add('Submitted',new Date(row.created_at).toLocaleString());add('Status',row.status.replaceAll('_',' '));
  if(kind==='identity'){
    add('Document type',row.document_type.replaceAll('_',' '));add('Applicant note',row.applicant_note||'None');
    const preview=document.createElement('div');preview.className='verify-note';preview.textContent='Creating a short-lived private document link…';panel.append(preview);
    try{const {data,error}=await supabase.storage.from('identity-documents').createSignedUrl(row.document_storage_path,300);if(error)throw error;const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open identity document (5-minute secure link)';preview.replaceChildren(a);}catch(e){preview.textContent=`Document preview unavailable: ${e.message||'Storage access failed.'}`;}
  }else{
    add('Amount',`₦${Number(row.amount_ngn).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}`);add('Bank',row.payout_details?.bank_name);add('Account name',row.payout_details?.account_name);add('Account number',row.payout_details?.account_number);add('User note',row.user_note||'None');add('Payment reference',row.payment_reference||'Not paid');
  }
  if(row.admin_note)add('Previous admin note',row.admin_note);
  const historyTitle=document.createElement('h4');historyTitle.textContent='Review history';panel.append(historyTitle);
  const history=document.createElement('div');history.className='verify-history';
  (Array.isArray(row.review_events)?row.review_events:[]).forEach(ev=>{const item=document.createElement('div');item.className='verify-history-item';const t=document.createElement('strong');t.textContent=String(ev.decision||'review').replaceAll('_',' ');const d=document.createElement('small');d.textContent=`${ev.admin_note||'No note'} · ${new Date(ev.created_at).toLocaleString()}`;item.append(t,d);history.append(item);});
  if(!history.children.length)history.textContent='No review actions recorded yet.';panel.append(history);
  const actions=document.createElement('div');actions.className='verify-actions';
  let choices=[];
  if(kind==='identity'&&row.status==='pending_review')choices=[['approved','Approve identity'],['rejected','Reject'],['needs_resubmission','Request resubmission']];
  if(kind==='withdrawal'&&row.status==='pending_review')choices=[['approved','Approve'],['rejected','Reject & release reserve']];
  if(kind==='withdrawal'&&row.status==='approved')choices=[['processing','Mark processing'],['rejected','Reject & release reserve']];
  if(kind==='withdrawal'&&row.status==='processing')choices=[['paid','Mark paid'],['rejected','Reject & release reserve']];
  choices.forEach(([decision,label])=>{const b=document.createElement('button');b.type='button';b.className=decision==='rejected'?'verify-danger':decision==='approved'?'verify-approve':'';b.textContent=label;b.addEventListener('click',async()=>{let note=await window.spikeDialog.prompt('Add an internal review note (optional):',{title:label,placeholder:'Reason or processing note',required:false,confirmText:'Confirm decision'});if(note===null)return;let reference=null;if(kind==='withdrawal'&&decision==='paid'){reference=await window.spikeDialog.prompt('Enter the confirmed bank transfer reference:',{title:'Confirm payout',placeholder:'Bank transfer reference',required:true,confirmText:'Record payment'});if(!reference)return;}b.disabled=true;try{const {data,error}=await withTimeout(supabase.rpc('spike_admin_review_financial_request',{p_kind:kind==='identity'?'identity':'withdrawal',p_request_id:id,p_decision:decision,p_admin_note:note||null,p_payment_reference:reference}),15000);if(error)throw error;if(data!==true)throw new Error('The server did not confirm this review action.');await Promise.all([loadFinancialRequests(),loadOverview()]);panel.replaceChildren();setFinancialStatus(`${label} completed for request ${id}.`);}catch(e){setFinancialStatus(e.message||'Review action failed.',true);b.disabled=false;}});actions.append(b);});
  if(choices.length)panel.append(actions);
}

function renderReportRow(report, reporter, duplicateCount = 1) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'report-queue-item';
  button.dataset.reportId = report.id;
  const title = document.createElement('strong');
  title.textContent = `${typeLabels[report.target_type] || 'Report'} · ${report.reason}`;
  const meta = document.createElement('small');
  meta.textContent = `${reporter?.display_name || reporter?.username || 'SPIKE member'} · ${statusLabels[report.status] || report.status} · ${new Date(report.created_at).toLocaleString()}`;
  const target = document.createElement('small');
  target.textContent = `Target ID: ${report.target_id}`;
  if (duplicateCount > 1) {
    const duplicate = document.createElement('small');
    duplicate.className = 'report-duplicate-flag';
    duplicate.textContent = `⚠ ${duplicateCount} reports reference this same target in the loaded results`;
    button.append(title, meta, target, duplicate);
  } else {
    button.append(title, meta, target);
  }
  return button;
}

function renderReportDetail(report, reporter) {
  const panel = $('reportDetail');
  if (!panel) return;
  panel.replaceChildren();
  const close = document.createElement('button'); close.type='button'; close.className='admin-close-button'; close.textContent='× Close details'; close.addEventListener('click',()=>panel.innerHTML='<div class="report-empty">Select a report to inspect its evidence and take action.</div>'); panel.append(close);
  const heading = document.createElement('h3');
  heading.textContent = `${typeLabels[report.target_type] || 'Report'} report`;
  const meta = document.createElement('p');
  meta.textContent = `Case ${report.id} · ${statusLabels[report.status] || report.status} · ${new Date(report.created_at).toLocaleString()}`;
  const who = document.createElement('p');
  who.textContent = `Reported by: ${reporter?.display_name || reporter?.username || report.reporter_id}`;
  const reason = document.createElement('p');
  reason.textContent = `Reason: ${report.reason}`;
  const target = document.createElement('p');
  target.textContent = `Target: ${report.target_type} / ${report.target_id}`;
  const details = document.createElement('p');
  details.textContent = report.details || 'No additional details were provided.';
  const reviewMeta = document.createElement('p');
  reviewMeta.className = 'verify-note';
  reviewMeta.textContent = report.reviewed_at
    ? `Last reviewed: ${new Date(report.reviewed_at).toLocaleString()} · Reviewer ID: ${report.reviewed_by || 'Not recorded'}`
    : 'Review history: no review timestamp is recorded yet.';
  panel.append(heading, meta, who, reason, target, details, reviewMeta);
  if (report.status === 'open' || report.status === 'reviewing') {
    const actions = document.createElement('div');
    actions.className = 'report-detail-actions';
    for (const [action, label] of [['reviewing', 'Mark investigating'], ['resolved', 'Resolve'], ['dismissed', 'Dismiss']]) {
      if (action === report.status) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'admin-refresh';
      button.dataset.reportAction = action;
      button.dataset.reportId = report.id;
      button.textContent = label;
      actions.append(button);
    }
    panel.append(actions);
  }
}

async function loadReports(append = false) {
  if (state.loadingReports) return;
  state.loadingReports = true;
  const statusNode = $('reportQueueStatus');
  const list = $('reportQueue');
  if (!append) {
    state.offset = 0;
    state.rows = [];
    list?.replaceChildren();
  }
  if (statusNode) statusNode.textContent = 'Loading report queue…';
  try {
    let query = supabase.from('reports')
      .select('id,reporter_id,target_type,target_id,reason,details,status,reviewed_by,reviewed_at,created_at')
      .order('created_at', { ascending: false })
      .range(state.offset, state.offset + state.limit - 1);
    const status = $('reportStatusFilter')?.value;
    const source = $('reportSourceFilter')?.value;
    const search = escapeLike($('reportSearch')?.value || '');
    if (status) query = query.eq('status', status);
    if (source) query = query.eq('target_type', source);
    if (search) {
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);
      query = query.or(uuid ? `reason.ilike.%${search}%,details.ilike.%${search}%,target_id.eq.${search}` : `reason.ilike.%${search}%,details.ilike.%${search}%`);
    }
    const { data, error } = await withTimeout(query);
    if (error) throw error;
    const rows = data || [];
    const reporterIds = [...new Set(rows.map((row) => row.reporter_id).filter(Boolean))];
    let people = [];
    if (reporterIds.length) {
      const result = await withTimeout(supabase.from('profiles').select('id,username,display_name,spike_id').in('id', reporterIds));
      if (result.error) throw result.error;
      people = result.data || [];
    }
    const byId = new Map(people.map((person) => [person.id, person]));
    state.reporters = new Map([...state.reporters, ...byId]);
    state.rows = append ? [...state.rows, ...rows] : rows;
    const targetCounts = new Map();
    state.rows.forEach((report) => {
      const key = `${report.target_type}:${report.target_id}`;
      targetCounts.set(key, (targetCounts.get(key) || 0) + 1);
    });
    rows.forEach((report) => {
      const key = `${report.target_type}:${report.target_id}`;
      list?.append(renderReportRow(report, state.reporters.get(report.reporter_id), targetCounts.get(key) || 1));
    });
    state.offset += rows.length;
    state.hasMore = rows.length === state.limit;
    const more = $('reportLoadMore');
    if (more) more.hidden = !state.hasMore;
    if (statusNode) statusNode.textContent = `${state.rows.length.toLocaleString()} cases loaded`;
    const stats = $('reportStats');
    if (stats) {
      const countTasks = [
        countRows('reports'),
        countRows('reports', (q) => q.eq('status', 'open')),
        countRows('reports', (q) => q.eq('status', 'reviewing')),
        countRows('reports', (q) => q.eq('status', 'resolved')),
        countRows('reports', (q) => q.gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())),
        countRows('reports', (q) => q.in('status', ['open', 'reviewing']).lt('created_at', new Date(Date.now() - 86400000).toISOString()))
      ];
      // A single unavailable statistic must not take down the report queue or its other metrics.
      const results = await withTimeout(Promise.allSettled(countTasks));
      const keys = ['total', 'open', 'reviewing', 'resolved', 'today', 'overdue'];
      const failed = [];
      stats.querySelectorAll('[data-rstat]').forEach((node) => {
        const index = keys.indexOf(node.dataset.rstat);
        if (index < 0) { node.textContent = 'Unavailable'; return; }
        const result = results[index];
        if (result?.status === 'fulfilled' && Number.isFinite(result.value)) {
          node.textContent = result.value.toLocaleString();
          node.removeAttribute('title');
        } else {
          node.textContent = 'Unavailable';
          node.title = 'This statistic could not be confirmed by the reports backend. It is not assumed to be zero.';
          failed.push(keys[index]);
        }
      });
      if (failed.length && statusNode) statusNode.textContent = `${state.rows.length.toLocaleString()} cases loaded · some statistics unavailable (${failed.join(', ')}).`;
    }
    if (!state.rows.length && statusNode) statusNode.textContent = 'No reports match these filters.';
  } catch (error) { if (statusNode) statusNode.textContent = error.message || 'Could not load report queue.'; throw error; }
  finally { state.loadingReports = false; }
}

async function updateReport(reportId, nextStatus) {
  if (!['reviewing', 'resolved', 'dismissed'].includes(nextStatus)) return;
  const { data, error } = await withTimeout(supabase.from('reports')
    .update({ status: nextStatus, reviewed_by: state.user.id, reviewed_at: new Date().toISOString() })
    .eq('id', reportId)
    .select('id,status')
    .maybeSingle());
  if (error) throw error;
  if (!data) throw new Error('The report could not be updated. Check your admin permissions and MFA status.');
  setStatus(`Report ${statusLabels[nextStatus].toLowerCase()}.`);
  await loadReports(false);
}


function setPurchaseStatus(message, isError = false) {
  const node = $('purchaseStatus'); if (!node) return;
  node.textContent = message; node.dataset.state = isError ? 'error' : 'ok';
}

let purchaseRows = [];
function purchaseCard(order) {
  const card = document.createElement('button'); card.type = 'button'; card.className = 'report-queue-item';
  card.dataset.purchaseId = order.id;
  const title = document.createElement('strong'); title.textContent = `${order.product_name || order.title || order.sku || 'SPIKE purchase'} · ₦${Number(order.amount_ngn || 0).toLocaleString('en-NG')}`;
  const meta = document.createElement('small'); meta.textContent = `${order.order_reference || order.reference || 'No reference'} · ${order.status || 'unknown'}`;
  const who = document.createElement('small'); who.textContent = `${order.display_name || order.username || order.user_email || order.user_id || 'Member'} · ${order.spike_id || 'No SP ID'}`;
  card.append(title, meta, who); return card;
}
function renderPurchaseDetail(order) {
  const host = $('purchaseDetail'); if (!host) return; host.replaceChildren();
  const heading = document.createElement('h3'); heading.textContent = order.product_name || order.title || order.sku || 'Purchase request';
  const headRow = document.createElement('div'); headRow.className = 'admin-detail-heading';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'admin-close-button'; close.textContent = '× Close details'; close.addEventListener('click', () => host.replaceChildren(Object.assign(document.createElement('p'), {className:'report-empty',textContent:'Select a request to inspect payment details and available actions.'})));
  headRow.append(heading, close);
  const info = document.createElement('p'); info.textContent = `Reference: ${order.order_reference || order.reference} · Amount: ₦${Number(order.amount_ngn || 0).toLocaleString('en-NG')} · Status: ${order.status}`;
  const user = document.createElement('p'); user.textContent = `Customer: ${order.display_name || order.username || order.user_email || order.user_id} · SP ID: ${order.spike_id || 'Not available'}`;
  const created = document.createElement('p'); created.textContent = `Created: ${order.created_at ? new Date(order.created_at).toLocaleString() : 'Not supplied'}`;
  host.append(headRow, info, user, created);
  if (!['approved','rejected','cancelled'].includes(order.status)) {
    if (order.status === 'payment_reported') {
      const approve = document.createElement('button'); approve.type = 'button'; approve.className = 'admin-refresh'; approve.textContent = order.product_type === 'verified' || String(order.sku||'').startsWith('verified_') ? 'Approve & activate subscription' : 'Approve & settle';
      approve.addEventListener('click', async () => {
        const confirmed = await window.spikeDialog.confirm(`Approve ${order.product_name || order.title || order.sku || 'this request'} for ₦${Number(order.amount_ngn || 0).toLocaleString('en-NG')}? This will settle the purchase and cannot be casually reversed.`, {title:'Confirm payment approval',confirmText:'Approve & settle',cancelText:'Review again',tone:'success'});
        if (!confirmed) return;
        approve.disabled = true;
        const originalLabel = approve.textContent;
        approve.textContent = 'Processing securely…';
        setPurchaseStatus('Sending approval to SPIKE securely. Please wait…');
        try {
          const { data, error } = await withTimeout(supabase.rpc('spike_admin_approve_purchase', { p_order_id: order.id, p_payment_reference: null }), 15000, 'Approval timed out. Refresh the request before trying again; do not assume it failed.');
          if (error) throw error;
          if (!data || data.ok !== true || data.status !== 'approved') throw new Error('The server did not confirm approval. Refresh the order and verify its status before retrying.');
          setPurchaseStatus(data.already_approved ? 'This request was already approved. The server confirmed its existing status.' : 'Payment approved. Server settlement confirmed; refreshing requests…');
          window.spikeDialog?.success(data.already_approved ? 'This payment request was already approved.' : 'Payment approved and settlement completed successfully.', {title:'SPIKE · Approval successful'});
          await loadPurchases();
          const refreshed = purchaseRows.find(row => row.id === order.id);
          if (refreshed) renderPurchaseDetail(refreshed);
        } catch (e) {
          setPurchaseStatus(e.message || 'Approval failed. No success was reported.', true);
          window.spikeDialog?.error(e.message || 'Approval failed. Refresh the request and try again only after checking its status.', {title:'Approval not completed'});
          approve.disabled = false;
          approve.textContent = originalLabel;
        }
      });
      const reviewNote = document.createElement('p'); reviewNote.className = 'verify-note'; reviewNote.textContent = 'The customer should have sent the order and transfer proof to SPIKE Admin on WhatsApp. Review that WhatsApp conversation, then independently confirm the exact amount and sender credit in the bank statement before approving. A bank transaction reference is optional and is not required to approve.';
      host.append(reviewNote, approve);
    } else {
      const waiting = document.createElement('p'); waiting.textContent = 'Waiting for the customer to send the order and transfer proof to SPIKE Admin on WhatsApp, then report payment here. Verify the WhatsApp conversation and bank statement before approval.'; host.append(waiting);
    }
    const reject = document.createElement('button'); reject.type = 'button'; reject.className = 'admin-refresh'; reject.textContent = 'Reject request';
    reject.addEventListener('click', async () => {
      const reason = await window.spikeDialog.prompt('Provide a clear reason for rejecting this payment request.',{title:'Reject payment request',placeholder:'Rejection reason',required:true,confirmText:'Reject request',tone:'danger'}); if (!reason || !reason.trim()) return;
      reject.disabled = true;
      try {
        const { data, error } = await withTimeout(supabase.rpc('spike_admin_reject_purchase', { p_order_id: order.id, p_reason: reason.trim() }));
        if (error) throw error;
        if (!data || data.ok !== true || data.status !== 'rejected') throw new Error('The server did not confirm rejection. Refresh the order before retrying.');
        setPurchaseStatus('Purchase request rejected by the server.');
        await loadPurchases();
      } catch (e) { setPurchaseStatus(e.message || 'Rejection failed.', true); reject.disabled = false; }
    });
    host.append(reject);
  }
}
async function loadPurchases() {
  setPurchaseStatus('Loading owner payment queue…');
  const { data, error } = await withTimeout(supabase.rpc('spike_admin_list_purchase_orders'), 12000, 'Purchase review backend is unavailable or timed out. Check that the owner purchase RPC migrations are deployed.');
  if (error) throw error;
  purchaseRows = Array.isArray(data) ? data : data?.orders || [];
  const search = String($('purchaseSearch')?.value || '').trim().toLowerCase();
  const coins = $('coinOrderList'), verified = $('verifiedOrderList');
  coins?.replaceChildren(); verified?.replaceChildren();
  const visible = purchaseRows.filter(row => `${row.order_reference||row.reference||''} ${row.product_name||row.title||row.sku||''} ${row.username||''} ${row.spike_id||''} ${row.payment_reference||''}`.toLowerCase().includes(search));
  for (const row of visible) {
    const target = row.product_type === 'verified' || String(row.sku||'').startsWith('verified_') ? verified : coins;
    const filter = target === verified ? $('verifiedOrderFilter')?.value : $('coinOrderFilter')?.value;
    if (filter && filter !== 'all' && row.status !== filter) continue;
    target?.append(purchaseCard(row));
  }
  if (coins && !coins.children.length) coins.textContent = 'No SP Coin purchase requests.';
  if (verified && !verified.children.length) verified.textContent = 'No Verified subscription requests.';
  const count = (key, status) => purchaseRows.filter(x => (key ? x.product_type === key || (key === 'verified' && String(x.sku||'').startsWith('verified_')) : true) && (!status || x.status === status)).length;
  document.querySelectorAll('[data-pstat]').forEach(n => { const k=n.dataset.pstat; const v={coins:count('coin'),coinreported:count('coin','payment_reported'),subs:count('verified'),subreported:count('verified','payment_reported')}; n.textContent=String(v[k] ?? '—'); });
  $('purchaseUpdated') && ($('purchaseUpdated').textContent = `${purchaseRows.length} requests · refreshed ${new Date().toLocaleTimeString()}`);
  setPurchaseStatus(`${purchaseRows.length} purchase requests loaded. Verify each transfer against the bank statement before approval.`);
}


function setPhase14Status(message, isError = false) {
  const node = $('phase14Status'); if (node) { node.textContent = message; node.classList.toggle('is-error', !!isError); }
}
const naira = value => `₦${Number(value || 0).toLocaleString('en-NG', {minimumFractionDigits:2,maximumFractionDigits:2})}`;
let phase14Catalog = [];
function resetPhase14GiftForm() {
  ['p14GiftId','p14GiftKey','p14GiftTitle','p14GiftImage','p14GiftCost'].forEach(id => { const n=$(id); if(n)n.value=''; });
  if ($('p14GiftOrder')) $('p14GiftOrder').value='100';
  if ($('p14GiftActive')) $('p14GiftActive').checked=false;
}
function renderPhase14Catalog() {
  const host=$('phase14GiftList'); if(!host)return; host.replaceChildren();
  if(!phase14Catalog.length){host.textContent='No gift items configured yet.';return;}
  for(const gift of phase14Catalog){
    const row=document.createElement('div'); row.className='user-row';
    const main=document.createElement('span'); main.className='user-row-main';
    const title=document.createElement('strong'); title.textContent=`${gift.title} · ${gift.coin_cost} SP Coins`;
    const meta=document.createElement('small'); meta.textContent=`${gift.gift_key} · ${gift.is_active?'Active':'Inactive'}`;
    main.append(title,meta); const edit=document.createElement('button'); edit.type='button';edit.className='admin-refresh';edit.textContent='Edit';
    edit.addEventListener('click',()=>{ $('p14GiftId').value=gift.id;$('p14GiftKey').value=gift.gift_key;$('p14GiftTitle').value=gift.title;$('p14GiftImage').value=gift.image_url||'';$('p14GiftCost').value=gift.coin_cost;$('p14GiftOrder').value=gift.sort_order;$('p14GiftActive').checked=!!gift.is_active; $('p14GiftTitle').focus(); });
    row.append(main,edit);host.append(row);
  }
}
async function loadPhase14Admin() {
  setPhase14Status('Loading owner-only gift and settlement data…');
  const {data,error}=await withTimeout(supabase.rpc('spike_admin_phase14_overview'),12000,'Owner gift controls timed out.');
  if(error)throw error;if(!data||typeof data!=='object')throw new Error('Invalid owner gift-control response.');
  phase14Catalog=Array.isArray(data.catalog)?data.catalog:[];
  document.querySelectorAll('[data-p14]').forEach(n=>{const key=n.dataset.p14;n.textContent=key.endsWith('_ngn')?naira(data[key]):String(data[key]??'—');});
  $('phase14GiftState').textContent=data.gifts_enabled?'Gifting is ENABLED':'Gifting is PAUSED';
  $('phase14EnableGifts').disabled=true;$('phase14DisableGifts').disabled=!data.gifts_enabled;
  renderPhase14Catalog();setPhase14Status(`Loaded ${phase14Catalog.length} gift items. Withdrawals: ${data.withdrawals_enabled?'enabled':'disabled'}.`);
}
async function savePhase14Gift(event) {
  event.preventDefault();const button=$('phase14GiftForm')?.querySelector('[type="submit"]');if(button)button.disabled=true;
  try {
    const args={p_gift_id:$('p14GiftId').value||null,p_gift_key:$('p14GiftKey').value.trim(),p_title:$('p14GiftTitle').value.trim(),p_image_url:$('p14GiftImage').value.trim()||null,p_coin_cost:Number($('p14GiftCost').value),p_is_active:$('p14GiftActive').checked,p_sort_order:Number($('p14GiftOrder').value||100)};
    const {error}=await withTimeout(supabase.rpc('spike_admin_upsert_gift',args),12000);if(error)throw error;
    resetPhase14GiftForm();await loadPhase14Admin();setPhase14Status('Gift saved successfully.');
  } catch(error){setPhase14Status(error.message||'Could not save gift.',true);} finally{if(button)button.disabled=false;}
}
async function setPhase14Gifts(enabled) {
  const button=$(enabled?'phase14EnableGifts':'phase14DisableGifts');if(button)button.disabled=true;
  try{const {error}=await withTimeout(supabase.rpc('spike_admin_set_gifts_enabled',{p_enabled:enabled}),12000);if(error)throw error;await loadPhase14Admin();setPhase14Status(enabled?'Gifting enabled.':'Gifting paused.');}
  catch(error){setPhase14Status(error.message||'Could not change gifting state.',true);}finally{if(button)button.disabled=false;}
}

async function init() {
  const { data: { session }, error } = await withTimeout(supabase.auth.getSession(), 12000, 'Admin sign-in check timed out. Check your connection and retry.');
  if (error || !session?.user) throw error || new Error('Sign in to access administration.');
  state.user = session.user;
  const { data: profile, error: profileError } = await withTimeout(supabase.from('profiles')
    .select('role,account_status').eq('id', session.user.id).maybeSingle());
  if (profileError) throw profileError;
  if (!profile || profile.account_status !== 'active' || profile.role !== 'admin' || String(session.user.email || '').trim().toLowerCase() !== 'eletexjoeytex@gmail.com') {
    throw new Error('Only the SPIKE owner account can access administration.');
  }

  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  $('enforcementSearchForm')?.addEventListener('submit',event=>{event.preventDefault();loadEnforcementDashboard().catch(e=>setEnforcementStatus(e.message,true));});
  $('enforcementRefresh')?.addEventListener('click',()=>loadEnforcementDashboard().catch(e=>setEnforcementStatus(e.message,true)));
  $('enforcementStatusFilter')?.addEventListener('change',()=>loadEnforcementDashboard().catch(e=>setEnforcementStatus(e.message,true)));
  $('enforcementWindow')?.addEventListener('change',()=>loadEnforcementDashboard().catch(e=>setEnforcementStatus(e.message,true)));
  $('auditSearchForm')?.addEventListener('submit',event=>{event.preventDefault();loadAuditCentre().catch(e=>setAuditStatus(e.message,true));});
  $('auditRefresh')?.addEventListener('click',()=>loadAuditCentre().catch(e=>setAuditStatus(e.message,true)));
  $('auditSource')?.addEventListener('change',()=>loadAuditCentre().catch(e=>setAuditStatus(e.message,true)));
  $('auditDays')?.addEventListener('change',()=>loadAuditCentre().catch(e=>setAuditStatus(e.message,true)));
  $('userSearchForm')?.addEventListener('submit', (event) => { event.preventDefault(); loadUsers(false).catch((e) => setStatus(e.message, true)); });
  $('userLoadMore')?.addEventListener('click', () => loadUsers(true).catch((e) => setStatus(e.message, true)));
  $('userList')?.addEventListener('click', (event) => { const button = event.target.closest('[data-user-id]'); if (!button) return; const user = state.users.find((row) => row.id === button.dataset.userId); if (user) renderUserDetail(user).catch((e) => setStatus(e.message, true)); });
  $('verifySearchForm')?.addEventListener('submit',(event)=>{event.preventDefault();loadVerificationUsers().catch(e=>setVerificationStatus(e.message,true));});
  $('verifyFilter')?.addEventListener('change',()=>loadVerificationUsers().catch(e=>setVerificationStatus(e.message,true)));
  $('verifyList')?.addEventListener('click',(event)=>{const b=event.target.closest('[data-verify-user-id]');if(!b)return;const user=verificationUsers.find(x=>x.id===b.dataset.verifyUserId);if(user)renderVerificationDetail(user);});
  $('verifiedActivityRefresh')?.addEventListener('click',()=>loadVerifiedActivity().catch(e=>setVerifiedActivityStatus(e.message,true)));
  $('verifiedActivitySearchForm')?.addEventListener('submit',event=>{event.preventDefault();loadVerifiedActivity().catch(e=>setVerifiedActivityStatus(e.message,true));});
  $('financialQueueRefresh')?.addEventListener('click',()=>loadFinancialRequests().catch(e=>setFinancialStatus(e.message,true)));
  $('financialStatusFilter')?.addEventListener('change',()=>loadFinancialRequests().catch(e=>setFinancialStatus(e.message,true)));
  ['identityRequestList','withdrawalRequestList'].forEach(id=>$(id)?.addEventListener('click',event=>{const b=event.target.closest('[data-financial-id]');if(b)renderFinancialDetail(b.dataset.financialKind,b.dataset.financialId).catch(e=>setFinancialStatus(e.message,true));}));
  $('reportSearchForm')?.addEventListener('submit', (event) => { event.preventDefault(); loadReports(false).catch((e) => setStatus(e.message, true)); });
  $('reportLoadRefresh')?.addEventListener('click', () => loadReports(false).catch((e) => setStatus(e.message, true)));
  $('reportLoadMore')?.addEventListener('click', () => loadReports(true).catch((e) => setStatus(e.message, true)));
  $('reportQueue')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-report-id]');
    if (!button || button.hasAttribute('data-report-action')) return;
    const report = state.rows.find((row) => row.id === button.dataset.reportId);
    if (report) renderReportDetail(report, state.reporters.get(report.reporter_id));
  });
  $('reportDetail')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-report-action]');
    if (!button) return;
    button.disabled = true;
    updateReport(button.dataset.reportId, button.dataset.reportAction).catch((e) => { setStatus(e.message || 'Could not update report.', true); button.disabled = false; });
  });
  $('purchaseRefresh')?.addEventListener('click', () => loadPurchases().catch(e => setPurchaseStatus(e.message || 'Refresh failed.', true)));
  $('phase14GiftForm')?.addEventListener('submit', savePhase14Gift);
  $('p14GiftReset')?.addEventListener('click', resetPhase14GiftForm);
  $('phase14Refresh')?.addEventListener('click', () => loadPhase14Admin().catch(e => setPhase14Status(e.message,true)));
  $('phase14DisableGifts')?.addEventListener('click', () => setPhase14Gifts(false));
  ['coinOrderFilter','verifiedOrderFilter','purchaseSearch'].forEach(id => $(id)?.addEventListener(id === 'purchaseSearch' ? 'input' : 'change', () => loadPurchases().catch(e => setPurchaseStatus(e.message, true))));
  ['coinOrderList','verifiedOrderList'].forEach(id => $(id)?.addEventListener('click', event => { const button=event.target.closest('[data-purchase-id]'); if (!button) return; const order=purchaseRows.find(x=>x.id===button.dataset.purchaseId); if(order) renderPurchaseDetail(order); }));
  $('overviewPeriod')?.addEventListener('change', () => loadOverview().catch((e) => setStatus(e.message || 'Could not refresh registration period.', true)));
  $('adminMetrics')?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-metric]');
    if (card) openMetricDetails(card.dataset.metric);
  });
  $('adminMetrics')?.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-metric]')) {
      event.preventDefault(); openMetricDetails(event.target.dataset.metric);
    }
  });
  $('adminMetricDialogClose')?.addEventListener('click', () => $('adminMetricDialog')?.close?.());
  $('adminMetricDialog')?.addEventListener('click', (event) => {
    if (event.target === $('adminMetricDialog')) $('adminMetricDialog').close?.();
  });
  $('adminMetricDialogRefresh')?.addEventListener('click', () => loadOverview().catch((e) => setStatus(e.message || 'Refresh failed.', true)));
  $('adminMetricDialogOpen')?.addEventListener('click', (event) => {
    const view = event.currentTarget.dataset.view;
    $('adminMetricDialog')?.close?.();
    if (view) showView(view);
  });
  if (state.overviewTimer) window.clearInterval(state.overviewTimer);
  state.overviewTimer = window.setInterval(() => {
    if (!document.hidden && state.activeView === 'overview') loadOverview().catch(() => {});
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.activeView === 'overview') loadOverview().catch(() => {});
  });
  $('adminRefresh')?.addEventListener('click', () => {
    Promise.all([loadOverview(), state.activeView === 'reports' ? loadReports(false) : Promise.resolve(), state.activeView === 'users' ? loadUsers(false) : Promise.resolve(), state.activeView === 'verification' ? Promise.all([loadVerificationUsers(),loadFinancialRequests()]) : Promise.resolve(), state.activeView === 'purchases' ? loadPurchases() : Promise.resolve(), state.activeView === 'monetization' ? loadPhase14Admin() : Promise.resolve(), state.activeView === 'enforcement' ? loadEnforcementDashboard() : state.activeView === 'audit' ? loadAuditCentre() : Promise.resolve()])
      .then(() => { if (state.activeView !== 'overview') setStatus('Admin data refreshed.'); })
      .catch((e) => setStatus(e.message || 'Refresh failed.', true));
  });
  await withTimeout(loadOverview(), 15000, 'Admin overview timed out. Use Refresh to retry.');
  setStatus('Connected. Owner-only dashboard, identity review, payout review, user management, moderation and purchase tools are available.');
}

init().catch((error) => {
  console.error('[SPIKE admin]', error);
  setStatus(error.message || 'Admin initialization failed.', true);
  const metrics = $('adminMetrics');
  if (metrics) metrics.setAttribute('aria-busy', 'false');
});
