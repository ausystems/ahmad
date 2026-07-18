// ui.js — loading screen, HUD, art & about panels, toasts. Seed 13000.
// Premium editorial: Marcellus display over Archivo, hairline gold rules.

import { WORKS, ABOUT, STUDIO } from './data.js';

export function createUI(ctx) {
  const root = document.getElementById('ui');

  const style = document.createElement('style');
  style.textContent = /* css */`
    #ui * { box-sizing: border-box; }
    .fade { transition: opacity .6s ease; }
    .hidden { opacity: 0; pointer-events: none !important; }

    /* ---------------- loading ---------------- */
    .load {
      position: absolute; inset: 0; background: var(--bg);
      display: grid; place-items: center; z-index: 60;
      transition: opacity 1.1s ease;
    }
    .load__inner { text-align: center; max-width: 30rem; padding: 2rem; }
    .load__mark {
      font-family: Marcellus, Georgia, serif; font-size: clamp(2.6rem, 7vw, 4.4rem);
      letter-spacing: .34em; text-indent: .34em; color: var(--cream);
    }
    .load__sub {
      margin-top: .9rem; font-size: .72rem; letter-spacing: .32em; text-indent: .32em;
      text-transform: uppercase; color: var(--muted);
    }
    .load__barwrap { margin: 2.6rem auto 0; width: 200px; height: 1px; background: #2a2c30; }
    .load__bar { height: 100%; width: 0%; background: var(--gold); transition: width .4s ease; }
    .load__enter {
      margin-top: 2.6rem; opacity: 0; transition: opacity .8s ease;
      font-size: .82rem; letter-spacing: .28em; text-indent: .28em; text-transform: uppercase;
      color: var(--gold); cursor: pointer; background: none; border: 1px solid var(--gold-dim);
      padding: 1rem 2.2rem; font-family: inherit;
    }
    .load__enter:hover { background: rgba(200,162,74,.12); }
    .load__hints {
      margin-top: 1.6rem; font-size: .68rem; letter-spacing: .14em; color: var(--muted);
      opacity: 0; transition: opacity .8s ease .15s;
    }
    .load.ready .load__enter, .load.ready .load__hints { opacity: 1; }

    /* ---------------- HUD ---------------- */
    .dot {
      position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px;
      border-radius: 50%; background: #fff; opacity: .3; mix-blend-mode: difference;
      transition: opacity .25s ease, transform .25s ease; pointer-events: none;
    }
    .dot.hot { opacity: .95; transform: scale(1.6); }
    .prompt {
      position: absolute; left: 50%; top: calc(50% + 2.2rem); transform: translateX(-50%);
      font-size: .78rem; letter-spacing: .18em; text-transform: uppercase; color: var(--cream);
      background: rgba(13,14,16,.55); border: 1px solid rgba(200,162,74,.35);
      padding: .55rem 1.1rem; backdrop-filter: blur(6px); white-space: nowrap;
      opacity: 0; transition: opacity .2s ease; pointer-events: none;
    }
    .prompt.on { opacity: 1; }
    .prompt b { color: var(--gold); font-weight: 600; }
    .brand {
      position: absolute; left: 1.4rem; bottom: 1.2rem; font-size: .68rem;
      letter-spacing: .26em; text-transform: uppercase; color: rgba(236,228,211,.55);
      pointer-events: none;
    }
    .pills { position: absolute; right: 1.4rem; bottom: 1.1rem; display: flex; gap: .55rem; }
    .pill {
      font-family: inherit; font-size: .7rem; letter-spacing: .22em; text-transform: uppercase;
      color: var(--cream); background: rgba(13,14,16,.5); border: 1px solid rgba(236,228,211,.22);
      padding: .55rem 1.05rem; cursor: pointer; backdrop-filter: blur(6px);
      transition: border-color .2s ease, color .2s ease;
      display: inline-flex; align-items: center; gap: .4rem;
    }
    .pill:hover { border-color: var(--gold); color: var(--gold); }
    .pill svg { width: .95rem; height: .95rem; fill: currentColor; }

    /* ---------------- panels ---------------- */
    .scrim {
      position: absolute; inset: 0; background: rgba(8,9,11,.4); opacity: 0;
      transition: opacity .45s ease; pointer-events: none; z-index: 30;
    }
    .scrim.on { opacity: 1; pointer-events: auto; }
    .panel {
      position: absolute; top: 0; bottom: 0; width: min(500px, 94vw);
      background: linear-gradient(160deg, #14151a, #0d0e10);
      border-left: 1px solid rgba(200,162,74,.25);
      padding: clamp(1.6rem, 4vh, 3rem); overflow-y: auto; z-index: 40;
      transition: transform .55s cubic-bezier(.22,1,.3,1);
      scrollbar-width: thin;
    }
    .panel--right { right: 0; transform: translateX(105%); }
    .panel--left { left: 0; border-left: 0; border-right: 1px solid rgba(200,162,74,.25); transform: translateX(-105%); }
    .panel.open { transform: translateX(0); }
    .panel__close {
      position: absolute; top: 1.1rem; right: 1.1rem; width: 2.4rem; height: 2.4rem;
      background: none; border: 1px solid rgba(236,228,211,.25); color: var(--cream);
      font-size: 1rem; cursor: pointer; font-family: inherit;
    }
    .panel__close:hover { border-color: var(--gold); color: var(--gold); }
    .panel__eyebrow {
      font-size: .66rem; letter-spacing: .3em; text-transform: uppercase; color: var(--gold);
      margin-bottom: 1.1rem;
    }
    .panel__title {
      font-family: Marcellus, Georgia, serif; font-size: clamp(1.9rem, 4.4vw, 2.6rem);
      color: var(--cream); line-height: 1.12; margin-bottom: .4rem;
    }
    .panel__role { color: var(--muted); font-size: .92rem; margin-bottom: 1.6rem; }
    .panel img {
      width: 100%; border: 1px solid rgba(200,162,74,.35); margin: 1.2rem 0; display: block;
      background: #000;
    }
    .panel p { color: #c9c2b4; font-size: .95rem; line-height: 1.75; margin-bottom: 1.1rem; }
    .panel .domain {
      display: inline-block; font-size: .78rem; letter-spacing: .12em; color: var(--gold);
      border: 1px solid rgba(200,162,74,.4); padding: .35rem .8rem; margin-bottom: 1.2rem;
      text-decoration: none;
    }
    .panel .price {
      font-size: .8rem; letter-spacing: .24em; text-transform: uppercase; color: var(--cream);
      border-top: 1px solid rgba(236,228,211,.14); padding-top: 1.3rem; margin-top: 1.4rem;
    }
    .panel .visit {
      display: block; text-align: center; margin-top: 1.6rem; padding: 1.05rem;
      background: var(--gold); color: #17140c; text-decoration: none; font-weight: 600;
      font-size: .8rem; letter-spacing: .26em; text-transform: uppercase;
      transition: filter .2s ease;
    }
    .panel .visit:hover { filter: brightness(1.12); }
    .panel .rule { border: 0; border-top: 1px solid rgba(200,162,74,.25); margin: 2rem 0 1.6rem; }
    .panel a.mail { color: var(--gold); text-decoration: none; font-size: 1.05rem; letter-spacing: .05em; }
    .panel a.mail:hover { text-decoration: underline; }

    /* ---------------- toast ---------------- */
    .toast {
      position: absolute; bottom: 4.2rem; left: 50%; transform: translateX(-50%) translateY(8px);
      background: rgba(13,14,16,.85); border: 1px solid rgba(200,162,74,.35); color: var(--cream);
      padding: .8rem 1.4rem; font-size: .8rem; letter-spacing: .06em; opacity: 0;
      transition: opacity .4s ease, transform .4s ease; pointer-events: none; z-index: 50;
      max-width: min(88vw, 34rem); text-align: center;
    }
    .toast.on { opacity: 1; transform: translateX(-50%) translateY(0); }

    /* ---------------- resume (focus lost → pointer lock dropped) ---------------- */
    .resume {
      position: absolute; inset: 0; z-index: 55; display: grid; place-items: center;
      background: rgba(9,10,12,.62); backdrop-filter: blur(3px);
      opacity: 0; pointer-events: none; transition: opacity .3s ease; cursor: pointer;
    }
    .resume.on { opacity: 1; pointer-events: auto; }
    .resume__inner { text-align: center; user-select: none; }
    .resume__mark {
      font-family: Marcellus, Georgia, serif; font-size: clamp(2rem, 5vw, 3rem);
      letter-spacing: .2em; text-indent: .2em; color: var(--cream);
    }
    .resume__hint {
      margin-top: 1.4rem; font-size: .74rem; letter-spacing: .3em; text-indent: .3em;
      text-transform: uppercase; color: var(--gold);
    }
    .resume__sub {
      margin-top: .7rem; font-size: .64rem; letter-spacing: .22em; text-transform: uppercase;
      color: var(--muted);
    }

    @media (prefers-reduced-motion: reduce) {
      .panel, .fade, .scrim, .toast, .resume { transition: none !important; }
    }
  `;
  root.appendChild(style);

  // ---------------------------------------------------------------- loading
  const load = document.createElement('div');
  load.className = 'load';
  load.innerHTML = `
    <div class="load__inner">
      <div class="load__mark">AHMAD</div>
      <div class="load__sub">The Gallery — a first-person portfolio</div>
      <div class="load__barwrap"><div class="load__bar"></div></div>
      <button class="load__enter" type="button">Click to enter</button>
      <div class="load__hints">WASD / arrows — move &nbsp;·&nbsp; mouse — look &nbsp;·&nbsp; Shift — run &nbsp;·&nbsp; E / click — view &nbsp;·&nbsp; M — mute &nbsp;·&nbsp; [ ] — sensitivity</div>
    </div>`;
  root.appendChild(load);
  const bar = load.querySelector('.load__bar');
  const enterBtn = load.querySelector('.load__enter');

  // ---------------------------------------------------------------- HUD
  const dot = document.createElement('div'); dot.className = 'dot hidden';
  const prompt = document.createElement('div'); prompt.className = 'prompt';
  const brand = document.createElement('div'); brand.className = 'brand fade hidden';
  brand.textContent = 'Ahmad · Skybound Scaling®';
  const pills = document.createElement('div'); pills.className = 'pills fade hidden';
  const SPK_ON = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
  const SPK_OFF = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4-2.7-2.7z"/></svg>';
  pills.innerHTML = `
    <button class="pill" data-act="about" type="button">About</button>
    <button class="pill" data-act="mute" type="button" aria-label="Toggle sound">${SPK_ON}</button>`;
  root.appendChild(dot); root.appendChild(prompt); root.appendChild(brand); root.appendChild(pills);

  // ---------------------------------------------------------------- panels
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const artPanel = document.createElement('aside');
  artPanel.className = 'panel panel--right';
  const aboutPanel = document.createElement('aside');
  aboutPanel.className = 'panel panel--left';
  aboutPanel.innerHTML = `
    <button class="panel__close" type="button" aria-label="Close">✕</button>
    <div class="panel__eyebrow">The designer</div>
    <h1 class="panel__title">${ABOUT.name}</h1>
    <div class="panel__role">${ABOUT.role}</div>
    <p>${ABOUT.statement1}</p>
    <p>${ABOUT.statement2}</p>
    <p>${ABOUT.contactLead}</p>
    <p><a class="mail" href="mailto:${ABOUT.email}">${ABOUT.email}</a></p>
    <hr class="rule">
    <div class="panel__eyebrow">About the studio — ${STUDIO.name}</div>
    <p>${STUDIO.blurb}</p>`;
  root.appendChild(scrim); root.appendChild(artPanel); root.appendChild(aboutPanel);

  const toast = document.createElement('div'); toast.className = 'toast';
  root.appendChild(toast);
  let toastTimer = 0;
  function showToast(msg, ms = 3800) {
    toast.textContent = msg;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('on'), ms);
  }
  ctx.events.addEventListener('toast', (e) => showToast(e.detail && e.detail.msg || String(e.detail)));

  // ---------------------------------------------------------------- state
  let openPanel = null;          // 'art' | 'about' | null
  let started = false;

  function setHudVisible(v) {
    for (const el of [dot, brand, pills]) el.classList.toggle('hidden', !v);
  }

  // ---------------------------------------------------------------- resume prompt
  // Shown whenever we're playing but pointer lock was dropped — most importantly
  // when the browser force-releases it as the window/tab loses focus (alt-tab).
  // Pointer lock can only be re-acquired from a fresh gesture, so clicking this
  // overlay re-locks and restores mouse-look.
  const resume = document.createElement('div');
  resume.className = 'resume';
  resume.innerHTML = `
    <div class="resume__inner">
      <div class="resume__mark">PAUSED</div>
      <div class="resume__hint">Click to resume</div>
      <div class="resume__sub">Mouse control was released</div>
    </div>`;
  root.appendChild(resume);

  const lockState = { locked: false, inPlay: false, canPointerLock: false };
  function updateResume() {
    const show = started && lockState.inPlay && !lockState.locked
      && lockState.canPointerLock && !openPanel;
    resume.classList.toggle('on', show);
  }
  ctx.events.addEventListener('lock', (e) => {
    const d = e.detail || {};
    lockState.locked = !!d.locked;
    if ('inPlay' in d) lockState.inPlay = !!d.inPlay;
    if ('canPointerLock' in d) lockState.canPointerLock = !!d.canPointerLock;
    updateResume();
  });
  resume.addEventListener('click', () => {
    resume.classList.remove('on');     // hide now; re-shows via 'lock' if it fails
    ctx.events.dispatchEvent(new CustomEvent('resume-click'));
  });

  function open(which, fill) {
    openPanel = which;
    scrim.classList.add('on');
    if (which === 'art') { artPanel.classList.add('open'); if (fill) fill(); }
    else aboutPanel.classList.add('open');
    ctx.events.dispatchEvent(new CustomEvent('request-unlock'));
    updateResume();
  }
  function closePanels(relock = true) {
    if (!openPanel) return;
    openPanel = null;
    scrim.classList.remove('on');
    artPanel.classList.remove('open');
    aboutPanel.classList.remove('open');
    // always release the input freeze; re-request pointer lock only when the
    // close came from a click (Esc can't re-lock without a fresh gesture)
    ctx.events.dispatchEvent(new CustomEvent('panels-closed'));
    if (relock && started) ctx.events.dispatchEvent(new CustomEvent('request-lock'));
    updateResume();
  }

  function fillArt(work) {
    const idx = WORKS.findIndex((w) => w.id === work.id) + 1;
    artPanel.innerHTML = `
      <button class="panel__close" type="button" aria-label="Close">✕</button>
      <div class="panel__eyebrow">Ahmad — Web design · № 0${idx} / 05</div>
      <h1 class="panel__title">${work.title}</h1>
      <a class="domain" href="${work.link}" target="_blank" rel="noreferrer">${work.domain}</a>
      <img src="${work.img}" alt="${work.title} — website screenshot">
      <p>${work.statement}</p>
      <div class="price">Sold — ${work.price}</div>
      <a class="visit" href="${work.link}" target="_blank" rel="noreferrer">Visit live site</a>`;
    artPanel.querySelector('.panel__close').addEventListener('click', () => closePanels());
  }

  aboutPanel.querySelector('.panel__close').addEventListener('click', () => closePanels());
  scrim.addEventListener('click', () => closePanels());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openPanel) { e.preventDefault(); closePanels(false); }
    if ((e.key === 'm' || e.key === 'M') && started) toggleMute();
  });

  ctx.events.addEventListener('activate-art', (e) => open('art', () => fillArt(e.detail)));

  // ---------------------------------------------------------------- prompt/dot
  ctx.events.addEventListener('prompt', (e) => {
    const label = e.detail && e.detail.label;
    if (label && !openPanel) {
      prompt.innerHTML = `<b>[E]</b>&nbsp; ${label}`;
      prompt.classList.add('on');
      dot.classList.add('hot');
    } else {
      prompt.classList.remove('on');
      dot.classList.remove('hot');
    }
  });

  // ---------------------------------------------------------------- pills
  let muted = localStorage.getItem('ag-muted') === '1';
  const muteBtn = pills.querySelector('[data-act="mute"]');
  function renderMute() { muteBtn.innerHTML = muted ? SPK_OFF : SPK_ON; }
  function toggleMute() {
    muted = !muted;
    localStorage.setItem('ag-muted', muted ? '1' : '0');
    if (ctx.audio) ctx.audio.setMuted(muted);
    renderMute();
  }
  renderMute();
  pills.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    if (btn.dataset.act === 'about') open('about');
    if (btn.dataset.act === 'mute') toggleMute();
  });

  // ---------------------------------------------------------------- api
  return {
    setProgress(p) { bar.style.width = `${Math.round(p * 100)}%`; },
    ready(startFn) {
      load.classList.add('ready');
      enterBtn.addEventListener('click', () => {
        if (started) return;
        started = true;
        load.classList.add('hidden');
        setTimeout(() => load.remove(), 1300);
        setHudVisible(true);
        startFn();
      }, { once: true });
    },
    fadeIn() { setHudVisible(true); },
    toast: showToast,
  };
}
