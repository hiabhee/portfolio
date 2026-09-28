// ═══════════════════════════════════════════
// scrolling mood-board: native scroll + grabbable pieces.
// Mouse/pen drags move pieces · touch scrolls the page.
// ═══════════════════════════════════════════
const $ = (s) => document.querySelector(s);
const hint = $('#hint'), toast = $('#toast');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let zTop = 10;

// Base rotation comes from data-rot (stylesheet reads --rot)
document.querySelectorAll('.piece').forEach((el) => {
  el.style.setProperty('--rot', (el.dataset.rot || 0) + 'deg');
});

// ── Smart guides: snap + red helper lines on align ──
const guideV = document.createElement('div');
const guideH = document.createElement('div');
guideV.className = 'guide guide-v';
guideH.className = 'guide guide-h';
document.body.append(guideV, guideH);
const SNAP = 6;

function hideGuides() { guideV.style.display = 'none'; guideH.style.display = 'none'; }

// Returns snapped {dx, dy} and positions the guide lines.
// Works in viewport coords: the candidate rect is the live rect shifted by (dx, dy).
function snapWithGuides(el, dx, dy) {
  const r = el.getBoundingClientRect();
  const dLinesX = [r.left + dx, (r.left + r.right) / 2 + dx, r.right + dx];
  const dLinesY = [r.top + dy, (r.top + r.bottom) / 2 + dy, r.bottom + dy];

  const othersX = [innerWidth / 2], othersY = [innerHeight / 2];
  document.querySelectorAll('.piece').forEach((o) => {
    if (o === el) return;
    const q = o.getBoundingClientRect();
    othersX.push(q.left, (q.left + q.right) / 2, q.right);
    othersY.push(q.top, (q.top + q.bottom) / 2, q.bottom);
  });

  let bestX = null, bestY = null;
  for (const a of dLinesX) for (const b of othersX) {
    const d = b - a;
    if (Math.abs(d) <= SNAP && (bestX === null || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: b };
  }
  for (const a of dLinesY) for (const b of othersY) {
    const d = b - a;
    if (Math.abs(d) <= SNAP && (bestY === null || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: b };
  }
  if (bestX) { dx += bestX.d; guideV.style.left = bestX.at + 'px'; guideV.style.display = 'block'; }
  else guideV.style.display = 'none';
  if (bestY) { dy += bestY.d; guideH.style.top = bestY.at + 'px'; guideH.style.display = 'block'; }
  else guideH.style.display = 'none';
  return { dx, dy };
}

// ── Drag any .piece ──
// Mouse/pen: grab anywhere. Touch: grab by tape/pin so the page still scrolls.
// Pointer events only record intent; rendering happens once per frame with a
// critically-damped glide (no overshoot) — buttery at any event rate, and it
// kills the rounding/layout-thrash jitter of per-event repaints.
const GLIDE = 0.35, SETTLE = 0.05;
document.querySelectorAll('.piece').forEach((el) => {
  el.addEventListener('pointerdown', (e) => {
    if (e.button === 1) return;
    if (e.pointerType === 'touch' && !e.target.closest('.tape,.pin,.clip,.binder')) return;
    hideHint();
    el.setPointerCapture(e.pointerId);
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform || '');
    const origin = { x: m ? +m[1] : 0, y: m ? +m[2] : 0 };
    const rendered = { ...origin };
    const start = { x: e.clientX, y: e.clientY };
    let px = e.clientX, py = e.clientY;
    const rot = el.dataset.rot || 0;
    const k = reduceMotion ? 1 : GLIDE;
    let raf = 0, done = false;
    el.style.zIndex = ++zTop;
    el.classList.add('dragging');

    const paint = (p) => {
      el.style.transform = `translate(${p.x}px,${p.y}px) rotate(${rot}deg)`;
    };
    const frame = () => {
      if (done) return;
      // snap the target, glide the rendered value toward it
      const s = snapWithGuides(el, origin.x + (px - start.x) - rendered.x, origin.y + (py - start.y) - rendered.y);
      const tx = rendered.x + s.dx, ty = rendered.y + s.dy;
      rendered.x += (tx - rendered.x) * k;
      rendered.y += (ty - rendered.y) * k;
      if (Math.abs(tx - rendered.x) < SETTLE) rendered.x = tx;
      if (Math.abs(ty - rendered.y) < SETTLE) rendered.y = ty;
      paint(rendered);
      raf = requestAnimationFrame(frame);
    };
    const up = () => {
      done = true;
      cancelAnimationFrame(raf);
      // land exactly on the final snapped target — no drift
      const s = snapWithGuides(el, origin.x + (px - start.x) - rendered.x, origin.y + (py - start.y) - rendered.y);
      paint({ x: rendered.x + s.dx, y: rendered.y + s.dy });
      el.classList.remove('dragging');
      hideGuides();
    };
    el.addEventListener('pointerup', up, { once: true });
    el.addEventListener('pointercancel', up, { once: true });
    el.addEventListener('pointermove', (ev) => { px = ev.clientX; py = ev.clientY; });
    raf = requestAnimationFrame(frame);
  });
});

// Touch hint: tapes are the handles
if (matchMedia('(pointer: coarse)').matches) {
  hint.textContent = 'drag by the tape to move · scroll for more ↓';
}

// ── Multiplayer cursor: Figma arrow + name flag, glued 1:1 ──
// No glide here — a cursor that trails feels laggy. Direct follow.
const fcursor = $('#fcursor');
if (fcursor && matchMedia('(hover:hover) and (pointer:fine)').matches) {
  addEventListener('mousemove', (e) => {
    fcursor.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
  }, { passive: true });
  addEventListener('pointerdown', () => fcursor.classList.add('press'));
  addEventListener('pointerup', () => fcursor.classList.remove('press'));
}
let toastT;
function toastMsg(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toast.classList.remove('show'), 2200);
}
document.querySelectorAll('[data-mail]').forEach((a) => a.addEventListener('click', async (e) => {
  e.preventDefault();
  try { await navigator.clipboard.writeText('jamdadeabhishek039@gmail.com'); toastMsg('Email copied ✓'); }
  catch { toastMsg('jamdadeabhishek039@gmail.com'); }
}));

