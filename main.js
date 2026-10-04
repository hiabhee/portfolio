// guided board: native scroll + grabbable pieces + word reveals.
// Simple + premium: headings rise word-by-word as you scroll.
const $ = (s) => document.querySelector(s);
const hint = $('#hint'), toast = $('#toast');
const guideV = $('#guideV'), guideH = $('#guideH');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobileLayout = matchMedia('(max-width: 760px)').matches;
const SNAP = 6, GLIDE = 1, SETTLE = 0.05;
let zTop = 10;

document.querySelectorAll('.piece').forEach((el) => {
  el.style.setProperty('--rot', (el.dataset.rot || 0) + 'deg');
});

// ── premium word split: every paper heading + hero animates word-by-word ──
if (!reduceMotion) {
  document.querySelectorAll('.paper h1, .paper h2').forEach((el) => {
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    el.setAttribute('aria-label', text);
    el.innerHTML = text.split(' ').map((w, i) =>
      `<span class="w" aria-hidden="true" style="--i:${i}">${w}</span>`).join(' ');
  });
  // hero name: reveal ABHISHEK + surname on load; role animates via .swap faces
  const firstLine = document.querySelector('.hero-name .hero-line:not(.swap)');
  if (firstLine) {
    const text = firstLine.textContent.trim();
    firstLine.innerHTML = `<span class="w" aria-hidden="true" style="--i:0">${text}</span>`;
  }
  const surnameFace = document.querySelector('.swap-surname');
  if (surnameFace) {
    const text = surnameFace.textContent.trim();
    surnameFace.innerHTML = `<span class="w" aria-hidden="true" style="--i:1">${text}</span>`;
  }
}

// ── match cut: surname ⇄ role, clean timed swap ──
(() => {
  const swap = document.getElementById('nameSwap');
  if (!swap || reduceMotion) return;
  let showRole = false, timer = 0;
  const HOLD_SURNAME = 3000, HOLD_ROLE = 2600;
  function cut() {
    showRole = !showRole;
    swap.classList.toggle('show-role', showRole);
    clearTimeout(timer);
    timer = setTimeout(cut, showRole ? HOLD_ROLE : HOLD_SURNAME);
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(timer);
      if (e.isIntersecting && !document.hidden) timer = setTimeout(cut, HOLD_SURNAME);
    }, { threshold: 0.3 });
    io.observe(swap);
  }
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(cut, HOLD_SURNAME);
  });
  timer = setTimeout(cut, HOLD_SURNAME);
})();

// ── restore persisted arrangement ──
const store = (() => {
  try { return JSON.parse(localStorage.getItem('board-v2') || '{}'); } catch { return {}; }
})();
function save(id, x, y) {
  if (!id) return;
  store[id] = { x: Math.round(x), y: Math.round(y) };
  try { localStorage.setItem('board-v2', JSON.stringify(store)); } catch {}
}
// decor-only drag: primary papers stay put, small scraps move + persist
const DECOR_SEL = '.stickers .sticker, .cluster .photo, .cluster .note-big, .scout';
if (!mobileLayout) {
  document.querySelectorAll('.stickers .sticker[data-name], .cluster .photo[data-name], .cluster .note-big[data-name]').forEach((el) => {
    const s = store[el.dataset.name];
    if (s) el.style.transform = `translate(${s.x}px,${s.y}px) rotate(${el.dataset.rot || 0}deg)`;
  });
}
// ── snap guides ──
function hideGuides() { guideV.style.display = 'none'; guideH.style.display = 'none'; }
function snapWithGuides(el, dx, dy) {
  const r = el.getBoundingClientRect();
  const xs = [r.left + dx, (r.left + r.right) / 2 + dx, r.right + dx];
  const ys = [r.top + dy, (r.top + r.bottom) / 2 + dy, r.bottom + dy];
  const ox = [innerWidth / 2], oy = [innerHeight / 2];
  document.querySelectorAll('.piece').forEach((o) => {
    if (o === el) return;
    const q = o.getBoundingClientRect();
    ox.push(q.left, (q.left + q.right) / 2, q.right);
    oy.push(q.top, (q.top + q.bottom) / 2, q.bottom);
  });
  let bx = null, by = null;
  for (const a of xs) for (const b of ox) { const d = b - a; if (Math.abs(d) <= SNAP && (bx === null || Math.abs(d) < Math.abs(bx.d))) bx = { d, at: b }; }
  for (const a of ys) for (const b of oy) { const d = b - a; if (Math.abs(d) <= SNAP && (by === null || Math.abs(d) < Math.abs(by.d))) by = { d, at: b }; }
  if (bx) { dx += bx.d; guideV.style.left = bx.at + 'px'; guideV.style.display = 'block'; } else guideV.style.display = 'none';
  if (by) { dy += by.d; guideH.style.top = by.at + 'px'; guideH.style.display = 'block'; } else guideH.style.display = 'none';
  return { dx, dy };
}

