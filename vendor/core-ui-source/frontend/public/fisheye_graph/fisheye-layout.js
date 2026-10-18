/* ─────────────── Fish-eye Graph · layout + animation ─────────────── */
/* Pure functions of (focusId, viewport, panelOpen, rotOffset).
   Layout shape per node: { x, y, scale, opacity, ring, isParent, angleDeg }.
   ring 0 = focus (center), ring 1 = direct neighbors, ring 2 = peripheral. */

const FOCUS_PX     = 260;        /* size of a scale=1.0 node in px */
const VISIBLE_CAP  = 12;         /* max children visible on the orbital ring */
const PARENT_SCALE = 0.78;
const RING1_SCALE  = 0.46;
const RING2_SCALE  = 0.22;

function panelWidthFor(w) {
  /* clamp(560, 50vw, 820) — must match CSS .panel width */
  return Math.min(820, Math.max(560, w * 0.50));
}

function polar(cx, cy, r, deg) {
  const rad = deg * Math.PI / 180;
  return { x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r };
}

function blankNode(cx, cy) {
  return { x: cx, y: cy, scale: 0, opacity: 0, ring: -1 };
}

/* Visibility window for the orbital ring.
   The "hidden zone" sits behind the parent corner (around angle 180°).
   Children rotated into that zone fade out — this is the infinite-scroll
   reveal: as the ring rotates, items pass through the occlusion arc, fade,
   and re-emerge on the opposite side.

   Only applies when there are MORE children than the visible cap (so the
   ring genuinely needs rotation). With small N, every child is fully visible
   regardless of angle — the parent corner is clipped offscreen and doesn't
   actually occlude orbital children at radius R1, so the previous "soft
   always-on fade" was over-protective and made some legitimate children
   nearly invisible (e.g. the 5th child of a 5-child track landing at 198°).
*/
function ringOpacity(angleDeg, hiddenWidth) {
  if (hiddenWidth <= 0) return 1;
  const fade = 32;
  const half = hiddenWidth / 2;
  const norm = ((angleDeg - 180 + 540) % 360) - 180;
  const dist = Math.abs(norm);
  if (dist >= half + fade) return 1;
  if (dist <= half) return 0;
  return (dist - half) / fade;
}

function computeLayout(focusId, w, h, panelOpen, rotOffset) {
  const panelW = panelOpen ? panelWidthFor(w) : 0;
  const effW   = w - panelW;

  const cx     = effW / 2;
  const cy     = h / 2 + 4;
  const dim    = Math.min(effW, h);
  const R1     = Math.min(310, dim * 0.34);
  const R2     = Math.min(560, dim * 0.62);

  /* Parent corner: off to the LEFT, viewport-anchored (NOT effective-area-
     anchored — it stays put when the panel opens, so the universe slides past
     it rather than dragging it along). Vertically nudged a hair above the
     focus for visual asymmetry; partially clipped on the left edge. */
  const parentCx = 38;
  const parentCy = cy - 60;

  const layout = {};
  for (const id in NODES) layout[id] = blankNode(cx, cy);

  /* Ring 0 — focus */
  layout[focusId] = { x: cx, y: cy, scale: 1.0, opacity: 1, ring: 0 };

  /* Parent — corner, enlarged, partially clipped */
  const parentId = PARENT[focusId];
  if (parentId) {
    layout[parentId] = {
      x: parentCx, y: parentCy,
      scale: PARENT_SCALE,
      opacity: 1,
      ring: 1,
      isParent: true,
    };
  }

  /* Ring 1 children — distributed around full 360° on the orbital ring,
     rotated by `rotOffset`, with a hidden zone behind the parent corner
     when childCount > VISIBLE_CAP. */
  const childIds = neighborsOf(focusId).filter(id => id !== parentId);
  const N = childIds.length;
  if (N > 0) {
    const hiddenWidth = N > VISIBLE_CAP
      ? 360 * (N - VISIBLE_CAP) / N + 18  /* extra margin so cap is hard */
      : 0;

    /* Adaptive child scale: shrink to keep adjacent children from overlapping
       on small viewports / large N. Chord between adjacent slots is
       2*R1*sin(π/N); divide by FOCUS_PX with a 1.18 padding factor. */
    const chordScale = (2 * R1 * Math.sin(Math.PI / Math.max(N, 3))) / FOCUS_PX / 1.18;
    const childScale = Math.max(0.26, Math.min(RING1_SCALE, chordScale));

    childIds.forEach((cid, i) => {
      const stable = -90 + (i / N) * 360;
      const angle  = stable + rotOffset;
      const opacity = ringOpacity(angle, hiddenWidth);

      if (opacity < 0.02) return;

      const p = polar(cx, cy, R1, angle);
      layout[cid] = {
        x: p.x, y: p.y,
        scale: childScale,
        opacity,
        ring: 1,
        angleDeg: angle,
      };
    });
  }

  /* Ring 2 (peripheral grandchildren) intentionally removed.
     Only the focus, its direct children, and its parent are visible at any
     given drill level — every other node in the graph stays at opacity 0
     until it becomes a ring-0 / ring-1 / parent participant. This keeps the
     stage uncluttered and makes drill transitions feel like the screen
     reshapes around a single, clean center-and-spokes diagram per level. */

  return layout;
}

