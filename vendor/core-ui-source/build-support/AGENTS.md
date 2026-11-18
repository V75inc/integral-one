# AGENTS.md

Guidance for coding agents working in this repository.

## Project Overview

Integral = **AI-native knowledge platform** — singular, conformable substrate of domain knowledge humans and AI agents read, write, schema, coordinate over under one access model. Mission: remove fundamental impediment to AI-first operation — agents have no canonical place to read from or write to. Integral collapses fragmented domain knowledge into one graph, flexible Operational Model schema layer, first-class agentive layer.

Monorepo:

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS (port 9006)
- **Backend**: Python 3.11+ FastAPI powered by jvspatial (port 4000)

Backend uses jvspatial graph-based data model — all entities are Nodes with explicit Edges for relationships. Integral is an **ops layer** on a pluggable harness: `backend/app/agentive/` is **always-on** and hosts staging, skills overlay, MCP perimeter, and the active harness binding (default Integral AI via Pydantic AI; Integral AI is the only resident harness; Echo is a test fixture, not a product option). Singular resident mind applies **per active binding**, faceted by principal (personal / org-facing / system) — not a peer-agent fleet. External agents connect via Integral's **MCP surface** only; there is **no agent-to-agent (A2A) fabric** (retired). See [docs/backend/adr/003-singular-resident-harness.md](docs/backend/adr/003-singular-resident-harness.md), [docs/product/RESIDENT_HARNESS.md](docs/product/RESIDENT_HARNESS.md). Architecture provisional (pre-1.0) — see [docs/product/ARCHITECTURE.md](docs/product/ARCHITECTURE.md) → "Vision-Aligned Architectural Directions".

**Harness engineering principle:** Prefer the supported facilities and public extension points of the pinned Pydantic AI Harness and Pydantic AI for agent runtime behavior. Before adding or extending custom harness behavior, examine those libraries for an appropriate facility and use it when it meets Integral's requirements. Custom code is justified for Integral substrate integration or when the libraries do not furnish a suitable facility; document the gap and preserve current authorization, tenancy, staging, receipts and recovery. Review existing custom behavior for replacement where practical, and verify semantic and security parity before removing it. See [docs/product/RESIDENT_HARNESS.md](docs/product/RESIDENT_HARNESS.md).

