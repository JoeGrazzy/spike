(() => {
  'use strict';
  if (window.__SPIKE_GUIDE_EXPERIENCE_V2__) return;
  window.__SPIKE_GUIDE_EXPERIENCE_V2__ = true;
  function boot() {
    const content = document.querySelector('#guideContent, .content');
    if (!content || document.getElementById('spikeXGuideWelcome')) return;
    const card = document.createElement('section');
    card.id = 'spikeXGuideWelcome';
    card.className = 'spike-x-guide-welcome';
    card.innerHTML = `
      <div class="eyebrow">START HERE</div>
      <h1>Welcome to SPIKE.</h1>
      <p>SPIKE stays simple on the surface: see what matters, share what is happening, connect with people, and grow at your own pace. The powerful tools are there when you need them.</p>
      <div class="spike-x-guide-jobs">
        <div class="spike-x-guide-job"><b>HOME</b><span>Feed, Stories and Live.</span></div>
        <div class="spike-x-guide-job"><b>DISCOVER</b><span>People, topics and conversations.</span></div>
        <div class="spike-x-guide-job"><b>CREATE</b><span>Posts, Stories and media.</span></div>
        <div class="spike-x-guide-job"><b>CONNECT</b><span>Messages, Rooms and Live.</span></div>
        <div class="spike-x-guide-job"><b>YOU</b><span>Profile, saved items and progress.</span></div>
      </div>
      <div class="spike-x-guide-vocab" aria-label="SPIKE vocabulary">
        <div><strong>Signal</strong><small>A post you share.</small></div>
        <div><strong>Pulse</strong><small>What is happening now.</small></div>
        <div><strong>Pass</strong><small>Share something with someone.</small></div>
        <div><strong>Momentum</strong><small>Attention that is growing.</small></div>
        <div><strong>Signal Chain</strong><small>A connected conversation.</small></div>
        <div><strong>Signal Vault</strong><small>Your saved content.</small></div>
      </div>`;
    content.insertBefore(card, content.firstElementChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
