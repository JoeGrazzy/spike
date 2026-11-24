/* SPIKE friendly empty states — consistent, human, non-judgmental */
(() => {
  'use strict';
  if (window.SPIKEEmpty) return;

  const ICONS = {
    messages: '💬',
    friends: '🤝',
    notifications: '🔔',
    feed: '✨',
    search: '🔎',
    generic: '🌱'
  };

  /* Warm, useful defaults by context */
  const PRESETS = {
    feed: {
      icon: 'feed',
      title: 'Your feed is waiting',
      body: 'Follow a few people or explore what’s trending to fill it with moments.',
      actionLabel: 'Explore',
      actionHref: 'feed.html'
    },
    messages: {
      icon: 'messages',
      title: 'No conversations yet',
      body: 'Start one with a friend — the first message is always the hardest.',
      actionLabel: 'Find friends',
      actionHref: 'friends.html'
    },
    notifications: {
      icon: 'notifications',
      title: 'You’re all caught up',
      body: 'We’ll let you know when something needs your attention.'
    },
    friends: {
      icon: 'friends',
      title: 'No friends here yet',
      body: 'Find people you know or discover new connections.',
      actionLabel: 'Find people',
      actionHref: 'friends.html'
    },
    search: {
      icon: 'search',
      title: 'Nothing matched',
      body: 'Try a different name, topic, or spelling.'
    },
    generic: {
      icon: 'generic',
      title: 'Nothing here yet',
      body: 'When something arrives, it will show up here.'
    }
  };

  function render(options = {}) {
    const preset = PRESETS[options.preset] || PRESETS.generic;
    const {
      icon = preset.icon || 'generic',
      title = preset.title,
      body = preset.body,
      actionLabel = preset.actionLabel || null,
      actionHref = preset.actionHref || null,
      actionOnClick = null,
      className = ''
    } = options;

    const iconChar = ICONS[icon] || ICONS.generic;
    const action = actionLabel
      ? (actionHref
          ? `<a class="spike-empty-action" href="${actionHref}">${actionLabel}</a>`
          : `<button type="button" class="spike-empty-action" data-spike-empty-action>${actionLabel}</button>`)
      : '';

    return `<div class="spike-empty ${className}" role="status">
      <div class="spike-empty-icon" aria-hidden="true">${iconChar}</div>
      <h3 class="spike-empty-title">${title}</h3>
      <p class="spike-empty-body">${body}</p>
      ${action}
    </div>`;
  }

  function mount(target, options) {
    const el = typeof target === 'string' ? document.getElementById(target) || document.querySelector(target) : target;
    if (!el) return null;
    el.innerHTML = render(options);
    if (options.actionOnClick) {
      const btn = el.querySelector('[data-spike-empty-action]');
      if (btn) btn.addEventListener('click', options.actionOnClick);
    }
    return el;
  }

  /** Simple feed skeleton (3 rows) for loading states */
  function feedSkeleton(count = 3) {
    const rows = Array.from({ length: count }, () => `
      <div class="spike-feed-skeleton" aria-hidden="true">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-body">
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>`).join('');
    return `<div class="spike-feed-skeleton-wrap" role="status" aria-label="Loading posts">${rows}</div>`;
  }

  window.SPIKEEmpty = { render, mount, feedSkeleton, ICONS, PRESETS };
})();
