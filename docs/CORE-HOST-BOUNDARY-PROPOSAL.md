# Core and host boundary

**Status:** Accepted by owner on 18 October 2026; implemented and qualified locally; review/publication pending.
**Date:** 18 October 2026

**Decider:** Eldon Marks / Integral architecture owner

## Context

Integral One needs one local human owner, persistent offline access and a native
controller that starts a private runtime. Business needs authenticated accounts,
workspace membership and tenant isolation. Future distributions should reuse the
same graph, editor, agent, permission and App contracts.

Current public Core main contains a legacy Electron application. One additionally
depends on an explicit development snapshot containing the single-user changes;
those changes are not an approved released Core dependency. The snapshot calls
`desktop_mode()` across authentication, policy, startup and services. Its action
restrictions classify operations partly by string fragments. These are concrete
maintenance concerns, not evidence that configuration itself is inappropriate.

Evidence inspected:

- Core main at `31190c06275332ff44637b6afa6fb068f6444c13`.
- Core development worktree: `services/deployment.py`, `desktop_identity.py`,
  `middleware/desktop_perimeter.py`, `services/authentication.py`, policy engine,
  local runtime and desktop contract tests.
- One's pinned distribution and source-provenance records; draft PR #1.

## Recommendation

Maintain one Core implementation with a small, validated runtime contract selected
at startup. Products compose trusted adapters and select supported presets. Core
enforces the resulting restrictions using neutral operation and identity concepts.
Presets remain configuration conveniences; product names do not enter services.

Start with two supported compositions. Avoid independent Boolean switches for
every feature and do not promise arbitrary combinations without qualification.

| Concern | One composition | Hosted composition, including Business |
| --- | --- | --- |
| Human identity admission | One installation-bound owner | Verified accounts mapped to Core principals |
| Session establishment | Trusted local-controller adapter | Configured account authentication adapter |
| Workspaces | Owner's personal workspaces | Authorized personal/organization workspaces |
| Collaboration and public publication | Unavailable | Available subject to normal permission checks |
| Transport | Private loopback transport | Hosted transport with its normal security controls |
| Product account registration | One's Clerk/receipt integration | Host's account/commercial integration |
| Graph, editor, agents and App execution | Same Core | Same Core |

Hosted composition is not a claim that tenant isolation is solved by a preset.
Core must continue validating principal, workspace membership, resource ownership
and scope on every applicable operation. A host's account directory or tenant
identifier never substitutes for those checks.

## Contract and responsibility boundaries

### Core owns

- Principal and workspace authority, resource authorization, graph integrity,
  transactions, agents and App execution.
- A small immutable runtime descriptor: identity admission, supported workspace
  kinds and supported operation groups. Distinguish authentication from
  collaboration; local login is not a collaboration operation.
- Generic enforcement before reads/writes or authority materialization, including
  service calls, MCP/tools, jobs and system subjects. Keep local defense at the
  relevant command boundary; centralize the policy definition and classification.
- Explicit operation-to-capability metadata using existing operation/policy
  machinery where possible. Validate coverage; unmapped exposed operations must
  not silently become permitted. Replace substring matching incrementally.
- Narrow startup/session integration points accepting validated principals and
  invoking Core-owned bootstrap operations. Host adapters do not manipulate graph
  rows directly or introduce alternate authorization engines.
- Neutral capability output for the UI. Presentation follows server capabilities;
  hiding UI and withholding HTTP routes are supplemental controls.
- Generic local storage lifecycle, backup and recovery primitives where shared.

An operation must satisfy both the runtime's supported operations and Core's
ordinary authorization. A runtime setting can restrict authority; it cannot grant
access to an otherwise unauthorized resource or bypass an agent approval.

### Hosts own

- Identity-provider and transport-specific adapters. One owns the native control
  secret, origin/loopback perimeter and local session bridge. Hosted adapters own
  provider verification and mapping into Core's authenticated principal contract.
- Startup composition and the deployment configuration. These are trusted process
  configuration, never request headers, user preferences or App-supplied flags.
- Product bootstrap orchestration; Core validates and atomically establishes the
  permitted owner/workspace structure. Preserve the existing first-owner race and
  foreign-store protections.
- Branding, account views, signup/registration counts, Clerk receipts, offline
  product experience, installers and signing. Receipt validity does not confer
  additional Core workspace permissions.
- Electron source and tests. Preserve an Apache reusable host package in One for
  Business's native client to consume; no extra repository is required initially.

