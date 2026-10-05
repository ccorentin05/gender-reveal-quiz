// Utilitaires partagés TV / animateur / joueur
window.Q = (() => {
  let offset = 0; // décalage horloge serveur - client

  const sync = (state) => { if (state && state.serverNow) offset = state.serverNow - Date.now(); };
  const now = () => Date.now() + offset;
  const remaining = (endsAt) => Math.max(0, endsAt - now());

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);

  // Boucle d'affichage d'un chrono (une seule active à la fois)
  let raf = null;
  function countdown(endsAt, duration, onTick) {
    cancelAnimationFrame(raf);
    const tick = () => {
      const ms = remaining(endsAt);
      onTick(ms, ms / duration);
      if (ms > 0) raf = requestAnimationFrame(tick);
    };
    tick();
  }
  const stopCountdown = () => cancelAnimationFrame(raf);

  // Confettis légers en canvas
  let confettiGen = 0;
  function clearConfetti() {
    confettiGen += 1;
    const c = document.getElementById('confetti');
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  }
  function confetti(duration = 4000, colors = ['#F2B8C0', '#9FCFDC', '#F5DC7A', '#E2BC94', '#C47F8C', '#4F7F9A']) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let canvas = document.getElementById('confetti');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'confetti';
      document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    const W = (canvas.width = innerWidth * devicePixelRatio);
    const H = (canvas.height = innerHeight * devicePixelRatio);
    const parts = Array.from({ length: 180 }, () => ({
      x: Math.random() * W,
      y: -Math.random() * H * 0.6,
      w: (6 + Math.random() * 8) * devicePixelRatio,
      h: (10 + Math.random() * 10) * devicePixelRatio,
      vy: (2 + Math.random() * 4) * devicePixelRatio,
      vx: (Math.random() - 0.5) * 2 * devicePixelRatio,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const gen = ++confettiGen;
    const end = performance.now() + duration;
    (function frame(t) {
      if (gen !== confettiGen) return;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        if (p.y > H && t < end) { p.y = -20; p.x = Math.random() * W; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < end || parts.some((p) => p.y < H)) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    })(performance.now());
  }

  // Animation d'un nombre (0 -> cible)
  function countUp(el, target, ms = 1400, suffix = '') {
    const start = performance.now();
    (function f(t) {
      const k = Math.min(1, (t - start) / ms);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))) + suffix;
      if (k < 1) requestAnimationFrame(f);
    })(start);
  }

  const ordinal = (n) => (n === 1 ? '1er' : `${n}e`);

  return { sync, now, remaining, esc, $, countdown, stopCountdown, confetti, clearConfetti, countUp, ordinal };
})();