**Current jvspatial security compatibility:** package metadata pins `jvspatial==0.2.10` and `pydantic-ai-harness[skills]==0.59.0`. Runtime dependencies resolve from PyPI; no alternate resident or Git source override remains. Use `uv sync --frozen --extra dev --extra test` and the clean wheel and full release gates before release. Integral's `RATE_LIMIT_DISABLED=1` bypasses jvspatial's auth-entrypoint cap only under pytest or `DEBUG`; production keeps that cap. Production OAuth requires `JVSPATIAL_OAUTH_KEY_ENCRYPTION_KEY` from a secret manager. See [backend/README.md](backend/README.md#jvspatial-security-compatibility) and [docs/ops/DEPLOY.md](docs/ops/DEPLOY.md#jvspatial-compatibility-release-gate).

When repairing legacy `UserModelCredential` duplicates, read through `GraphContext.find` so the unique index is not created before deduplication. Validate the migration against a PostgreSQL schema containing actual duplicate rows, then verify the index rejects a new duplicate.

**Note:** Historical docs mentioned `AGENTIVE_ENABLED` as a substrate-only kill-switch. That flag is **not** in `app/config.py` and does **not** gate boot today — do not reintroduce conditional-load language without restoring a real gate.

See [docs/product/CONCEPT.md](docs/product/CONCEPT.md) for product vision, [docs/product/PRD.md](docs/product/PRD.md) for requirements, [docs/product/ARCHITECTURE.md](docs/product/ARCHITECTURE.md) for technical design, [docs/product/RESIDENT_HARNESS.md](docs/product/RESIDENT_HARNESS.md) for the resident-harness spec, [docs/product/ROADMAP.md](docs/product/ROADMAP.md) for milestone sequencing, [docs/README.md](docs/README.md) for the documentation hub, [docs/operational-models/](docs/operational-models/) for operational-model substrate (view palette, Pillars 1–4, agent contract, draft/publish), and [docs/product/BYOA.md](docs/product/BYOA.md) for the external-agent surface (MCP-only per ADR-003).

**Project context:** Integral = captive operational substrate of **Integral AI Empowerment** proserve practice (see `../integral_manifest/`). Built by internal AI-engineering team (~10 engineers + hire capacity) leveraging Claude Code / equivalent coding-model pipelines under GSD discipline. Eldon Marks = **product visionary + architect** — authors milestone briefs, reviews substrate-touching plans, runs per-milestone architecture reviews. Engineering leads run pods (~5 engineers each); each engineer drives 1–2 AI coding pipelines per phase. Strategic context: `../integral_manifest/00-master/STRATEGIC_POSITION.md` (external planning repository). Operating discipline: `../integral_manifest/00-master/VISIONARY_PLAYBOOK.md` (external planning repository). For substrate-touching code, consult `docs/INVARIANTS.md` (authored M1) — plan-checker must enumerate which invariants change preserves.

## Quick Start Commands

### Backend
```bash
# Prerequisite: uv — this repo installs from uv.lock, NOT requirements.txt.
cd backend
uv sync --frozen --extra dev --extra test   # dev + test are SEPARATE extras
.venv/bin/python -m app.main  # server runs at http://localhost:4000
```

### Frontend
```bash
cd frontend
npm install
npm run dev  # runs at http://localhost:9006, proxies /api to backend
```

A pip-installed Core serves that same UI with `integral web` from the wheel
(`0.1.1rc5` and later). This checkout uses the Vite server above. `integral
init` with no `--slug` writes a blank distro (`integral-apps/` empty).

### Testing

**The gate is `make verify`.** PR CI runs smoke, Core-only, extension-contract,
PostgreSQL, frontend and artifact lanes; the full default suite remains a local
responsibility. One command covers the broad local gate:

```bash
make verify      # guards, pinned formatters, tsc, artifact, both suites; backend uses CI env
make verify-ci   # reproduce the CI smoke lane; not the whole workflow
make verify-pr   # reproduce backend test lanes and the PostgreSQL lane
make help        # all targets
```

Editing a core skill, `tool_manifest.yaml`, a binding, or an `examples/` App
changes `docs/generated/capability-map.{json,md}`; run `make capability-map`
and commit the result, or the smoke test `backend/tests/test_capability_map.py` fails.

**A green local `pytest` is NOT evidence that CI will pass.** CI runs the
backend with `TESTING=1`, **no `.env` file**, and the smoke marker under xdist.
A plain local run differs on all three counts, and each can hide a real failure:

- **no `.env`** → `DEBUG` defaults `False`, so the boot guards in `app/main.py`
  that are inert on a dev box (`backend/.env` sets `DEBUG=true`) *do* fire
- **`-m smoke`** → a different set of tests than the full suite
- **xdist** → an import-time `sys.exit()` surfaces as
  `INTERNALERROR ... KeyError: <WorkerController gwN>`, not a readable failure

All three combined once hid a boot guard that `sys.exit(1)`-ed during
collection, turning every CI run red while local stayed green. Run `make
verify-ci` before pushing, and check `gh pr checks <n>` after.

`make verify` runs the complete default backend selection (including smoke)
once with `TESTING=1`, `DEBUG=false`, no dotenv and xdist file grouping. It no
longer repeats the smoke subset in the same gate. Workers are capped at four;
use `PYTEST_WORKERS=0` for a serial comparison. Slowest-test timings are printed
and JUnit reports stay in ignored `backend/.pytest_cache/verification/`.
Contracts and the CI PostgreSQL graph lanes use two workers with per-test
work stealing; PostgreSQL pools are bounded to one to three connections each.
Use `CONTRACT_TEST_WORKERS=0` or `POSTGRES_TEST_WORKERS=0` for serial comparison.
Local and CI PostgreSQL graph commands share `make test-postgres-ci`; real
encoder qualification stays a separate serial lane. Frontend CI checks types
once before `build:assets`; standalone `npm run build` still includes TypeScript.

```bash
# Narrower runs
cd backend
pytest                           # run all tests
pytest --cov=app                 # with coverage
pytest tests/test_crud_*.py -v   # CRUD tests only
BASE_URL=http://localhost:4000 pytest -v  # against live server

cd frontend
npm run test:run
```

### Git hooks (one-time setup per clone)
```bash
git config core.hooksPath .githooks
```
Wires `.githooks/pre-commit`, which runs the substrate and packaging guards:
- `.ci/jvspatial_drift_check.sh` — blocks raw-FastAPI patterns
- `.ci/graph_contiguousness_check.sh` — blocks `<Node>.create(` without same-function edge wire (I-GRAPH-01)
- `.ci/substrate_domain_drift_check.sh` — blocks domain references in substrate scope (I-SUBSTRATE-01)
- `.ci/core_no_app_import_check.sh` — Core must not import `app.packages` / `app.plugins` (I-EXT-01)
- `.ci/service_layer_drift_check.sh` — blocks graph writes in `api/` that belong in `services/` (I-CRUD-01)
- `.ci/ui_drift_check.sh` — blocks raw typography / surface literals outside `frontend/src/ui/`
- `.ci/skill_compliance_check.sh` — validates declarative skill format
- `.ci/bundle_facade_check.sh` — blocks bundles importing `app.services` / `app.models` directly
- `.ci/tool_manifest_check.sh` — reconciles `tool_manifest.yaml` against the live tool surface
- `.ci/csp_inline_script_hash_check.sh` — reconciles the inline `<script>` blocks in `frontend/index.html` against the CSP `script-src` hashes in the nginx configs (not a substrate guard; it is here because a stale hash breaks the app in the browser only — build, types and every server-side healthcheck stay green)
- `.ci/node_destroy_check.sh` — blocks `.destroy(` (not a jvspatial API)
- `.ci/nodes_len_drift_check.sh` — blocks `len(await ….nodes(…))`; use `count_nodes` / `nodes_page` / `limit=`
- `.ci/core_profiles_only_check.sh` — keeps bundled Core profiles seeds-only
- `.ci/contracts_boundary_check.sh` — keeps shared contracts dependency-light
- `.ci/module_boundary_check.sh` — enforces module dependency boundaries
- `.ci/module_import_cycle_check.sh` — rejects module import cycles

CI runs the jvspatial, graph, substrate-domain, service-layer, Core/App import
and CSP guards. The local hook also runs the additional guards above. Note most guards scan the
**staged** index (`git diff --cached`), so they pass vacuously against an
unstaged tree — `csp_inline_script_hash_check.sh` is the exception and scans
the working tree, because a security header either agrees with the app or does
not, and "pre-existing drift this commit didn't touch" is not a coherent state
for it.

Bypass with `--no-verify` only for documented exceptions. See `.githooks/README.md`.

### Agent git & commit discipline (MANDATORY)

These rules bind any AI agent working in this repo. They are not optional.

1. **NEVER push without explicit user consent.** Committing is fine at any
   time; `git push` (and opening/updating PRs) requires the user to explicitly
   say to push in this session. Do not push "to be helpful," to back up work,
   or because a task feels finished. When work is committed and ready, say so
   and ask before pushing.
2. **Before EVERY commit, gate on a clean build:**
   - Run the pre-commit hooks over the changes and **fix every lint/format
     error** they surface (`black`, `isort`, `flake8`, `tsc --noEmit`, the
     substrate drift guards). Do not `--no-verify` past a real failure.
   - Run the relevant tests — `pytest` for touched backend areas (the full
     suite for substrate-touching changes) and the frontend suite
     (`npm run test:run` / `vitest`) for touched frontend areas — and **fix
     every failure** before committing. A commit must never carry failing
     lint or failing tests.
   - Only commit once lint is clean and tests pass. If a fix is out of scope,
     stop and surface it rather than committing a broken state.

3. **Use the primary checkout by default.** Ask the user each time before
   creating an additional worktree. Reuse the existing task checkout while work
   is active. Retire obsolete worktrees and merged task branches after checking
   their current state; preserve unreconciled source and local data outside the
   repository before cleanup. Do not leave task reports or recovery dumps in
   tracked documentation.

### Documentation is part of the release gate

Keep relevant documentation current in the same change as behavior, contracts,
configuration, dependencies or supported-platform changes. Update the canonical
user/developer guide and release notes, rather than adding a competing guide;
regenerate affected source-derived references. If no documentation changes are
needed, record why in the review evidence.

Before a TestPyPI candidate or PyPI release, verify documented install commands,
configuration, upgrade/migration and recovery steps against the exact candidate.
Record platform coverage, skipped/blocked checks and artifact provenance in the
release evidence. Distinguish implemented, tested, published and deployed states;
do not advertise an unqualified platform or imply data can be reset to upgrade.
Stale or materially unverified release instructions block promotion. Keep Core
contracts generic and document One/Business product behavior in their own repos.
See [RELEASING.md](RELEASING.md) for the documentation acceptance checklist.

### Chat identity and first-time guidance

- Resolve chat identity through the shared authenticated profile resolver; an
  `o.User.*` sign-in ID is not a `n.User.*` workspace profile ID. Keep the
  caller's bounded display name available on both native chat paths, separately
  from first-turn onboarding. A profile name is data, never instructions or
  permission authority; do not derive names from email addresses.
- Keep the welcome brief and explain that Integral can build Apps and set up
  the workspace as the conversation proceeds. A concrete request takes
  precedence over the generic introduction. Greeting must not complete
  onboarding or bypass write approvals.
- Inline errors should have a readable summary and accessible full-message
  disclosure. Preserve API message/code across durable chat restoration; do
  not expose arbitrary tool arguments or server-only diagnostics.

### Code Quality
```bash
# Backend
cd backend
black app/ && isort app/
mypy app/
flake8 app/

# Frontend
cd frontend
npm run lint:types
```

## Architecture Overview

### Backend Structure (jvspatial-based)

```
backend/app/
├── api/              # REST endpoints via @endpoint decorator
│   ├── auth.py, users.py, tracks.py, entries.py, apps.py, workspaces.py
│   ├── operational_models.py, entry_types.py, tags.py, views.py, comments.py
│   ├── access.py            # unified collaborators/exclusions/access for App/Track/Entry
│   ├── shares.py            # share-link mint / list / redeem / revoke
│   ├── shared_with_me.py    # /me/shared, /me/invitations aggregators
│   ├── invitations.py, attachments.py, notifications.py, feed.py, audit_log.py
│   └── ...
├── agentive/         # Always-on — agents, MCP tools, uplinks
├── schemas/          # Pydantic models for validation
├── models/           # jvspatial node + edge type definitions (nodes.py, edges.py)
├── services/         # Business logic — permissions, sharing, share_links, operational_model_*,
│                     #   request_scope, workspace_resolver, workspace_permissions,
│                     #   personal_workspace, uniqueness, edge_upsert, …
└── middleware/       # TestAuthBypassMiddleware (test mode), scope plumbing
```

### jvspatial Object-Spatial Contract (MUST-USE)

jvspatial = **object-spatial** graph framework, not Node/Edge ORM. Four pillars:

1. **Data on nodes** — entities are Pydantic-backed `Node` subclasses.
2. **Semantics on edges** — relationships carry typed metadata as first-class edge fields (associative edges), not stuffed in `context` dicts.
3. **Behavior travels via walkers** — multi-hop computation is `Walker` that traverses and accumulates, not Python loop driving successive `.nodes()` calls.
4. **Branch nodes for organization** — collections, registries, membership pools are dedicated nodes grouping child entities, not flat lists on parent.

Wrong pillar (cascade as service function instead of walker, relationship state on node instead of edge) = **drift**, not style.

**Pragmatism clause.** Pillars are default, not absolutes. When idiomatic approach causes measured, non-trivial inefficiency, denormalized or procedural route acceptable — provided it preserves schema integrity, maintainability, substrate invariants (`docs/INVARIANTS.md`), and deviation documented inline as `# deviation: <reason> — <measurement>`. *Measure first, deviate second, document always.* "I didn't feel like writing a walker" is not efficiency justification.

#### Primitive reference

| Pattern | Use | Canonical example |
|---------|-----|-------------------|
| HTTP route | `@endpoint(path, methods=[...], auth=True, tags=[...])` from `jvspatial.api` | `backend/app/api/entries.py` |
| Auth identity | `resolve_principal_id(request)` from `request.state.user` | `backend/app/api/utils.py` |
| Workspace scope | `await resolve_workspace_id_from_request(request, user_id)` | `backend/app/services/request_scope.py` |
| Errors | `JVSpatialAPIException` subclasses from `app/api/errors.py` — NEVER `HTTPException` | `backend/app/api/errors.py` |
| Request/response shapes | Pydantic `BaseModel` in `backend/app/schemas/` — NEVER inline in `api/*.py` | `backend/app/schemas/*.py` |
| Node definition (graph participant) | `class X(Node)` subclass of `jvspatial.core.Node`; override `__entity_name__` only to resolve discriminator collisions. MUST wire structural edge at create per I-GRAPH-01. | `backend/app/models/nodes.py:22` |
| Object definition (non-graph record) | `class X(Object)` subclass of `jvspatial.core.Object` for log-shaped / scalar-keyed records that participate in no cascade, walker, or graph traversal (I-GRAPH-02). `ChangeEvent` is the canonical example (currently `DBLog`-shaped). | `jvspatial/core/entities/object.py` |
| Edge definition | `class X(Edge)` subclass of `jvspatial.core.Edge`, PascalCase class + ALL_CAPS alias | `backend/app/models/edges.py` |
| **Associative edge metadata** | Declare relationship state as typed edge fields (`role`, `field_key`, `cataloged_at`) — query via edge properties, NOT `edge.context.get(...)` | `backend/app/models/edges.py` (COLLABORATES_ON) |
| Edge create | `await source.connect(target, edge=EdgeClass, **metadata)` | `backend/app/api/entries.py` |
| Single-hop traversal | `await node.nodes(edge=[E], node=["T"], direction="out\|in", limit=N)` — list-form `edge=`/`node=` pushes down to SQL on jvspatial ≥0.0.18; always pass `limit=` for user-facing lists. Pass the **Edge class** (or the stored entity name), never an ALL_CAPS *alias string* when the class is PascalCase (agentive edges: `edge=[HAS_CHANNEL_IDENTITY]` / `HasChannelIdentity`, not `edge=["HAS_CHANNEL_IDENTITY"]`). Core Integral edges whose class *is* ALL_CAPS (`CONTAINS`, `OWNS`, …) may use either form. | `backend/app/api/entries.py` |
| Neighbour page / count | `await node.nodes_page(...)` / `await node.count_nodes(...)` — prefer over hydrating then slicing; never `len(await node.nodes(...))` (CI guard `.ci/nodes_len_drift_check.sh`) | `backend/app/api/comments.py`, `attachments.py` |
| Degree without hydrate | `await node.connection_count()` — adjacency always lives in the edge table; never read node `edges[]` | jvspatial Node API |
| Edge query | `ctx = await node.get_context(); await ctx.find_edges_between(a, b, edge_class=E)` | `backend/app/api/entries.py` |
| **Walker (multi-hop computation)** | `class XWalker(Walker)` + `@on_visit(NodeType)` hooks; `await walker.spawn(start_node)` to traverse | jvspatial `core/entities/walker.py`; integral examples: `services/walkers/cross_app_resolver.py`, `services/walkers/plan_rollup.py`, `services/graph_reachability.py` |
| Walker dispatch | `walker = MyWalker(...); await walker.spawn(node)` queues node and runs visit hooks | jvspatial walker docs |
| **Branch / registry node** | Dedicated `Node` subclass organizing child collection (e.g., `Apps`, `Tracks`, `Views` registries under `Workspace`) | `backend/app/models/nodes.py` (registry nodes) |
| Response serialize | `await export_node(n)` (wraps `node.export(flat=True)`) | `backend/app/api/utils.py` |
| Conditional node registration | `server.add_node_type(cls)` post-Server creation for flag-gated modules | `backend/app/main.py` |
| Server lifecycle | `Server(...)` with `DatabaseConfig`, `AuthConfig`, `CORSConfig`; `on_startup` / `on_shutdown` callbacks | `backend/app/main.py` |

#### Decision tree

```
Computation across more than one node hop?                         → Walker (default).
   ↳ Walker materializes >2x edges of a tuned bulk query on a
     measured hot path?                                            → Bulk query + inline deviation comment.
State about a RELATIONSHIP (role, timestamps, field_key)?          → Associative edge metadata (default).
   ↳ Read pattern hydrates every edge for a hot scalar query and
     a denormalized node field is measurably cheaper?              → Denormalize ON WRITE; edge stays source-of-truth.
State about an ENTITY (title, body, status)?                       → Node field.
Need to group a child collection so it's queryable as a unit?      → Branch / registry node — only if grouping is addressable.
   ↳ Branch node adds a hop with no addressability/lifecycle win?  → Don't add it. Keep flat.
Single-hop fetch (parent of X, members of Y)?                      → node.nodes() / find_edges_between().
Creating a new Node (any class, any phase)?                        → Wire structural edge to a rooted parent in same txn, ALWAYS. (I-GRAPH-01.)
HTTP route?                                                         → @endpoint, ALWAYS. (No perf delta from @router.)
Error response?                                                     → JVSpatialAPIException subclass, ALWAYS.
Request/response model?                                             → app/schemas/, ALWAYS.
Domain-specific behavior needed at a substrate trigger point?  → Declare in
   bundle manifest hooks[]. Substrate hook framework dispatches generically.
Need pythonic execution inside a bundle?                        → Declare a
   tools[] entry. trust_tier=trusted required. Skill OR hook binding routes
   to it. Bundles never import from app.services / app.models.
Bundle work that can outlast a request (import, month-end run)?   → ctx.enqueue_job(...)
   from a tools[] entry; the job tool saves its place on the record and calls
   ctx.report_progress. See docs/platform/background-app-jobs.md.
```

Lines marked **ALWAYS** have no efficiency exception. Lines with `↳` branches are where pragmatism applies; deviation always carries `# deviation: <reason> — measured <X ms vs Y ms on <fixture>>`.

**Graph contiguousness (I-GRAPH-01 + I-GRAPH-02).** Two-part rule, no carve-out:

1. **Every persisted `Node` MUST be reachable from `Root → IntegralApp → …`** by walking named edges (I-GRAPH-01). At every `<NodeClass>.create(...)` site, wire the structural edge (`CATALOGS`, `CONTAINS`, `OWNS`, `HAS_*`, or domain-specific named edge) connecting the new node into the rooted subgraph **in the same transaction / unit of work**. Furthermore, when an established App-bound Node anchors a subsystem (`App —CONTAINS→ Track`, `App —CONTAINS→ Skill`, `App —HAS_OPERATIONAL_MODEL→ OperationalModel`), every other Node belonging to that subsystem MUST extend from the App-Node directly (entity edge) or indirectly (branch / registry node). Floating side-car Nodes that semantically belong to an App but hang only off `IntegralApp`, `User`, or no rooted ancestor at all are forbidden. Denormalized scalar foreign keys (`entry_id: str`, `user_id: str`) are permitted as fast-path caches; they are NEVER a substitute for the edge.

2. **Traditional records that do not benefit from graph inclusion are `Object`, not `Node`** (I-GRAPH-02). `jvspatial.core.Object` is the persistence primitive for log-shaped, append-mostly, or scalar-keyed records that participate in no cascade, no permission resolution, no walker, no graph-walk read. `ChangeEvent` is the canonical example — persisted as `DBLog` rows in the logging database via `backend/app/services/change_event_logger.py`. `DBLog` itself is `class DBLog(Object)` in jvspatial (`jvspatial/logging/models.py`), so ChangeEvent persistence ALREADY conforms to I-GRAPH-02 — no migration needed; an `Object` subclass is the canonical primitive in use today. Mis-modelling a graph-participant as `Object` is as wrong as mis-modelling a log-shaped record as `Node`. Decide up-front; conversion is a substrate-touching plan.

Detached nodes are invisible to walkers, cascade-delete, graph backup/restore, and any future substrate-wide computation. Full specification and reconciliation scope: `docs/INVARIANTS.md` § I-GRAPH-01 + § I-GRAPH-02.

#### Forbidden patterns

**Hard-forbidden (no exception — perf delta nil, mixed patterns hurt maintainability):**

- `from fastapi import APIRouter` inside `backend/app/` — use `@endpoint`.
- `@router.<method>` / `@app.<method>` decorators — use `@endpoint`.
- `raise HTTPException(...)` — raise `JVSpatialAPIException` subclass from `app/api/errors.py`.
- Pydantic `BaseModel` request/response defined inside `api/*.py` — move to `schemas/`.
- Direct DB driver imports (`sqlalchemy`, `asyncpg`, `sqlite3`) outside jvspatial bootstrap — use Node CRUD.
- **`<NodeClass>.create(...)` (or `<NodeClass>(...).save()`) without a structural edge wire in the same function** — every Node MUST attach to the rooted subgraph at create time (I-GRAPH-01). Scalar foreign-key fields are not a substitute. No carve-out — records that legitimately don't benefit from graph inclusion belong as `Object`, not `Node` (I-GRAPH-02). Promoting a record to `Node` without a graph attachment plan, OR demoting a graph-participant to `Object` because "edges are inconvenient," requires a substrate-touching plan.
- Importing `app.services.*` or `app.models.*` from inside `backend/app/packages/*/tools/` — bundles reach substrate only through the `ToolContext` facade.
- Adding domain references (bundle slugs, EntryType names, Track names, V75 tokens) inside substrate scope per I-SUBSTRATE-01 / I-EXT-01. Add to `.ci/substrate_drift_allowlist.txt` with a `# reason:` comment if structural; otherwise refactor to a hook binding / tool in the bundle.
- Importing `app.packages.*` or `app.plugins.*` from Core (`services/`, `api/`, `models/`, `schemas/`) — Apps reach Core through `ToolContext` and published contracts ([docs/platform/extension-contract-v1.md](docs/platform/extension-contract-v1.md)). Use `INTEGRAL_CORE_ONLY=1` / `make verify-core-only` to prove Core boots without domain packages.
- Hardcoding bundle behavior inside `backend/app/api/*` or `backend/app/services/*` — substrate calls bundle code ONLY through the hook framework (I-HOOK-01).

**Default-forbidden (deviation permitted with inline `# deviation: <reason> — measured ...` comment):**

- **Procedural Python recursion across graph** for textbook traversals (e.g., role cascade Workspace→App→Track→Entry) — write Walker. *Exception:* tuned bulk query materializing relevant subgraph in one round-trip acceptable on measured hot paths.
- **`edge.context.get("role")` dict unwrapping** for state declared as typed edge field — query typed field directly. *Exception:* if jvspatial's edge-hydration path is itself bottleneck.
- **Stuffing relationship state on source/target node** when it semantically belongs to relationship — redemption counts, invite status, member onboarding belong on edge or branch node. *Exception:* node-side cached counter mirroring edge-side source-of-truth, refreshed on write in same transaction.

**Forbidden in spirit (no exception):**

- Skipping convention "because surrounding code does it wrong way." Drift compounds.
- Reaching for efficiency escape hatch *without* measurement. "Walkers might be slow" is not deviation; "walker materialized 12× edges, p95 went 8ms→96ms on `permission_cascade_bench`" is.

#### Pointers

- Full pattern detail + code examples: jvspatial contract and decision tree in this file; substrate rules in `docs/INVARIANTS.md`.
- Substrate invariants (edge naming, literal expansion, anchor pattern): `docs/INVARIANTS.md`.
- Agentive-layer specifics: `backend/app/agentive/AGENTS.md`.
- Workspace Agent Profile (resident skill overlay): [docs/backend/workspace-agent-profile.md](docs/backend/workspace-agent-profile.md).

### Frontend Structure

```
frontend/src/
├── api/              # API client (axios-based) — includes sharing.ts
├── components/       # React components
│   ├── ui/                       # base UI primitives
│   ├── entries/                  # entry composition; entries/fieldTypes/registry.ts
│   ├── tracks/, apps/            # app/track detail UI
│   ├── views/                    # view palette: registry.tsx, manifests/*.manifest.ts, contracts.json, plugins/auto.ts
│   ├── layout/                   # WorkspaceSwitcher and chrome
│   ├── collab/                   # UserSearchPicker etc.
│   ├── system/                   # SystemNotificationBar + provider + apiErrorNotifier + useOfflineNotification
│   ├── sidebar/, chat/, feed/, notifications/, settings/, command/
├── pages/            # Page components (incl. SharedWithMePage, WorkspaceMembersPage, InvitationAcceptPage)
├── features/         # Feature-level modules (ai-chat/, settings/)
├── hooks/            # Custom React hooks
├── context/          # React context providers (Auth, Scope, Toast, etc.)
├── utils/            # Utility functions
└── lib/              # Operational Model manifest, telemetry
```

### Core Data Model (Graph Nodes)

All entities = jvspatial Nodes with explicit Edges:

| Node | Description |
|------|-------------|
| `User` | Authenticated users |
| `Workspace` | Top-level container; `kind: "personal" \| "organization"`. Personal workspace auto-created at signup via `services/personal_workspace.py` (idempotent). Organization-kind owns member pool keyed by `IS_MEMBER_OF` with role `admin \| member \| guest`. (Replaces retired `Organization` node — see docs/product/ARCHITECTURE.md §3.2.) |
| `App` | Groups tracks; has `HAS_OPERATIONAL_MODEL` edge; lives in exactly one Workspace |
| `Track` | Contains entries; has `HAS_OPERATIONAL_MODEL` edge; lives in exactly one Workspace |
| `Entry` | Content items (belong to Track via `CONTAINS`); supports own collaborators/exclusions on top of track cascade |
| `EntryType` | Blueprint for entries (under OperationalModel) |
| `Tag` | Scoped labels (workspace/app/track), hierarchical via `parent_tag_id` |
| `View` | Saved view configs (feed, kanban, table, calendar, gallery, composable_*) |
| `OperationalModel` | Defines EntryType/Tag/View subgraph for App/Track; supports draft/publish lifecycle |
| `Invitation` | Pending invite — targets Workspace **or** resource (App/Track/Entry) via polymorphic `INVITED_TO` edge |
| `ShareLink` | Tokenized URL for redeemable share access (mint / redeem / revoke); attaches to App/Track/Entry |
| `Comment`, `Attachment` | Supporting entities (Notifications tracked via `HAS_NOTIFICATION` edges, not node) |

### Key Relationships (Edges)

Canonical edge catalog (full set in `backend/app/models/edges.py`):

- `OWNS`: User → Workspace / App / Track
- `IS_MEMBER_OF`: User → Workspace (org-kind; role `admin | member | guest`; selective creation rights for apps/tracks). Guest membership auto-granted on cross-workspace share.
- `COLLABORATES_ON`: User → App / Track / Entry (role `owner | editor | commenter | viewer`)
- `EXCLUDED_FROM`: User → App / Track / Entry (explicit deny; overrides inherited paths only, never direct `OWNS`/`COLLABORATES_ON`)
- `CONTAINS`: Workspace → App/Track, App → Track, Track → Entry, OperationalModel → EntryType/Tag
- `HAS_OPERATIONAL_MODEL`: App/Track → OperationalModel (exactly one each)
- `DEFINES_TRACK_PROFILE`: app-attached OperationalModel → track-template OperationalModel
- `IS_OF_TYPE`: Entry → EntryType
- `TAGGED_WITH`: Entry / other entity → Tag
- `REFERENCES`: Entry → Entry (relation-field edges; carries `field_key` and `cross_track` flag)
- `USES_TEMPLATE`: Track → Track (template provenance)
- `HAS_COMMENT`: Entry / Comment → Comment
- `AUTHORED_BY`: Entry / Comment → User
- `MENTIONS`: Comment → User
- `HAS_ATTACHMENT`: Entry → Attachment
- `HAS_NOTIFICATION`: User → Notification record (wired by `link_notification` — every Notification creator MUST call it; I-GRAPH-01)
- `INVITED_TO`: Invitation → Workspace / App / Track / Entry (polymorphic — workspace or resource-level invites)
- `CATALOGS`: registry membership (Users/Workspaces/Apps/Tracks/Invitations/Views/OperationalModels)
- `HAS_SHARE_LINK`, `HAS_UPLOAD_SESSION`, `HAS_CONFLICT`, `HAS_APPROVAL`, `HAS_AGENT_CONFIG`, `HAS_ORG_AGENT`, `HAS_SYSTEM_AGENT`, `HAS_CHANNEL_IDENTITY` (see `docs/INVARIANTS.md` § I-GRAPH-01)

### Access Model — Inheritance with Explicit Deny

Full spec in [docs/product/ARCHITECTURE.md §9](docs/product/ARCHITECTURE.md). Summary:

1. **Workspace gates everything inside it.** App, Track, Entry reachable only when caller has ownership (personal-kind), org-kind `IS_MEMBER_OF` (admin/member/guest), or guest grant from cross-workspace share. No agent-only or share-only path bypasses workspace gate.
2. **Cascade chain:** Workspace (`visibility=organization` opt-in) → App `COLLABORATES_ON` → Track `COLLABORATES_ON` → Entry inherits track's effective role. Each layer adds to role pool; strongest wins.
3. **Explicit deny** via `EXCLUDED_FROM` (App / Track / Entry). Overrides INHERITED paths only — `OWNS` and direct `COLLABORATES_ON` always beat it.
4. **Roles:** `owner | editor | commenter | viewer`. `commenter` = read + post comments, no entry edits.
5. **Backend-authoritative workspace scope.** List endpoints require the `X-Integral-Scope: ws:<workspace_id>` request header (note the `ws:` prefix — an explicitly supplied bare or malformed header is rejected with 400; only an omitted header uses the default Personal Workspace); backend validates caller has access to that workspace and refuses cross-workspace reads. Enforcement in `services/request_scope.py` + `services/workspace_resolver.py`. Frontend `WorkspaceSwitcher` and `ScopeContext` keep this in sync (incl. auto-switch when opening resource in another workspace user has access to).

Canonical resolver = `resolve_role(user_id, resource_type, resource_id)` in `backend/app/services/permissions.py`. Workspace-level checks in `services/workspace_permissions.py`.

Sharing surface (Phases 2–5):
- `POST/GET/DELETE /{apps|tracks|entries}/{id}/collaborators` — direct collaborators
- `POST/DELETE /{apps|tracks|entries}/{id}/exclusions` — explicit deny
- `GET /{apps|tracks|entries}/{id}/access` — unified snapshot: direct, inherited, excluded, links, `links_visible`, `effective_role`. Owner/admin only — every other caller gets a reduced `{resource_type, resource_id, effective_role, links_visible: false}` so a viewer cannot enumerate who else has access
- `POST /{apps|tracks|entries}/{id}/shares` — mint share-link; `POST /shares/redeem`; `DELETE /shares/{share_link_id}`
- `POST /{apps|tracks|entries}/{id}/invitations` — resource-level invites (workspace invites at `/workspaces/{id}/invitations`)
- `GET /me/shared`, `GET /me/invitations` — aggregators for "Shared with me" surface

### Authentication

- JWT-based via jvspatial auth system
- Test mode (`TESTING=1`): `TestAuthBypassMiddleware` pre-sets `request.state.user`
- Exempt paths: `/api/auth/*`, `/health`, `/docs`, `/openapi.json`
- All other `/api/*` routes require authentication
- Workspace scope header `X-Integral-Scope: ws:<workspace_id>` required on list endpoints (validated by `services/request_scope.py`; the `ws:` prefix is mandatory — a supplied bare or malformed header is rejected with 400; omission uses the default Personal Workspace)

**Email verification (non-blocking).** New signups receive a 6-digit OTP via email. Login is **never** gated on `email_verified` — verification is surfaced through the system notification bar (see "System Notification Bar" below). OTP storage and validation in `services/email_verification.py` mirrors the `password_reset.py` pattern: SHA-256 hash on `User.preferences["email_verification"]` (slot = `{hash, expires_at, attempts}`), plaintext lives only in the outgoing email, `secrets.compare_digest` for constant-time validation, expiry checked before hash comparison. Endpoints (both auth-required so the caller owns the account):

- `POST /auth/verify-email` — body `{code: "123456"}`; sets `User.email_verified = true` on success
- `POST /auth/resend-verification` — no-ops while a non-expired code is still pending

Knobs in `app/config.py`: `EMAIL_VERIFICATION_CODE_EXPIRE_MINUTES` (default 15), `EMAIL_VERIFICATION_MAX_ATTEMPTS` (default 5; on exceed the slot is cleared and user must resend).

### Environment Variables

Key variables in `.env` (copy from `.env.example`):

```bash
# Backend
HOST=0.0.0.0
PORT=4000
DEBUG=True
SECRET_KEY=<strong-secret>
# Postgres (default — jvspatial Phase C backend: asyncpg + JSONB + pgvector).
# `docker compose up -d db` starts a local pgvector/pg16 on host :5433.
JVSPATIAL_DB_TYPE=postgres
JVSPATIAL_POSTGRES_DSN=postgresql://integral:integral@localhost:5433/integral
# Or sqlite for zero-infra dev (file-backed):
# JVSPATIAL_DB_TYPE=sqlite
# JVSPATIAL_DB_PATH=integral.db

# Frontend (via Vite proxy)
VITE_BACKEND_URL=http://localhost:4000  # optional, defaults to localhost:4000
```

## Development Notes

### jvspatial Integration

- Backend hosts jvspatial `Server`, registers routes with `@endpoint`
- `app/main.py` uses `server.run()` entrypoint (handles uvicorn, logging)
- Change events from jvspatial can drive real-time updates (future: WebSocket/SSE)
- See [jvspatial docs](https://github.com/TrueSelph/jvspatial) for framework details

### Error Handling

- Typical error JSON: `{error_code, message, details, timestamp, path}`
- Some FastAPI paths (e.g., Pydantic 422) return `{"detail": ...}`

### OperationalModel System (current)

**Modeling tenet** — when advising how to model information space in Integral, orient every answer around canonical analogy:

- **Track ≈ table**, **Entry ≈ record**, **App ≈ schema / database**.
- Records express depth through **two reference patterns** — pick one, never both for same relationship:
  - **Lookup / value reference** — `relation` field with `target: entry` → materializes `REFERENCES` (e.g. Project → Contact).
  - **Expansion reference** — `relation` field with `target: track` → materializes `ANCHORS` (e.g. Project → Project-Details track). *Anchor pattern, Phase 3.1.*
- For depth-via-mixed-types, declare multiple `EntryType`s under one anchored track; let each view project slice via `View.entry_type_keys` (first-class substrate primitive — not `filters` workaround).
- Never stuff child collection into parent's JSON payload, never invent hierarchical containment edge, never provision one anchored track per child category when mixed entity types + per-view filtering suffice.

Full rationale and pattern catalogue: [docs/operational-models/README.md](docs/operational-models/README.md) (Modeling Tenets section); pattern catalogue lands at `docs/operational-models/COMPOSITION_PATTERNS.md` in Phase 3.1 (ANC-10).

**Two roles** (same node type, different placement):

1. **Library packages**: Under `OperationalModels` registry, read-mostly, versioned manifests with canonical v2 shape (`scope: track` or `scope: app`, `package`, `migrations`)
2. **Attached instances**:
   - App-attached: Default profile for app, may `DEFINES_TRACK_PROFILE` → track templates
   - Track-attached: Owns that track's EntryType/Tag/View subgraph

**APIs:**
- `GET/PATCH /apps/{id}/operational-model`, `GET/PATCH /tracks/{id}/operational-model`
- `POST /apps/{id}/operational-model/merge-library`, `POST /tracks/{id}/operational-model/merge-library`
- `GET /operational-models` (list library packages)
- **Draft / publish lifecycle**: `POST /operational-models/{id}/{draft,publish,diff,discard-draft}` and `GET /operational-model-substrate` for field/view/plugin introspection

**Manifest v2 shape:**
- `track` scope: `entry_types[]`, `taxonomy.tag_groups[]`, `views[]`
- `app` scope: `app.tracks[]` (multiple track types with optional `provision_on_create`), `app.relations[]`, `skills[]`, `agents[]`, `settings_schema`, `seeds[]`, `permissions[]`, `requires_apps[]`
- Field types: `text`, `number`, `boolean`, `date`, `datetime`, `markdown`, `json`, `select`, `multi_select`, `relation`, `computed`
- View types: `feed`, `kanban`, `table`, `calendar`, `gallery`, plus composable meta-widgets `composable_list`, `composable_grid`, `composable_board`, `composable_timeline`
- `field_types[]` and `view_types[]` declare manifest-scoped composites; `plugins[]` declares signed code-plugin requirements

**View palette:** Profiles compose from prebuilt `view_type` keys (`feed`, `kanban`, `composable_board`, …) — not runtime hot-load of arbitrary view code. Canonical contracts: `backend/app/views/contracts/*.json`; registry: `app/views/operational_model_view_types.py`; sync to `frontend/src/views/contracts.json` via `backend/scripts/sync_view_contracts.py`. Convention: [docs/operational-models/VIEW_PALETTE.md](docs/operational-models/VIEW_PALETTE.md).

**Runtime:** `operational_model_runtime.py` compiles YAML→JSON, validates, resolves scope-aware profiles. `operational_model_merge.py` handles library merges into attached profiles. `operational_model_field_types` + `app.views.operational_model_view_types` = extensible registries used by both backend and agent's introspection tool surface. `operational_model_atomic_swap`, `operational_model_diff`, `operational_model_migrations` implement draft/publish lifecycle. `operational_model_plugins` discovers signed code plugins from `backend/app/plugins/` or Python entry points. Library drop-in: `backend/app/packages/<slug>/operational-model.yaml` synced via `operational_model_library_sync.py`.

**Frontend mirrors:** `frontend/src/views/registry.tsx` (widget registry, composite-aware) + declarative manifests under `frontend/src/views/manifests/` (auto-loaded at boot). Widget components live under `frontend/src/components/views/` (composable meta-widgets in `composable/`). Field types: `frontend/src/components/entries/fieldTypes/registry.ts`. Substrate plugin loader: `frontend/src/views/plugins/auto.ts` in `main.tsx`.

**Agent contract:** introspection-first MCP tools — `integral_describe_substrate`, `integral_describe_model`, `integral_get_model_draft`, `integral_propose_model_revision`, `integral_diff_model_draft`, `integral_publish_model_draft`, `integral_discard_model_draft`. Patch DSL at `app/services/agent_profile_patches.py`. See [docs/platform/operational-model.md](docs/platform/operational-model.md) and [docs/operational-models/](docs/operational-models/) for full contract.

**Per-entry `visibility_rule`** is not an authority mechanism. Use current canonical policy, including supported direct Entry grants and Track/App access. Preserve existing data and identities during upgrades; use a reviewed migration and verified backup rather than deleting or reseeding an active database.

### App configuration and collection changes

**App-specific settings UI MUST use the standard App settings dialog** reached
from the App header. Declare controls in `app.settings_schema`; never add
settings editors to Home, dashboards, Tracks, Entries or extension views.
Operational record forms remain distinct. Unsupported controls require a
reviewed extension to the shared settings renderer, not another panel. This
binds coding agents, resident-agent designs and external App developers. See
[the App settings UI contract](docs/platform/app-settings-ui.md) and
[I-APP-SETTINGS-01](docs/INVARIANTS.md#i-app-settings-01--one-app-settings-surface).


Preserve the explicit [App-owner configuration exception](docs/INVARIANTS.md#i-role-02--inherited-role-cap-at-editor-inherited-role-caps-to-editor)
without raising inherited collaborator roles or granting library publication.
Current membership, canonical containment, exclusions and all affected model
parents still govern configuration. For collection changes, select every page,
stage at most 500 explicit Entries per review, preserve per-record live policy
and revisions, and reconcile durable receipts. A late failure can leave partial
completion; never describe the collection command as atomic. See
[chat contracts](docs/backend/ai-chat.md#collection-changes-and-retrieved-evidence).

### Chat approvals and registered tools

Pending Entry edits reuse the standard form in proposal-only mode. They must
mint a new pending review through the transactional revision service, never
write the record directly or mutate the old proposal. Keep targets fixed,
preserve file bindings, reject stale records/schemas, and clear capability
origin proof on human-authored replacements. See I-APPROVAL-05 and
[the record-review contract](docs/backend/ai-chat.md#editing-a-proposed-record).

Ordinary terminal card approvals, denials and cancellations end with the host
receipt, without a second model run. Resume only for questions and approved
design/draft workflows that still need agent work. Keep registered App tool
discovery and invocation available together in skills; registered tool keys are
not declared query keys. Session exports must encode binary image bytes.

Keep closing receipts useful with local links from execution metadata or the
staged target; a link never grants access or proves a fresh readback. The
`integral_open_view` tool is presentation-only: preserve bound chat ownership,
workspace and live resource/View checks. Use its dedicated public navigation
event, never expose arbitrary tool results. Apply only to successful live
foreground turns; history, recovery, changed routes/scopes and composer drafts
must not move the user's page. Keep the same chat available after navigation.

### Chat image input

Native images use canonical persisted uploads and `attachment_ids`, not duplicate
browser base64 or remote URLs. Preserve source hashes, scan visibility, current
thread/owning-entry access and canonical workspace checks before every physical
model attempt, including retries and image-bearing restored history. Supply
pixels as typed model input; extracted text does not provide image understanding.
Text-only system receipts must still pass image preparation so approval and
other host continuations can run. System receipts cannot introduce new images
and must stay out of rendered conversation bubbles after reload.
See [chat lifecycle](docs/backend/ai-chat.md#image-input).

### Search and indexing

For recurring domain questions, follow [efficient agent reads](docs/platform/extension-contract-v1.md#efficient-agent-reads).
Apps own focused deterministic summaries and compact source results; Core owns
generic governed reads and bounded discovery/context. Skills should identify
the registered read and minimal input, avoiding repeated catalog/schema discovery.
Measure first-tool and first-domain-data timings separately, plus total time,
call/token counts and verified answer accuracy on populated workspaces. Never
trade current authorization or complete aggregate coverage for speed.

Installed-App record questions must discover the App's registered read tools
or declared queries. Keep the insights skill and refusal recovery hints aligned;
do not bypass the governed query boundary. Chat progress uses a single short
line derived from observable operations, never private reasoning. Preserve both
stream inactivity and total request deadlines and uncertain-outcome accounting.

Canonical contract: [declarative indexing and retrieval](docs/backend/semantic-indexing.md);
selection/storage decision: [ADR-016](docs/backend/adr/016-declarative-semantic-indexing.md).

- Keep the graph authoritative. Index declarations select content, never its
  audience. Narrow workspace/App/Track candidates before ranking and recheck
  current entry.read, canonical containment/source hash and governed App queries
  before exposing titles, passages, metadata or citations. Preserve direct Entry
  grants without implicitly granting Track access.
- On PostgreSQL, canonical writes retain durable index intent in the graph
  transaction; model/vector calls belong in the worker. Preserve generation/lease
  fencing, atomic guarded publication and malformed-source isolation. Do not
  reinstate synchronous reembedding or use `backfill_embeddings.py` to populate
  the versioned passage index; use reconciliation and the authorized reindex API.
- Preserve Track policies and EntryType narrowing through OM compilation,
  materialization, merges and readback. Profile changes require a separate
  backfill; matching dimensions alone never make old vectors compatible.
- Index configuration/rebuild tools use ordinary staged approval and recheck
  current configuration authority. Configuration revision, rebuild request and
  audit intent commit together; deliver audit after commit. A queued rebuild is
  not completed indexing. Coverage is bounded and point-in-time.
- The text encoder uses pinned ONNX artifacts, tokenizer configuration and
  explicit pooling. Keep artifact/preprocessing identity in the profile hash;
  do not mask incompatible dependency constraints, use mutable model revisions
  or silently guess custom-model aliases. Profile changes backfill a separate space.
- Retrieval changes need the explicit real encoder/pgvector and PostgreSQL
  rollback lanes in the guide, plus the default backend and CI-faithful gates.
  Measure labelled evidence, HTTP latency and actual provider token use
  separately; passage tokens and a healthy database do not prove those outcomes.
- Keep [API inventory](docs/backend/API_REFERENCE.md) source-derived:
  `python3 scripts/build_documentation.py --inventory-only`. Regenerate the
  capability map after changing tools/skills; retain one current topic guide and
  link candidate evidence without presenting it as deployment qualification.

### System Notification Bar (frontend)

App-wide critical-message surface for conditions that deserve more prominence than a toast: email verification, server-unreachable, offline, scheduled maintenance, etc. Lives under `frontend/src/components/system/`.

**Pieces:**

| File | Role |
|------|------|
| `SystemNotificationsContext.tsx` | React context + priority queue (error 100 > warning 75 > info 50 > success 25; caller may override). Publishes a module-level `_liveApi` slot so non-React modules (axios interceptor, error boundaries) can push without a hook. |
| `SystemNotificationBar.tsx` | HelloBar-style fixed-top renderer (`z-1000`, opaque `--bg` + type tint). 500ms entrance delay, slide-down via `.system-bar-animated` CSS class with `data-open` toggle. Reports its natural height onto `:root` as `--system-bar-h` via a `ResizeObserver` so the layout pads in sync. |
| `lib/apiErrorNotifier.ts` | Canonical home (`components/system/apiErrorNotifier.ts` is a deprecated re-export kept for back-compat — import from `lib/`). `notifyApiFailure(err, {context, onRetry})` / `clearApiFailure()`. Classifies network/5xx/4xx/408/429; skips 401/403 (handled elsewhere). Single `system:api-error` id so repeated failures update in place. |
| `useOfflineNotification.ts` | Watches `navigator.onLine`, pushes a persistent `system:offline` (priority 200, non-dismissible) when offline; auto-clears on reconnect. |
| `index.ts` | Barrel export. |

**Mount order (already wired in `App.tsx`):**

```tsx
<SystemNotificationsProvider>
  <SystemConnectivityWatchers />   {/* hosts useOfflineNotification */}
  <SystemNotificationBar />
  <div className="system-bar-layout" style={{ paddingTop: 'var(--system-bar-h, 0px)' }}>
    <Suspense ...><Routes>...</Routes></Suspense>
  </div>
</SystemNotificationsProvider>
```

The padding-top wrapper sits OUTSIDE the auth/public route split so public surfaces (login, signup, forgot-password, reset-password, verify-email, invitation accept) squeeze down too. `Sidebar` adopts the `.system-bar-sidebar` class so its `top`/`height` animate with the same `380ms cubic-bezier(0.16, 1, 0.3, 1)` easing as `.system-bar-layout` — the fixed rail squeezes in lockstep with main content. Chat pages (`AIChatPage`, `ChatPage`) compute their viewport as `calc(100vh - var(--system-bar-h, 0px))` so the bar doesn't push them past the bottom.

**Wiring conventions:**

- **Global API failures auto-route.** `frontend/src/api/client.ts` calls `notifyApiFailure(err)` on every non-401 error and `clearApiFailure()` on the next successful response. Routes that own their own error UI (auth flows) are listed in `SUPPRESS_NOTIFY_PATHS`; per-request opt-out via `config.__suppressSystemNotify = true`.
- **Page-level retry.** Pages that previously rendered an inline "Could not load X" banner now react to their query error inside a `useEffect` and call `notifyApiFailure(err, { context, onRetry })` — the axios interceptor already pushed a generic notification; this *upgrades* it with a context-specific title and a Retry action. Reference: `pages/FeedPage.tsx`, `pages/MissionControlPage.tsx`.
- **Programmatic feature banners.** Components that own a condition (e.g. `EmailVerificationBanner` in `components/layout/`) call `notify({ id, type, icon, title, actions })` and must `dismiss(id)` on unmount — otherwise the bar stays pinned after the owning surface unmounts (e.g. Layout tear-down on logout).

Add a new system condition by giving it a stable `id` (e.g. `system:rate-limited`, `auth:email-verification`), choosing a `type` (priority follows automatically), and pushing via `useSystemNotifications()` or `getSystemNotificationsApi()` outside React.

### Testing Patterns

**Backend test fixtures** (`tests/conftest.py`):
- `authenticated_client`: httpx AsyncClient with auth
- `test_user`: Created test user

```python
@pytest.mark.asyncio
async def test_create_track(authenticated_client: AsyncClient, test_user):
    response = await authenticated_client.post(
        "/api/tracks",
        json={"title": "My Track", "visibility": "private"},
    )
```

**Frontend testing**: Vitest with React Testing Library

### Docker

```bash
docker-compose up  # builds backend from Dockerfile, runs API on :4000
```

## References

- **docs/product/ARCHITECTURE.md**: Detailed system design, data model, YAML schemas, access model (§9)
- **docs/product/PRD.md**: Product requirements, user personas, epics
- **docs/product/CONCEPT.md**: Product vision and philosophy
- **docs/product/BYOA.md**: Bring-your-own-agent
- **docs/platform/operational-model.md**: OperationalModel overview and learning path
- **docs/operational-models/**: Substrate scaffolding — `README`, `VIEW_PALETTE`, `AGENT_CONTRACT`, `COMPOSITES`, `DRAFT_PUBLISH`, `META_WIDGETS`, `MIGRATIONS`, `PLUGINS` (view palette + Pillars 1–4)
- **backend/README.md**: Full backend documentation
- **docs/backend/**: Operational Model authoring, packages, app bundles v1, search index
- **jvspatial**: https://github.com/TrueSelph/jvspatial


## Optional local workspace reference

When this repository is part of a local multi-repository workspace and the files exist, [architecture](../docs/ARCHITECTURE.md), [foundation map](../docs/JVSPATIAL_FOUNDATION.md) and [contracts](../docs/API_CONTRACTS.md) provide additional source-navigation context. These documents describe one developer's setup; they do not require sibling repositories, directory names, branches, dependency overrides, tools or deployment choices in other checkouts.

Use this repository's own configuration and instructions as the baseline. Verify actual dependency artifacts and assess affected consumers when changing shared contracts. If another consumer checkout is unavailable, report the validation limit; its absence alone does not block unrelated work. Local workflow exceptions apply only when explicitly authorized for the current workspace.

<!-- integral-app-ui:start -->
## Shared App UI — automatic instructions

Before creating or changing App UI, read [APP_UI_GUIDE.md](APP_UI_GUIDE.md). Use Core's public React SDK patterns and host theme; keep domain behavior in the App.
New/migrated React components require SDK ^1.2.0 and design checks. Preserve
existing scoped instructions. Never treat UI work as permission to publish, deploy
or activate a release.
<!-- integral-app-ui:end -->
