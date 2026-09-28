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
  const io = new IntersectionObserver(([e]) => {
    clearTimeout(timer);
    if (e.isIntersecting && !document.hidden) timer = setTimeout(cut, HOLD_SURNAME);
  }, { threshold: 0.3 });
  io.observe(swap);
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
if (!mobileLayout) {
  document.querySelectorAll('.piece[data-name]').forEach((el) => {
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

// ── drag whole pieces ──
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
    const k = reduceMotion ? 1 : GLIDE;
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
      const s = snapWithGuides(el, origin.x + (px - start.x) - rendered.x, origin.y + (py - start.y) - rendered.y);
      const fin = { x: rendered.x + s.dx, y: rendered.y + s.dy };
      paint(fin);
      el.classList.remove('dragging'); hideGuides();
      setTimeout(() => el.classList.remove('selected'), 1200);
      if (persistKey) save(persistKey, fin.x, fin.y);
    };
    el.addEventListener('pointerup', up, { once: true });
    el.addEventListener('pointercancel', up, { once: true });
    el.addEventListener('pointermove', (ev) => { px = ev.clientX; py = ev.clientY; });
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
  document.querySelectorAll('.piece').forEach((el) => makeDraggable(el, { persistKey: el.dataset.name }));
}

if (matchMedia('(pointer: coarse)').matches) hint.textContent = 'drag cards by the tape · scroll for more ↓';

// ── toast / hint ──
let toastT;
function toastMsg(msg) {
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 2400);
}
function hideHint() { hint.classList.add('gone'); }
setTimeout(hideHint, 9000);

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

// ── gentle section entrances drive the word reveals ──
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => {
  if (reduceMotion) el.classList.add('in'); else io.observe(el);
});

// ── mumbai clock in the header ──
(() => {
  const el = document.getElementById('clock');
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  const tick = () => { el.textContent = `◐ MUM ${fmt.format(new Date())}`; };
  tick();
  setInterval(tick, 20000);
})();

// ── new-year countdown: days left, rolled yearly ──
(() => {
  const el = document.getElementById('nycount');
  if (!el) return;
  const now = new Date();
  const target = new Date(now.getFullYear() + 1, 0, 1);
  const days = Math.max(0, Math.ceil((target - now) / 86400000));
  el.textContent = days === 0 ? 'happy new year!' : `${days} days → ${target.getFullYear()}`;
})();

// ── github activity: live heatmap, graceful fallback ──
(() => {
  const weeksEl = document.getElementById('calWeeks');
  const monthsEl = document.getElementById('calMonths');
  const totalEl = document.getElementById('calTotal');
  if (!weeksEl || !monthsEl || !totalEl) return;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (iso) => {
    const d = new Date(iso + 'T12:00:00');
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };
  fetch('https://github-contributions-api.jogruber.de/v4/hiabhee?y=last')
    .then((r) => { if (!r.ok) throw new Error('gh api'); return r.json(); })
    .then((data) => {
      const days = data.contributions;
      if (!days || !days.length) throw new Error('empty');
      // pad so the first column starts on Sunday
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
        // month label at the first column where a new month appears
        const col = Math.floor((idx + lead) / 7);
        const m = new Date(d.date + 'T12:00:00').getMonth();
        if (m !== lastMonth && (idx + lead) % 7 === 0) {
          lastMonth = m;
          const lab = document.createElement('span');
          lab.textContent = MONTHS[m];
          lab.style.left = (col * 14) + 'px';
          monthsEl.appendChild(lab);
        }
      });
      totalEl.textContent = `${total.toLocaleString('en-US')} contributions · ${fmt(days[0].date)} – ${fmt(days[days.length - 1].date)}`;
    })
    .catch(() => {
      totalEl.innerHTML = 'live graph is shy today — <a class="linkbtn" href="https://github.com/hiabhee" target="_blank" rel="noopener">see it on GitHub ↗</a>';
    });
})();
