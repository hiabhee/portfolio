# Double-click Dust Effect Implementation Plan

**Goal:** Add the approved double-click dust effect to eligible portfolio content.

**Architecture:** A small browser module delegates `dblclick`, captures the target with locally served html2canvas, and renders sampled pixels in one fixed canvas. Capture completes before the target is hidden; removed state is held only in the page DOM until refresh.

**Tech Stack:** Static HTML, vanilla JavaScript, CSS, html2canvas 1.4.1 (MIT).

**Spec:** `docs/superpowers/specs/2026-10-04-double-click-dust-design.md`

## Global Constraints

- Ignore links, buttons, form controls, editable content, hidden nodes, and global navigation shells.
- Support mouse double-click only; preserve normal click behavior.
- Keep targets hidden only until full refresh, without persistent storage.
- Cap bursts at 1,800 particles each, two overlapping bursts, and 2,400 live particles total.
- Under reduced motion, hide eligible targets immediately without capture or particle travel.
- On capture failure, leave the target unchanged.

## Review Focus

- Transparent or inaccessible image pixels: leave target unchanged when capture is unusable.
- Large or rapidly repeated targets: respect both per-burst and total particle caps.
- Nested action controls: preserve their existing click and navigation behavior.
- Reduced-motion preference: hide immediately without starting a frame loop.
- Resizing during a burst: keep the overlay aligned to the viewport and clear cleanly.

### Task 1: Add the isolated dust effect

**Files:**
- Create: `dust.js`
- Create: `assets/vendor/html2canvas.min.js`
- Create: `assets/vendor/html2canvas.LICENSE`
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `package.json` and `package-lock.json`

**Implementation:** Install html2canvas 1.4.1 as a local dependency, serve its 194 KB minified distribution from `assets/vendor`, expose it as a local deferred script and load `dust.js` after it from `index.html`. Keep eligibility, capture, particle sampling, drawing, and hiding in separate functions. Add a shared fixed, pointer-transparent canvas and reduced-motion handling.

**Review checks:** Verify action controls and menu event paths are excluded; each floating scrapbook object is targeted as one complete object; non-floating SVG child paths are captured from their parent SVG but only that child’s bounds animate and only that child is hidden; capture errors and empty pixel buffers leave the target unchanged; refresh restores hidden content; no storage keys are added.
