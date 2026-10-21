export interface User {
  id: string;
  /** Auth / object user id (`o.User...`); matches `author_id` on entries when present. */
  user_id?: string;
  email?: string;
  display_name: string;
  /** Legacy free-form URL (kept for back-compat with pasted avatars). */
  avatar_url?: string;
  /** Phase 9 Plan 09-01 (AVT-01) — FK to the canonical 128px Attachment
   *  variant produced by the resize pipeline. When set, frontends resolve
   *  the rendered URL via ``GET /api/users/{id}/avatar?size=N&v=<updated_at>``. */
  avatar_attachment_id?: string;
  /** ISO timestamp; used as the cache-bust ``?v=`` token on avatar URLs. */
  updated_at?: string;
  bio?: string;
  preferences?: Record<string, unknown>;
  /** Persisted IANA account zone; unset before first browser detection. */
  timezone?: string | null;
  /** Phase 9 Plan 09-05 (ONBD-01) — onboarding completion timestamp.
   *  `null`/`undefined` means the user has not yet completed first-login
   *  onboarding; Layout mounts OnboardingModal (A2) or
   *  OnboardingGetStartedBanner (A5) until this is populated. */
  onboarded_at?: string | null;
  /** True when the account was provisioned with a temporary password. */
  must_change_password?: boolean;
  /** HR hire flow — public onboarding form the member must complete. */
  pending_assigned_form?: { url: string } | null;
  /** @deprecated use pending_assigned_form */
  pending_onboarding_form?: { url: string } | null;
  /** False until the user completes email verification. Non-blocking — the
   *  app shows a banner but doesn't gate login on this flag. */
  email_verified?: boolean;
  created_at: string;
  /** Primary workspace from session hints (owner or member). */
  workspace_id?: string;
  /** Collaborator/member role or UI role label from backend enrichment. */
  role?: string;
  roles?: string[];
  /** Track collaborator listing only: how this user gains access.
   *  `owner` = track owner; `direct` = explicit COLLABORATES_ON edge;
   *  `app` = inherited via a parent App (also see `source_app_id`). */
  source?: 'owner' | 'direct' | 'app';
  source_app_id?: string;
  source_app_name?: string;
  /** Uncapped parent-resource role for inherited rows (display only).
   *  Effective auth still uses the capped ``role`` per I-ROLE-02. */
  source_role?: string;
  /** True if an EXCLUDED_FROM edge blocks this user's inherited access. */
  excluded?: boolean;
  /** False only when `excluded` is true. */
  effective_access?: boolean;
}

/** Four-role enum for organization workspace membership. */
export type WorkspaceRole = "owner" | "admin" | "member" | "guest";

export interface WorkspaceMember extends User {
  role?: WorkspaceRole | string;
  can_create_apps?: boolean;
  can_create_tracks?: boolean;
}

/** Workspace invitation status lifecycle. */
export type InvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "revoked"
  | "expired";

export interface Invitation {
  id: string;
  workspace_id: string;
  email: string;
  invited_user_id?: string | null;
  invited_by_user_id: string;
  target_resource_type?: 'app' | 'track' | 'entry' | null;
  target_resource_id?: string | null;
  target_resource_role?: string | null;
  adopted_by_user_id?: string | null;
  adopted_at?: string | null;
  role: WorkspaceRole | string;
  can_create_apps: boolean;
  can_create_tracks: boolean;
  status: InvitationStatus;
  message?: string;
  created_at?: string;
  expires_at?: string;
  consumed_at?: string;
  grant_receipt?: InvitationGrantReceipt;
}

export interface InvitationGrantReceipt {
  outcome: 'created' | 'upgraded' | 'unchanged' | 'conflict' | null;
  granted_role: string | null;
  can_create_apps?: boolean | null;
  can_create_tracks?: boolean | null;
  effective_role_at_acceptance: string | null;
  revision: number;
}

/** Minimal Workspace shape used by invitation previews. */
export interface WorkspaceSummary {
  id: string;
  name?: string;
  description?: string;
  accent_color?: string;
  kind?: 'personal' | 'organization';
}