// ── drag whole pieces: 1:1 tracking + velocity settle (critically damped, no bounce) ──
function makeDraggable(el, { persistKey } = {}) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button === 1) return;
    if (e.target.closest('a,button') && e.target !== el) return;
    if (e.pointerType === 'touch' && !e.target.closest('.tape,.pin')) return;
    hideHint();
    e.stopPropagation();
    try { el.setPointerCapture(e.pointerId); } catch {}
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform || '');
    const origin = { x: m ? +m[1] : 0, y: m ? +m[2] : 0 };
    const rendered = { ...origin };
    const start = { x: e.clientX, y: e.clientY };
    let px = e.clientX, py = e.clientY;
    const rot = el.dataset.rot || 0;
    const k = reduceMotion ? 1 : 1; // direct manipulation: stay glued to pointer
    // velocity history for release handoff
    const trail = [{ x: px, y: py, t: performance.now() }];
    let raf = 0, done = false;
    el.style.zIndex = ++zTop;
    el.classList.add('dragging', 'selected');
    document.querySelectorAll('.piece.selected').forEach((o) => { if (o !== el) o.classList.remove('selected'); });

    const paint = (p) => {
      el.style.transform = `translate(${p.x}px,${p.y}px) rotate(${rot}deg)`;
    };
    const frame = () => {
      if (done) return;
      const s = snapWithGuides(el, origin.x + (px - start.x) - rendered.x, origin.y + (py - start.y) - rendered.y);
      const tx = rendered.x + s.dx, ty = rendered.y + s.dy;
      rendered.x += (tx - rendered.x) * k; rendered.y += (ty - rendered.y) * k;
      if (Math.abs(tx - rendered.x) < SETTLE) rendered.x = tx;
      if (Math.abs(ty - rendered.y) < SETTLE) rendered.y = ty;
      paint(rendered);
      raf = requestAnimationFrame(frame);
    };
    const up = () => {
      done = true; cancelAnimationFrame(raf);
      // velocity handoff: project a short distance, then settle without overshoot
      let vx = 0, vy = 0;
      if (!reduceMotion && trail.length > 1) {
        const a = trail[0], b = trail[trail.length - 1];
        const dt = Math.max(16, b.t - a.t) / 1000;
        vx = (b.x - a.x) / dt; vy = (b.y - a.y) / dt;
        const clamp = (v) => Math.max(-800, Math.min(800, v));
        vx = clamp(vx); vy = clamp(vy);
      }
      const proj = 0.05; // 50ms projection — subtle, stays close
      const raw = { x: origin.x + (px - start.x), y: origin.y + (py - start.y) };
      const fin = {
        x: Math.max(raw.x - 24, Math.min(raw.x + 24, raw.x + vx * proj)),
        y: Math.max(raw.y - 24, Math.min(raw.y + 24, raw.y + vy * proj)),
      };
      const s = snapWithGuides(el, fin.x - rendered.x, fin.y - rendered.y);
      fin.x = rendered.x + s.dx; fin.y = rendered.y + s.dy;
      if (reduceMotion) {
        paint(fin);
        el.classList.remove('dragging'); hideGuides();
      } else {
        // critically-damped settle: 160ms ease-out from live position
        const from = { ...rendered };
        const t0 = performance.now(), dur = 160;
        const settle = (t) => {
          const p = Math.min(1, (t - t0) / dur);
          const ez = 1 - Math.pow(1 - p, 3);
          paint({ x: from.x + (fin.x - from.x) * ez, y: from.y + (fin.y - from.y) * ez });
          if (p < 1) requestAnimationFrame(settle);
          else { el.classList.remove('dragging'); hideGuides(); }
        };
        el.classList.remove('dragging');
        requestAnimationFrame(settle);
      }
      setTimeout(() => el.classList.remove('selected'), 1200);
      if (persistKey) save(persistKey, Math.round(fin.x), Math.round(fin.y));
    };
    el.addEventListener('pointerup', up, { once: true });
    el.addEventListener('pointercancel', up, { once: true });
    el.addEventListener('pointermove', (ev) => {
      px = ev.clientX; py = ev.clientY;
      const now = performance.now();
      trail.push({ x: px, y: py, t: now });
      if (trail.length > 6) trail.shift();
    });
    raf = requestAnimationFrame(frame);
  });

  // keyboard alternative: arrows nudge focused element
  el.addEventListener('keydown', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform || '');
    let x = m ? +m[1] : 0, y = m ? +m[2] : 0;
    const step = e.shiftKey ? 24 : 12;
    if (e.key === 'ArrowUp') y -= step; if (e.key === 'ArrowDown') y += step;
    if (e.key === 'ArrowLeft') x -= step; if (e.key === 'ArrowRight') x += step;
    el.style.transform = `translate(${x}px,${y}px) rotate(${el.dataset.rot || 0}deg)`;
    if (persistKey) save(persistKey, x, y);
  });
}

