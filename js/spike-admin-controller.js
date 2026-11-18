import { supabase } from './spike-supabase-client.js';

const $ = (id) => document.getElementById(id);
const state = { user: null, rows: [], reporters: new Map(), offset: 0, limit: 40, loading: false, hasMore: false, activeView: 'overview', users: [], userOffset: 0, userHasMore: false, selectedUser: null };
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
  const supported = ['overview', 'users', 'reports', 'purchases'];
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
  if (name === 'purchases') loadPurchases().catch((error) => setPurchaseStatus(error.message || 'Could not load purchase requests.', true));
}

async function countRows(table, configure = () => {}) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  query = configure(query);
  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
}

async function loadOverview() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [users, newUsers, suspended, liveRooms] = await Promise.all([
    countRows('profiles'),
    countRows('profiles', (q) => q.gte('created_at', today.toISOString())),
    countRows('profiles', (q) => q.eq('account_status', 'suspended')),
    countRows('rooms', (q) => q.eq('status', 'live'))
  ]);
  const supported = {
    total_registered_users: users,
    new_registrations_today: newUsers,
    suspended_accounts: suspended,
    total_active_rooms: liveRooms
  };
  document.querySelectorAll('[data-value]').forEach((node) => {
    const key = node.dataset.value;
    if (Object.hasOwn(supported, key)) {
      node.textContent = supported[key].toLocaleString();
      node.closest('article')?.removeAttribute('hidden');
      node.title = 'Live count from the connected Supabase table';
    } else {
      node.textContent = '—';
      node.closest('article')?.setAttribute('hidden', '');
      node.title = 'This metric is hidden until an authoritative backend source exists';
    }
  });
  const metrics = $('adminMetrics');
  if (metrics) metrics.setAttribute('aria-busy', 'false');
}

function renderUserRow(user) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'report-queue-item';
  button.dataset.userId = user.id;
  const title = document.createElement('strong');
  title.textContent = user.display_name || user.username || 'SPIKE member';
  const meta = document.createElement('small');
  meta.textContent = `@${user.username || 'unknown'} · ${user.spike_id || 'No SP ID'} · ${user.role}`;
  const status = document.createElement('small');
  status.textContent = `${user.account_status} · Joined ${new Date(user.created_at).toLocaleDateString()}`;
  button.append(title, meta, status);
  return button;
}

async function loadUsers(append = false) {
  if (state.loading) return;
  state.loading = true;
  const list = $('userList');
  const status = $('userListStatus');
  if (!append) { state.userOffset = 0; state.users = []; list?.replaceChildren(); }
  if (status) status.textContent = 'Loading account directory…';
  try {
    let query = supabase.from('profiles')
      .select('id,username,display_name,spike_id,role,account_status,created_at,updated_at')
      .order('created_at', { ascending: false })
      .range(state.userOffset, state.userOffset + state.limit - 1);
    const filter = $('userFilter')?.value || 'all';
    if (filter === 'active' || filter === 'suspended') query = query.eq('account_status', filter);
    if (filter === 'admin' || filter === 'moderator') query = query.eq('role', filter);
    const term = escapeLike($('userSearch')?.value || '');
    if (term) query = query.or(`username.ilike.%${term}%,display_name.ilike.%${term}%,spike_id.ilike.%${term}%`);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    state.users = append ? [...state.users, ...rows] : rows;
    rows.forEach((user) => list?.append(renderUserRow(user)));
    state.userOffset += rows.length;
    state.userHasMore = rows.length === state.limit;
    if ($('userLoadMore')) $('userLoadMore').hidden = !state.userHasMore;
    if (status) status.textContent = `${state.users.length.toLocaleString()} accounts loaded`;
    if ($('userCountLabel')) $('userCountLabel').textContent = `${state.users.length.toLocaleString()} accounts`;
    if (!state.users.length && status) status.textContent = 'No accounts match this search.';
  } finally { state.loading = false; }
}

