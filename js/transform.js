/* =========================================================
   Hero transformation: a golden "hand" sweeps through the hair,
   turning the damaged hair (before) into pearl-blonde balayage (after).
   Canvas 2D: both photos drawn with the same cinematic slow push-in,
   the "before" photo is erased along the hand's path, with gold sparks.
   ========================================================= */
(function () {
  'use strict';
  const frame = document.querySelector('.cine__bg');
  if (!frame) return;
  const imgBefore = frame.querySelector('.studio__before');
  const imgAfter = frame.querySelector('.cine__after');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { frame.classList.add('is-after'); return; }

  // Real video version: plays the transformation, holds the result, then starts again from "before".
  const vid = frame.querySelector('.cine__video');
  if (vid) {
    frame.classList.add('has-video');
    const HOLD = 3500;
    const sync = () => frame.classList.toggle('is-after', vid.duration ? vid.currentTime > vid.duration * 0.55 : false);
    vid.addEventListener('timeupdate', sync);
    vid.addEventListener('ended', () => {
      frame.classList.add('is-after');
      setTimeout(() => { frame.classList.add('is-rewinding'); setTimeout(() => {
        // alternate between the takes listed in data-videos
        const list = (vid.dataset.videos || '').split(',').map((x) => x.trim()).filter(Boolean);
        if (list.length > 1) { vid.dataset.i = String(((+vid.dataset.i || 0) + 1) % list.length); vid.src = list[+vid.dataset.i]; }
        else vid.currentTime = 0;
        frame.classList.remove('is-after', 'is-rewinding'); vid.play().catch(() => {});
      }, 700); }, HOLD);
    });
    vid.play().catch(() => {});
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'cine__canvas';
  frame.insertBefore(canvas, frame.querySelector('.cine__shade'));
  const ctx = canvas.getContext('2d');
  const buf = document.createElement('canvas'), bctx = buf.getContext('2d');   // "before" layer
  const mask = document.createElement('canvas'), mctx = mask.getContext('2d'); // where the hand has passed

  // path of the hand through the hair, in image coordinates (0..1)
  const PATH = [[.30, .53], [.42, .49], [.56, .49], [.70, .54], [.66, .66], [.50, .64], [.36, .68], [.30, .82], [.42, .90], [.56, .86], [.70, .80], [.72, .96], [.50, 1.0], [.30, .98]];
  const SWEEP = 2600, BEFORE = 3200, AFTER = 5600, BACK = 900;

  let W = 0, H = 0, dpr = 1, sparks = [];
  function fit() {
    const r = frame.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    for (const c of [canvas, buf, mask]) { c.width = W; c.height = H; }
  }
  window.addEventListener('resize', fit);

  // same framing as the CSS version: cover, nudged right on desktop
  function rect(img, t) {
    const small = window.innerWidth <= 860;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const push = 1 + 0.05 * (0.5 - 0.5 * Math.cos(t / 14000 * Math.PI * 2)); // slow cinematic push-in
    const s = Math.max(W / iw, H / ih) * (small ? 1 : 1.04) * push;
    const dw = iw * s, dh = ih * s;
    const x = (W - dw) * 0.5 + (small ? 0 : W * 0.09);
    const y = (H - dh) * (small ? 0.2 : 0.18);
    return { x, y, w: dw, h: dh };
  }
  const pt = (R, p) => [R.x + p[0] * R.w, R.y + p[1] * R.h];
  function along(k) { // point on the polyline at progress k (0..1)
    const n = PATH.length - 1, f = Math.min(n - 1e-6, Math.max(0, k * n)), i = Math.floor(f), u = f - i;
    return [PATH[i][0] + (PATH[i + 1][0] - PATH[i][0]) * u, PATH[i][1] + (PATH[i + 1][1] - PATH[i][1]) * u];
  }
  function stamp(R, p, rad) {
    const [x, y] = pt(R, p);
    const g = mctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.55, 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = g; mctx.beginPath(); mctx.arc(x, y, rad, 0, Math.PI * 2); mctx.fill();
  }
  function emit(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random() * 1.6) * dpr;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6 * dpr, life: 1, r: (0.6 + Math.random() * 1.8) * dpr });
    }
  }

  let phase = 'before', t0 = performance.now(), lastK = 0, beforeAlpha = 1;
  function setPhase(p) { phase = p; t0 = performance.now(); }

  function frameLoop(now) {
    const t = now;
    const el = now - t0;
    const Rb = rect(imgBefore, t), Ra = rect(imgAfter, t);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(imgAfter, Ra.x, Ra.y, Ra.w, Ra.h);

    let head = null;
    if (phase === 'before') {
      mctx.clearRect(0, 0, W, H); lastK = 0; beforeAlpha = 1;
      if (el > BEFORE) { setPhase('sweep'); frame.classList.add('is-wiping'); }
    } else if (phase === 'sweep') {
      const k = Math.min(1, el / SWEEP);
      const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const rad = Rb.w * 0.11;
      for (let s = lastK; s <= e; s += 0.004) stamp(Rb, along(s), rad);
      lastK = e;
      head = pt(Rb, along(e));
      emit(head[0], head[1], 6);
      if (k >= 0.7) beforeAlpha = Math.max(0, 1 - (k - 0.7) / 0.3);
      if (k >= 1) { setPhase('after'); frame.classList.remove('is-wiping'); frame.classList.add('is-after'); }
    } else if (phase === 'after') {
      beforeAlpha = 0;
      if (el > AFTER) { setPhase('back'); frame.classList.remove('is-after'); mctx.clearRect(0, 0, W, H); }
    } else if (phase === 'back') {
      beforeAlpha = Math.min(1, el / BACK);
      if (el > BACK) setPhase('before');
    }

    if (beforeAlpha > 0) {
      bctx.globalCompositeOperation = 'source-over';
      bctx.clearRect(0, 0, W, H);
      bctx.drawImage(imgBefore, Rb.x, Rb.y, Rb.w, Rb.h);
      if (phase === 'sweep') { bctx.globalCompositeOperation = 'destination-out'; bctx.drawImage(mask, 0, 0); }
      ctx.globalAlpha = beforeAlpha;
      ctx.drawImage(buf, 0, 0);
      ctx.globalAlpha = 1;
    }

    // golden light of the hand + sparks
    ctx.globalCompositeOperation = 'lighter';
    if (head) {
      const r = Rb.w * 0.09;
      const g = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], r);
      g.addColorStop(0, 'rgba(255,236,180,.55)'); g.addColorStop(.4, 'rgba(212,169,69,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(head[0], head[1], r, 0, Math.PI * 2); ctx.fill();
    }
    sparks = sparks.filter((p) => p.life > 0);
    for (const p of sparks) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.03 * dpr; p.life -= 0.018;
      ctx.fillStyle = `rgba(255,${200 + Math.round(40 * p.life)},${120 + Math.round(80 * p.life)},${p.life})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + p.life), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(frameLoop);
  }

  function start() {
    fit();
    frame.classList.add('has-canvas');
    requestAnimationFrame(frameLoop);
  }
  const ready = (img) => img.complete && img.naturalWidth ? Promise.resolve() : new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); });
  Promise.all([ready(imgBefore), ready(imgAfter)]).then(() => {
    if (imgBefore.naturalWidth && imgAfter.naturalWidth) start();
  });
})();
