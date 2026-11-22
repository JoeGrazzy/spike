/* SPIKE wallet dashboard controller.
 * Reads only the authenticated user's account and ledger. Financial mutations
 * remain server-owned; this controller never writes balances or ledger rows.
 */
(() => {
  'use strict';
  const db = () => window.SPIKE_SUPABASE || window.db;
  const $ = id => document.getElementById(id);
  let ledger = [], busy = false;
  const money = value => { const n = Number(value ?? 0); return (Number.isFinite(n) ? n : 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const walletCurrency = value => String(value || '').toUpperCase() === 'NGN' ? 'NGN' : 'SP Coins';
  const ngn = value => `₦${money(value)}`;
  const node = (tag, cls, value) => { const n = document.createElement(tag); if (cls) n.className = cls; if (value !== undefined) n.textContent = value; return n; };
  const message = (id, value, error = false) => { const n = $(id); if (!n) return; n.textContent = value; n.classList.toggle('error', error); };
  const withTimeout = (promise, label) => { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out. Check your connection and retry.`)), 12000); })]).finally(() => clearTimeout(timer)); };
  const setBusy = value => { busy = value; document.querySelectorAll('[data-wallet-refresh]').forEach(b => { b.disabled = value; b.textContent = value ? 'Refreshing…' : 'Refresh wallet'; }); };

  function ledgerRow(row) {
    const item = node('article', 'wallet-ledger-row');
    const main = node('div', 'wallet-ledger-main');
    main.append(node('strong', '', row.description || String(row.entry_type || 'Transaction').replace(/_/g, ' ')), node('small', '', row.created_at ? new Date(row.created_at).toLocaleString() : 'Date unavailable'));
    const side = node('div', 'wallet-ledger-side');
    const sign = ['credit', 'release', 'reversal'].includes(row.entry_type) ? '+' : ['debit', 'hold'].includes(row.entry_type) ? '−' : '';
    side.append(node('strong', `wallet-ledger-amount ${sign === '+' ? 'is-credit' : sign ? 'is-debit' : ''}`, `${sign}${money(row.amount)} ${walletCurrency(row.currency)}`.trim()), node('small', '', row.status || 'recorded'));
    item.append(main, side); return item;
  }
  function renderLedger() {
    const q = String($('coinLedgerSearch')?.value || '').trim().toLowerCase();
    const type = $('coinLedgerType')?.value || 'all';
    const rows = ledger.filter(x => (type === 'all' || (type === 'credit' ? ['credit', 'release', 'reversal'].includes(x.entry_type) : ['debit', 'hold'].includes(x.entry_type))) && (!q || `${x.description || ''} ${x.entry_type || ''} ${x.reference || ''} ${x.status || ''}`.toLowerCase().includes(q)));
    const host = $('coinLedger'); if (!host) return;
    host.replaceChildren();
    if (!rows.length) host.append(node('p', 'wallet-muted', ledger.length ? 'No ledger entries match this filter.' : 'No wallet transactions have been recorded yet.'));
    else rows.forEach(x => host.append(ledgerRow(x)));
  }
  async function load() {
    if (busy) return;
    setBusy(true);
    message('walletAccountStatus', 'Checking your secure wallet…');
    const recent = $('walletRecentActivity'); if (recent) recent.setAttribute('aria-busy', 'true');
    try {
      const client = db();
      if (!client?.auth) throw new Error('Wallet database is not ready. Please refresh and try again.');
      const auth = await withTimeout(client.auth.getUser(), 'Wallet sign-in check');
      if (auth.error) throw auth.error;
      if (!auth.data?.user) throw new Error('Sign in to view your wallet.');
      const user = auth.data.user;
      void loadCreatorEarnings(client, user);
      const [accountResult, ledgerResult] = await Promise.allSettled([
        withTimeout(client.from('wallet_accounts').select('currency,available_balance,pending_balance,updated_at').eq('user_id', user.id).maybeSingle(), 'Wallet balance request'),
        withTimeout(client.from('wallet_ledger').select('id,entry_type,amount,currency,reference,description,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100), 'Wallet history request')
      ]);

      if (accountResult.status === 'fulfilled' && !accountResult.value.error) {
        const account = accountResult.value.data;
        if (account) {
          const available = money(account.available_balance), pending = money(account.pending_balance);
          const balance = $('coinBalance'), breakdown = $('coinSourceBreakdown');
          if (balance) { balance.dataset.visibleValue = `${available} SP Coins`; balance.textContent = balance.dataset.visibleValue; }
          if (breakdown) { breakdown.dataset.visibleValue = `Available: ${available} · Pending: ${pending}`; breakdown.textContent = breakdown.dataset.visibleValue; }
          message('walletAccountStatus', `Wallet synced · Updated ${account.updated_at ? new Date(account.updated_at).toLocaleString() : 'just now'}`);
        } else {
          if ($('coinBalance')) { $('coinBalance').dataset.visibleValue = '0.00 SP Coins'; $('coinBalance').textContent = '0.00 SP Coins'; }
          const breakdown = $('coinSourceBreakdown'); if (breakdown) { breakdown.dataset.visibleValue = 'Available: 0.00 · Pending: 0.00'; breakdown.textContent = breakdown.dataset.visibleValue; }
          message('walletAccountStatus', 'Wallet ready · no coin balance recorded yet.');
        }
      } else {
        const err = accountResult.status === 'rejected' ? accountResult.reason : accountResult.value.error;
        message('walletAccountStatus', `Balance unavailable: ${err?.message || 'Could not read wallet account.'} Use Refresh wallet to try again.`, true);
        if ($('coinBalance')) $('coinBalance').textContent = 'Unavailable';
      }

      if (ledgerResult.status === 'fulfilled' && !ledgerResult.value.error) {
        ledger = ledgerResult.value.data || [];
        if (recent) { recent.replaceChildren(); recent.setAttribute('aria-busy', 'false'); if (!ledger.length) recent.append(node('p', 'wallet-muted', 'No wallet activity recorded yet.')); else ledger.slice(0, 5).forEach(x => recent.append(ledgerRow(x))); }
        renderLedger();
      } else {
        const err = ledgerResult.status === 'rejected' ? ledgerResult.reason : ledgerResult.value.error;
        if (recent) { recent.replaceChildren(node('p', 'wallet-status error', `Activity could not load: ${err?.message || 'Please try again.'}`)); recent.setAttribute('aria-busy', 'false'); }
        message('coinLedger', `Transaction history unavailable: ${err?.message || 'Please try again.'}`, true);
      }
    } finally { setBusy(false); }
  }

  async function loadCreatorEarnings(client, user) {
    const status=$('creatorAccountState');
    const balance=$('creatorBalance');
    const history=$('creatorEarningsHistory');
    if(status)status.textContent='Loading your private creator earnings…';
    try {
      const result=await withTimeout(client.rpc('spike_my_creator_earnings'), 'Creator earnings request');
      if(result.error)throw result.error;
      const data=result.data||{};
      const totalEarned = data.total_earned_ngn ?? (Number(data.available_ngn || 0) + Number(data.reserved_ngn || 0) + Number(data.paid_ngn || 0));
      if(balance)balance.textContent=ngn(data.available_ngn);
      if($('walletEarningsUsd'))$('walletEarningsUsd').textContent=ngn(totalEarned);
      const breakdown = $('walletEarningsBreakdown');
      if(breakdown)breakdown.textContent=`Available ${ngn(data.available_ngn)} · Reserved ${ngn(data.reserved_ngn)} · Paid ${ngn(data.paid_ngn)}`;
      const meta=$('creatorBalanceMeta');
      if(meta)meta.textContent=`Available to withdraw when payouts are enabled · Lifetime net earned ${ngn(totalEarned)}`;
      if(status)status.textContent='Your creator earnings are loaded securely.';
      if(history){
        history.replaceChildren();
        const entries=Array.isArray(data.entries)?data.entries:[];
        if(!entries.length)history.append(node('p','wallet-muted','No creator earnings have been credited yet.'));
        entries.forEach(entry=>{
          const row=node('article','wallet-ledger-row');
          const main=node('div','wallet-ledger-main');
          main.append(node('strong','','Creator gift earning'),node('small','',entry.created_at?new Date(entry.created_at).toLocaleString():'Date unavailable'));
          const side=node('div','wallet-ledger-side');
          side.append(node('strong','wallet-ledger-amount is-credit',ngn(entry.amount_ngn)),node('small','',String(entry.status||'recorded')));
          row.append(main,side);history.append(row);
        });
      }
      const giftValue = $('walletGiftValueNgn');
      const giftMeta = $('walletGiftValueMeta');
      const giftFunding = $('walletGiftFundingMeta');
      const giftCount = Number(data.gift_count || 0);
      const coinsReceived = Number(data.coins_received || 0);
      if (giftValue) giftValue.textContent = ngn(data.gift_value_ngn);
      if (giftMeta) giftMeta.textContent = `${coinsReceived.toLocaleString('en-NG')} SP Coins · ${giftCount.toLocaleString('en-NG')} gifts`;
      if (giftFunding) giftFunding.textContent = giftCount > 0
        ? 'Verified paid-backed gift settlements'
        : 'No verified gift settlements yet';
      const reconcile=$('creatorGiftReconcileStatus');
      if(reconcile)reconcile.textContent='Earnings shown here are your own net credited amounts from the settlement ledger.';
    } catch(error) {
      if(status)status.textContent=`Creator earnings unavailable: ${error.message||'Please retry later.'}`;
      if(balance)balance.textContent='Unavailable';
      if($('walletEarningsUsd'))$('walletEarningsUsd').textContent='Unavailable';
      if($('walletEarningsBreakdown'))$('walletEarningsBreakdown').textContent='Earnings breakdown unavailable. Refresh to retry.';
      if(history)history.textContent='Creator earnings history could not be loaded. Use Refresh wallet to retry.';
      if($('walletGiftValueNgn'))$('walletGiftValueNgn').textContent='Unavailable';
      if($('walletGiftValueMeta'))$('walletGiftValueMeta').textContent='Gift ledger could not be reached';
      if($('walletGiftFundingMeta'))$('walletGiftFundingMeta').textContent='Use Refresh wallet to retry';
    }
    // No approved live FX rate is configured; never invent a USD conversion.
    if($('walletEarningsRate'))$('walletEarningsRate').textContent='Lifetime net earnings · NGN · verified settlement records';
  }

  function markUnavailable() {
    const unsupported = {
      walletReceivedGifts: 'Gift history is not available yet: SPIKE has not deployed a verified gift-settlement ledger.',
      creatorEligibility: 'Withdrawal requests use your full available creator earnings and are reviewed by SPIKE.',
      creatorProgress: 'Submit a withdrawal request to begin owner review.',
      creatorWithdrawalHistory: 'Your withdrawal history is available in the Withdraw earnings section.',
      creatorBankStatus: 'Bank details are collected securely only when you submit a payout request.'
    };
    for (const [id, value] of Object.entries(unsupported)) if ($(id)) message(id, value);
    if ($('walletGiftValueNgn')) $('walletGiftValueNgn').textContent = 'Loading…';
    if ($('walletGiftValueMeta')) $('walletGiftValueMeta').textContent = 'Connecting to your private gift ledger…';
    if ($('walletGiftFundingMeta')) $('walletGiftFundingMeta').textContent = 'Only verified paid-backed gifts are counted';
    if ($('walletEarningsUsd')) $('walletEarningsUsd').textContent = 'Loading…';
    if ($('walletEarningsRate')) $('walletEarningsRate').textContent = 'Loading verified settlement records…';
    for (const selector of ['#creatorGiftReconcileButton', '#creatorEligibilityRequestButton']) document.querySelectorAll(selector).forEach(button => { button.disabled = true; button.title = 'Unavailable until the secure server-side financial workflow is connected.'; });
    for (const id of ['creatorBankForm']) { const form = $(id); if (form) { form.querySelectorAll('input,button').forEach(x => x.disabled = true); form.addEventListener('submit', e => e.preventDefault(), { once: true }); } }
  }
  async function boot() {
    $('coinLedgerSearch')?.addEventListener('input', renderLedger);
    $('coinLedgerType')?.addEventListener('change', renderLedger);
    document.querySelectorAll('[data-wallet-refresh]').forEach(button => button.addEventListener('click', () => load().catch(e => message('walletAccountStatus', e.message || 'Wallet refresh failed.', true))));
    markUnavailable();
    await load();
    window.SPIKE_WALLET = Object.freeze({ refresh: load });
  }
  const start = () => boot().catch(e => { console.error('[SPIKE wallet]', e); message('walletAccountStatus', e.message || 'Wallet could not load. Use Refresh wallet to retry.', true); message('walletRecentActivity', e.message || 'Wallet could not load.', true); message('coinLedger', e.message || 'Wallet could not load.', true); const recent = $('walletRecentActivity'); if (recent) recent.setAttribute('aria-busy', 'false'); setBusy(false); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
