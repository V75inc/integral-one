/* ─────────────── Fish-eye Graph · data + helpers ─────────────── */
/* Vanilla script — top-level consts become window globals shared with
   layout/panel/app modules. */

const NODES = {
  /* Workspace + spaces */
  "ws.acme": { kind: "workspace", title: "Acme Inc.", color: "#a3a3a3", meta: "Workspace · 2 spaces" },
  "sp.crm": { kind: "space", title: "CRM", color: "#a3a3a3", meta: "14 tracks · 8 members" },
  "sp.personal": { kind: "space", title: "Personal", color: "#a3a3a3", meta: "3 tracks" },

  /* CRM tracks — 14 total, exceeds 12-cap so rotation is needed */
  "t.roadmap": { kind: "track", title: "Roadmap", color: "#ff8552", meta: "42 entries · 7 collab" },
  "t.opps": { kind: "track", title: "Opportunities", color: "#8aa8c8", meta: "143 entries · 5 stages" },
  "t.contacts": { kind: "track", title: "Contacts", color: "#65d895", meta: "218 entries" },
  "t.projects": { kind: "track", title: "Projects", color: "#b59cd6", meta: "34 entries" },
  "t.support": { kind: "track", title: "Support Queue", color: "#ffd166", meta: "12 open" },
  "t.field": { kind: "track", title: "Field Marketing", color: "#ef6f6f", meta: "18 entries" },
  "t.partners": { kind: "track", title: "Partner Onboarding", color: "#7eb4f0", meta: "6 entries" },
  "t.sales": { kind: "track", title: "Sales Pipeline", color: "#4caf82", meta: "57 deals · 4 stages" },
  "t.renewals": { kind: "track", title: "Renewals", color: "#ffc857", meta: "23 entries" },
  "t.success": { kind: "track", title: "Customer Success", color: "#5dd6f0", meta: "31 accounts" },
  "t.mktops": { kind: "track", title: "Marketing Ops", color: "#ce93d8", meta: "11 entries" },
  "t.events": { kind: "track", title: "Events", color: "#ff7a7a", meta: "5 upcoming" },
  "t.vendors": { kind: "track", title: "Vendors", color: "#90a4ae", meta: "27 entries" },
  "t.compliance":{ kind: "track", title: "Compliance", color: "#bcaaa4", meta: "9 entries" },

  /* People */
  "p.eldon": { kind: "person", title: "Eldon Baird", color: "#ff8552", meta: "Member · online" },
  "p.jordan": { kind: "person", title: "Jordan Reyes", color: "#8aa8c8", meta: "Member" },
  "p.pat": { kind: "person", title: "Pat Lin", color: "#65d895", meta: "Member" },
};

const EDGES = [
  ["ws.acme", "sp.crm"], ["ws.acme", "sp.personal"],

  /* CRM → tracks */
  ["sp.crm", "t.roadmap"], ["sp.crm", "t.opps"], ["sp.crm", "t.contacts"],
  ["sp.crm", "t.projects"], ["sp.crm", "t.support"], ["sp.crm", "t.field"],
  ["sp.crm", "t.partners"], ["sp.crm", "t.sales"], ["sp.crm", "t.renewals"],
  ["sp.crm", "t.success"], ["sp.crm", "t.mktops"], ["sp.crm", "t.events"],
  ["sp.crm", "t.vendors"], ["sp.crm", "t.compliance"],

  /* Track ↔ people */
  ["t.roadmap", "p.eldon"], ["t.roadmap", "p.jordan"], ["t.roadmap", "p.pat"],
  ["t.opps", "p.jordan"],["t.contacts", "p.pat"], ["t.projects", "p.eldon"],
  ["t.sales", "p.eldon"], ["t.renewals", "p.jordan"],["t.success", "p.pat"],
  ["t.mktops", "p.jordan"],["t.events", "p.pat"],

  /* Cross-track edges (the graph isn't a tree) */
  ["t.roadmap", "t.opps"], ["t.roadmap", "t.projects"],
  ["t.opps", "t.sales"], ["t.contacts","t.success"],
];

const PARENT = {
  "sp.crm": "ws.acme", "sp.personal": "ws.acme",

  "t.roadmap": "sp.crm", "t.opps": "sp.crm", "t.contacts": "sp.crm",
  "t.projects": "sp.crm", "t.support": "sp.crm", "t.field": "sp.crm",
  "t.partners": "sp.crm", "t.sales": "sp.crm", "t.renewals": "sp.crm",
  "t.success": "sp.crm", "t.mktops": "sp.crm", "t.events": "sp.crm",
  "t.vendors": "sp.crm", "t.compliance": "sp.crm",

  "p.eldon": "t.roadmap", "p.jordan": "t.roadmap", "p.pat": "t.roadmap",
};

