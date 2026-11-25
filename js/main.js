/* =========================================================
   Florin Roșca — interacțiuni & animații (GSAP + ScrollTrigger, scroll nativ)
   ========================================================= */
(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGsap = !!window.gsap;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  document.getElementById('year').textContent = new Date().getFullYear();

  if (hasGsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  /* Native scroll only (no inertia / scroll hijacking) */
  function scrollToTarget(target) {
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  }
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const target = id === '#top' ? document.body : $(id);
      if (!target) return;
      e.preventDefault();
      closeMenu();
      scrollToTarget(target);
    });
  });

  /* ---------- Nav ---------- */
  const nav = $('.nav');
  let lastY = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 40);
    nav.classList.toggle('is-hidden', y > lastY && y > 600 && !document.body.classList.contains('menu-open'));
    lastY = y;
  }, { passive: true });

  const burger = $('.nav__burger');
  const menu = $('.menu');
  function closeMenu() {
    menu.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
  }
  burger.addEventListener('click', () => {
    const open = !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('menu-open', open);
  });

  /* ---------- Magnetic buttons ---------- */
  if (finePointer && !reduced) {
    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * 0.22}px, ${dy * 0.3}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------- 3D tilt (cards, products, medal fallback) ---------- */
  if (finePointer && !reduced) {
    $$('[data-tilt]').forEach((el) => {
      const target = el.classList.contains('hero__medal') ? $('.medal', el) : el;
      const max = el.classList.contains('hero__medal') ? 14 : 9;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        target.style.transform = `perspective(1000px) rotateY(${(px - 0.5) * max * 2}deg) rotateX(${(0.5 - py) * max * 2}deg) translateZ(0)`;
        target.style.transition = 'transform .12s ease-out';
        el.style.setProperty('--mx', `${px * 100}%`);
        el.style.setProperty('--my', `${py * 100}%`);
        target.style.setProperty('--sx', `${px * 100}%`);
        target.style.setProperty('--sy', `${py * 100}%`);
      });
      el.addEventListener('pointerleave', () => {
        target.style.transition = 'transform .8s cubic-bezier(.22,1,.36,1)';
        target.style.transform = '';
      });
    });
  }

  /* ---------- Contact spotlight ---------- */
  const contact = $('.contact');
  contact.addEventListener('pointermove', (e) => {
    const r = contact.getBoundingClientRect();
    contact.style.setProperty('--cx', `${e.clientX - r.left}px`);
    contact.style.setProperty('--cy', `${e.clientY - r.top}px`);
  });

  /* ---------- Music toggle ---------- */
  const soundBtn = $('.sound'), theme = $('#theme');
  if (soundBtn && theme) {
    theme.volume = 0.7;
    // continue the song where it was when moving between the pages of the site
    try { const pos = +sessionStorage.getItem('fr-music-pos'); if (pos > 0) theme.addEventListener('loadedmetadata', () => { theme.currentTime = pos % (theme.duration || 1e9); }, { once: true }); } catch (e) {}
    window.addEventListener('pagehide', () => { try { sessionStorage.setItem('fr-music-pos', String(theme.currentTime || 0)); } catch (e) {} });
    const setState = (on) => {
      soundBtn.setAttribute('aria-pressed', String(on));
      soundBtn.classList.toggle('is-on', on);
      const label = on ? 'Oprește muzica' : 'Pornește muzica';
      $('.sound__label', soundBtn).textContent = label;
      soundBtn.setAttribute('aria-label', label);
    };
    // remember if this visitor switched the music off
    const KEY = 'fr-music-off-v2';
    const get = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
    const put = (v) => { try { v ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch (e) {} };
    // Intro on the home page: "Florin Roșca… Luxury Hair" + applause; the song comes in
    // over the last part of the applause and then goes on (with its own "Florin Roșca" later).
    const intro = new Audio('assets/audio/intro.mp3');
    intro.preload = 'auto'; intro.volume = 1;
    const hasHeroVideo = !!document.querySelector('.cine__video');
    let introDone = false, waiting = false, fallback = 0;
    try { introDone = sessionStorage.getItem('fr-intro-done') === '1'; } catch (e) {}
    const fadeIn = () => { theme.volume = 0; let v = 0; const t = setInterval(() => { v = Math.min(0.7, v + 0.14); theme.volume = v; if (v >= 0.7) clearInterval(t); }, 60); };
    const playTheme = (fade) => theme.play().then(() => { if (fade) fadeIn(); setState(true); return true; }).catch(() => false);
    const startSong = () => {
      if (!waiting) return;
      waiting = false; clearTimeout(fallback);
      // the intro already said "Florin Roșca" with applause: skip the song's first voice tag
      playTheme(true);
    };
    const SONG_AT = 8.3; // seconds into the intro: the song starts while the applause fades
    intro.addEventListener('timeupdate', () => { if (intro.currentTime >= SONG_AT) startSong(); });
    intro.addEventListener('ended', startSong);
    const start = () => {
      if (!theme.paused || waiting) return Promise.resolve(true);
      if (!introDone && hasHeroVideo) {
        return intro.play().then(() => {
          introDone = true; waiting = true; setState(true);
          try { sessionStorage.setItem('fr-intro-done', '1'); } catch (e) {}
          fallback = setTimeout(startSong, 9500); // safety net
          return true;
        }).catch(() => false);
      }
      return playTheme(false);
    };
    window.__music = { start, playing: () => !theme.paused || !intro.paused || waiting, off: get };

    soundBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (theme.paused && intro.paused && !waiting) { put(false); start(); }
      else { theme.pause(); intro.pause(); waiting = false; clearTimeout(fallback); setState(false); put(true); }
    });

    // Autostart: try right away; browsers that block sound without a gesture
    // start it on the visitor's first tap / click / key press anywhere on the page.
    if (!get()) {
      theme.preload = 'auto';
      // keep trying on every kind of interaction (tap, click, key, scroll, wheel) until the browser allows it
      const events = ['mousedown', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown', 'wheel', 'scroll', 'touchmove'];
      let trying = false;
      const stop = () => events.forEach((ev) => window.removeEventListener(ev, onFirst, true));
      const onFirst = () => {
        if (get() || !theme.paused) return stop();
        if (trying) return;
        trying = true;
        start().then((ok) => { trying = false; if (ok) stop(); });
      };
      start().then((ok) => {
        if (ok) return;
        events.forEach((ev) => window.addEventListener(ev, onFirst, { capture: true, passive: true }));
        // some browsers allow sound a moment later (e.g. after the page becomes visible)
        document.addEventListener('visibilitychange', onFirst);
        setTimeout(onFirst, 800);
      });
    }
  }

  /* ---------- Portfolio lightbox ---------- */
  const works = $$('.work');
  const lb = $('.lightbox'), lbImg = $('.lightbox__fig img'), lbCap = $('.lightbox__fig figcaption');
  let lbIndex = 0, lastFocus = null;
  function showWork(i) {
    lbIndex = (i + works.length) % works.length;
    const w = works[lbIndex];
    lbImg.src = w.dataset.full; lbImg.alt = $('img', w).alt; lbCap.innerHTML = w.dataset.cap;
  }
  function openLb(i) { lastFocus = document.activeElement; showWork(i); lb.hidden = false; document.body.style.overflow = 'hidden'; $('.lightbox__close').focus(); }
  function closeLb() { lb.hidden = true; document.body.style.overflow = ''; if (lastFocus) lastFocus.focus(); }
  works.forEach((w, i) => w.addEventListener('click', () => openLb(i)));
  $('.lightbox__close').addEventListener('click', closeLb);
  $('.lightbox__prev').addEventListener('click', () => showWork(lbIndex - 1));
  $('.lightbox__next').addEventListener('click', () => showWork(lbIndex + 1));
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });
  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowRight') showWork(lbIndex + 1);
    if (e.key === 'ArrowLeft') showWork(lbIndex - 1);
  });
  let tx = null;
  lb.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 40) showWork(lbIndex + (dx < 0 ? 1 : -1));
  });

  /* ---------- Text splitting helpers ---------- */
  function splitChars(el) {
    const text = el.textContent;
    el.textContent = '';
    for (const ch of text) {
      const s = document.createElement('span');
      s.className = 'char';
      s.textContent = ch === ' ' ? ' ' : ch;
      el.appendChild(s);
    }
    return $$('.char', el);
  }
  // wrap each <br>-separated line of a heading in a mask
  function splitLines(el) {
    const parts = el.innerHTML.split(/<br\s*\/?>/i);
    el.innerHTML = parts.map((p) => `<span class="rl-line"><span>${p}</span></span>`).join('');
    return $$('.rl-line > span', el);
  }

  /* ---------- Counters ---------- */
  function runCounter(el) {
    const end = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.decimals || '0', 10);
    const suf = el.dataset.suffix || '';
    const fmt = (v) => v.toFixed(dec).replace('.', ',') + suf;
    if (!hasGsap || reduced) { el.textContent = fmt(end); return; }
    const o = { v: 0 };
    gsap.to(o, { v: end, duration: 2, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(o.v); } });
  }

  /* ---------- No GSAP / reduced motion: show everything ---------- */
  if (!hasGsap || reduced) {
    $$('[data-count]').forEach(runCounter);
    finishLoader(true);
    return;
  }

  /* ---------- Preloader ---------- */
  const heroChars = $$('.hero__title .split').flatMap(splitChars);
  gsap.set(heroChars, { yPercent: 115, rotateX: -80, opacity: 0, transformOrigin: '50% 100%' });
  gsap.set('.reveal-hero', { y: 30, opacity: 0 });
  gsap.set('.hero__medal', { opacity: 0, scale: 0.85 });
  gsap.set('.nav', { yPercent: -100 });

  function finishLoader(instant) {
    const loader = $('.loader');
    const done = () => { document.body.classList.remove('is-loading'); if (window.Stage) window.Stage.intro(); window.__entered = true; window.dispatchEvent(new Event('fr:entered')); };
    if (instant || !hasGsap) { loader.remove(); done(); return; }
    const tl = gsap.timeline({ onComplete: () => loader.remove() });
    tl.to('.loader__inner', { opacity: 0, scale: 0.92, duration: 0.5, ease: 'power2.in' })
      .add(done)
      .to('.loader__curtain--top', { yPercent: -100, duration: 1.1, ease: 'expo.inOut' }, '<')
      .to('.loader__curtain--bottom', { yPercent: 100, duration: 1.1, ease: 'expo.inOut' }, '<')
      .to('.nav', { yPercent: 0, duration: 1, ease: 'expo.out' }, '-=0.5')
      .to(heroChars, { yPercent: 0, rotateX: 0, opacity: 1, duration: 1.3, stagger: 0.045, ease: 'expo.out' }, '-=0.9')
      .to('.hero__medal', { opacity: 1, scale: 1, duration: 1.6, ease: 'expo.out' }, '<')
      .to('.reveal-hero', { y: 0, opacity: 1, duration: 1, stagger: 0.1, ease: 'power3.out' }, '-=1.1');
  }

  // Entrance: the music starts the moment the site opens. Browsers only allow sound after a tap,
  // so when autoplay is blocked we show an "Intră în salon" button; tapping it starts the music and opens the site.
  // Entrance: if the browser blocks sound, show the "Intră în salon" button; one tap starts the music and opens the site.
  async function enterGate() {
    const m = window.__music;
    if (!m || m.off() || m.playing()) return finishLoader(false);
    if (await m.start()) return finishLoader(false);
    const loader = $('.loader'), btn = $('.loader__enter');
    if (!btn) return finishLoader(false);
    loader.setAttribute('aria-hidden', 'false');
    loader.classList.add('is-gate');
    btn.hidden = false; btn.focus();
    btn.addEventListener('click', () => { m.start(); btn.disabled = true; finishLoader(false); }, { once: true });
  }

  (function runLoader() {
    const bar = $('.loader__bar span'), count = $('.loader__count');
    const p = { v: 0 };
    // don't wait for the video and music to download: the page text is ready
    let loaded = document.readyState !== 'loading';
    document.addEventListener('DOMContentLoaded', () => { loaded = true; });
    const tween = gsap.to(p, {
      v: 100, duration: 0.9, ease: 'power2.inOut',
      onUpdate() {
        // hold at 90% until assets are loaded
        if (!loaded && p.v > 90) { p.v = 90; }
        bar.style.width = p.v + '%';
        count.textContent = Math.round(p.v);
      },
      onComplete() {
        const wait = () => (loaded ? enterGate() : setTimeout(wait, 100));
        wait();
      }
    });
    setTimeout(() => { loaded = true; }, 1500); // safety net
    return tween;
  })();

  /* ---------- Generic reveals ---------- */
  $$('.reveal').forEach((el) => {
    gsap.from(el, { y: 40, opacity: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
  });
  $$('.reveal-lines').forEach((el) => {
    const lines = splitLines(el);
    gsap.from(lines, { yPercent: 110, duration: 1.2, stagger: 0.12, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 85%' } });
  });
  $$('[data-count]').forEach((el) => {
    ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => runCounter(el) });
  });

  /* ---------- Images: reveal once, then a slow self-running drift ---------- */
  $$('.parallax').forEach((fig, i) => {
    gsap.from(fig, { clipPath: 'inset(100% 0 0 0)', duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: fig, start: 'top 90%' } });
    const img = $('img', fig);
    if (img) gsap.fromTo(img, { scale: 1.12, yPercent: -2 }, { scale: 1.04, yPercent: 2, duration: 7 + i, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  });
  gsap.to('[data-float]', { y: -16, rotate: -4, duration: 3, ease: 'sine.inOut', yoyo: true, repeat: -1 });

  /* ---------- Services: cards + floating elements ---------- */
  gsap.from('.card', {
    y: 120, rotateX: -35, opacity: 0, transformOrigin: '50% 100%', duration: 1.4, stagger: 0.12, ease: 'expo.out',
    scrollTrigger: { trigger: '.cards', start: 'top 85%' }
  });
  $$('.floater').forEach((f, i) => {
    gsap.to(f, { y: -30 - i * 8, rotate: (i % 2 ? 1 : -1) * (25 + i * 8), duration: 4 + i * 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.to(f, { x: (i % 2 ? 14 : -14), duration: 3 + i * 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  });
  // place ring words in 3D
  const ringWords = $$('.ring3d span');
  ringWords.forEach((s, i) => {
    const a = (360 / ringWords.length) * i;
    s.style.transform = `translate(-50%,-50%) rotateY(${a}deg) translateZ(230px)`;
  });

  /* ---------- Process line draw ---------- */
  const path = $('.process__line path');
  if (path) {
    const len = path.getTotalLength();
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
    gsap.to(path, { strokeDashoffset: 0, duration: 2.4, ease: 'power2.inOut', scrollTrigger: { trigger: '.process', start: 'top 70%' } });
  }

  /* ---------- Portfolio: user-controlled strip (drag / swipe / arrows) ---------- */
  gsap.from('.work', { y: 60, opacity: 0, duration: 1.2, stagger: 0.08, ease: 'expo.out', scrollTrigger: { trigger: '.works__grid', start: 'top 85%' } });

  /* ---------- Products & FAQ ---------- */
  gsap.from('.product__img', { rotateY: -40, opacity: 0, duration: 1.4, stagger: 0.1, ease: 'expo.out', scrollTrigger: { trigger: '.products', start: 'top 85%' } });

  /* ---------- Contact entrance ---------- */
  gsap.from('.booking', { rotateY: -18, rotateX: 8, transformPerspective: 1200, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: '.booking', start: 'top 85%' } });

  window.addEventListener('load', () => ScrollTrigger.refresh());
})();

/* TikTok creator embed: loaded only when the section comes into view */
(function () {
  const box = document.querySelector('.tt__embed');
  if (!box) return;
  const load = () => {
    const u = box.dataset.tt;
    box.innerHTML = '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@' + u + '" data-unique-id="' + u + '" data-embed-type="creator" style="max-width:780px;min-width:288px;"><section><a target="_blank" rel="noopener" href="https://www.tiktok.com/@' + u + '?refer=creator_embed">@' + u + '</a></section></blockquote>';
    const s = document.createElement('script'); s.async = true; s.src = 'https://www.tiktok.com/embed.js'; document.body.appendChild(s);
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '400px' });
    io.observe(box);
  } else load();
})();