export interface App {
  /** Built-in icon key or inline raster logo. */
  icon?: string;
  installed_package_slug?: string;
  id: string;
  name: string;
  description?: string;
  owner_user_id?: string;
  visibility?: string;
  /** Canonical container. */
  workspace_id?: string;
  attached_operational_model_id?: string;
  library_merge_source_id?: string;
  /** Identity color (#RGB / #RRGGBB). Empty/missing = use platform default. */
  accent_color?: string;
  /** Phase 36 — workspace-scoped display order. Null = unordered (sort last). */
  position?: number | null;
  created_at?: string;
  updated_at?: string;
  /** Library package this App was installed from (bundle installs). */
  installed_from_library_id?: string;
  /** Bundle slug from YAML package (skill overlay namespace). */
  source_operational_model_slug?: string;
  lifecycle_state?:
    | 'installing'
    | 'awaiting_settings'
    | 'active'
    | 'paused'
    | 'uninstalled';
  installed_at?: string;
  version?: string;
  settings_schema?: Record<string, unknown>;
  /** F1 — app.operations[] from attached Operational Model (named authority). */
  operations?: Array<{
    key: string;
    kind?: string;
    name?: string;
    description?: string;
    policy_action?: string | null;
    capability?: string | null;
    staging_level?: string | null;
    idempotency_key?: string | null;
    timeout_seconds?: number | null;
  }>;
}

/** Attached or library content package (entry types, tags, views). */
export interface OperationalModelNode {
  can_delete?: boolean;
  id: string;
  name: string;
  description?: string;
  version?: string;
  manifest?: Record<string, unknown>;
  scope?: string;
  workspace_id?: string;
  app_id?: string;
  library_package?: boolean;
  library_merge_source_id?: string;
  library_merge_source_name?: string;
  // Compile-time bookkeeping the backend stamps onto the node — carries the
  // package's canonical slug (`metadata.slug`) since the compiled manifest's
  // `package.slug` is folded into `package.name` and lost. See
  // `appBundleMatching.extractPackageMeta`.
  metadata?: { slug?: string; [key: string]: unknown };
  created_at?: string;
  updated_at?: string;
}

/** App-defined track template (`DEFINES_TRACK_PROFILE` under the App operational model). */
export type TrackTemplate = OperationalModelNode;