Treat these as a few internal integration seams first. Do not introduce dynamic
adapter discovery, an arbitrary plugin framework or a general policy language.
Keep current server authentication as the first hosted implementation; a wholesale
authentication rewrite is unnecessary.

## Options considered

| Option | Initial effort | Maintenance and security consequences |
| --- | --- | --- |
| Existing desktop/server branches | Lowest | Reasonable short-term baseline; product-aware checks and string-based classification spread as hosts grow |
| One-specific API/middleware wrapper alone | Low to medium | Reduces Core edits but does not enforce direct service, agent or job calls; insufficient as the only boundary |
| Separate single-user and hosted Core implementations | High | Duplicates fixes, migrations, permissions and App compatibility; reject |
| Fully modularize all collaboration/identity subsystems now | Highest | Large refactor of intertwined authority and lifecycle code; disproportionate to the current need |
| Small runtime contract plus trusted host adapters | Medium, incremental | Recommended: one implementation and authorization model, explicit hosting seams, bounded supported combinations |

This recommendation retains profiles as presets. The improvement is assigning
product behavior to hosts and giving Core a narrow, generic enforcement contract;
merely renaming `desktop_mode()` would not achieve that separation.

## Compatibility and invariants

- Preserve I-SUBSTRATE-01 and I-EXT-01: no One, Business, Clerk or App-specific
  behavior/imports in Core's resource services. Trusted host adapters are startup
  infrastructure, not ordinary executable App hooks.
- Preserve rooted graph creation, principal/workspace authority and approval
  requirements. Runtime restrictions precede ordinary policy grants.
- Preserve application ID, data paths, installation/owner IDs, recovery keys and
  issued offline receipt verification. Do not replace existing data or identities.
- Accept stored `desktop_single_user` as a compatibility alias if an internal
  neutral name is introduced. A naming cleanup alone does not justify migration.
- Choose composition at startup. Changing a local store into a hosted tenant is
  an explicit future export/import workflow, not a live profile toggle.
- Local access remains independent of cloud sessions and product-account outages.
- Preserve Apache and component notices during source movement. Business remains
  private; shared public packages must not import it.

## Incremental implementation sequence

1. Inventory all current guards, identity/session paths, exposed actions and direct
   invocation paths. Establish the two composition contracts and negative cases.
2. Introduce the generic descriptor and explicit operation classification behind
   compatibility wrappers. Preserve current denials while replacing their policy
   source. Keep guards at the command boundaries that need them.
3. Extract identity/bootstrap/session and transport integration through the narrow
   seams. Move One-specific adapters into the public One source; keep a supported
   hosted composition for Core developer/server operation and Business.
4. Transfer the reusable Electron package, tests and notices to One; update pins
   and provenance before retiring Core's legacy desktop entry/workflow/docs.
5. Qualify both compositions, release reviewed Core artifacts, then replace One's
   development wheel/UI pins. Public One release remains gated on this work and
   its separate production signup, platform, dependency and signing requirements.

Qualification must cover first-owner races, foreign-store rejection, direct
service/MCP/job calls, system-subject restrictions, disabled-route requests,
cross-workspace/tenant access, account outages, sign-out/offline recovery and
existing-store upgrades. Existing tests are evidence to preserve, not proof that
the proposed contract has already been implemented or qualified.

## Consequences

Core remains responsible for secure behavior in both local and hosted execution.
Hosts gain ownership of identity/transport integration and product experience.
This reduces product coupling but adds a small contract that must be versioned and
tested. The migration requires security review; preserve the working restrictions
until equivalent coverage and enforcement exist.

The implementation below is a local candidate. Source publication and release approval remain separate gates.


## Implementation record

The candidate introduces neutral Core runtime descriptors, explicit operation
metadata, identity/session and transport adapters with v1 compatibility facades.
The reusable Electron host source/tests/notices live in One. Core's legacy native
product/workflow are retired in its separate candidate branch.

Core's UI uses a protected `HostSessionAdapter` contract. One supplies its native
bridge, verified display profile and sign-in/offline return view through the
existing source overlay. Core's default has no native session authority. This
preserves the existing One UI and controller/receipt behavior without requiring
Core to read a desktop global or contain the product's account-return page.

Both managed Core configurations have been exercised using private synthetic
stores: local old-wheel/new-wheel record and key preservation, and hosted account
creation with cross-workspace/tenant denial. Additional source, PostgreSQL,
frontend and package gates are recorded in [runtime qualification](RUNTIME-COMPOSITION-QUALIFICATION.md).
The new candidate is local pending source review/publication; older remote green
checks and unsigned artifacts must not be presented as its CI evidence.
