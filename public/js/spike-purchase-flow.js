/* SPIKE Manual Payment Gateway v1 — customer request and WhatsApp handoff.
 * All prices, coin quantities, ownership and order state must be validated by the RPCs.
 * This module never credits a wallet or marks a payment approved in the browser.
 */
(() => {
  'use strict';
  const WHATSAPP_NUMBER = '2349159096952'; // 09159096952 in international format
  const db = () => window.SPIKE_SUPABASE || window.db;
  const $ = (id) => document.getElementById(id);
  const money = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;
  const el = (tag, cls, value) => { const n = document.createElement(tag); if (cls) n.className = cls; if (value !== undefined) n.textContent = value; return n; };
  const set = (id, value, error = false) => { const n = $(id); if (n) { n.textContent = value; n.classList.toggle('error', error); } };
  const rpc = async (name, args = {}) => {
    let timer;
    try {
      const result = await Promise.race([db().rpc(name, args), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The secure payment service took too long to respond. Please retry; no payment was taken.')), 15000); })]);
      if (result.error) throw result.error;
      return result.data;
    } finally { clearTimeout(timer); }
  };
  let currentUser = null, catalog = [], orders = [], verifiedProfileState = null, verifiedSubscription = null, subscriptionClock = null;

  function renderVerifiedHero() {
    const hero = $('spikeVerifiedHero'); if (!hero) return;
    const title = $('spikeVerifiedTitle'), detail = $('spikeVerifiedDetail'), state = $('spikeVerifiedState');
    const action = $('spikeVerifiedAction'), silver = $('spikeVerifiedSilver'), badge = $('spikeVerifiedAnimation');
    hero.classList.remove('is-loading','is-verified','is-pending','is-unverified','is-error');
    if (verifiedProfileState === null) {
      hero.classList.add('is-loading');
      if (title) title.textContent = 'CHECKING VERIFICATION';
      if (detail) detail.textContent = 'Confirming your account status securely…';
      if (state) state.textContent = 'CHECKING STATUS';
      if (action) { action.textContent = 'Checking status…'; action.disabled = true; }
      return;
    }
    const verified = verifiedProfileState === true;
    const pending = orders.some(order => order.product_type === 'verified' && ['pending_payment','payment_reported'].includes(order.status));
    if (verified) {
      hero.classList.add('is-verified');
      if (title) title.textContent = 'SPIKE VERIFIED';
      if (detail) detail.textContent = 'Your verified membership is active. Your official SPIKE badge is displayed below.';
      if (state) state.textContent = 'VERIFIED MEMBER';
      if (silver) silver.hidden = true;
      if (badge) { badge.hidden = false; badge.src = 'assets/spike-verified-badge.webp'; badge.onerror = () => { badge.hidden = true; if (silver) silver.hidden = false; }; }
      if (action) { action.textContent = 'Manage membership'; action.disabled = false; }
    } else {
      hero.classList.add(pending ? 'is-pending' : 'is-unverified');
      if (title) title.textContent = 'SPIKE NOT VERIFIED';
      if (detail) detail.textContent = pending ? 'Your subscription request is awaiting payment review. Your badge will appear only after approval.' : 'Your account does not currently have an active verified badge. Request a subscription below.';
      if (state) state.textContent = pending ? 'REQUEST UNDER REVIEW' : 'VERIFICATION NOT ACTIVE';
      if (silver) silver.hidden = false;
      if (badge) badge.hidden = true;
      if (action) { action.textContent = pending ? 'View subscription request' : 'Get SPIKE Verified'; action.disabled = false; }
    }
  }

  async function loadVerifiedProfileState() {
    verifiedProfileState = null; renderVerifiedHero();
    const [{ data, error }, { data: subscription, error: subscriptionError }] = await Promise.all([
      db().from('profiles').select('is_verified').eq('id', currentUser.id).maybeSingle(),
      db().from('spike_verified_subscriptions').select('plan_sku,status,starts_at,valid_until').eq('user_id', currentUser.id).maybeSingle()
    ]);
    if (error) throw error;
    if (subscriptionError) throw subscriptionError;
    if (!data) throw new Error('Your verification status could not be found. Please refresh.');
    verifiedSubscription = subscription || null;
    const subscriptionExpired = !subscription || subscription.status !== 'active' || !subscription.valid_until || new Date(subscription.valid_until).getTime() <= Date.now();
    verifiedProfileState = data.is_verified === true && !subscriptionExpired;
    renderVerifiedHero();
    renderVerifiedSubscription();
  }

  function renderVerifiedSubscription() {
    const plans = $('verifiedSubscriptionPlans');
    const activePanel = $('verifiedSubscriptionActive');
    const hint = $('verifiedSubscriptionPlanHint');
    const status = $('verifiedSubscriptionStatus');
    if (!plans || !activePanel) return;
    const expiry = verifiedSubscription?.valid_until ? new Date(verifiedSubscription.valid_until) : null;
    const active = verifiedProfileState === true && verifiedSubscription?.status === 'active' && expiry && expiry.getTime() > Date.now();
    plans.hidden = !!active;
    activePanel.hidden = !active;
    if (hint) hint.hidden = !!active;
    if (!active) {
      if (subscriptionClock) { clearInterval(subscriptionClock); subscriptionClock = null; }
      if (status && verifiedProfileState !== null) status.textContent = verifiedSubscription?.status === 'active' && expiry && expiry.getTime() <= Date.now()
        ? 'Your previous SPIKE Verified subscription has expired. Choose a plan below to renew your membership.'
        : 'Choose a monthly or yearly plan to create a payment request. Payment is activated only after owner verification.';
      return;
    }
    const sku = String(verifiedSubscription.plan_sku || '').toLowerCase();
    const planName = sku.includes('year') ? 'YEARLY VERIFIED' : sku.includes('month') ? 'MONTHLY VERIFIED' : sku.replace(/^verified[_-]?/, '').replace(/[_-]+/g, ' ').toUpperCase() || 'SPIKE VERIFIED';
    const date = expiry.toLocaleString('en-NG', { dateStyle: 'long', timeStyle: 'short' });
    activePanel.replaceChildren();
    activePanel.append(el('strong', '', 'YOUR ACTIVE SUBSCRIPTION'));
    activePanel.append(el('div', 'wallet-verified-mark', `✓ ${planName}`));
    activePanel.append(el('p', 'wallet-muted', `Status: Active · Started ${verifiedSubscription.starts_at ? new Date(verifiedSubscription.starts_at).toLocaleDateString('en-NG', {dateStyle:'medium'}) : '—'}`));
    const countdown = el('div', 'wallet-subscription-countdown');
    countdown.append(el('small', '', 'TIME REMAINING'));
    const value = el('strong', '', 'Calculating…'); value.id = 'verifiedSubscriptionCountdownValue'; countdown.append(value);
    countdown.append(el('small', '', `Expires ${date}`));
    activePanel.append(countdown);
    if (status) status.textContent = 'Your SPIKE Verified membership is active. Your monthly and yearly purchase options are hidden while this subscription remains valid.';
    const updateCountdown = () => {
      const remaining = expiry.getTime() - Date.now();
      if (remaining <= 0) {
        if (subscriptionClock) { clearInterval(subscriptionClock); subscriptionClock = null; }
        verifiedProfileState = false;
        renderVerifiedHero();
        renderVerifiedSubscription();
        return;
      }
      const totalSeconds = Math.floor(remaining / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      value.textContent = `${days} days · ${hours} hours · ${minutes} min · ${seconds} sec`;
    };
    if (subscriptionClock) clearInterval(subscriptionClock);
    updateCountdown();
    subscriptionClock = setInterval(updateCountdown, 1000);
  }

  function renderCatalog() {
    const host = $('coinPackages'); if (!host) return;
    host.replaceChildren();
    const coins = catalog.filter(x => x.product_type === 'coin' || x.kind === 'coin');
    if (!coins.length) { host.append(el('p', 'wallet-muted', 'SP Coin packages are not yet published by SPIKE.')); return; }
    for (const item of coins) {
      const card = el('article', 'wallet-package wallet-coin-package');
      card.dataset.sku = item.sku;
      card.append(el('strong', '', item.title || item.name || 'SP Coin package'));
      if (item.sku === 'coin_popular') card.append(el('span', 'wallet-package-badge', 'Most popular'));
      card.append(el('span', 'wallet-muted', `${Number(item.coin_amount || item.coins || 0).toLocaleString('en-NG')} SP Coins`));
      card.append(el('span', 'wallet-package-price', money(item.amount_ngn)));
      const button = el('button', '', 'Create payment request'); button.type = 'button'; button.dataset.sku = item.sku; button.addEventListener('click', () => createOrder(item.sku, button));
      card.append(button); host.append(card);
    }
  }
  function renderOrderList(hostId, rows, emptyMessage) {
    const host = $(hostId); if (!host) return;
    host.replaceChildren();
    if (!rows.length) { host.append(el('p', 'wallet-muted', emptyMessage)); return; }
    for (const order of rows) {
      const card = el('article', 'wallet-note');
      const status = order.status || 'pending_payment';
      card.append(el('strong', '', `${order.product_name || order.title || order.sku} · ${money(order.amount_ngn)}`));
      card.append(el('p', 'wallet-muted', `Reference: ${order.order_reference || order.reference} · Status: ${status.replace(/_/g, ' ')}`));
      if (status === 'pending_payment') {
        const message = [
          'Hello SPIKE Admin, I am contacting you about my purchase request.',
          `Item: ${order.product_name || order.title || order.sku}`,
          `Amount: ${money(order.amount_ngn)}`,
          `Order reference: ${order.order_reference || order.reference}`,
          `Account: ${currentUser?.email || 'Signed-in SPIKE member'}`,
          'Please confirm the official bank payment instructions. I will send my transfer proof in this WhatsApp conversation after payment.'
        ].join('\n');
        const wa = el('a', 'wallet-wa', 'Continue on WhatsApp · Send order to SPIKE Admin'); wa.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`; wa.target = '_blank'; wa.rel = 'noopener noreferrer'; card.append(wa);
        card.append(el('p', 'wallet-muted', 'First send this order to SPIKE Admin on WhatsApp and tap Send. Wait for the official payment instructions, make the transfer, then send your payment proof in the same WhatsApp chat.'));
        const reported = el('button', 'wallet-action', 'I sent payment proof on WhatsApp'); reported.type = 'button'; reported.disabled = true;
        const reportHint = el('p', 'wallet-muted', 'Send your order on WhatsApp first to unlock the payment report.'); card.append(reportHint);
        wa.addEventListener('click', () => { reported.disabled = false; reportHint.textContent = 'After sending your transfer proof in WhatsApp, tap the button below to notify SPIKE Admin.'; });
        reported.addEventListener('click', async () => {
          reported.disabled = true;
          try { await rpc('spike_report_purchase_payment', { p_order_id: order.id }); await loadOrders(); set(hostId === 'verifiedSubscriptionHistory' ? 'verifiedSubscriptionStatus' : 'coinPurchaseStatus', 'Payment report recorded. SPIKE will check your WhatsApp payment proof and independently verify the bank credit.'); }
          catch (e) { reported.disabled = false; set(hostId === 'verifiedSubscriptionHistory' ? 'verifiedSubscriptionStatus' : 'coinPurchaseStatus', e.message || 'Could not record payment report.', true); }
        }); card.append(reported);
      } else if (status === 'payment_reported') {
        card.append(el('p', 'wallet-muted', 'Payment reported. SPIKE will review the WhatsApp conversation and independently verify the bank credit before approval.'));
      } else if (status === 'approved') {
        card.append(el('p', 'wallet-muted', 'Payment verified and request approved.'));
      } else if (status === 'rejected') {
        card.append(el('p', 'wallet-muted', `Request rejected by SPIKE${order.review_note ? `: ${order.review_note}` : '.'}`));
      } else if (status === 'cancelled') {
        card.append(el('p', 'wallet-muted', 'This purchase request was cancelled. Create a new request if you still want this item.'));
      }
      host.append(card);
    }
  }
  function renderOrders() {
    renderOrderList('coinOrders', orders.filter(x => (x.product_type || 'coin') === 'coin'), 'You have no SP Coin purchase requests yet.');
    renderOrderList('verifiedSubscriptionHistory', orders.filter(x => x.product_type === 'verified'), 'You have no Verified subscription requests yet.');
    renderVerifiedHero();
  }
  function renderVerifiedPlans() {
    const bySku = new Map(catalog.filter(x => x.product_type === 'verified').map(x => [x.sku, x]));
    document.querySelectorAll('[data-verified-subscribe]').forEach(button => {
      const item = bySku.get(`verified_${button.dataset.verifiedSubscribe}`);
      button.disabled = !item;
      button.textContent = item ? `Request ${button.dataset.verifiedSubscribe} subscription` : 'Currently unavailable';
      const card = button.closest('.wallet-subscription-plan');
      const price = card?.querySelector('.price');
      if (price) price.textContent = item ? money(item.amount_ngn) : 'Unavailable';
      const details = card?.querySelectorAll('.wallet-muted');
      if (details?.length > 1) details[1].textContent = item ? `${Number(item.duration_days || 0)} days · manual payment review` : 'This plan is not currently published';
    });
  }
  async function createOrder(sku, button) {
    if (!currentUser) { set('coinPurchaseStatus', 'Please sign in before creating a purchase request.', true); return; }
    button.disabled = true;
    try {
      const idempotency = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const data = await rpc('spike_create_purchase_order', { p_sku: sku, p_idempotency_key: idempotency });
      const order = Array.isArray(data) ? data[0] : data;
      if (!order?.id || !(order.order_reference || order.reference)) throw new Error('The server did not return a valid order reference. No payment should be made.');
      await loadOrders();
      const statusId = catalog.find(item => item.sku === sku)?.product_type === 'verified' ? 'verifiedSubscriptionStatus' : 'coinPurchaseStatus';
      set(statusId, `Request ${order.order_reference || order.reference} created. Open Purchase requests, send the order to SPIKE Admin on WhatsApp, wait for official payment instructions, then send your transfer proof in that chat.`);
    } catch (e) { const statusId = catalog.find(item => item.sku === sku)?.product_type === 'verified' ? 'verifiedSubscriptionStatus' : 'coinPurchaseStatus'; set(statusId, e.message || 'Could not create purchase request. No payment was taken.', true); }
    finally { button.disabled = false; }
  }
  async function loadOrders() {
    const data = await rpc('spike_my_purchase_orders');
    orders = Array.isArray(data) ? data : data?.orders || [];
    renderOrders();
  }
  async function boot() {
    if (!db()?.auth) { set('coinPurchaseStatus', 'Wallet database is not ready. Refresh the page and try again.', true); return; }
    document.querySelectorAll('[data-purchase-refresh]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true; const old = button.textContent; button.textContent = 'Refreshing…';
      try { await loadOrders(); set('coinPurchaseStatus', 'Purchase requests refreshed.'); }
      catch (e) { set('coinPurchaseStatus', e.message || 'Could not refresh purchase requests.', true); }
      finally { button.disabled = false; button.textContent = old; }
    }));
    const auth = await db().auth.getUser(); currentUser = auth.data?.user;
    if (!currentUser) { set('coinPurchaseStatus', 'Sign in to view available purchase requests.'); set('verifiedSubscriptionStatus', 'Sign in to view or request SPIKE Verified.'); return; }
    try {
      await loadVerifiedProfileState();
      const result = await rpc('spike_get_purchase_catalog');
      catalog = Array.isArray(result) ? result : result?.items || [];
      renderCatalog(); renderVerifiedPlans(); await loadOrders();
      renderVerifiedHero();
      renderVerifiedSubscription();
      document.querySelectorAll('[data-verified-subscribe]').forEach(button => {
        const sku = `verified_${button.dataset.verifiedSubscribe}`;
        if (catalog.some(item => item.sku === sku && item.product_type === 'verified')) {
          button.addEventListener('click', () => createOrder(sku, button));
        }
      });
      // Catalog-driven subscription prices are checked by the server; these labels are display-only.
    } catch (e) {
      const unavailable = /function .* does not exist|schema cache|PGRST202/i.test(e.message || '');
      set('coinPurchaseStatus', unavailable ? 'Payment request service is not available. No transfer should be made until this message changes.' : (e.message || 'Could not load purchase catalogue.'), true);
      set('verifiedSubscriptionStatus', 'Secure payment service is not deployed yet. Subscription requests remain unavailable.', true);
      if (verifiedProfileState === null) { const hero = $('spikeVerifiedHero'); hero?.classList.remove('is-loading'); hero?.classList.add('is-error'); if ($('spikeVerifiedTitle')) $('spikeVerifiedTitle').textContent = 'STATUS UNAVAILABLE'; if ($('spikeVerifiedDetail')) $('spikeVerifiedDetail').textContent = 'SPIKE could not confirm your verification status. Please refresh; no badge has been assumed.'; if ($('spikeVerifiedState')) $('spikeVerifiedState').textContent = 'CHECK CONNECTION'; if ($('spikeVerifiedAction')) { $('spikeVerifiedAction').textContent = 'Retry by refreshing'; $('spikeVerifiedAction').disabled = true; } }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error('[SPIKE purchase flow]', e); set('coinPurchaseStatus', e.message || 'Purchase service unavailable.', true); }), { once: true });
  else boot().catch(e => { console.error('[SPIKE purchase flow]', e); set('coinPurchaseStatus', e.message || 'Purchase service unavailable.', true); });
})();