if (!mobileLayout) {
  document.querySelectorAll(DECOR_SEL).forEach((el) => {
    el.classList.add('draggable');
    makeDraggable(el, { persistKey: el.dataset.name });
  });
}

if (matchMedia('(pointer: coarse)').matches) hint.textContent = 'drag the little stickers · scroll for more ↓';

// ── toast / hint ──
let toastT;
function toastMsg(msg) {
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 2400);
}
function hideHint() { hint.classList.add('gone'); }
setTimeout(hideHint, 9000);

// ── sticker strip: vertical scroll glides the wave left → right, one full loop ──
// loop is exact by construction: 3 identical sets ⇒ one set = 1/3 of track width,
// so travel is expressed in % of the track itself — zero pixel measuring, nothing to drift.
(() => {
  const tall = document.getElementById('orbitTall');
  const track = document.getElementById('orbitRing');
  const count = document.getElementById('orbitCount');
  if (!tall || !track || reduceMotion) return; // static grid fallback
  if (!track.querySelectorAll('.orbit-card').length) return;
  document.querySelector('.orbit-sec')?.classList.add('orbit-live');
  track.innerHTML += track.innerHTML + track.innerHTML; // 3 identical sets: seamless loop
  let ticking = false, logged = false;
  const frame = () => {
    ticking = false;
    const top = tall.getBoundingClientRect().top;
    const travel = tall.offsetHeight - innerHeight;
    const p = travel > 0 ? Math.min(1, Math.max(0, -top / travel)) : 1;
    track.style.transform = `translate3d(${(((p - 1) / 3) * 100).toFixed(3)}%,-50%,0)`;
    if (count) count.textContent = `${Math.round(p * 100)}%`;
    if (!logged) { logged = true; console.info(`[orbit] strip live — cards:${track.children.length}`); }
  };
  const kick = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick);
  addEventListener('load', kick);
  kick();
})();

// ── rail spy ──
const railLinks = [...document.querySelectorAll('.rail a')];
function railSpy() {
  const mid = innerHeight * 0.4;
  let cur = railLinks[0]?.dataset.sec;
  document.querySelectorAll('main section[id]').forEach((p) => { if (p.getBoundingClientRect().top <= mid) cur = p.id; });
  railLinks.forEach((a) => {
    const active = a.dataset.sec === cur;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'location');
    else a.removeAttribute('aria-current');
  });
}
addEventListener('scroll', () => requestAnimationFrame(railSpy), { passive: true });
railSpy();

