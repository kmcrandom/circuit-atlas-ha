# Circuit Atlas — Property Navigation, Card Layout, and Versioned Wiring Plan

Status: Implemented and verified
Branch: `sdd/property-navigation-and-layout`
Date: 2026-08-24
Companions: `specs/product-spec.md`, `specs/domain-model.md`

## 1. Outcome and scope

This pull request will deliver three approved product amendments as one coherent UX and data-model change:

1. Make the Circuit Atlas root route aware of whether the workspace contains zero, one, or multiple properties.
2. Make property chooser cards responsive so the “Open atlas” affordance never overlaps Panels, Circuits, or Assets statistics.
3. Add versioned wiring configurations so an as-found dumb multi-way topology remains available after a smart-switch conversion, including travelers that become capped, spare, abandoned, repurposed, or unknown.

The implementation remains property-neutral and preserves Home Assistant Ingress and Cloudflare Access boundaries. It will migrate existing `0.2.x` data in place; it will not require recreating a property or re-entering topology.

## 2. Phase 1 — Schema and migration foundation

### 2.1 Configuration records

Add normalized tables and constraints for:

- `wiring_configurations`: property, user-facing name, `draft|planned|current|historical` lifecycle, source/superseded configuration IDs, captured/effective/finalized timestamps, summary, verification state, revision, and audit timestamps;
- `wiring_configuration_scopes`: optional affected circuit, control group, box, or asset references used for navigation and change summaries;
- `wiring_configuration_nodes`: membership of shared electrical nodes in a configuration where explicit participation is needed for rendering and cloning;
- `conductor_end_connections`: one configuration-specific assignment for a physical conductor end, including node, termination method, certainty, observed/assigned role, explicit disconnected-state classification, notes, and revision.

Keep `conductor_ends` as the durable physical A/B identity for a conductor. Move its node/termination facts into `conductor_end_connections`. This avoids duplicating conductors while allowing the same end to be a traveler historically and capped currently.

Add `wiring_configuration_id` ownership to topology relationships whose meaning can change between installations:

- asset mounts and mount positions;
- asset circuit assertions;
- trace gaps;
- control members and control links.

Device terminal definitions and internal device-contact definitions remain attached to their durable device records. Loaders include them only when their device/nodes participate in the selected configuration. Circuit sources remain shared supply facts unless implementation proves a configuration-specific source is required; any such expansion must update the specification before proceeding.

### 2.2 Constraints and indexes

- Enforce exactly one current configuration per property with a partial unique index plus transactional creation/activation checks.
- Enforce property/configuration composite foreign keys so a configuration cannot reference another property’s assets or topology.
- Enforce one connection per `(property, configuration, conductor end)`.
- Permit a conductor end to have no connected node only when its explicit state is capped, spare, abandoned, repurposed, or unknown.
- Index current-configuration resolution, configuration ancestry, conductor-end loading, box diagrams, control groups, assertions, and compare queries.
- Keep historical rows restrict-deleted and reject ordinary writes to finalized historical configurations in repositories.

### 2.3 Upgrade migration

Create one baseline current configuration for every existing property. In the same migration:

- preserve each physical conductor-end ID;
- copy its existing node, termination method, certainty, and notes into a baseline connection row;
- associate existing mounts, assertions, trace gaps, control members, and control links with that property’s baseline configuration;
- populate required node membership;
- leave all asset, conductor, cable, terminal, splice, breaker, circuit, evidence, and attachment IDs unchanged.

The migration tests will start from the exact `0.2.1` schema with populated fictional topology, apply the new migration, and compare every migrated relationship. A clean database and a newly created/imported property must also receive one baseline current configuration.

Likely files:

- `circuit-atlas/db/schema.ts`
- a generated migration and Drizzle metadata under `circuit-atlas/drizzle/`
- `circuit-atlas/tests/schema/migration.test.mjs`
- property creation/import repository paths

Checkpoint: existing topology is losslessly represented under one current configuration, database constraints reject cross-property and multiple-current states, and no UI behavior has changed yet.

## 3. Phase 2 — Configuration-aware repository boundary

Introduce a centralized configuration context resolver used by every topology read/write:

- omitted configuration ID resolves to the property’s current configuration;
- an explicit configuration ID must belong to the authenticated property;
- current, draft, and planned configurations may be edited according to route permissions;
- historical configurations are read-only;
- default inventory, breaker, map, search, and trace view models always resolve current unless an explicit historical/planned view is supported by that screen.

Refactor topology and box repositories to load configuration-scoped connections, mounts, assertions, gaps, and control relationships. Key property/topology revisions and cached graph results by configuration so editing a planned configuration cannot invalidate or alter a current result incorrectly.