export interface SavedView {
  id: string;
  name: string;
  type: string;
  /** Declarative manifest view key (when provisioned from a operational model). */
  config?: Record<string, unknown> & { _manifest_view_key?: string };
  track_id: string;
  operational_model_id?: string;
  is_default?: boolean;
  /** Hidden views remain configured + queryable but are filtered out of the
   *  track's tab strip. Toggle via TrackConfigPanel. */
  hidden?: boolean;
  /** Slug list (manifest-stable keys) restricting which entry types this
   *  view surfaces. Empty / undefined = no constraint. */
  entry_type_keys?: string[];
  /** Slug pre-selected when the user creates a new entry from inside this
   *  view. Empty / undefined = fall back to track-level default. */
  default_entry_type_key?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface OperationalModelFieldSpec {
  /** Stable field identity. It survives label/key changes; legacy fields are
   * assigned a deterministic compatibility ID by the compiler. */
  id?: string;
  key: string;
  name: string;
  type: string;
  required?: boolean;
  readonly?: boolean;
  /** Excluded from the CREATE-entry form only (EntryFormExpanded's
   *  dynamicFields) — still renders normally once the entry exists (edit
   *  mode, detail page, related_views). For fields a server-side hook
   *  fills in right after creation. */
  hide_on_create?: boolean;
  /** Excluded from entry cards (feed/kanban/gallery) and the table only; still
   *  shown on the entry detail and in edit forms. */
  hide_on_card?: boolean;
  /** Entry-detail layout: the value spans the full field grid (full-width row). */
  full_width?: boolean;
  /** Entry-detail layout: clamp a long value to this many lines and offer a
   *  Read more toggle (e.g. a conversation log). Omit/0 = no clamp. */
  max_lines?: number;
  /** Render/edit this text field as multi-line (a textarea) even when the current
   *  value has no newline. */
  multiline?: boolean;
  /** Entry-detail only: omit the row when the field has no value (keeps the panel
   *  tidy); unset fields keep showing their "—" placeholder. */
  hide_when_empty?: boolean;
  /** Never shown in forms or the entry field list; still stored and readable via the API. */
  hidden?: boolean;
  default?: unknown;
  /**
   * Prefill from the parent App's settings at compose/create time.
   * Key must exist on the App's ``settings_schema`` / ``settings`` bag
   * (e.g. Finance ``currency`` ← ``default_currency``). Does not lock the
   * field — the user may still override.
   */
  default_from_setting?: string;
  /** Enumerated allowed values. Element type depends on ``type`` — string for
   *  ``select``/``multi_select``, number for numeric enums, etc. */
  enum?: unknown[];
  widget?: string;
  placeholder?: string;
  help?: string;
  /** When false, show a traditional label above the control (opt-out of seamless composer styling). */
  seamless?: boolean;
  group?: string;
  order?: number;
  /** Field-type-specific validation knobs (min/max/step for number, pattern for text, etc.). */
  validation?: Record<string, unknown>;
  /** Whether this field is indexed for fast lookup / search. */
  index?: boolean;
  /** Compiled same-entry expression for a computed field. The value is not stored. */
  expression?: {
    source: string;
    ast: {
      op: string;
      value?: string;
      key?: string;
      arg?: unknown;
      left?: unknown;
      right?: unknown;
      args?: unknown[];
    };
    result_type?: 'number' | 'text';
  };
  relation?: {
    /**
     * Phase 3.1 (ANC-02). ``entry`` is the back-compat default — relations
     * point at sibling Entries via REFERENCES. ``track`` is the anchor
     * variant — the relation value is a Track id and the entry is wired
     * to that track via ANCHORS at save time.
     */
    target?: 'entry' | 'track';
    target_entry_types?: string[];
    target_track_types?: string[];
    /** Phase 3.1 (ANC-02). When target='track', the template key under the
     * containing App's ``app.track_templates`` registry that the auto-
     * provision hook should materialize. */
    target_track_template?: string;
    auto_provision?: boolean;
    allow_cross_track?: boolean;
    many?: boolean;
    inverse_field?: string;
  };
  /**
   * Plan 03 — Phase 4. File / files field configuration. Matches the
   * normalized shape from operational_model_runtime._normalize_field_spec
   * (accept MIME list, max_count, expose_metadata projections).
   */
  config?: {
    accept?: string[];
    max_count?: number;
    expose_metadata?: Array<{ from: string; as: string }>;
  } & Record<string, unknown>;
  /**
   * Composite-type metadata. Populated by ``compile_canonical_manifest``
   * when the field references a manifest-declared composite (e.g.
   * ``currency = number + {currency: USD}``). The frontend dispatcher
   * uses ``base`` to fall back to the primitive renderer; a custom
   * field-type registration with the same ``type`` overrides this and
   * receives ``composite.config`` directly on the field spec.
   */
  composite?: {
    base?: string;
    config?: Record<string, unknown>;
    label?: string;
    description?: string;
  };
}

export interface EntryTypeBodyBaseField {
  enabled?: boolean;
  label?: string;
  placeholder?: string;
  help?: string;
  /** Sort key vs. custom fields (default 1000). Lower renders earlier. */
  order?: number;
}

export interface EntryTypeAttachmentsBaseField {
  enabled?: boolean;
  label?: string;
  help?: string;
  allow_file_upload?: boolean;
  allow_url_reference?: boolean;
  /** Sort key vs. other slots (default 1100). */
  order?: number;
}

export interface EntryTypeBaseFields {
  /** Optional headline slot (same shape as body); manifest `label` / `placeholder` customize the composer. */
  title?: EntryTypeBodyBaseField;
  body?: EntryTypeBodyBaseField;
  attachments?: EntryTypeAttachmentsBaseField;
}

/**
 * Phase 3.1 Plan 03.1-04 (ANC-06). A related view declaration attached to
 * an entry type — rendered inline below the entry detail view (see
 * EntryDetail.tsx → RelatedViewsSection). ``view`` is either a bare view
 * key (resolved within the current track's CP) or a resolver-prefixed
 * reference of form ``:<resolver_token>/<view_key>`` (the resolver returns
 * a track id; the view_key resolves within that track's CP).
 */
export interface RelatedViewSpec {
  view: string;
  bind: Record<string, unknown>;
  /**
   * Where this slot renders relative to Comments in EntryDetail.tsx.
   * ``'primary'`` renders immediately after the field-group form, before
   * Comments (for content that IS the entry's main surface, e.g. a filing's
   * employee-line table + action bar). Defaults to ``'related'`` — today's
   * behavior, rendered after Comments as a contextual extension.
   */
  position?: 'primary' | 'related';
}

export interface OperationalModelFormSchema {
  fields?: OperationalModelFieldSpec[];
  base_fields?: EntryTypeBaseFields;
  required_tag_groups?: string[];
  /** Phase 3.1 Plan 03.1-04 (ANC-06). */
  related_views?: RelatedViewSpec[];
  /** Manifest-declared entry-type key, when compiled from a operational model. */
  _manifest_entry_type_key?: string;
  /** Opt-in: entries of this type open on a dedicated full page (EntryPage.tsx)
   *  instead of the default modal overlay. Defaults to false/undefined. */
  open_as_page?: boolean;
  /** Opt-in (needs ``open_as_page``): the entry page shows the entry's file in a
   *  pane beside its fields. ``file_field`` names the file field that holds the
   *  file to show; when empty or unset, the newest attachment is shown. ``editor: 'body'``
   *  adds a Document tab that edits the entry body in place. */
  canvas?: { file_field?: string; editor?: string } | null;
  /** Opt-in: a multi-step create flow (region_system's create_wizard
   *  primitive) replaces the default single-form create dialog. See
   *  CreateWizardModal.tsx + operational_model_compile.py's
   *  _normalize_create_wizard for the full shape. */
  create_wizard?: CreateWizardConfig;
  /** At most one Entry of this type is meaningful per workspace (e.g. a
   *  Company Profile). Enforced server-side at create time — see
   *  `singleton` in operational_model_compile.py; TrackDetailPage reads this
   *  to suppress the "+ New" affordance once that one record exists. */
  singleton?: boolean;
  /** Extension views / Core regions mounted at compose/detail surfaces. */
  ui_contributions?: Array<{
    placement: string;
    extension_view_key?: string;
    view?: string;
    view_type?: string;
    config?: Record<string, unknown>;
    layout?: string;
    owns_form?: boolean;
    title_from_fields?: string[];
  }>;
}

export interface CreateWizardStepColumnJoin {
  track_type: string;
  on_field: string;
  show_field: string;
}

export interface CreateWizardStepColumn {
  key: string;
  label: string;
  source_field?: string;
  join?: CreateWizardStepColumnJoin;
}

export interface CreateWizardStepChecklistFilter {
  join: CreateWizardStepColumnJoin & { match_field: string };
  against_form_field: string;
}

export interface CreateWizardStep {
  kind: 'form' | 'entry_checklist' | 'period_picker' | 'summary';
  key: string;
  title: string;
  /** kind: 'form' */
  fields?: string[];
  prefill_tool?: string;
  /** kind: 'entry_checklist' */
  source_track_type?: string;
  active_field?: string;
  display_columns?: CreateWizardStepColumn[];
  /** kind: 'entry_checklist' — narrow rows to those whose related record's
   *  `join.match_field` equals the value collected under
   *  `against_form_field` in an earlier step. */
  filter?: CreateWizardStepChecklistFilter;
  /** kind: 'entry_checklist' — block Next/Create while nothing is checked.
   *  Default false (unset): a checklist step may legitimately be optional
   *  (e.g. "link related records"). Set true where zero selected makes the
   *  entry meaningless (e.g. a Pay Run's Select Employees step — a run
   *  with no employees, silently allowed by an empty candidate list when
   *  no Compensation Record matches the chosen frequency, is not a valid
   *  pay run). */
  required?: boolean;
  /** kind: 'period_picker' — reuses `fields` above for which field keys
   *  each returned period's values fill in. */
  periods_tool?: string;
  /** kind: 'period_picker' — subset of already-collected form values to
   *  forward as the periods_tool's call args (e.g. a `frequency` picked
   *  in an earlier form step). */
  input_fields?: string[];
}

export interface CreateWizardPeriodOption {
  label: string;
  [fieldKey: string]: unknown;
}

export interface CreateWizardConfig {
  steps: CreateWizardStep[];
  on_create_tool: string;
  on_create_ids_param: string;
}

export interface DeclarativeViewConfig {
  view_type?: string;
  filters?: Array<Record<string, unknown>>;
  sort?: Array<Record<string, unknown>>;
  group_by?: string | null;
  layout?: Record<string, unknown>;
  field_visibility?: string[];
  kanban_columns?: Array<{ key: string; label?: string }>;
  calendar_mapping?: Record<string, unknown>;
}

/** Resolved from the track’s effective operational model tier (manifest ``track.defaults``). */
export interface TrackOperationalModelDefaults {
  default_entry_type?: string;
  default_view?: string;
}

/** Provenance for tracks auto-spawned by an Entry's relation field
 *  (``target: track``). Populated by the backend ANCHORS inbound walk;
 *  ``null`` for user-created tracks. */
export interface TrackAnchorSource {
  entry_id: string;
  entry_title: string;
  track_id: string;
  /** Title of the parent track that owns the anchoring entry. */
  track_title?: string;
  field_key: string;
}

export interface Track {
  id: string;
  title: string;
  purpose?: string;
  description?: string;
  /** Custom #RGB / #RRGGBB accent; omit or empty uses app brand accent (`--brand-accent`). */
  accent_color?: string;
  visibility: string;
  owner_id: string;
  owner?: User;
  /** Canonical container. */
  workspace_id?: string;
  /** When set, matches ``app.tracks[].key`` from the parent app manifest for runtime profile resolution. */
  template_id?: string;
  relation_type_key?: string;
  /** System-owned grouping discriminator; settings tracks can be surfaced through a settings hub. */
  kind?: string;
  /**
   * When false, omit from App track nav / Feed filters. Track remains
   * addressable via direct URL, pins, and APIs with include_nav_hidden.
   * Defaults true when omitted (legacy tracks).
   */
  nav_visible?: boolean;
  /** Workspace/app ordering position when one has been assigned. */
  position?: number | null;
  attached_operational_model_id?: string;
  library_merge_source_id?: string;
  operational_model_defaults?: TrackOperationalModelDefaults;
  entry_count?: number;
  collaborators?: User[];
  /** From GET /tracks/{id}/collaborators — effective access count (direct + inherited − excluded). */
  collaborator_effective_total?: number;
  /** True when inherited collaborators exceeded the listing cap. */
  collaborator_inherited_truncated?: boolean;
  /** "public" or "workspace" when track visibility grants extend beyond enumerated rows. */
  collaborator_visibility_grant?: string | null;
  /**
   * From GET /tracks/{id}/collaborators — caller's effective role via backend
   * ``resolve_role`` (includes staff + App cascade). Prefer over scanning
   * ``collaborators`` for permission gates.
   */
  caller_role?: string | null;
  /** Present when the track is contained in an App (list / get / create). */
  app?: App;
  /** When set, this track was auto-provisioned to hold extended data for
   *  the named Entry via an ANCHORS edge (relation field with
   *  ``target: track``). Drives the "Entry extensions" grouping on the
   *  Tracks page. */
  anchor_source?: TrackAnchorSource | null;
  created_at: string;
  updated_at?: string;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  track_id?: string;
  app_id?: string;
  /** Taxonomy group from the operational model manifest (``taxonomy.tag_groups[].key``). */
  group_key?: string;
  /** When set, tag is only offered for these entry type keys/slugs (manifest ``applies_to``). */
  applies_to_entry_types?: string[];
}

export interface EntryTypeNode {
  id: string;
  name: string;
  icon?: string;
  form_schema?: OperationalModelFormSchema;
  track_id?: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  user_reacted?: boolean;
}

export interface Comment {
  id: string;
  text: string;
  author_id: string;
  author?: User;
  entry_id: string;
  parent_id?: string;
  created_at: string;
  updated_at?: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mime_type?: string;
  size?: number;
  storage_key?: string;
  source_type?: 'file' | 'url' | string;
  external_url?: string;
  uploaded_by?: string;
  created_at?: string;
  // Plan 03 — Phase 1 hardening.
  content_hash?: string;
  scan_status?: string;
  scan_engine?: string;
  scan_message?: string;
  // Plan 03 — Phase 1 derived dimensions.
  width?: number | null;
  height?: number | null;
  page_count?: number | null;
  thumb_storage_key?: string;
  preview_storage_key?: string;
  // Plan 03 — Phase 1.5 metadata pipeline.
  metadata?: {
    common?: Record<string, unknown>;
    type_specific?: Record<string, unknown>;
  };
  extracted_text?: string;
  metadata_status?: string;
  metadata_extractor_version?: number;
  metadata_error?: string;
  // Plan 03 — Phase 2 resolved URLs (populated by GET endpoints).
  download_url?: string;
  thumb_url?: string | null;
  preview_url?: string | null;
}

/** Persisted Open Graph snapshot (``custom_fields._link_preview``). */
export interface StoredLinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  site_name?: string;
}

