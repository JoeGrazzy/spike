/* RLS-scoped unread notification badges for the feed header. */
(() => {
  'use strict';
  if (window.__SPIKE_NOTIFICATION_BADGES_V1__) return;
  window.__SPIKE_NOTIFICATION_BADGES_V1__ = true;
  const db = () => window.SPIKE_SUPABASE || window.db;
  let channel = null, user = null;
  function paint(count) {
    document.querySelectorAll('[data-spike-notification-badge]').forEach(link => {
      const badge = link.querySelector('.spike-notification-badge-count');
      if (badge) { badge.textContent = count > 99 ? '99+' : String(count); badge.hidden = count < 1; }
      link.setAttribute('aria-label', count ? `Notifications, ${count} unread` : 'Notifications, no unread alerts');
      link.title = count ? `${count} unread notifications` : 'Notifications';
    });
  }
  async function refresh() {
    const client = db(); if (!client) return;
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) { paint(0); return; }
    user = data.user;
    const { count, error: queryError } = await client.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);
    if (queryError) { console.warn('[SPIKE notification badge]', queryError.message); return; }
    paint(count || 0);
    if (!channel) channel = client.channel(`spike-header-notifications-${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, refresh).subscribe();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => refresh().catch(console.warn), { once: true }); else refresh().catch(console.warn);
  window.addEventListener('focus', () => refresh().catch(console.warn));
  window.addEventListener('pagehide', () => { if (channel && db()) db().removeChannel(channel); }, { once: true });
})();
