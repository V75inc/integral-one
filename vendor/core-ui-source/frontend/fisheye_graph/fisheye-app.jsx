/* ─────────────── Fish-eye Graph · App ─────────────── */
/* Owns focusId, panelOpen, rotOffset state. Drives a single rAF lerp
   between layout snapshots when focus or panel changes; updates rotOffset
   directly on drag (no animation — direct manipulation). */

const { useState, useEffect, useRef, useCallback, useMemo } = React;
const Panel = window.Panel;

function App() {
  const [size, setSize] = useState(() => ({
    w: window.innerWidth, h: window.innerHeight,
  }));
  const [focusId, setFocusId] = useState("sp.crm");
  const [panelOpen, setPanelOpen] = useState(false);
  const [rotOffset, setRotOffset] = useState(0);
  const [layout, setLayout] = useState(() =>
    computeLayout("sp.crm", window.innerWidth, window.innerHeight, false, 0));
  const [autoOpenedFor, setAutoOpenedFor] = useState(null);

  /* Edge-rendering opacity multiplier. During drill transitions we hide the
     edges and fade them back in over the latter half of the animation, so
     they don't draw from a still-moving focus to nodes that haven't arrived
     yet. Steady-state value is 1. Panel open/close doesn't touch this. */
  const [edgeFade, setEdgeFade] = useState(1);

  const animRef = useRef(null);
  const busyRef = useRef(false);
  const stageRef = useRef(null);
  const dragRef = useRef({
    active: false, moved: 0,
    startX: 0, startY: 0,
    startRot: 0, pointerId: null,
  });

  /* ── resize ── */
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* Snap layout when size changes while idle. */
  useEffect(() => {
    if (!busyRef.current) {
      setLayout(computeLayout(focusId, size.w, size.h, panelOpen, rotOffset));
    }
  }, [size.w, size.h]);

  /* ── transition runner ──
     Lerps fromLayout → toLayout. If `spinFocus` is supplied, applies a
     decaying orbital rotation around that node so children swing into
     place rather than translating in a straight line — the entry IS
     the orbit. */
  const runTransition = useCallback((toLayout, duration = 760, spinFocus = null, spinDeg = 90) => {
    busyRef.current = true;
    const fromL = layout;
    const [from, to] = reconcileLayouts(fromL, toLayout);

    /* Hide edges immediately. They'll fade in over the latter half of the
       animation alongside the appearing/persisting nodes. Drill-only
       behaviour — panel open/close uses a separate path that leaves
       edgeFade at its current value (typically 1). */
    const isDrillTransition = !!spinFocus;
    if (isDrillTransition) setEdgeFade(0);

    const start = performance.now();
    const tick = (now) => {
      const raw = Math.min(1, (now - start) / duration);
      const eased = easeInOutCubic(raw);

      const next = {};
      for (const id in NODES) next[id] = lerpNode(from[id], to[id], eased);

      if (isDrillTransition) {
        /* Linear fade-in over t ∈ [0.55, 1.0]. The 0.55 threshold lets the
           parent settle visually before edges start appearing — the
           "node arrives, then its connections" beat. */
        const fade = raw < 0.55 ? 0 : (raw - 0.55) / 0.45;
        setEdgeFade(Math.min(1, fade));
      }

      if (spinFocus && raw < 1) {
        const fp = next[spinFocus];
        if (fp) {
          const extra = spinDeg * (1 - eased);
          const rad = extra * Math.PI / 180;
          const cs = Math.cos(rad), sn = Math.sin(rad);
          const fcx = fp.x, fcy = fp.y;
          for (const id in next) {
            if (id === spinFocus) continue;
            /* Only spin the NEW focus's direct children that are *arriving*
               on the orbital ring — the ones landing into orbit for the
               first time. Exiting nodes, the parent corner, and ring-2
               peripherals keep their straight-line lerp paths. */
            const t = to[id];
            if (!t || t.ring !== 1 || t.isParent || t.opacity < 0.5) continue;
            /* CRITICAL: skip the OLD focus. On drill-up, the old focus is
               moving from center → orbit (ring 0 → ring 1). Spinning it
               around the new focus while it's also lerping outward yields a
               teleport: at t=0 the spin formula rotates its old-center
               position around the parent-corner position by spinDeg degrees,
               putting it nowhere meaningful. Letting it lerp directly gives
               a clean center-to-orbit arc that follows the path the user
               expects ("the focus I just left flies out to its slot"). */
            const f = from[id];
            if (f && f.ring === 0) continue;
            const p = next[id];
            const dx = p.x - fcx, dy = p.y - fcy;
            next[id] = { ...p,
              x: fcx + dx * cs - dy * sn,
              y: fcy + dx * sn + dy * cs,
            };
          }
        }
      }
      setLayout(next);

      if (raw < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        busyRef.current = false;
        animRef.current = null;
        setLayout(toLayout);
        /* Snap edges to fully visible at the end so steady-state hovers
           don't flicker through a partial value. */
        if (isDrillTransition) setEdgeFade(1);
      }
    };
    animRef.current = requestAnimationFrame(tick);
  }, [layout]);

  /* ── drill ── */
  const drillTo = useCallback((newFocusId) => {
    if (newFocusId === focusId) return;
    if (busyRef.current) return;
    if (!NODES[newFocusId]) return;

    const isDrillDown = PARENT[newFocusId] === focusId;
    /* Once the panel is open, leave it up unless the user manually closes it. */
    const nextPanel = panelOpen || isDrillDown;

    setFocusId(newFocusId);
    setPanelOpen(nextPanel);
    setRotOffset(0);
    setAutoOpenedFor(null);

    const toL = computeLayout(newFocusId, size.w, size.h, nextPanel, 0);
    runTransition(toL, 760, newFocusId, isDrillDown ? 95 : -75);
  }, [focusId, panelOpen, size.w, size.h, runTransition]);

  /* ── panel toggle ── */
  const togglePanel = useCallback(() => {
    if (busyRef.current) return;
    const next = !panelOpen;
    setPanelOpen(next);
    setAutoOpenedFor(null);
    const toL = computeLayout(focusId, size.w, size.h, next, rotOffset);
    runTransition(toL, 460, null);
  }, [panelOpen, focusId, rotOffset, size.w, size.h, runTransition]);

  /* ── ring rotation (wheel) ──
     The wheel listener has to be native + non-passive (React's synthetic
     onWheel can't preventDefault). Previously this useEffect re-attached
     the listener on every rotOffset change because rotOffset was a dep.
     Wheel events fire faster than React re-renders, so during the brief
     cleanup→reattach window between scroll ticks, events were being
     dropped — which read as "scrolling broken / can't reach the end."

     Fix: attach the listener exactly once and read state from a ref
     that's kept in sync each render. The ref always holds the latest
     rot/focus/panel/size so a single stable handler can do the work. */
  const inputsRef = useRef({ rotOffset, focusId, panelOpen, size });
  useEffect(() => {
    inputsRef.current = { rotOffset, focusId, panelOpen, size };
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e) => {
      if (busyRef.current) return;
      e.preventDefault();
      const s = inputsRef.current;
      const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.28;
      const newRot = s.rotOffset + delta;
      /* Update the ref synchronously so the next wheel event reads the
         correct rotation, even before React commits the state change. */
      inputsRef.current = { ...s, rotOffset: newRot };
      setRotOffset(newRot);
      setLayout(computeLayout(s.focusId, s.size.w, s.size.h, s.panelOpen, newRot));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []); /* mount-once: handler reads from ref, never goes stale */

  /* ── ring rotation (drag) ── */
  const onStagePointerDown = (e) => {
    if (busyRef.current) return;
    dragRef.current = {
      active: true, moved: 0,
      startX: e.clientX, startY: e.clientY,
      startRot: rotOffset,
      pointerId: e.pointerId,
    };
    if (e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }
  };
  const onStagePointerMove = (e) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy));
    if (busyRef.current) return;
    const newRot = d.startRot + dx * 0.4; /* ~0.4° per px horizontal */
    setRotOffset(newRot);
    setLayout(computeLayout(focusId, size.w, size.h, panelOpen, newRot));
  };
  const onStagePointerUp = () => {
    dragRef.current.active = false;
  };

  /* ── rotation chevrons ── */
  const rotateBy = useCallback((deg) => {
    if (busyRef.current) return;
    const newRot = rotOffset + deg;
    setRotOffset(newRot);
    setLayout(computeLayout(focusId, size.w, size.h, panelOpen, newRot));
  }, [rotOffset, focusId, panelOpen, size.w, size.h]);

  /* ── keyboard ── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        const p = PARENT[focusId];
        if (p) drillTo(p);
      }
      if (e.key === 'ArrowLeft') rotateBy(-30);
      if (e.key === 'ArrowRight') rotateBy(30);
      if (e.key === 'p' || e.key === 'P') togglePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusId, drillTo, rotateBy, togglePanel]);

  /* ── cleanup ── */
  useEffect(() => () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
  }, []);

  /* ── derived ── */
  const panelW = panelOpen ? Math.min(640, Math.max(420, size.w * 0.42)) : 0;
  const effW = size.w - panelW;
  const dim = Math.min(effW, size.h);
  const ringR1 = Math.min(310, dim * 0.34);
  const ringR2 = Math.min(560, dim * 0.62);
  const cx = effW / 2;
  const cy = size.h / 2 + 4;

  const edges = useMemo(() => EDGES
    .filter(([a, b]) => {
      if (layout[a].opacity < 0.05 || layout[b].opacity < 0.05) return false;
      /* Only render edges directly incident to the focus — parent edge and
         child edges. Cross-track and grandchild edges are hidden so the graph
         reads as a clean center-and-spokes diagram per drill level. */
      return a === focusId || b === focusId;
    })
    .map(([a, b]) => {
      const pa = layout[a], pb = layout[b];
      const opacity = Math.min(pa.opacity, pb.opacity);
      const focusEdge = pa.ring === 0 || pb.ring === 0;
      const periph = pa.ring === 2 || pb.ring === 2;
      const parentEdge = pa.isParent || pb.isParent;
      return { a, b, pa, pb, opacity, focusEdge, periph, parentEdge };
    }), [layout, focusId]);

  const nodeEntries = useMemo(() => Object.entries(layout)
    .filter(([_, p]) => p.opacity > 0.02)
    .sort(([_a, a], [_b, b]) => a.scale - b.scale), [layout]);

  const chain = chainTo(focusId);

  /* When clicking on the focus center, toggle panel. */
  const onNodeClick = (id) => {
    if (dragRef.current.moved > 4) return; /* drag, not click */
    if (id === focusId) {
      togglePanel();
    } else {
      drillTo(id);
    }
  };

  return (
    <>
      <div
        ref={stageRef}
        className={`stage ${dragRef.current.active ? 'is-dragging' : ''}`}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerUp}
        style={{ '--eff-w': `${effW}px`, '--cx': `${cx}px`, '--cy': `${cy}px` }}>

        {/* Faint orbital guides (decorative) */}
        <div
          className="ring-guide"
          style={{
            width: ringR1 * 2, height: ringR1 * 2,
            left: cx, top: cy,
          }} />
        <div
          className="ring-guide ring-guide-2"
          style={{
            width: ringR2 * 2, height: ringR2 * 2,
            left: cx, top: cy,
          }} />

        {/* Top chrome */}
        <div className="chrome">
          <div className="wordmark" onClick={() => drillTo("ws.acme")}>
            <div className="brand-mark" />Integral
          </div>
          <div className="scope">
            <span className="scope-chain">
              {chain.map((id, i) => (
                <React.Fragment key={id}>
                  {i > 0 && <span className="sep">›</span>}
                  <span
                    className={`crumb ${i === chain.length - 1 ? 'is-active' : ''}`}
                    onClick={() => drillTo(id)}
                    onPointerDown={(e) => e.stopPropagation()}>
                    {NODES[id].title}
                  </span>
                </React.Fragment>
              ))}
            </span>
          </div>
          <div className="chrome-right" onPointerDown={(e) => e.stopPropagation()}>
            <div className="search-pill">
              <span style={{ opacity: 0.5 }}>⌕</span>
              <span>Search the universe</span>
            </div>
            <div className="avatar-chrome" />
          </div>
        </div>

        {/* Edges */}
        <svg
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 1,
          }}>
          {edges.map(({ a, b, pa, pb, opacity, focusEdge, periph, parentEdge }) => {
            /* During drill transitions, edgeFade ramps 0→1 over the second
               half of the animation. At steady state edgeFade === 1 and the
               edge looks identical to before. */
            const a8 = opacity * edgeFade;
            return (
              <line
                key={a + '-' + b}
                x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                stroke={
                  parentEdge
                    ? `rgba(255, 220, 195, ${0.32 * a8})`
                    : focusEdge
                    ? `rgba(220, 220, 235, ${0.30 * a8})`
                    : periph
                    ? `rgba(140, 140, 160, ${0.16 * a8})`
                    : `rgba(180, 180, 200, ${0.20 * a8})`
                }
                strokeWidth={parentEdge ? 1.2 : focusEdge ? 1.05 : 0.85}
                strokeDasharray={periph ? "2 5" : ""}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {nodeEntries.map(([id, p]) => {
          const node = NODES[id];
          const sz = p.scale * FOCUS_PX;
          const isFocus = p.ring === 0;
          return (
            <button
              key={id}
              className={`node ${isFocus ? 'is-focus' : ''} ${p.isParent ? 'is-parent-corner' : ''}`}
              data-ring={p.ring}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onNodeClick(id)}
              style={{
                left: p.x, top: p.y,
                width: sz, height: sz,
                transform: 'translate(-50%, -50%)',
                opacity: p.opacity,
                fontSize: `${Math.max(9, sz * 0.105)}px`,
                "--node-color": node.color,
                "--node-glow": hexToRgba(node.color, isFocus ? 0.22 : p.isParent ? 0.20 : 0.16),
                zIndex: 5 + Math.round(p.scale * 100),
              }}
              tabIndex={p.opacity > 0.5 ? 0 : -1}
              aria-label={p.isParent ? `Drill out to ${node.title}` : `Drill into ${node.title}`}>
              <div className="node-sphere">
                <div className="dot" />
                {p.isParent && <div className="parent-back-arrow">↩</div>}
                <div className="eyebrow">
                  {p.isParent ? "↩ " : ""}{KIND_LABEL[node.kind]}
                </div>
                <div className="title">{node.title}</div>
                {p.scale > 0.36 && <div className="meta">{node.meta}</div>}
              </div>
            </button>
          );
        })}

        {/* Rotation chevrons — only shown if rotation is meaningful */}
        {(() => {
          const childCount = neighborsOf(focusId).filter(n => n !== PARENT[focusId]).length;
          if (childCount <= VISIBLE_CAP && childCount <= 3) return null;
          return (
            <>
              <button
                className="rot-chevron rot-chevron-left"
                style={{ left: cx - ringR1 - 22, top: cy }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => rotateBy(-30)}
                aria-label="Rotate ring left">
                <svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 2 L4 7 L9 12" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button
                className="rot-chevron rot-chevron-right"
                style={{ left: cx + ringR1 + 22, top: cy }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => rotateBy(30)}
                aria-label="Rotate ring right">
                <svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 2 L10 7 L5 12" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </>
          );
        })()}

        {/* Demo rail */}
        <div className="rail" onPointerDown={(e) => e.stopPropagation()}>
          {[
            { id: "ws.acme", label: "Acme Inc." },
            { id: "sp.crm", label: "CRM" },
            { id: "t.roadmap", label: "Roadmap", color: "#ff8552" },
            { id: "t.opps", label: "Opportunities", color: "#8aa8c8" },
            { id: "t.sales", label: "Sales", color: "#4caf82" },
            { id: "p.eldon", label: "Eldon" },
          ].map(({ id, label, color }) => (
            <button
              key={id}
              className={focusId === id ? "is-active" : ""}
              onClick={() => drillTo(id)}>
              {color && <span className="rail-dot" style={{ background: color }} />}
              {label}
            </button>
          ))}
        </div>

        <div className="hint" onPointerDown={(e) => e.stopPropagation()}>
          <span>Drag or scroll to spin · click to drill · </span>
          <kbd>Esc</kbd>
          <span> back · </span>
          <kbd>P</kbd>
          <span> panel</span>
        </div>
      </div>

      <Panel
        focusId={focusId}
        isOpen={panelOpen}
        onClose={togglePanel}
      />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