/** Provenance — single source of truth on every Entry (PROV-01, Phase 2 D-01).
 *  Hand-mirrored from backend/app/schemas/provenance.py. The frontend
 *  ProvenanceBadge component is the SOLE consumer of `.source` for visual
 *  rendering (see docs/INVARIANTS.md I-UX-01). */
export type ActorKind = 'human' | 'agent' | 'connector' | 'system';
export interface Provenance {
  source: ActorKind;
  source_id?: string;
  confidence?: number;
  derived_from?: string[];
  synced_at?: string;
}

export interface Entry {
  id: string;
  track_id: string;
  track?: Track;
  /** Present when the entry's track is contained in an App (feed / track entries / get). */
  app?: App;
  type: string;
  title?: string;
  body?: string;
  attachment_ids?: string[];
  attachments?: Attachment[];
  tags?: Tag[];
  author_id: string;
  author?: User;
  reactions?: Reaction[];
  comment_count?: number;
  status?: string;
  custom_fields?: Record<string, unknown>;
  /** Read-only live projections; never merge into write payloads. */
  read_time_fields?: { values: Record<string, unknown>; status: Record<string, string> };
  /** Optimistic-concurrency token returned by the record write contract. */
  record_revision?: number;
  /** Effective profile revision under which this record was last written. */
  schema_revision?: number;
  created_at: string;
  updated_at?: string;
  /** PROV-01 / Phase 2: every Entry response carries `provenance`. Optional
   *  here for backwards-compatibility with mocks/tests; the production
   *  backend always populates it (lazy-backfilled on first read). */
  provenance?: Provenance;
  /** Backlink: the Entry whose ANCHORS edge points at this entry's parent
   *  Track. Present (typed `EntryBacklink`) when the parent Track is an
   *  anchored track; `null` otherwise. Surfaced by the backend's
   *  `attach_backlinks` helper on `GET /entries/{id}`. */
  anchor_source?: EntryBacklink | null;
  /** Backlinks: every Entry with an outbound REFERENCES edge pointing at
   *  this Entry. Capped server-side (default 25). Use
   *  `referenced_by_total` when present to detect truncation. */
  referenced_by?: EntryBacklink[];
  referenced_by_total?: number;
}

/** Minimal shape used by EntryDetail to render "Linked from" /
 *  "Referenced by" sections without round-tripping each referrer. */
export interface EntryBacklink {
  id: string;
  title: string;
  track_id: string;
  track_title: string;
  /** Relation field key on the referring entry that materialized the edge
   *  (e.g. `"contact"` on a Project → Contact REFERENCES, or
   *  `"details_track"` on a Project → Project-Details ANCHORS). */
  field_key: string;
}

/** Resolved value for a relation custom field. Drives the hyperlinked
 *  label rendering on EntryDetail (and any other surface that wants
 *  navigable relation values). When `kind === 'entry'`, `trackId` carries
 *  the parent track id so the route resolves to `/tracks/{trackId}?entry={id}`.
 *  When `kind === 'track'`, the value is the track itself and the route is
 *  `/tracks/{id}`. */
export interface RelationFieldTarget {
  id: string;
  label: string;
  kind: 'entry' | 'track';
  trackId?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  /** Body text of the notification — maps to the backend Notification.content field. */
  content: string;
  read: boolean;
  created_at: string;
  /** Target URL for navigation when the notification is clicked. */
  action_url?: string;
  /** Additional context data (track_id, workspace_id, etc.). */
  metadata?: Record<string, unknown>;
}