// ── Rail: highlight the section on screen ──
const railLinks = [...document.querySelectorAll('.rail a')];
function railSpy() {
  const mid = innerHeight * 0.4;
  let current = railLinks[0]?.dataset.sec;
  document.querySelectorAll('.piece[id]').forEach((p) => {
    if (p.getBoundingClientRect().top <= mid) current = p.id;
  });
  railLinks.forEach((a) => a.classList.toggle('active', a.dataset.sec === current));
}
addEventListener('scroll', () => requestAnimationFrame(railSpy), { passive: true });
railSpy();

// ── Live sparkline ──
const spark = $('#spark');
if (spark) {
  const ctx = spark.getContext('2d');
  const N = 60, data = Array.from({ length: N }, () => 34 + Math.random() * 12);
  let visible = true;
  new IntersectionObserver((es) => (visible = es[0].isIntersecting)).observe(spark);
  const size = () => {
    const r = spark.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    spark.width = r.width * dpr; spark.height = r.height * dpr;
  };
  addEventListener('resize', size); size();
  const draw = () => {
    const { width: W, height: H } = spark;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#e2e2e8'; ctx.lineWidth = 1;
    const ty = H - (40 / 70) * H;
    ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(W, ty); ctx.stroke();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,113,227,.30)'); g.addColorStop(1, 'rgba(0,113,227,0)');
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (N - 1)) * W, y = H - (Math.min(v, 70) / 70) * H;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = '#0071e3'; ctx.lineWidth = 2 * (W / (spark.clientWidth || 1)); ctx.stroke();
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  };
  draw();
  if (!reduceMotion) (function loop() {
    requestAnimationFrame(loop);
    if (!visible) return;
    data.push(Math.max(18, Math.min(66, data[data.length - 1] + (Math.random() - .5) * 8)));
    data.shift(); draw();
  })();
}

// ── Hint ──
function hideHint() { hint.classList.add('gone'); }
setTimeout(hideHint, 9000);
