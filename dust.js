// Double-click a piece of the board to let it dissolve into dust.
(() => {
  'use strict';

  const MAX_PER_BURST = 1800;
  const MAX_LIVE_PARTICLES = 2400;
  const MAX_BURSTS = 2;
  const DURATION_MIN = 1100;
  const DURATION_MAX = 1400;
  const FLOATING_SELECTOR = '.stickers .sticker, .cluster .photo, .cluster .note-big, .orbit-card, .face-sticker, .scout';
  const IGNORE_SELECTOR = 'a, button, input, select, textarea, option, label, [contenteditable="true"], [role="button"], [role="link"], [role="menu"], [role="menuitem"], [aria-haspopup], [aria-expanded], [aria-controls], [data-dust-ignore], .menu, .menubar, .navigation, .nav, header, nav, [role="navigation"], .rail, .strip, .skip-link';
  const pending = new WeakSet();
  const removed = new WeakSet();
  const bursts = new Set();
  const particles = [];
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let canvas;
  let context;
  let frame = 0;
  let lastFrame = 0;
  let pixelRatio = 1;

  function getCanvas() {
    if (canvas) return context ? canvas : null;
    canvas = document.createElement('canvas');
    canvas.className = 'dust-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.tabIndex = -1;
    context = canvas.getContext('2d', { alpha: true });
    if (!context) return null;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });
    document.body.append(canvas);
    return canvas;
  }

  function resizeCanvas() {
    if (!canvas || !context) return;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * pixelRatio);
    canvas.height = Math.round(window.innerHeight * pixelRatio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function resolveTarget(node) {
    if (!(node instanceof Element)) return null;
    const floating = node.closest(FLOATING_SELECTOR);
    if (floating) return { element: floating, captureElement: floating, svgRoot: null };
    const svg = node.closest('svg');
    return {
      element: node,
      captureElement: svg || node,
      svgRoot: svg && svg !== node ? svg : null
    };
  }

  function isIgnoredEventPath(event) {
    return event.composedPath().some((node) => node instanceof Element && node.matches(IGNORE_SELECTOR));
  }

  function isEligible(target) {
    if (!target || removed.has(target)) return false;
    if (target.matches('html, body, main, header, nav, [role="navigation"], [data-dust-ignore], .strip, .rail, .skip-link')) return false;
    if (target.closest(IGNORE_SELECTOR)) return false;
    if (target.closest('[inert]')) return false;
    if (target.matches(':disabled, [hidden]')) return false;

    const bounds = target.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return false;
    for (let node = target; node instanceof Element; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      if (node === document.documentElement) break;
    }
    return true;
  }

  function cropSvgCapture(capture, svgRoot, target) {
    if (!svgRoot) return { canvas: capture, bounds: target.getBoundingClientRect() };
    const rootBounds = svgRoot.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    if (!rootBounds.width || !rootBounds.height || !targetBounds.width || !targetBounds.height) return null;

    const scaleX = capture.width / rootBounds.width;
    const scaleY = capture.height / rootBounds.height;
    const sourceX = Math.max(0, (targetBounds.left - rootBounds.left) * scaleX);
    const sourceY = Math.max(0, (targetBounds.top - rootBounds.top) * scaleY);
    const sourceWidth = Math.min(capture.width - sourceX, targetBounds.width * scaleX);
    const sourceHeight = Math.min(capture.height - sourceY, targetBounds.height * scaleY);
    if (sourceWidth <= 0 || sourceHeight <= 0) return null;

    const cropped = document.createElement('canvas');
    cropped.width = Math.max(1, Math.ceil(sourceWidth));
    cropped.height = Math.max(1, Math.ceil(sourceHeight));
    const croppedContext = cropped.getContext('2d');
    if (!croppedContext) return null;
    croppedContext.drawImage(capture, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, cropped.width, cropped.height);
    return { canvas: cropped, bounds: targetBounds };
  }

  function hideTarget(target) {
    target.style.visibility = 'hidden';
    target.style.pointerEvents = 'none';
    target.setAttribute('aria-hidden', 'true');
    target.setAttribute('inert', '');
    removed.add(target);
  }

  function isUsableCapture(capture) {
    if (!capture || capture.width < 1 || capture.height < 1) return false;
    try {
      const sample = document.createElement('canvas');
      sample.width = sample.height = 1;
      const sampleContext = sample.getContext('2d', { willReadFrequently: true });
      sampleContext.drawImage(capture, 0, 0, 1, 1);
      sampleContext.getImageData(0, 0, 1, 1);
      return true;
    } catch {
      return false;
    }
  }

  function makeParticles(capture, bounds, clickX, clickY) {
    const read = capture.getContext('2d', { willReadFrequently: true });
    if (!read) return [];
    const width = capture.width;
    const height = capture.height;
    const data = read.getImageData(0, 0, width, height).data;
    const stride = Math.max(1, Math.ceil(Math.sqrt((width * height) / MAX_PER_BURST)));
    const scaleX = bounds.width / width;
    const scaleY = bounds.height / height;
    const originX = bounds.left;
    const originY = bounds.top;
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const awayX = centerX - clickX;
    const awayY = centerY - clickY;
    const awayLength = Math.hypot(awayX, awayY) || 1;
    const particlesForBurst = [];

    for (let y = Math.floor(stride / 2); y < height; y += stride) {
      for (let x = Math.floor(stride / 2); x < width; x += stride) {
        const index = (y * width + x) * 4;
        const alpha = data[index + 3] / 255;
        if (alpha < 0.08) continue;

        const px = originX + (x + (Math.random() - 0.5) * stride) * scaleX;
        const py = originY + (y + (Math.random() - 0.5) * stride) * scaleY;
        const radialX = px - clickX;
        const radialY = py - clickY;
        const radialLength = Math.hypot(radialX, radialY) || 1;
        const dirX = radialX / radialLength + awayX / awayLength * 0.38;
        const dirY = radialY / radialLength + awayY / awayLength * 0.38;
        const dirLength = Math.hypot(dirX, dirY) || 1;
        const speed = 34 + Math.random() * 122;

        particlesForBurst.push({
          x: px,
          y: py,
          vx: dirX / dirLength * speed + (Math.random() - 0.5) * 22,
          vy: dirY / dirLength * speed - Math.random() * 24,
          size: Math.max(1.1, Math.min(4, stride * Math.min(scaleX, scaleY) * (0.42 + Math.random() * 0.38))),
          color: `rgba(${data[index]}, ${data[index + 1]}, ${data[index + 2]}, ${alpha})`,
          angle: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 8,
          gravity: 24 + Math.random() * 30,
          born: 0,
          duration: DURATION_MIN + Math.random() * (DURATION_MAX - DURATION_MIN)
        });
        if (particlesForBurst.length >= MAX_PER_BURST) return particlesForBurst;
      }
    }
    return particlesForBurst;
  }

  function drawFrame(now) {
    frame = 0;
    if (!canvas || !context) return;
    const dt = Math.min((now - (lastFrame || now)) / 1000, 0.04);
    lastFrame = now;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      if (!particle.born) particle.born = now;
      const elapsed = now - particle.born;
      const progress = Math.min(1, elapsed / particle.duration);
      const eased = 1 - Math.pow(1 - progress, 2.2);
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.angle += particle.spin * dt;

      context.save();
      context.globalAlpha = (1 - eased) * (1 - eased * 0.18);
      context.translate(particle.x, particle.y);
      context.rotate(particle.angle);
      context.fillStyle = particle.color;
      context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.82);
      context.restore();

      if (progress >= 1) particles.splice(index, 1);
    }

    if (particles.length) frame = requestAnimationFrame(drawFrame);
    else {
      lastFrame = 0;
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  function startAnimation() {
    if (!frame && particles.length) frame = requestAnimationFrame(drawFrame);
  }

  async function dissolve(selection, event) {
    const { element, captureElement, svgRoot } = selection;
    const target = element;
    if (!isEligible(target) || pending.has(target)) return;

    if (motionPreference.matches) {
      hideTarget(target);
      return;
    }
    if (bursts.size >= MAX_BURSTS || particles.length >= MAX_LIVE_PARTICLES) return;

    const renderer = window.html2canvas;
    if (typeof renderer !== 'function') return;
    pending.add(target);
    let capture;
    try {
      capture = await renderer(captureElement, {
        backgroundColor: null,
        scale: 1,
        useCORS: true,
        logging: false,
        imageTimeout: 1500,
        removeContainer: true
      });
      if (!isUsableCapture(capture)) return;
      if (!getCanvas()) return;
      const croppedCapture = cropSvgCapture(capture, svgRoot, target);
      if (!croppedCapture || !isEligible(target)) return;
      const burstParticles = makeParticles(croppedCapture.canvas, croppedCapture.bounds, event.clientX, event.clientY);
      if (!burstParticles.length || particles.length + burstParticles.length > MAX_LIVE_PARTICLES || bursts.size >= MAX_BURSTS) return;

      const burst = { target, particles: burstParticles };
      bursts.add(burst);
      particles.push(...burstParticles);
      hideTarget(target);
      startAnimation();

      const cleanup = () => {
        if (burst.particles.some((particle) => particles.includes(particle))) {
          window.setTimeout(cleanup, 80);
          return;
        }
        bursts.delete(burst);
      };
      window.setTimeout(cleanup, DURATION_MIN + 100);
    } catch {
      // A renderer failure is intentionally a no-op; keep the original usable.
    } finally {
      pending.delete(target);
    }
  }

  document.addEventListener('dblclick', (event) => {
    if (isIgnoredEventPath(event)) return;
    const target = resolveTarget(event.target);
    if (!target || !isEligible(target.element) || pending.has(target.element)) return;
    void dissolve(target, event);
  });
})();