const KIND_LABEL = {
  workspace: "WORKSPACE",
  space: "SPACE",
  track: "TRACK",
  person: "PERSON",
};

function neighborsOf(id) {
  const out = new Set();
  for (const [a, b] of EDGES) {
    if (a === id) out.add(b);
    if (b === id) out.add(a);
  }
  return [...out];
}

function chainTo(id) {
  const chain = [id];
  let cur = id;
  while (PARENT[cur]) { cur = PARENT[cur]; chain.unshift(cur); }
  return chain;
}

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/* ─────────────── Mock content for the side panel ─────────────── */
/* Per-entity feed of fake entries, generic enough to read as real CRM data. */

const MOCK_ENTRIES = {
  "t.roadmap": [
    { title: "Q4 launch checklist", status: "IN PROGRESS", statusColor: "#ffd166", who: "p.eldon", when: "Updated 2h ago", comments: 8 },
    { title: "Pricing v2", status: "PROPOSED", statusColor: "#8aa8c8", who: "p.jordan", when: "Updated 5h ago", comments: 3 },
    { title: "Onboarding redesign", status: "IN PROGRESS", statusColor: "#ffd166", who: "p.pat", when: "Updated yesterday", comments: 12 },
    { title: "API rate limits", status: "DONE", statusColor: "#65d895", who: "p.eldon", when: "Closed 2d ago", comments: 2 },
    { title: "Mobile parity", status: "PROPOSED", statusColor: "#8aa8c8", who: "p.jordan", when: "Updated 3d ago", comments: 5 },
  ],
  "t.opps": [
    { title: "Northwind — Series B prospect", status: "QUALIFIED", statusColor: "#65d895", who: "p.jordan", when: "Updated 1h ago", comments: 4 },
    { title: "Initrode — renewal", status: "NEGOTIATION", statusColor: "#ffd166", who: "p.eldon", when: "Updated 4h ago", comments: 9 },
    { title: "Globex — discovery call", status: "NEW", statusColor: "#8aa8c8", who: "p.jordan", when: "Updated yesterday", comments: 1 },
    { title: "Massive Dynamic — POC", status: "QUALIFIED", statusColor: "#65d895", who: "p.pat", when: "Updated 2d ago", comments: 6 },
  ],
  "t.contacts": [
    { title: "Sara Mehta — VP Eng, Northwind", status: "ACTIVE", statusColor: "#65d895", who: "p.jordan", when: "Last touched 3d ago", comments: 0 },
    { title: "Marcus Chen — Founder, Globex", status: "ACTIVE", statusColor: "#65d895", who: "p.eldon", when: "Last touched yesterday", comments: 2 },
    { title: "Linh Tran — Head of Ops", status: "DORMANT", statusColor: "#a3a3a3", who: "p.pat", when: "No contact 2 weeks", comments: 0 },
  ],
  "p.eldon": [
    { title: "Just commented on “Q4 launch checklist”", status: "ACTIVITY", statusColor: "#ff8552", who: "p.eldon", when: "12 min ago", comments: 0 },
    { title: "Closed “API rate limits”", status: "ACTIVITY", statusColor: "#ff8552", who: "p.eldon", when: "2d ago", comments: 0 },
    { title: "Joined Sales Pipeline", status: "ACTIVITY", statusColor: "#ff8552", who: "p.eldon", when: "1 week ago", comments: 0 },
  ],
  "p.jordan": [
    { title: "Commented on “Pricing v2”", status: "ACTIVITY", statusColor: "#8aa8c8", who: "p.jordan", when: "5h ago", comments: 0 },
    { title: "Pushed Northwind to QUALIFIED", status: "ACTIVITY", statusColor: "#8aa8c8", who: "p.jordan", when: "1d ago", comments: 0 },
  ],
  "p.pat": [
    { title: "Updated “Onboarding redesign”", status: "ACTIVITY", statusColor: "#65d895", who: "p.pat", when: "1h ago", comments: 0 },
    { title: "Reviewed Massive Dynamic POC", status: "ACTIVITY", statusColor: "#65d895", who: "p.pat", when: "2d ago", comments: 0 },
  ],
  "sp.crm": [
    { title: "8 entries updated today", status: "PULSE", statusColor: "#ff8552", who: "p.eldon", when: "Across 5 tracks", comments: 0 },
    { title: "Northwind moved to QUALIFIED", status: "EVENT", statusColor: "#65d895", who: "p.jordan", when: "1h ago", comments: 4 },
    { title: "Renewals — 3 due this week", status: "ALERT", statusColor: "#ffd166", who: "p.pat", when: "Updated 30m ago", comments: 0 },
  ],
  "ws.acme": [
    { title: "CRM · 8 entries today", status: "PULSE", statusColor: "#ff8552", who: "p.eldon", when: "Live", comments: 0 },
    { title: "Personal · 1 entry today", status: "PULSE", statusColor: "#ff8552", who: "p.pat", when: "Live", comments: 0 },
  ],
};