Update all existing topology mutation paths—not only the wiring screen—including:

- generic topology resources;
- gang-box termination create/update/remove;
- room-walk capture materialization;
- aggregate asset mounting and replacement;
- breaker/asset connected lookups;
- box, circuit, inventory, map, search, and inspector view models.

Existing callers remain backward compatible by defaulting to current. New writes carry an explicit configuration ID once the client has loaded configuration context. Optimistic revision conflicts remain scoped to the affected configuration.

Likely files:

- `circuit-atlas/db/repositories/topology.ts`
- `circuit-atlas/db/repositories/box-termination.ts`
- `circuit-atlas/db/repositories/core.ts`
- `circuit-atlas/db/repositories/capture.ts`
- `circuit-atlas/db/repositories/aggregates.ts`
- `circuit-atlas/db/repositories/view-models.ts`
- related route schemas and topology tests

Checkpoint: all existing behavior passes against the implicit current configuration, while a planned edit demonstrably leaves current traces and box models unchanged.

## 4. Phase 3 — Configuration services and API

Add authenticated property-scoped services and routes to:

- list configurations with status, ancestry, scope summary, verification, and counts;
- create a blank draft or clone current/historical into a draft or planned configuration;
- edit draft/planned metadata and scope links;
- finalize a captured snapshot as historical;
- compare two configurations;
- activate a validated planned configuration with explicit confirmation;
- archive/discard an unactivated draft or planned configuration when it has no protected descendants.

Proposed routes:

- `GET|POST /api/p/[propertyId]/wiring-configurations`
- `GET|PATCH /api/p/[propertyId]/wiring-configurations/[configurationId]`
- `POST /api/p/[propertyId]/wiring-configurations/[configurationId]/clone`
- `POST /api/p/[propertyId]/wiring-configurations/[configurationId]/activate`
- `GET /api/p/[propertyId]/wiring-configurations/compare?from=…&to=…`

Activation runs in one SQLite transaction. It validates structural graph errors, confirms the request’s expected current/revisions, changes the displaced current to historical, promotes the candidate, records change events, and invalidates the correct caches. Warnings remain visible but do not masquerade as hard errors. The response never describes the wiring as safe or code-compliant.

Comparison returns stable-identity changes for devices/mounts, conductor-end node/role/status, splices/node participation, assertions, gaps, and control membership/links. It does not compare secret installed-device values.

Checkpoint: API tests cover cloning, independent edits, immutable history, conflict-safe activation, reversion cloning, authorization, and configuration comparison.

## 5. Phase 4 — Root route and property chooser fixes

Make the root route dynamic and identity-aware:

- zero properties renders the existing first-run landing screen;
- one property redirects to that property’s map;
- multiple properties redirect to `/properties`;
- Home Assistant prefixed ingress and Cloudflare-authenticated root access retain their existing authentication and runtime-path behavior.

Change property-card layout so the open affordance participates in normal grid/flex flow rather than absolute positioning over the statistics. Reserve a distinct footer row, allow long names/addresses to wrap safely, and keep all three counts readable at narrow widths and with wide numeric values.

Likely files:

- `circuit-atlas/app/page.tsx`
- `circuit-atlas/app/properties/property-onboarding.tsx`
- `circuit-atlas/app/globals.css`
- rendered-route and Playwright tests

Checkpoint: zero/one/multiple-property entry behavior and property-card non-overlap pass at desktop and phone widths beneath both root and representative ingress paths.

## 6. Phase 5 — Wiring configuration UX

Add a configuration bar to the Wiring workspace showing name, lifecycle, verification state, effective date, and a prominent non-current banner. Provide actions for:

- Save/capture the current wiring as historical;
- Plan a change by cloning current;
- Clone a historical configuration as a planned reversion;
- Edit configuration name, reason, affected records, notes, and evidence;
- Compare with current or another configuration;
- Activate a planned configuration after an explicit confirmation summary.

Persist the selected configuration in URL state so links and reloads retain context without browser-local storage. Preserve it when opening a box or record from a historical/planned wiring diagram. Current remains the default when no configuration is selected.

Make gang-box diagrams and termination editors configuration-aware:

- historical views are visibly read-only;
- current/draft/planned views show only their participating devices, mounts, nodes, splices, and conductor assignments;
- conductor-end editing includes connected, capped, spare, abandoned, repurposed, and unknown states;
- changing a status never deletes the conductor or another configuration’s connection;
- device replacement in a planned configuration can mount the proposed/new device without removing the historical dumb device from prior diagrams.