// ── scroll reveals: sections rise in as they enter the viewport ──
(() => {
  const reveals = [...document.querySelectorAll('.reveal')];
  if (reduceMotion) {
    reveals.forEach((el) => el.classList.add('in'));
    document.body.classList.add('is-ready');
    return;
  }
  if (!('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  reveals.forEach((el) => io.observe(el));
})();

// ── hero loads immediately, everything else waits for scroll ──
requestAnimationFrame(() => requestAnimationFrame(() => {
  document.body.classList.add('is-ready');
  document.dispatchEvent(new Event('portfolio:ready'));
}));

// ── face sticker gestures: leans toward your cursor, squashes on poke, wiggles on click ──
(() => {
  const wrap = document.getElementById('faceSticker');
  const img = document.getElementById('faceTilt');
  if (!wrap || !img || reduceMotion) return;
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, hovering = false;
  const loop = () => {
    cx += (tx - cx) * 0.14; cy += (ty - cy) * 0.14;
    img.style.transform =
      `rotateY(${(cx * 14).toFixed(2)}deg) rotateX(${(-cy * 12).toFixed(2)}deg) scale(${hovering ? 1.06 : 1})`;
    if (hovering || Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) {
      raf = requestAnimationFrame(loop);
    } else { raf = 0; img.style.transform = ''; }
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  const replay = (cls) => { img.classList.remove(cls); void img.offsetWidth; img.classList.add(cls); };
  img.addEventListener('animationend', () => img.classList.remove('wiggle', 'squash'));
  wrap.addEventListener('pointermove', (e) => {
    const r = wrap.getBoundingClientRect();
    tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.9)));
    ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 0.9)));
    hovering = true;
    kick();
  });
  wrap.addEventListener('pointerleave', () => { tx = 0; ty = 0; hovering = false; kick(); });
  wrap.addEventListener('pointerdown', () => replay('squash'));
  wrap.addEventListener('click', () => replay('wiggle'));
})();

// ── motto: tap toggles the latin → english roll (touch has no hover) ──
(() => {
  const motto = document.getElementById('motto');
  if (!motto) return;
  motto.addEventListener('click', () => motto.classList.toggle('show'));
})();

// ── figma-style cursor: arrow + "you" pill chasing the pointer ──
(() => {
  if (!matchMedia('(pointer: fine)').matches) return;
  const cur = document.getElementById('figcursor');
  if (!cur) return;
  document.body.classList.add('cursor-you');
  const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y, raf = 0;
  const loop = () => {
    x += (tx - x) * (instant ? 1 : 0.68);
    y += (ty - y) * (instant ? 1 : 0.68);
    cur.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    if (!instant && (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1)) raf = requestAnimationFrame(loop);
    else raf = 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  addEventListener('pointermove', (e) => {
    tx = e.clientX; ty = e.clientY;
    cur.classList.add('on');
    kick();
  }, { passive: true });
  document.addEventListener('mouseleave', () => cur.classList.remove('on'));
  document.addEventListener('mouseenter', () => cur.classList.add('on'));
  addEventListener('pointerdown', () => cur.classList.add('press'));
  addEventListener('pointerup', () => cur.classList.remove('press'));
})();

// ── reusable SVG scribbles: paths draw on view; optional heads follow ──
(() => {
  const draws = [...document.querySelectorAll('[data-draw]')];
  const notes = [...document.querySelectorAll('[data-note]')];
  draws.forEach((el) => {
    const requestedDuration = Number.parseFloat(el.dataset.dur);
    const requestedDelay = Number.parseFloat(el.dataset.delay);
    const duration = Number.isFinite(requestedDuration)
      ? Math.min(1.2, Math.max(0.5, requestedDuration)) : 0.8;
    const delay = Number.isFinite(requestedDelay) ? Math.max(0, requestedDelay) : 0;
    el.style.setProperty('--dur', `${duration}s`);
    el.style.setProperty('--delay', `${delay}s`);
    el.style.setProperty('--draw-from', el.dataset.direction === 'reverse' ? '-1' : '1');
  });
  const targets = [...draws, ...notes];
  const reveal = (el, instant = false) => {
    if (instant) el.classList.add('motion-static');
    el.classList.add(el.hasAttribute('data-draw') ? 'drawn' : 'note-in');
  };
  if (reduceMotion) {
    targets.forEach((el) => reveal(el));
    document.body.classList.add('is-ready');
    return;
  }
  let ready = document.body.classList.contains('is-ready');
  const pendingHero = new Set();
  const enter = (el) => {
    if (!ready && el.closest('.hero')) pendingHero.add(el);
    else reveal(el);
  };
  const onReady = () => {
    ready = true;
    pendingHero.forEach((el) => reveal(el));
    pendingHero.clear();
  };
  document.addEventListener('portfolio:ready', onReady, { once: true });
  if (ready) onReady();
  targets.filter((el) => el.dataset.triggerOnView === 'false').forEach(enter);
  const observed = targets.filter((el) => el.dataset.triggerOnView !== 'false');
  if (!('IntersectionObserver' in window)) {
    observed.forEach((el) => reveal(el, true));
    return;
  }
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { enter(e.target); io.unobserve(e.target); }
  }), { threshold: 0.25 });
  observed.forEach((el) => io.observe(el));
})();
if (reduceMotion) document.body.classList.add('is-ready');

