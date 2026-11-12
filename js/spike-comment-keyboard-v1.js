/* Keep the active Feed Echo input above Android's soft keyboard. */
(() => {
  'use strict';
  const SELECTOR = '.comment-form textarea';
  let activeInput = null;
  let revealTimers = [];
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function cancelScheduledReveal() {
    revealTimers.forEach(clearTimeout);
    revealTimers = [];
  }

  function revealInput(input, force = false) {
    if (!input || !input.isConnected || document.activeElement !== input) return;
    const viewport = window.visualViewport;
    const visibleTop = viewport ? viewport.offsetTop : 0;
    const visibleBottom = visibleTop + (viewport ? viewport.height : window.innerHeight);
    const rect = input.getBoundingClientRect();
    const margin = 22;
    const clipped = rect.bottom > visibleBottom - margin || rect.top < visibleTop + 10;
    if (!force && !clipped) return;
    try {
      input.scrollIntoView({
        behavior: reducedMotion() ? 'auto' : 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    } catch (_) {
      try { input.scrollIntoView(true); } catch (_) {}
    }
  }

  function scheduleReveal(input, force = false) {
    cancelScheduledReveal();
    // Android WebView may deliver the keyboard animation and visualViewport
    // resize in several stages. Recheck after each stage instead of guessing
    // based only on the viewport size at the moment focus begins.
    [80, 220, 420, 700].forEach((delay, index) => {
      revealTimers.push(setTimeout(() => {
        if (activeInput === input && document.activeElement === input) revealInput(input, force && index === 0);
      }, delay));
    });
  }

  document.addEventListener('focusin', event => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement) || !target.matches(SELECTOR)) return;
    activeInput = target;
    target.style.scrollMarginBlock = '24px';
    scheduleReveal(target, true);
  });

  document.addEventListener('focusout', event => {
    if (event.target !== activeInput) return;
    setTimeout(() => {
      if (document.activeElement !== activeInput) {
        activeInput = null;
        cancelScheduledReveal();
      }
    }, 80);
  });

  // Reposition again when the soft keyboard changes the visual viewport.
  if (window.visualViewport) {
    const onViewportChange = () => {
      if (activeInput && document.activeElement === activeInput) scheduleReveal(activeInput, false);
    };
    window.visualViewport.addEventListener('resize', onViewportChange, { passive: true });
    window.visualViewport.addEventListener('scroll', onViewportChange, { passive: true });
  }

  // Expanding a multi-line Echo can push its own input under the keyboard.
  document.addEventListener('input', event => {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement && target.matches(SELECTOR) && document.activeElement === target) {
      scheduleReveal(target, false);
    }
  });
})();