/* ─────────────── Animation utilities ─────────────── */

const easeInOutCubic = t => t < 0.5
  ? 4 * t * t * t
  : 1 - Math.pow(-2 * t + 2, 3) / 2;

const lerp = (a, b, t) => a + (b - a) * t;

function lerpNode(from, to, t) {
  return {
    x:        lerp(from.x, to.x, t),
    y:        lerp(from.y, to.y, t),
    scale:    lerp(from.scale, to.scale, t),
    opacity:  lerp(from.opacity, to.opacity, t),
    ring:     t < 0.5 ? from.ring : to.ring,
    isParent: t < 0.5 ? from.isParent : to.isParent,
    angleDeg: t < 0.5 ? from.angleDeg : to.angleDeg,
  };
}

function focusFromLayout(L) {
  for (const id in L) if (L[id].ring === 0) return id;
  return null;
}

/* Reconciliation policy for appearing/disappearing nodes:

   The original Claude Design version anchored every appearing node to a
   graph-neighbor on the other side, so nodes streaked in/out along edges.
   That looks pretty for a few nodes but causes visible "jumping" when the
   parent of an appearing node itself moved during the same transition —
   the streak originates from a moving target.

   Per Eldon's feedback ("elements should move, zoom and track in place
   without jumping; other nodes should fade into view"), we now do the
   simplest possible thing:

     - APPEARING nodes (visible only in the new layout): start at their
       TARGET position with opacity 0, scaled slightly down (0.7×). They
       fade up + scale to full as the transition runs. No flight path.
     - DISAPPEARING nodes (visible only in the old layout): stay at their
       OLD position, fade to opacity 0 with a tiny shrink to 0.7×. No
       flight path away.
     - PERSISTENT nodes (visible in both): straight lerp old→new for every
       channel (x, y, scale, opacity). The orbital spin overlay is still
       applied on drill transitions so direct children of the new focus
       arc into orbit.

   Net effect: the eye tracks elements that exist in both states along a
   single, predictable arc; appearing/disappearing nodes politely fade
   without competing for attention. */
function reconcileLayouts(fromL, toL) {
  const fromAdj = {};
  const toAdj   = {};

  for (const id in NODES) {
    const f = fromL[id], t = toL[id];
    fromAdj[id] = { ...f };
    toAdj[id]   = { ...t };

    /* Appearing: start at the target position, faded out, slightly small. */
    if (f.opacity < 0.05 && t.opacity > 0.05) {
      fromAdj[id] = {
        x: t.x, y: t.y,
        scale: Math.max(0.05, t.scale * 0.7),
        opacity: 0,
        ring: t.ring, isParent: t.isParent, angleDeg: t.angleDeg,
      };
    }

    /* Disappearing: stay at the old position, fade out, slightly shrink. */
    if (f.opacity > 0.05 && t.opacity < 0.05) {
      toAdj[id] = {
        x: f.x, y: f.y,
        scale: Math.max(0.05, f.scale * 0.7),
        opacity: 0,
        ring: f.ring, isParent: f.isParent, angleDeg: f.angleDeg,
      };
    }
  }
  return [fromAdj, toAdj];
}