async function renderUserDetail(user) {
  state.selectedUser = user;
  const panel = $('userDetail');
  if (!panel) return;
  panel.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = user.display_name || user.username || 'SPIKE member';
  const identity = document.createElement('p');
  identity.textContent = `@${user.username || 'unknown'} · ${user.spike_id || 'No SP ID'} · ${user.id}`;
  const status = document.createElement('p');
  status.textContent = `Account: ${user.account_status} · Role: ${user.role} · Joined: ${new Date(user.created_at).toLocaleString()}`;
  const walletHeading = document.createElement('h4');
  walletHeading.textContent = 'Wallet summary';
  const wallet = document.createElement('p');
  wallet.textContent = 'Loading wallet summary…';
  const reportsHeading = document.createElement('h4');
  reportsHeading.textContent = 'Moderation reports';
  const reports = document.createElement('p');
  reports.textContent = 'Loading report history…';
  const note = document.createElement('p');
  note.className = 'report-hint';
  note.textContent = 'This directory is read-only. Suspension, role changes, identity verification and account deletion are not exposed until dedicated audited server-side workflows are implemented.';
  panel.append(heading, identity, status, walletHeading, wallet, reportsHeading, reports, note);
  const [walletResult, reportResult] = await Promise.all([
    supabase.from('wallet_accounts').select('currency,available_balance,pending_balance').eq('user_id', user.id).maybeSingle(),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('reporter_id', user.id)
  ]);
  if (walletResult.error) wallet.textContent = `Wallet summary unavailable: ${walletResult.error.message}`;
  else if (!walletResult.data) wallet.textContent = 'No wallet account exists.';
  else wallet.textContent = `${walletResult.data.currency}: ${Number(walletResult.data.available_balance).toLocaleString()} available · ${Number(walletResult.data.pending_balance).toLocaleString()} pending`;
  if (reportResult.error) reports.textContent = `Report history unavailable: ${reportResult.error.message}`;
  else reports.textContent = `${Number(reportResult.count || 0).toLocaleString()} reports submitted by this account.`;
}

function renderReportRow(report, reporter) {
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
  button.append(title, meta, target);
  return button;
}

function renderReportDetail(report, reporter) {
  const panel = $('reportDetail');
  if (!panel) return;
  panel.replaceChildren();
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
  panel.append(heading, meta, who, reason, target, details);
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
  if (state.loading) return;
  state.loading = true;
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
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    const reporterIds = [...new Set(rows.map((row) => row.reporter_id).filter(Boolean))];
    let people = [];
    if (reporterIds.length) {
      const result = await supabase.from('profiles').select('id,username,display_name,spike_id').in('id', reporterIds);
      if (result.error) throw result.error;
      people = result.data || [];
    }
    const byId = new Map(people.map((person) => [person.id, person]));
    state.reporters = new Map([...state.reporters, ...byId]);
    state.rows = append ? [...state.rows, ...rows] : rows;
    rows.forEach((report) => list?.append(renderReportRow(report, byId.get(report.reporter_id))));
    state.offset += rows.length;
    state.hasMore = rows.length === state.limit;
    const more = $('reportLoadMore');
    if (more) more.hidden = !state.hasMore;
    if (statusNode) statusNode.textContent = `${state.rows.length.toLocaleString()} cases loaded`;
    const stats = $('reportStats');
    if (stats) {
      const counts = await Promise.all([
        countRows('reports'),
        countRows('reports', (q) => q.eq('status', 'open')),
        countRows('reports', (q) => q.eq('status', 'reviewing')),
        countRows('reports', (q) => q.eq('status', 'resolved')),
        countRows('reports', (q) => q.gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())),
        countRows('reports', (q) => q.in('status', ['open', 'reviewing']).lt('created_at', new Date(Date.now() - 86400000).toISOString()))
      ]);
      const values = { total: counts[0], open: counts[1], reviewing: counts[2], resolved: counts[3], today: counts[4], overdue: counts[5] };
      stats.querySelectorAll('[data-rstat]').forEach((node) => {
        const key = node.dataset.rstat;
        node.textContent = Object.hasOwn(values, key) ? values[key].toLocaleString() : 'Not configured';
        if (!Object.hasOwn(values, key)) node.title = 'No authoritative backend data is available for this metric';
      });
    }
    if (!state.rows.length && statusNode) statusNode.textContent = 'No reports match these filters.';
  } finally {
    state.loading = false;
  }
}