function entriesFor(id) {
  return MOCK_ENTRIES[id] || [];
}

const PRESENCE = {
  "t.roadmap": ["p.eldon", "p.jordan", "p.pat"],
  "t.opps": ["p.jordan"],
  "t.sales": ["p.eldon", "p.jordan"],
  "sp.crm": ["p.eldon", "p.jordan", "p.pat"],
  "ws.acme": ["p.eldon", "p.jordan", "p.pat"],
};
function presenceFor(id) { return PRESENCE[id] || []; }

/* ─────────────── Entry detail mock ───────────────
   When the user clicks an entry card in the panel feed, the panel pivots
   to a detail view rendered from this map. Keyed by `${trackId}::${index}`
   so each row in `MOCK_ENTRIES[trackId]` can have its own body. Falls back
   to a derived stub if not present. */
const MOCK_ENTRY_DETAILS = {
  "t.roadmap::0": {
    body: "Tracking the launch checklist for Q4. Owners are split across product, marketing, and ops. Blocker: pricing v2 needs legal sign-off before we can publish the new tier.",
    fields: [
      { label: "Owner", value: "Eldon Baird" },
      { label: "Priority", value: "High" },
      { label: "Due", value: "Oct 31, 2026" },
      { label: "Linked", value: "Pricing v2 · Mobile parity" },
    ],
    thread: [
      { who: "p.jordan", body: "Marketing's stuck waiting for the new tier copy. Can we unblock that?", when: "10m" },
      { who: "p.eldon", body: "Pricing v2 is blocked until legal signs off — I've pinged them.", when: "12m" },
      { who: "p.pat", body: "Onboarding redesign: I'll have wireframes by Friday.", when: "1h" },
    ],
  },
  "t.roadmap::1": {
    body: "New tier proposal: drop the “Team” price, fold its features into Pro, introduce a usage-based add-on for the org plan. Awaiting legal review of the contract changes.",
    fields: [
      { label: "Owner", value: "Jordan Reyes" },
      { label: "Priority", value: "High" },
      { label: "Status", value: "Awaiting legal" },
      { label: "Updated", value: "5h ago" },
    ],
    thread: [
      { who: "p.jordan", body: "Sent the redline back to legal yesterday. Expecting their response by EOD tomorrow.", when: "5h" },
      { who: "p.eldon", body: "Once approved, marketing copy is two days. So a week to launch.", when: "5h" },
    ],
  },
  "t.roadmap::2": {
    body: "Replacing the four-step onboarding with a single welcome modal + progressive disclosure. A/B early data shows 14% activation lift for the new flow.",
    fields: [
      { label: "Owner", value: "Pat Lin" },
      { label: "Priority", value: "Medium" },
      { label: "Status", value: "In design review" },
      { label: "Linked", value: "Q4 launch checklist" },
    ],
    thread: [
      { who: "p.pat", body: "Wireframes coming Friday — I'll DM the deck once they're tight.", when: "1h" },
      { who: "p.eldon", body: "Push them in here when ready so the team can comment inline.", when: "45m" },
    ],
  },
  "t.opps::0": {
    body: "Northwind moved to QUALIFIED yesterday. They've shortlisted us with two others. Next step: the technical demo on the 14th.",
    fields: [
      { label: "Stage", value: "Qualified" },
      { label: "ARR", value: "$420K" },
      { label: "Probability", value: "55%" },
      { label: "Owner", value: "Jordan Reyes" },
    ],
    thread: [
      { who: "p.jordan", body: "Pushed Northwind to QUALIFIED. They've shortlisted us with two others.", when: "1h" },
      { who: "p.eldon", body: "Want me to join the demo? I can cover the architecture deep-dive.", when: "55m" },
    ],
  },
};
function entryDetailFor(trackId, idx) {
  const key = `${trackId}::${idx}`;
  if (MOCK_ENTRY_DETAILS[key]) return MOCK_ENTRY_DETAILS[key];
  /* Generic fallback so untouched mocks still render a panel. */
  return {
    body: "Open this entry to read the full discussion, structured fields, and live comments.",
    fields: [
      { label: "Status", value: (entriesFor(trackId)[idx] || {}).status || "—" },
    ],
    thread: [],
  };
}
