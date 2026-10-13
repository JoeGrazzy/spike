/* SPIKE DM signals: the single shared contract for inbox + conversation typing. */
(function (global) {
  'use strict';
  if (global.SPIKEDMSignals) return;
  const PREFIX = 'spike:dm-typing:v1:';
  const lower = value => String(value || '').toLowerCase();
  function pairTopic(a, b) {
    const pair = [lower(a), lower(b)].sort();
    return PREFIX + pair.join(':');
  }
  function subscribeTyping(client, selfId, peerId, onTyping) {
    if (!client || !selfId || !peerId || lower(selfId) === lower(peerId)) return null;
    const self = lower(selfId), peer = lower(peerId);
    const channel = client.channel(pairTopic(self, peer), { config: { private: true, broadcast: { ack: true, self: false } } });
    channel.on('broadcast', { event: 'typing' }, ({ payload } = {}) => {
      if (!payload || lower(payload.from) !== peer || lower(payload.to) !== self) return;
      try { onTyping?.(payload.typing === true, payload); } catch (error) { console.warn('[SPIKE DM signals] typing callback failed', error); }
    });
    return channel;
  }
  function publishTyping(channel, from, to, typing) {
    if (!channel || !from || !to) return Promise.resolve(false);
    return Promise.resolve(channel.send({ type: 'broadcast', event: 'typing', payload: { from: lower(from), to: lower(to), typing: typing === true } }))
      .then(() => true).catch(error => { console.info('[SPIKE DM signals] typing publish unavailable', error?.message || error); return false; });
  }
  async function startPresence(client, peerId) {
    if (!client || !global.AppPresence) return false;
    const started = await global.AppPresence.start(client);
    if (peerId) {
      global.AppPresence.watch([peerId]);
      // Last-seen hydration is privacy-filtered by the server RPC; realtime presence remains authoritative.
      try {
        const result = await client.rpc('spike_get_user_presence', { p_user_ids: [peerId] });
        const row = (result?.data || []).find(item => lower(item.user_id) === lower(peerId));
        const state = global.AppPresence.getState?.(peerId);
        const label = global.document?.querySelector('.titlewrap[data-presence-user] [data-presence-text]');
        if (row && !state?.online && label) label.textContent = row.last_seen ? 'Last seen ' + new Date(row.last_seen).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Offline';
      } catch (_) {}
    }
    return started;
  }
  async function remove(client, channel) {
    if (!client || !channel) return;
    try { await client.removeChannel(channel); } catch (_) {}
  }
  global.SPIKEDMSignals = Object.freeze({ pairTopic, subscribeTyping, publishTyping, startPresence, remove });
})(window);