// ── mumbai clock in the header ──
(() => {
  const el = document.getElementById('clock');
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  const tick = () => { el.textContent = `◐ MUM ${fmt.format(new Date())}`; };
  tick();
  setInterval(tick, 20000);
})();

// ── new-year countdown: days left, re-checked every day + counted up ──
(() => {
  const el = document.getElementById('nycount');
  if (!el) return;
  const DAY = 86400000;
  const daysLeft = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(today.getFullYear() + 1, 0, 1);
    return { days: Math.max(0, Math.round((target - today) / DAY)), year: target.getFullYear() };
  };
  const label = (days, year) =>
    days === 0 ? 'happy new year!' : `${days} day${days === 1 ? '' : 's'} → ${year}`;
  let current = 0;
  let shownYear = daysLeft().year;
  const paint = (days, year) => { el.textContent = label(days, year); };
  const countTo = (to, year) => {
    if (reduceMotion) { current = to; shownYear = year; paint(current, shownYear); return; }
    const from = current;
    if (from === to) { paint(to, year); return; }
    const t0 = performance.now(), dur = Math.min(1400, 400 + Math.abs(to - from) * 12);
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const ez = 1 - Math.pow(1 - p, 3);
      paint(Math.round(from + (to - from) * ez), year);
      if (p < 1) requestAnimationFrame(step);
      else { current = to; shownYear = year; }
    };
    requestAnimationFrame(step);
  };
  // initial count-up on load
  const first = daysLeft();
  countTo(first.days, first.year);
  // re-check often (covers midnight rollover + sleeping tabs) — updates only when the day changes
  const refresh = () => {
    const { days, year } = daysLeft();
    if (days !== current || year !== shownYear) countTo(days, year);
  };
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();

// ── github activity: render a bundled snapshot first, then refresh live ──
(() => {
  const weeksEl = document.getElementById('calWeeks');
  const monthsEl = document.getElementById('calMonths');
  const totalEl = document.getElementById('calTotal');
  const calWrap = document.querySelector('.calwrap');
  if (!weeksEl || !monthsEl || !totalEl || !calWrap) return;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (iso) => {
    const d = new Date(iso + 'T12:00:00');
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };
  const render = (days) => {
    if (!Array.isArray(days) || !days.length) return false;
    weeksEl.replaceChildren();
    monthsEl.replaceChildren();
    const lead = new Date(days[0].date + 'T12:00:00').getDay();
    for (let i = 0; i < lead; i++) {
      const pad = document.createElement('i');
      pad.className = 'pad'; pad.setAttribute('aria-hidden', 'true');
      weeksEl.appendChild(pad);
    }
    let total = 0, lastMonth = -1;
    days.forEach((d, idx) => {
      total += d.count;
      const cell = document.createElement('i');
      if (d.level > 0) cell.className = 'l' + d.level;
      cell.title = `${d.count} contribution${d.count === 1 ? '' : 's'} on ${fmt(d.date)}`;
      weeksEl.appendChild(cell);
      const col = Math.floor((idx + lead) / 7);
      const m = new Date(d.date + 'T12:00:00').getMonth();
      if (m !== lastMonth && (idx + lead) % 7 === 0) {
        lastMonth = m;
        const lab = document.createElement('span');
        lab.textContent = MONTHS[m];
        lab.style.left = (col * parseFloat(getComputedStyle(weeksEl).getPropertyValue('--cal-step'))) + 'px';
        monthsEl.appendChild(lab);
      }
    });
    totalEl.textContent = `${total.toLocaleString('en-US')} contributions · ${fmt(days[0].date)} – ${fmt(days[days.length - 1].date)}`;
    requestAnimationFrame(() => { calWrap.scrollLeft = calWrap.scrollWidth; });
    return true;
  };
  fetch('assets/github-contributions.json')
    .then((r) => { if (!r.ok) throw new Error('snapshot'); return r.json(); })
    .then((data) => render(data.contributions))
    .catch(() => {})
    .then(() => fetch('https://github-contributions-api.jogruber.de/v4/hiabhee?y=last'))
    .then((r) => { if (!r.ok) throw new Error('gh api'); return r.json(); })
    .then((data) => render(data.contributions))
    .catch(() => {
      if (!weeksEl.children.length) {
        totalEl.innerHTML = 'live graph is shy today — <a class="linkbtn" href="https://github.com/hiabhee" target="_blank" rel="noopener">see it on GitHub ↗</a>';
      }
    });
})();
