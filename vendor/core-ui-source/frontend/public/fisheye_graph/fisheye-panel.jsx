/* ─────────────── Fish-eye Graph · side panel ───────────────
   Type-aware panel with per-kind content and an entry-detail sub-view.

   Tabs by node kind:
     workspace : Spaces · Members · Settings              (no entry detail)
     space     : Pulse  · Tracks  · Members · Settings    (no entry detail)
     track     : Feed   · Kanban  · Table   · Members · Settings
     person    : Activity · Tracks                        (no tabs strictly,
                 but two sections in Feed)

   Within Track Feed/Kanban/Table, clicking an entry opens an EntryDetail
   sub-view inside the panel — same panel, replaced body, "← Back to feed"
   at the top. The orbital map behind the panel is unaffected.

   Visual language matches the rest of the prototype: dark surfaces, hairline
   borders, color-tinted accents driven by the focused node's color. The
   entry detail and the kanban/table renders deliberately echo the patterns
   from S6–S10 and the original V1–V3 conformable mockups so the user gets
   what we've been refining all along, just embedded inside the spatial
   shell. */

const { useState: usePanelState, useEffect: usePanelEffect } = React;

/* ──────────────────────────── Atoms ──────────────────────────── */

function Avatar({ id, size = 22 }) {
  const node = NODES[id] || { color: "#a3a3a3", title: "?" };
  const initial = (node.title || "?").charAt(0);
  return (
    <div
      className="avatar-mini"
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, ${node.color} 0%, ${node.color}80 100%)`,
        fontSize: size * 0.45,
      }}>
      {initial}
    </div>
  );
}

function PresenceRow({ ids }) {
  if (!ids || ids.length === 0) return null;
  const names = ids.map(id => NODES[id]?.title.split(' ')[0]).join(', ');
  return (
    <div className="panel-presence">
      <span className="presence-dot" />
      <div className="presence-stack">
        {ids.slice(0, 4).map(id => <Avatar key={id} id={id} size={18} />)}
      </div>
      <span>{ids.length} here · {names}</span>
    </div>
  );
}

function StatusPill({ entry }) {
  return (
    <span
      className="entry-status"
      style={{
        color: entry.statusColor,
        background: hexToRgba(entry.statusColor, 0.12),
      }}>
      {entry.status}
    </span>
  );
}

function EntryCard({ entry, onClick }) {
  return (
    <div className="entry-card" onClick={onClick} role="button">
      <div className="entry-row">
        <StatusPill entry={entry} />
        <span className="entry-title">{entry.title}</span>
      </div>
      <div className="entry-foot">
        <Avatar id={entry.who} size={18} />
        <span className="entry-meta">
          {NODES[entry.who]?.title.split(' ')[0]} · {entry.when}
        </span>
        {entry.comments > 0 && (
          <span className="entry-comments">{entry.comments} comments</span>
        )}
      </div>
    </div>
  );
}

function CommentBubble({ who, body, when }) {
  return (
    <div className="comment-bubble">
      <Avatar id={who} size={26} />
      <div className="comment-body">
        <div className="comment-head">
          <span className="comment-who">{NODES[who]?.title.split(' ')[0]}</span>
          <span className="comment-when">{when}</span>
        </div>
        <p className="comment-text">{body}</p>
      </div>
    </div>
  );
}

const FAKE_COMMENTS = {
  "t.roadmap": [
    { who: "p.eldon",  body: "Pricing v2 is blocked until legal signs off — I've pinged them.", when: "12m" },
    { who: "p.jordan", body: "Northwind wants a demo of mobile parity before EOQ.",             when: "32m" },
    { who: "p.pat",    body: "Onboarding redesign: I'll have wireframes by Friday.",            when: "1h" },
  ],
  "t.opps": [
    { who: "p.jordan", body: "Pushed Northwind to QUALIFIED. They've shortlisted us with two others.", when: "1h" },
  ],
};
function fakeCommentsFor(id) { return FAKE_COMMENTS[id] || []; }

/* ─────────────────── Track view tabs (Feed / Kanban / Table) ─────────────────── */

function TrackFeedView({ entries, comments, onOpenEntry }) {
  return (
    <>
      <div className="panel-section-label">Recent entries</div>
      {entries.length === 0
        ? <div className="empty-state">No entries yet.</div>
        : entries.map((e, i) => (
            <EntryCard key={i} entry={e} onClick={() => onOpenEntry(i)} />
          ))}

      {comments.length > 0 && (
        <>
          <div className="panel-section-label" style={{ marginTop: 28 }}>
            Live · comments-as-realtime
          </div>
          {comments.map((c, i) => <CommentBubble key={i} {...c} />)}
        </>
      )}
    </>
  );
}

function TrackKanbanView({ entries, onOpenEntry }) {
  /* Group entries by status. Order columns by first-seen status to keep
     stable across renders. */
  const cols = [];
  const seen = new Map();
  entries.forEach((e, i) => {
    if (!seen.has(e.status)) {
      seen.set(e.status, cols.length);
      cols.push({ status: e.status, color: e.statusColor, items: [] });
    }
    cols[seen.get(e.status)].items.push({ ...e, _idx: i });
  });

  if (cols.length === 0) {
    return <div className="empty-state">No entries to board.</div>;
  }

  return (
    <div className="kanban">
      {cols.map(col => (
        <div key={col.status} className="kanban-col">
          <div className="kanban-col-head">
            <span style={{ color: col.color }}>{col.status}</span>
            <span>{col.items.length}</span>
          </div>
          {col.items.map((e) => (
            <div
              key={e._idx}
              className="kanban-card"
              onClick={() => onOpenEntry(e._idx)}
              role="button">
              <div className="kanban-card-title">{e.title}</div>
              <div className="kanban-card-meta">
                <Avatar id={e.who} size={14} />
                <span>{NODES[e.who]?.title.split(' ')[0]}</span>
                {e.comments > 0 && <span>· {e.comments} 💬</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TrackTableView({ entries, onOpenEntry }) {
  if (entries.length === 0) {
    return <div className="empty-state">No entries.</div>;
  }
  return (
    <table className="entry-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>Author</th>
          <th>When</th>
          <th>💬</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => (
          <tr key={i} onClick={() => onOpenEntry(i)} role="button">
            <td className="t-title">{e.title}</td>
            <td><StatusPill entry={e} /></td>
            <td>
              <span className="t-author">
                <Avatar id={e.who} size={16} />
                {NODES[e.who]?.title.split(' ')[0]}
              </span>
            </td>
            <td className="t-when">{e.when}</td>
            <td className="t-comments">{e.comments || ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─────────────────── Entry detail (panel sub-view) ─────────────────── */

function EntryDetailView({ trackId, idx, onBack }) {
  const entry  = entriesFor(trackId)[idx];
  const detail = entryDetailFor(trackId, idx);
  if (!entry) {
    return (
      <>
        <button className="link-back" onClick={onBack}>← Back to feed</button>
        <div className="empty-state">Entry not found.</div>
      </>
    );
  }
  return (
    <>
      <button className="link-back" onClick={onBack}>← Back to feed</button>
      <div className="entry-detail-head">
        <StatusPill entry={entry} />
        <h2 className="entry-detail-title">{entry.title}</h2>
        <div className="entry-detail-byline">
          <Avatar id={entry.who} size={20} />
          <span>{NODES[entry.who]?.title || "?"}</span>
          <span className="entry-meta">· {entry.when}</span>
        </div>
      </div>

      {detail.body && (
        <p className="entry-detail-body">{detail.body}</p>
      )}

      {detail.fields && detail.fields.length > 0 && (
        <div className="entry-detail-fields">
          {detail.fields.map((f, i) => (
            <div key={i} className="entry-detail-field">
              <span className="entry-detail-field-label">{f.label}</span>
              <span className="entry-detail-field-value">{f.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="panel-section-label" style={{ marginTop: 8 }}>
        {detail.thread && detail.thread.length > 0
          ? `Thread · ${detail.thread.length}`
          : "No comments yet"}
      </div>
      {(detail.thread || []).map((c, i) => <CommentBubble key={i} {...c} />)}
    </>
  );
}

/* ─────────────────── Per-kind body renderers ─────────────────── */

function WorkspaceBody({ focusId }) {
  /* Spaces under this workspace. */
  const spaces = neighborsOf(focusId).filter(id => NODES[id]?.kind === "space");
  return (
    <>
      <div className="panel-section-label">Spaces</div>
      {spaces.length === 0
        ? <div className="empty-state">No spaces yet.</div>
        : spaces.map(id => (
            <div key={id} className="member-row" style={{ paddingLeft: 0 }}>
              <span
                className="rail-dot"
                style={{
                  width: 10, height: 10,
                  background: NODES[id].color,
                  flexShrink: 0,
                }} />
              <div>
                <div className="member-name">{NODES[id].title}</div>
                <div className="member-meta">{NODES[id].meta}</div>
              </div>
            </div>
          ))}

      <div className="panel-section-label" style={{ marginTop: 28 }}>
        Workspace pulse
      </div>
      {(entriesFor(focusId) || []).map((e, i) => (
        <EntryCard key={i} entry={e} onClick={() => {}} />
      ))}
    </>
  );
}

function SpacePulseBody({ focusId, comments, onOpenEntry }) {
  const entries = entriesFor(focusId);
  return (
    <>
      <div className="panel-section-label">Recent activity</div>
      {entries.length === 0
        ? <div className="empty-state">No activity yet.</div>
        : entries.map((e, i) => (
            <EntryCard key={i} entry={e} onClick={() => onOpenEntry(i)} />
          ))}

      {comments.length > 0 && (
        <>
          <div className="panel-section-label" style={{ marginTop: 28 }}>
            Live · comments-as-realtime
          </div>
          {comments.map((c, i) => <CommentBubble key={i} {...c} />)}
        </>
      )}
    </>
  );
}

function SpaceTracksBody({ focusId }) {
  const tracks = neighborsOf(focusId).filter(id => NODES[id]?.kind === "track");
  return (
    <>
      <div className="panel-section-label">{tracks.length} tracks</div>
      {tracks.map(id => (
        <div key={id} className="member-row" style={{ paddingLeft: 0 }}>
          <span
            className="rail-dot"
            style={{
              width: 10, height: 10,
              background: NODES[id].color,
              flexShrink: 0,
            }} />
          <div>
            <div className="member-name">{NODES[id].title}</div>
            <div className="member-meta">{NODES[id].meta}</div>
          </div>
        </div>
      ))}
    </>
  );
}

function MembersBody({ presence }) {
  return (
    <>
      <div className="panel-section-label">{presence.length} member{presence.length === 1 ? '' : 's'}</div>
      {presence.length === 0 && <div className="empty-state">No members.</div>}
      {presence.map(id => (
        <div key={id} className="member-row">
          <Avatar id={id} size={32} />
          <div>
            <div className="member-name">{NODES[id]?.title}</div>
            <div className="member-meta">{NODES[id]?.meta}</div>
          </div>
        </div>
      ))}
    </>
  );
}

function SettingsBody() {
  return (
    <div className="empty-state" style={{ marginTop: 40 }}>
      Settings live here. Notifications, permissions, automation, integrations.
    </div>
  );
}

function PersonBody({ focusId }) {
  const activity = entriesFor(focusId);
  /* Tracks this person is on, derived from edges. */
  const tracks = neighborsOf(focusId).filter(id => NODES[id]?.kind === "track");
  return (
    <>
      <div className="panel-section-label">Recent activity</div>
      {activity.length === 0
        ? <div className="empty-state">No activity yet.</div>
        : activity.map((e, i) => <EntryCard key={i} entry={e} onClick={() => {}} />)}

      {tracks.length > 0 && (
        <>
          <div className="panel-section-label" style={{ marginTop: 28 }}>
            On {tracks.length} track{tracks.length === 1 ? '' : 's'}
          </div>
          {tracks.map(id => (
            <div key={id} className="member-row" style={{ paddingLeft: 0 }}>
              <span
                className="rail-dot"
                style={{
                  width: 10, height: 10,
                  background: NODES[id].color,
                  flexShrink: 0,
                }} />
              <div>
                <div className="member-name">{NODES[id].title}</div>
                <div className="member-meta">{NODES[id].meta}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

/* ─────────────────── Tab declarations per kind ─────────────────── */

const TABS_BY_KIND = {
  workspace: null,                                                 /* no tabs */
  space:     ["pulse", "tracks", "members", "settings"],
  track:     ["feed", "kanban", "table", "members", "settings"],
  person:    null,                                                 /* no tabs */
};

function tabLabel(t) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ─────────────────── Panel root ─────────────────── */

function Panel({ focusId, isOpen, onClose }) {
  const node = NODES[focusId];
  const tabs = node ? TABS_BY_KIND[node.kind] : null;
  const defaultTab = tabs ? tabs[0] : null;

  const [tab, setTab]               = usePanelState(defaultTab);
  const [openEntryIdx, setOpenIdx]  = usePanelState(null);

  /* When focus changes, reset tab to the new kind's default and clear any
     opened entry detail. Without this, drilling to a Person while you're on
     the "kanban" tab leaves the panel in an undefined-tab state. */
  usePanelEffect(() => {
    setTab(defaultTab);
    setOpenIdx(null);
  }, [focusId, node?.kind]);

  if (!node) return null;

  const entries  = entriesFor(focusId);
  const comments = fakeCommentsFor(focusId);
  const presence = presenceFor(focusId);

  const onOpenEntry = (idx) => setOpenIdx(idx);
  const onBack      = () => setOpenIdx(null);

  return (
    <aside
      className={`panel ${isOpen ? 'is-open' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ '--panel-color': node.color }}>

      <header className="panel-header">
        <div className="panel-eyebrow">{KIND_LABEL[node.kind]}</div>
        <h1 className="panel-title">{node.title}</h1>
        <div className="panel-meta">{node.meta}</div>
        <button className="panel-close" onClick={onClose} aria-label="Close panel">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <PresenceRow ids={presence} />
      </header>

      {tabs && openEntryIdx === null && (
        <div className="panel-tabs">
          {tabs.map(t => (
            <button
              key={t}
              className={`panel-tab ${tab === t ? 'is-active' : ''}`}
              onClick={() => setTab(t)}>
              {tabLabel(t)}
            </button>
          ))}
        </div>
      )}

      <div className="panel-body">
        {/* Entry detail sub-view always wins when openEntryIdx is set */}
        {openEntryIdx !== null && (
          <EntryDetailView
            trackId={focusId}
            idx={openEntryIdx}
            onBack={onBack}
          />
        )}

        {openEntryIdx === null && node.kind === "track" && (
          <>
            {tab === "feed"     && <TrackFeedView   entries={entries} comments={comments} onOpenEntry={onOpenEntry} />}
            {tab === "kanban"   && <TrackKanbanView entries={entries} onOpenEntry={onOpenEntry} />}
            {tab === "table"    && <TrackTableView  entries={entries} onOpenEntry={onOpenEntry} />}
            {tab === "members"  && <MembersBody     presence={presence} />}
            {tab === "settings" && <SettingsBody />}
          </>
        )}

        {openEntryIdx === null && node.kind === "space" && (
          <>
            {tab === "pulse"    && <SpacePulseBody  focusId={focusId} comments={comments} onOpenEntry={onOpenEntry} />}
            {tab === "tracks"   && <SpaceTracksBody focusId={focusId} />}
            {tab === "members"  && <MembersBody     presence={presence} />}
            {tab === "settings" && <SettingsBody />}
          </>
        )}

        {openEntryIdx === null && node.kind === "workspace" && (
          <WorkspaceBody focusId={focusId} />
        )}

        {openEntryIdx === null && node.kind === "person" && (
          <PersonBody focusId={focusId} />
        )}
      </div>

      {openEntryIdx === null && (
        <div className="composer">
          <Avatar id="p.eldon" size={28} />
          <input placeholder={`Reply in ${node.title}…`} />
          <button className="composer-send">↑</button>
        </div>
      )}
    </aside>
  );
}

window.Panel = Panel;
