# Double-click dust effect

**Status:** Design approved in conversation; awaiting written-spec review  
**Date:** 2026-10-04

## Goal

Let a visitor double-click a visible content element and watch that element break into a short, polished burst of dust particles. The effect should fit the portfolio’s paper-and-scribble visual language and leave the page usable.

The target stays hidden for the rest of the current page load. A full refresh restores it. No state is persisted.

## Scope

Eligible targets are visible, rendered content elements with a measurable box: text, headings, images, SVG artwork, cards, stickers, and similar page content. The effect targets the element under the pointer, rather than automatically removing its nearest card or section. If the event lands on a child path inside inline SVG artwork, resolve the target to its containing `<svg>` so the capture contains the full drawing.

Links and buttons are never dust targets. Their normal click behavior remains immediate. A click on a nested label or icon inside a link or button is excluded by checking the target’s ancestors. Form controls, editable content, hidden or zero-size nodes, and document-level or fixed navigation shells (`html`, `body`, `main`, the header, and the navigation rail) are also excluded. Double-clicking a card’s blank area may dust that card; double-clicking one of its links or buttons will not.

The first implementation responds to mouse double-clicks. Touch double-tap is out of scope.

## Interaction flow

1. A delegated `dblclick` handler resolves the event target and checks eligibility. It does not change click handling, cancel navigation, or delay normal actions.
2. The effect captures the target’s current visual appearance. The original remains visible until capture succeeds.
3. A shared, transparent, fixed-position canvas receives colored particles sampled from the captured pixels. Sampling adapts to the target’s area and caps the burst at 1,800 particles.
4. Particles launch from their original positions with varied outward velocity, a small gravity drift, individual rotation, and a smooth fade over about 1.1–1.4 seconds. The burst direction is biased away from the double-click point for a tactile, intentional release.
5. As the particles begin, the original gets `visibility: hidden`, `pointer-events: none`, `aria-hidden="true"`, and `inert`. Keeping its box preserves page layout and avoids a scroll jump. It remains this way until refresh.
6. The shared canvas clears when the last particle ends. Animation frames run only while particles are active.

At most two bursts may overlap, with a shared cap of 2,400 live particles. If the cap is reached, the new request is ignored and its element remains visible.

## Capture and failure handling

Use a locally bundled DOM-to-canvas renderer so the feature does not depend on a runtime CDN request. The renderer recreates the DOM and styles; it does not capture the browser’s exact composited pixels. Its CSS support is therefore imperfect, and cross-origin frames or images may be unavailable. The official documentation describes these limits and the CORS requirements for images: [html2canvas documentation](https://html2canvas.github.io/html2canvas/documentation/) and [FAQ](https://html2canvas.github.io/html2canvas/faq/).

If capture rejects, returns an unusable canvas, or produces no visible pixels, leave the target unchanged and skip the effect. Do not partially hide content, persist a failed state, or print a user-facing error. Before implementation, verify the renderer’s license, locally bundled size, and its output on the site’s portrait sticker, paper cards, SVG doodles, and text.

## Motion and accessibility

The particle canvas is `aria-hidden` and `pointer-events: none`; it never blocks input. When `prefers-reduced-motion: reduce` is enabled, skip rasterization and particles, then hide an eligible target immediately after the double-click. The element still returns on refresh. The effect does not run continuously and uses `requestAnimationFrame` only during active bursts.

## Implementation boundaries

- Add one isolated dust-effect module and one reusable canvas overlay; use delegated event handling instead of listeners on every element.
- Keep the target eligibility rule centralized and explicit.
- Keep particle sampling, animation, and target hiding in separate functions so capture or animation failure cannot strand a target.
- Do not alter existing drag, link, button, navigation, or scroll behavior.
- Do not write removed-element state to `localStorage` or another persistent store.

## Acceptance checks

- Double-clicking a heading, paragraph, portrait, SVG doodle, and paper card produces a recognizable dust burst matching each target’s current colors and shape.
- The target stays hidden in place after the dust clears; surrounding layout does not jump.
- Refresh restores every dusted element.
- Double-clicking a link or button does not trigger the dust effect, and a normal single click still performs its existing action without delay.
- A failed or blank capture leaves the element fully visible and usable.
- A large target and two quick successive bursts stay within the particle caps and do not keep an idle animation loop running.
- Reduced-motion mode hides the target immediately with no particle flight.
- The page remains scrollable and fixed navigation remains usable while particles are visible.
