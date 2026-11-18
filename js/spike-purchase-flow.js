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
  const rpc = async (name, args = {}) => { const { data, error } = await db().rpc(name, args); if (error) throw error; return data; };
  let currentUser = null, catalog = [], orders = [];

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
        const message = `Hello SPIKE Support. Please send bank details for ${order.product_name || order.title || order.sku}, ${money(order.amount_ngn)}, order ${order.order_reference || order.reference}.`;
        const wa = el('a', 'wallet-wa', 'Continue on WhatsApp'); wa.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`; wa.target = '_blank'; wa.rel = 'noopener noreferrer'; card.append(wa);
        const reported = el('button', 'wallet-action', 'I have sent payment proof'); reported.type = 'button'; reported.addEventListener('click', async () => {
          reported.disabled = true;
          try { await rpc('spike_report_purchase_payment', { p_order_id: order.id }); await loadOrders(); set(hostId === 'verifiedSubscriptionHistory' ? 'verifiedSubscriptionStatus' : 'coinPurchaseStatus', 'Payment report recorded. SPIKE will verify the transfer manually.'); }
          catch (e) { reported.disabled = false; set(hostId === 'verifiedSubscriptionHistory' ? 'verifiedSubscriptionStatus' : 'coinPurchaseStatus', e.message || 'Could not record payment report.', true); }
        }); card.append(reported);
      } else if (status === 'payment_reported') {
        card.append(el('p', 'wallet-muted', 'Payment reported. Awaiting manual bank-statement verification by SPIKE.'));
      } else if (status === 'approved') {
        card.append(el('p', 'wallet-muted', 'Payment verified and request approved.'));
      }
      host.append(card);
    }
  }
  function renderOrders() {
    renderOrderList('coinOrders', orders.filter(x => (x.product_type || 'coin') === 'coin'), 'You have no SP Coin purchase requests yet.');
    renderOrderList('verifiedSubscriptionHistory', orders.filter(x => x.product_type === 'verified'), 'You have no Verified subscription requests yet.');
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
      set(statusId, `Request ${order.order_reference || order.reference} created. Use the Continue on WhatsApp link in your order history, tap Send, then wait for SPIKE to provide bank details.`);
    } catch (e) { const statusId = catalog.find(item => item.sku === sku)?.product_type === 'verified' ? 'verifiedSubscriptionStatus' : 'coinPurchaseStatus'; set(statusId, e.message || 'Could not create purchase request. No payment was taken.', true); }
    finally { button.disabled = false; }
  }
  async function loadOrders() {
    const data = await rpc('spike_my_purchase_orders');
    orders = Array.isArray(data) ? data : data?.orders || [];
    renderOrders();
  }
  async function boot() {
    if (!db()?.auth) return;
    const auth = await db().auth.getUser(); currentUser = auth.data?.user;
    if (!currentUser) { set('coinPurchaseStatus', 'Sign in to view available purchase requests.'); return; }
    try {
      const result = await rpc('spike_get_purchase_catalog');
      catalog = Array.isArray(result) ? result : result?.items || [];
      renderCatalog(); renderVerifiedPlans(); await loadOrders();
      set('verifiedSubscriptionStatus', 'Choose a monthly or yearly plan to create a payment request. Payment is activated only after owner verification.');
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
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error('[SPIKE purchase flow]', e); set('coinPurchaseStatus', e.message || 'Purchase service unavailable.', true); }), { once: true });
  else boot().catch(e => { console.error('[SPIKE purchase flow]', e); set('coinPurchaseStatus', e.message || 'Purchase service unavailable.', true); });
})();