async function updateReport(reportId, nextStatus) {
  if (!['reviewing', 'resolved', 'dismissed'].includes(nextStatus)) return;
  const { data, error } = await supabase.from('reports')
    .update({ status: nextStatus, reviewed_by: state.user.id, reviewed_at: new Date().toISOString() })
    .eq('id', reportId)
    .select('id,status')
    .maybeSingle();
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
  const info = document.createElement('p'); info.textContent = `Reference: ${order.order_reference || order.reference} · Amount: ₦${Number(order.amount_ngn || 0).toLocaleString('en-NG')} · Status: ${order.status}`;
  const user = document.createElement('p'); user.textContent = `Customer: ${order.display_name || order.username || order.user_email || order.user_id} · SP ID: ${order.spike_id || 'Not available'}`;
  const created = document.createElement('p'); created.textContent = `Created: ${order.created_at ? new Date(order.created_at).toLocaleString() : 'Not supplied'}`;
  host.append(heading, info, user, created);
  if (!['approved','rejected','cancelled'].includes(order.status)) {
    const payment = document.createElement('input'); payment.type = 'text'; payment.maxLength = 120; payment.placeholder = 'Bank transaction reference (required to approve)'; payment.id = 'purchasePaymentReference'; payment.autocomplete = 'off';
    if (order.status === 'payment_reported') {
      const approve = document.createElement('button'); approve.type = 'button'; approve.className = 'admin-refresh'; approve.textContent = 'Approve & settle';
      approve.addEventListener('click', async () => {
        if (!payment.value.trim()) { setPurchaseStatus('Enter the bank transaction reference after checking the bank statement.', true); return; }
        approve.disabled = true;
        try {
          const { data, error } = await supabase.rpc('spike_admin_approve_purchase', { p_order_id: order.id, p_payment_reference: payment.value.trim() });
          if (error) throw error;
          if (!data || data.ok !== true || data.status !== 'approved') throw new Error('The server did not confirm approval. Check the order status before retrying.');
          setPurchaseStatus('Payment approved and settlement confirmed by the server. Refreshing the order queue.');
          await loadPurchases();
        } catch (e) { setPurchaseStatus(e.message || 'Approval failed.', true); approve.disabled = false; }
      });
      host.append(payment, approve);
    } else {
      const waiting = document.createElement('p'); waiting.textContent = 'Approval is locked until the customer reports payment proof and the bank statement is checked.'; host.append(waiting);
    }
    const reject = document.createElement('button'); reject.type = 'button'; reject.className = 'admin-refresh'; reject.textContent = 'Reject request';
    reject.addEventListener('click', async () => {
      const reason = window.prompt('Reason for rejecting this payment request:'); if (!reason || !reason.trim()) return;
      reject.disabled = true;
      try {
        const { data, error } = await supabase.rpc('spike_admin_reject_purchase', { p_order_id: order.id, p_reason: reason.trim() });
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
  const { data, error } = await supabase.rpc('spike_admin_list_purchase_orders');
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

async function init() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user) throw error || new Error('Sign in to access administration.');
  state.user = session.user;
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('role,account_status').eq('id', session.user.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.account_status !== 'active' || profile.role !== 'admin' || String(session.user.email || '').trim().toLowerCase() !== 'eletexjoeytex@gmail.com') {
    throw new Error('Only the SPIKE owner account can access administration.');
  }

  document.querySelectorAll('[data-view="verification"]').forEach((button) => {
    button.disabled = true;
    button.title = 'This section is not connected to a verified backend workflow yet.';
    button.setAttribute('aria-disabled', 'true');
  });
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  $('userSearchForm')?.addEventListener('submit', (event) => { event.preventDefault(); loadUsers(false).catch((e) => setStatus(e.message, true)); });
  $('userLoadMore')?.addEventListener('click', () => loadUsers(true).catch((e) => setStatus(e.message, true)));
  $('userList')?.addEventListener('click', (event) => { const button = event.target.closest('[data-user-id]'); if (!button) return; const user = state.users.find((row) => row.id === button.dataset.userId); if (user) renderUserDetail(user).catch((e) => setStatus(e.message, true)); });
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
  ['coinOrderFilter','verifiedOrderFilter','purchaseSearch'].forEach(id => $(id)?.addEventListener(id === 'purchaseSearch' ? 'input' : 'change', () => loadPurchases().catch(e => setPurchaseStatus(e.message, true))));
  ['coinOrderList','verifiedOrderList'].forEach(id => $(id)?.addEventListener('click', event => { const button=event.target.closest('[data-purchase-id]'); if (!button) return; const order=purchaseRows.find(x=>x.id===button.dataset.purchaseId); if(order) renderPurchaseDetail(order); }));
  $('adminRefresh')?.addEventListener('click', () => {
    Promise.all([loadOverview(), state.activeView === 'reports' ? loadReports(false) : Promise.resolve(), state.activeView === 'users' ? loadUsers(false) : Promise.resolve(), state.activeView === 'purchases' ? loadPurchases() : Promise.resolve()])
      .then(() => setStatus('Admin data refreshed.'))
      .catch((e) => setStatus(e.message || 'Refresh failed.', true));
  });
  await loadOverview();
  setStatus('Connected. Overview metrics, account directory and report moderation are available; owner-only manual payment review is also available.');
}

init().catch((error) => setStatus(error.message || 'Admin initialization failed.', true));
