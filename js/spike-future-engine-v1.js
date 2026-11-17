/* SPIKE FUTURE ENGINE v1 — lightweight, decorative spatial network field.
   No dependencies, no network calls, no DOM interception, no user data collection. */
(() => {
  'use strict';
  const body = document.body;
  if (!body || body.dataset.spikeFutureEngine === 'ready') return;
  const page = body.dataset.spikePage || (location.pathname.split('/').pop() || 'home');
  if (/^(legal|policy|reset-password)\.html$/i.test(page)) return;
  body.dataset.spikeFutureEngine = 'ready';
  body.classList.add('spike-future-enabled', 'spike-tech-enabled');

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.id = 'spike-future-field';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('role', 'presentation');
  body.prepend(canvas);
  if (reduceMotion) return;

  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) { canvas.remove(); return; }
  let width = 0, height = 0, dpr = 1, raf = 0, last = 0, paused = !!document.hidden;
  let pointer = { x: -1000, y: -1000 };
  let nodes = [];
  const mobile = window.matchMedia && window.matchMedia('(max-width: 680px)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  const targetCount = saveData ? 12 : (mobile ? 18 : 36);
  const rand = (min, max) => min + Math.random() * (max - min);

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.25);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nodes = Array.from({ length: targetCount }, () => ({
      x: rand(0, width), y: rand(0, height),
      vx: rand(-.105, .105), vy: rand(-.09, .09), r: rand(.65, 1.55), phase: rand(0, Math.PI * 2)
    }));
  }
  function draw(time) {
    if (paused || document.hidden) { raf = 0; return; }
    if (time - last < (mobile ? 48 : 32)) { raf = requestAnimationFrame(draw); return; }
    last = time;
    ctx.clearRect(0, 0, width, height);
    const linkDistance = mobile ? 92 : 132;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      a.x += a.vx; a.y += a.vy;
      if (a.x < -12 || a.x > width + 12) a.vx *= -1;
      if (a.y < -12 || a.y > height + 12) a.vy *= -1;
      const dxp = a.x - pointer.x, dyp = a.y - pointer.y;
      const pd = Math.hypot(dxp, dyp);
      if (pd < 115 && pd > 0) { a.x += dxp / pd * .035; a.y += dyp / pd * .035; }
      const pulse = .55 + Math.sin(time * .00055 + a.phase) * .20;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(94, 215, 255, ${pulse * .58})`; ctx.fill();
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, dist = Math.hypot(dx, dy);
        if (dist < linkDistance) {
          const alpha = (1 - dist / linkDistance) * (mobile ? .13 : .19);
          ctx.strokeStyle = `rgba(74, 185, 235, ${alpha})`;
          ctx.lineWidth = .65;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(draw);
  }
  function pause() {
    paused = true;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    pointer.x = pointer.y = -1000;
  }
  function resume() {
    if (document.hidden) return;
    paused = false;
    if (!raf) raf = requestAnimationFrame(draw);
  }
  function onVisibility() { if (document.hidden) pause(); else resume(); }
  function onPointer(event) { if (!paused) { pointer.x = event.clientX; pointer.y = event.clientY; } }
  resize();
  raf = requestAnimationFrame(draw);
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('blur', pause, { passive: true });
  window.addEventListener('focus', resume, { passive: true });
  window.addEventListener('pagehide', pause, { passive: true });
  window.addEventListener('pageshow', resume, { passive: true });
  document.addEventListener('visibilitychange', onVisibility, { passive: true });
})();