The compare view uses a navigable list on all viewports and may add a side-by-side diagram on larger screens. It identifies added, removed, and changed relationships by stable record identity and labels both sides clearly. No information is desktop-only.

Likely files:

- `circuit-atlas/app/p/[propertyId]/wiring/wiring-client.tsx`
- `circuit-atlas/features/wiring/*`
- `circuit-atlas/app/p/[propertyId]/boxes/[boxId]/*`
- `circuit-atlas/features/boxes/*`
- shared UI components and configuration-aware client API helpers

Checkpoint: a fictional four-switch dumb topology can be captured, cloned, changed to smart/aux wiring with obsolete travelers capped, activated, compared, and cloned back into a planned reversion entirely through the UI.

## 7. Phase 6 — Portability, privacy, and compatibility

- Add configurations and configuration-scoped relationships to complete export ordering and checksums.
- Preserve configuration IDs, ancestry, lifecycle, current selection, scopes, evidence links, archived-device references, and conductor states on import.
- Importing a pre-configuration Circuit Atlas manifest synthesizes one baseline current configuration and associates its topology exactly once.
- Merge imports preserve the destination’s single-current invariant. An incoming current configuration is imported as planned when the destination already has a current configuration unless the user explicitly chooses activation after preview.
- Import preview reports configuration counts/status remapping without exposing smart-device secrets.
- Keep authentication, setup-code masking, private attachments, and property isolation unchanged.

Likely files:

- `circuit-atlas/db/repositories/portability.ts`
- import/export API and settings UI
- portability and privacy tests

## 8. Verification

Run throughout implementation from `circuit-atlas/`:

- focused schema, repository, topology, route, component, and Playwright tests;
- `npm run lint`;
- `npx tsc --noEmit`;
- `npm test`;
- `npm run test:e2e` on isolated data and ports.

Required end-to-end scenarios:

1. Root route with zero, one, and multiple properties at desktop and phone widths, including a representative Home Assistant ingress prefix.
2. Property cards with long fictional names/addresses and wide counts; bounding boxes prove “Open atlas” and Assets do not overlap.
3. Existing `0.2.1` topology migrates into a baseline current configuration without row loss or changed trace results.
4. A conventional four-switch multi-way graph is cloned to planned smart/aux wiring; current traces remain unchanged until activation.
5. Obsolete traveler conductors are capped/spare in current while retaining traveler connections historically.
6. Historical configuration mutation is rejected; cloning it creates an editable planned reversion.
7. Activation atomically changes the default graph and retains the displaced configuration as historical.
8. Desktop and phone users can select, inspect, compare, and activate configurations with fictional data only.
9. Complete export/import preserves all configurations and which one is current.
10. Home Assistant Ingress, Cloudflare Access failure boundaries, smart-device secret masking, and existing property data remain intact.

Manual verification will use fictional topology only. It will confirm that non-current diagrams cannot be mistaken for current wiring and that activation language remains documentation-focused.

Verification completed 2026-08-24. Lint, TypeScript, 126 unit/component tests, 10 schema tests, 9 gateway tests, the production build and rendered-route tests, and 12 desktop/mobile Playwright scenarios pass. The migration suite includes populated `0.2.1` conductor topology; repository coverage proves clone/independent edit/compare/activation and historical immutability; browser coverage proves ingress navigation and non-overlapping property-card statistics/action layout.

## 9. Risks and mitigations

- **Silent current/historical mixing:** centralize configuration resolution and require every topology repository test to prove default-current behavior.
- **Migration data loss:** test against a populated `0.2.1` fixture and compare identities/trace output before and after migration.
- **Clone cost:** copy only configuration-specific relationship rows in one transaction; retain shared physical records and add indexes for household-scale graphs.
- **Partial activation:** use one transaction with expected-current and revision guards.
- **Archived-device filtering:** configuration loaders follow explicit historical relationships rather than global active lifecycle filters.
- **URL/context loss:** include configuration ID in supported wiring/box links and default safely to current when absent or invalid.
- **Ingress redirect regression:** exercise root and prefixed paths in gateway/rendered/Playwright coverage.
- **Large PR:** implement in the checkpoints above, keep commits phase-oriented, and run the full suite after schema/repository work and again before source-control approval.

## 10. Non-goals

- Automatically discovering wiring or switch changes from Home Assistant/Zigbee devices
- Treating activation as proof that electrical work occurred or is safe
- Live energized-state simulation
- Restoring database records by deleting the current configuration
- Duplicating physical cables/conductors for every configuration
- Publishing, merging, releasing, or deploying without the later SDD approvals
