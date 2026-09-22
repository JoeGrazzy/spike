(() => {
  'use strict';
  const root = document.getElementById('spikeFeedLive');
  const list = document.getElementById('spikeFeedLiveList');
  if (!root || !list) return;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = value => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
  const ago = value => {
    const t = new Date(value).getTime();
    if (!Number.isFinite(t)) return 'now';
    const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  let refreshTimer = null;
  let channel = null;

  function client() {
    return window.__SPIKE_SUPABASE__ || window.supabaseClient || window.sb || null;
  }

  function render(streams, profiles) {
    if (!streams.length) {
      root.hidden = true;
      list.innerHTML = '';
      return;
    }
    const rows = streams.slice(0, 8).map(s => {
      const p = profiles.find(x => x.id === s.host_id) || {};
      const host = p.display_name || p.username || 'SPIKE Creator';
      const avatar = p.avatar_url || '';
      return `<a class="spike-feed-live-card" href="live.html?stream=${encodeURIComponent(s.id)}&from=feed" aria-label="Join ${esc(host)} live: ${esc(s.title || 'Live broadcast')}">
        <div class="spike-feed-live-avatar">${avatar ? `<img src="${esc(avatar)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<span>✦</span>'}<i aria-hidden="true"></i></div>
        <div class="spike-feed-live-copy"><strong>${esc(host)}</strong><b>${esc(s.title || 'Live broadcast')}</b><span>${esc(s.category || 'Live')} · ${num(s.viewer_count)} watching · ${ago(s.started_at)} ago</span></div>
        <span class="spike-feed-live-join">Join</span>
      </a>`;
    }).join('');
    list.innerHTML = rows;
    root.hidden = false;
  }

  async function load() {
    const sb = client();
    if (!sb) return;
    try {
      const { data: streams, error } = await sb.from('spike_live_streams')
        .select('id,host_id,title,category,started_at,viewer_count,guest_open,status')
        .eq('status', 'live')
        .order('viewer_count', { ascending: false })
        .order('started_at', { ascending: false })
        .limit(12);
      if (error) throw error;
      const live = streams || [];
      const ids = [...new Set(live.map(s => s.host_id).filter(Boolean))];
      let profiles = [];
      if (ids.length) {
        const result = await sb.from('profiles').select('id,display_name,username,avatar_url').in('id', ids);
        if (!result.error) profiles = result.data || [];
      }
      render(live, profiles);
    } catch (error) {
      console.warn('SPIKE Feed Live load failed', error);
      root.hidden = true;
    }
  }

  function subscribe(sb) {
    try {
      channel?.unsubscribe?.();
      channel = sb.channel('spike-feed-live-rail')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'spike_live_streams' }, load)
        .subscribe();
    } catch (error) {
      console.warn('SPIKE Feed Live realtime unavailable', error);
    }
  }

  function init() {
    const sb = client();
    if (!sb) {
      setTimeout(init, 250);
      return;
    }
    load();
    subscribe(sb);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30000);
  }

  window.addEventListener('beforeunload', () => {
    clearInterval(refreshTimer);
    try { channel?.unsubscribe?.(); } catch (_) {}
  }, { once: true });

  init();
})();
