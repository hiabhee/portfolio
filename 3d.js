// 3D dojo buddies — two tiny procedural three.js characters: portrait (living avatar)
// and contact (waver). The hero belongs to the face sticker now; everything else
// stays 2D on purpose. Silent 2D fallback if WebGL/CDN fails.
(async () => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  let THREE;
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
  } catch (err) {
    console.warn('[3d buddies] three.js CDN blocked/failed — staying 2D.', err);
    return;
  }
  if (!THREE || !THREE.Scene) return;

  const INK = 0x171719, CREAM = 0xf1efe8, RED = 0xe8491d;
  const mat = (c, rough = 0.65) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.05 });

  function light(scene) {
    scene.add(new THREE.HemisphereLight(0xfffdf8, 0x8a8578, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd0ff, 0.5);
    rim.position.set(-3, 2, -2);
    scene.add(rim);
  }

  // chibi ninja from primitives; bust=true → head + shoulders only (portrait)
  function makeNinja(bust = false) {
    const g = new THREE.Group();
    const M = { ink: mat(INK), cream: mat(CREAM, 0.5), red: mat(RED, 0.5) };
    let bodyY = 0;
    if (bust) {
      const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 18), M.ink);
      shoulders.scale.set(1.15, 0.55, 0.8);
      shoulders.position.y = -0.28;
      g.add(shoulders);
      bodyY = -0.1;
    } else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.42, 6, 16), M.ink);
      body.position.y = 0.42;
      g.add(body);
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 10, 24), M.red);
      belt.rotation.x = Math.PI / 2;
      belt.position.y = 0.42;
      g.add(belt);
      for (const s of [-1, 1]) {
        const foot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), M.ink);
        foot.scale.set(1, 0.7, 1.3);
        foot.position.set(s * 0.14, 0.02, 0.04);
        g.add(foot);
      }
    }
    // arms on shoulder pivots (right one waves)
    const arms = {};
    for (const s of ['L', 'R']) {
      const pivot = new THREE.Group();
      pivot.position.set(s === 'L' ? -0.34 : 0.34, bodyY + 0.62, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.34, 4, 10), M.ink);
      arm.position.y = -0.22;
      pivot.add(arm);
      pivot.rotation.z = s === 'L' ? -0.35 : 0.35;
      g.add(pivot);
      arms[s] = pivot;
    }
    // head
    const head = new THREE.Group();
    head.position.y = bodyY + 1.02;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 22), M.ink);
    head.add(skull);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.055, 10, 28), M.red);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.13;
    head.add(band);
    const face = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.11, 0.2, 4, 12), M.cream);
    face.rotation.z = Math.PI / 2;
    face.position.set(0, -0.02, 0.27);
    face.scale.set(1, 1, 0.45);
    head.add(face);
    const eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), M.ink);
      eye.position.set(s * 0.1, -0.02, 0.36);
      head.add(eye);
      eyes.push(eye);
    }
    const ribbons = [];
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.3 - i * 0.07, 0.055, 0.02), M.red);
      r.geometry.translate(0.15 - i * 0.035, 0, 0); // pivot at knot
      r.position.set(-0.05, 0.16 - i * 0.09, -0.3);
      r.rotation.y = 0.5 + i * 0.25;
      head.add(r);
      ribbons.push(r);
    }
    g.add(head);
    return { group: g, head, eyes, arms, ribbons, baseY: 0 };
  }

  const mouse = { x: 0, y: 0 };
  if (finePointer) {
    addEventListener('pointermove', (e) => {
      mouse.x = (e.clientX / innerWidth) * 2 - 1;
      mouse.y = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });
  }

  const blink = (eyes, t, phase) => {
    const c = (t + phase) % 3.4;
    const s = c > 3.26 ? 0.12 : 1;
    eyes.forEach((e) => e.scale.set(1, s, 1));
  };
  const flutter = (ribbons, t) => {
    ribbons.forEach((r, i) => { r.rotation.z = Math.sin(t * (2.2 + i * 0.9) + i) * 0.28; });
  };

  function stage(canvas, builder) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    light(scene);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    const st = { canvas, renderer, scene, camera, visible: false, ready: false, ...builder(scene, camera) };
    const fit = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return false;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      return true;
    };
    st.fit = fit;
    return st;
  }

  const stages = [];
  const show = (canvas, extra) => {
    canvas.hidden = false;
    if (extra) extra.classList.add('webgl-on');
  };

  // ── portrait + contact buddies below (hero belongs to the face sticker now) ──

  // ── 1 · portrait bust: replaces the placeholder with a living avatar ──
  try {
    const canvas = document.getElementById('glPortrait');
    if (canvas) {
      const s = stage(canvas, (scene, camera) => {
        const n = makeNinja(true);
        n.group.position.y = -0.1;
        scene.add(n.group);
        camera.position.set(0, 0.45, 3.6);
        camera.lookAt(0, 0.35, 0);
        return {
          tick: (t) => {
            n.group.rotation.y = Math.sin(t * 0.35) * 0.3 + mouse.x * 0.45;
            n.group.rotation.x = -mouse.y * 0.06;
            blink(n.eyes, t, 1.3);
            flutter(n.ribbons, t);
          },
        };
      });
      s.kind = 'portrait';
      s.wrap = document.getElementById('portraitWrap');
      stages.push(s);
    }
  } catch { /* keep SVG portrait */ }

  // ── 2 · contact buddy: waves while you read, hops when poked ──
  try {
    const canvas = document.getElementById('glBuddy');
    if (canvas) {
      const s = stage(canvas, (scene, camera) => {
        const n = makeNinja(false);
        n.group.position.y = -0.35;
        scene.add(n.group);
        camera.position.set(0, 0.6, 4.4);
        camera.lookAt(0, 0.5, 0);
        return {
          cheer: false,
          excitedUntil: 0,
          tick(t, st) {
            const excited = performance.now() < st.excitedUntil;
            const waving = st.cheer || excited;
            n.group.position.y = -0.35
              + Math.sin(t * 1.8) * 0.04
              + (excited ? Math.abs(Math.sin(t * 7)) * 0.16 : 0);
            n.group.rotation.y = Math.sin(t * 0.6) * 0.12 + mouse.x * 0.25;
            n.arms.R.rotation.z = waving
              ? 2.5 + Math.sin(t * (excited ? 11 : 7)) * 0.45
              : 0.35 + Math.sin(t * 1.8) * 0.06;
            blink(n.eyes, t, 2.2);
            flutter(n.ribbons, t);
          },
        };
      });
      s.kind = 'buddy';
      canvas.style.pointerEvents = 'auto';
      canvas.addEventListener('click', () => { s.excitedUntil = performance.now() + 900; });
      const contact = document.getElementById('contact');
      if (contact && 'IntersectionObserver' in window) {
        new IntersectionObserver(([e]) => { s.cheer = e.isIntersecting; }).observe(contact);
      } else {
        s.cheer = true;
      }
      stages.push(s);
    }
  } catch { /* keep 2D card */ }

  if (!stages.length) {
    console.warn('[3d buddies] no stages mounted — staying 2D.');
    return;
  }
  console.info('[3d buddies] live:', stages.map((s) => s.kind).join(', '));

  // render only what is on screen
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const s = stages.find((x) => x.canvas === e.target);
      if (s) s.visible = e.isIntersecting;
    }), { threshold: 0.05 });
    stages.forEach((s) => io.observe(s.canvas));
  } else {
    stages.forEach((s) => { s.visible = true; });
  }

  const renderAll = (t) => {
    for (const s of stages) {
      if (!s.visible && s.ready) continue;
      if (!s.fit()) continue;
      try {
        s.tick(t, s);
        s.renderer.render(s.scene, s.camera);
      } catch { continue; }
      if (!s.ready) {
        s.ready = true;
        show(s.canvas, s.wrap);
      }
    }
  };

  const t0 = performance.now();
  const clockT = () => (performance.now() - t0) / 1000;

  addEventListener('resize', () => {
    const t = clockT();
    for (const s of stages) {
      if (!s.ready) continue;
      if (!s.fit()) continue;
      try { s.tick(t, s); s.renderer.render(s.scene, s.camera); } catch { /* ignore */ }
    }
  });

  if (reduceMotion) {
    renderAll(1.2); // one calm static frame, no loop
    return;
  }
  (function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    renderAll(clockT());
  })();
});
