# Circuit Atlas — Implementation Plan

Status: Implementation and local verification complete; private publication pending approval
Branch: `sdd/electrical-system-map`
Approved inputs: `specs/product-spec.md`, `specs/domain-model.md`
Date: 2026-08-13
Verified: 2026-08-20

Deployment follow-up: ChatGPT Sites publication is superseded by the approved Home Assistant App specification and the proposed `specs/plan-home-assistant-app.md`. This document remains the verified record of the original product implementation; it is not the active deployment plan.

Verification evidence: strict TypeScript and lint checks pass; 112 unit/component tests and seven clean-schema integrity tests pass; desktop/mobile browser checks pass; the production Cloudflare Worker build server-renders successfully; the dependency audit reports no known production vulnerabilities. Local workflow verification also covered property setup, panels/breakers/circuits, mixed smart/dumb light sources, bidirectional breaker lookup, resumable capture materialization, box terminations with exact conductor A/B ends, revision conflicts and idempotent retries, private floor-plan upload and placement, upgrade editing, expanded global search, export/import preview plus confirmed merge, and smart-device identifiers/commissioning details for both an asset and an individual bulb.

## 1. Delivery outcome

Build and publish the first complete private version of Circuit Atlas as a responsive web application. The delivered version will support multiple independent properties, durable structured records, private floor plans/photos, breaker-first and asset-first lookup, conductor-level topology, arbitrary multi-way switching, gang-box diagrams, floor-plan placement, smart-device planning, and versioned export/import.

Implementation proceeds in vertical slices. Each slice leaves the application buildable and adds automated coverage before later diagram views depend on it.

## 2. Technical architecture

### Runtime

- Keep the initialized React 19, Next-compatible App Router, vinext, and Cloudflare Worker structure.
- Deploy through Sites as a private application after the production build and verification pass.
- Use server-rendered route shells and initial data. Use focused client components for diagrams, editors, autosave, floor-plan interaction, and synchronized selection.
- Use TypeScript in strict mode throughout.

### Persistence

- Enable D1 as logical binding `DB` for all structured records.
- Enable R2 as logical binding `FILES` for floor-plan originals/previews, evidence photos, and export bundles.
- Keep browser storage limited to non-authoritative UI preferences and crash-recovery drafts. Successful edits always persist through the server.
- Generate Drizzle SQL migrations, inspect them, apply them to isolated local D1 storage, and save them with the source.

### Identity and property isolation

- Use the hosting platform's authenticated-user headers as the private workspace identity; do not add a separate password system.
- Centralize identity lookup in `lib/auth/identity.ts`. Production requests without the required identity fail closed. An explicitly development-only local identity supports local preview and tests.
- Map each authenticated owner to a workspace. A workspace can own several properties.
- Put `property_id` on all property-owned tables, even when it is transitively derivable.
- Use composite foreign keys/uniqueness constraints where practical and mandatory repository guards everywhere else so a relationship cannot cross properties.
- Require property scope in every repository/query function. There will be no implicit default property in the data layer.
- Use globally unique internal UUIDs plus immutable, property-scoped display codes generated from property counters.

### Request and mutation boundary

- Use property-scoped route handlers under `/api/p/[propertyId]/...` and workspace routes under `/api/properties/...`.
- Validate all request bodies, route parameters, enum values, file metadata, and imported documents with shared Zod schemas.
- Return purpose-built view models rather than raw database rows.
- Mutations include a record revision. A stale revision returns a conflict response instead of overwriting newer data.
- Autosave uses a serialized client queue with request IDs; responses identify `saving`, `saved`, `retryable failure`, or `conflict`.
- Create/update/archive operations append a compact change event. Permanent deletion is not exposed in the initial UI.

### Diagram model

- Electrical truth remains in terminals, nodes, conductor ends, and internal contacts. Canvas positions and rendered edges are presentation data only.
- Use a client-only `@xyflow/react` surface for topology/termination interaction after an early vinext production-build compatibility spike.
- Use `elkjs` for deterministic, port-aware automatic layout. Move layout into a web worker if the representative large-house test crosses the responsiveness threshold.
- Use custom accessible SVG for gang-box geometry and an image/PDF background plus SVG overlay for floor plans.
- Every visual diagram has a keyboard-navigable tree/table and plain-language trace summary containing the same information.

### User interface state

- Keep the selected record, active floor, breaker filter, and other shareable filters in URL parameters.
- Use server data for authoritative state and local reducers for active editing/undo.
- Do not introduce a global client state library unless mutation/selection tests demonstrate a need.

## 3. Planned dependencies

Add only after the relevant compatibility spike succeeds:

- `zod`, `react-hook-form`, and `@hookform/resolvers` for shared validation and nested forms;
- `react-aria-components` for accessible dialogs, menus, tabs, comboboxes, and focus handling;
- `lucide-react` for generic interface icons;
- `@xyflow/react` for topology and termination canvases;
- `elkjs` for diagram layout;
- `pdfjs-dist` as a client-only PDF floor-plan renderer;
- Vitest, Testing Library, `jest-axe`, and Playwright for unit, component, accessibility, and end-to-end tests.

If a proposed diagram or PDF library cannot build in the Cloudflare/vinext environment, keep the approved behavior and replace only the rendering adapter; do not change the domain model.

## 4. Repository layout

The implementation will organize code by stable domain boundaries rather than by a particular house:

```text
app/
  page.tsx
  properties/
  p/[propertyId]/
    layout.tsx
    map/
    circuits/
    inventory/
    wiring/
    boxes/[boxId]/
    upgrades/
    capture/[draftId]/
    settings/
  api/
    properties/
    p/[propertyId]/
      assets/
      circuits/
      boxes/
      topology/
      floor-plans/
      files/
      upgrades/
      export/
      import/
components/
  app-shell/
  inspector/
  search/
  ui/
features/
  properties/
  circuits/
  inventory/
  map/
  boxes/
  wiring/
  capture/
  upgrades/
db/
  schema/
  repositories/
  migrations.ts
lib/
  auth/
  domain/
  ids/
  topology/
  validation/
  view-models/
  files/
  import-export/
tests/
  fixtures/
  unit/
  integration/
  components/
  e2e/
```

Route files stay thin. Database access, topology rules, validation, and view-model construction live in independently testable modules.

## 5. Database and migration plan

The first migration will establish these table groups. Exact columns use snake case in SQLite and inferred TypeScript types in the application.

### Workspace and location

- `workspaces`, `properties`, `property_code_counters`
- `structures`, `levels`, `spaces`, `wall_zones`
- `floor_plans`, `plan_placements`

### Assets and products

- `assets`, `asset_aliases`, `asset_locations`
- `product_models`, `installed_products`
- `devices`, `fixtures`, `appliances`, `light_sources`
- `asset_functions`, `lamp_holders`, `plug_connections`

### Panels and circuits

- `panels`, `panel_positions`
- `breakers`, `breaker_poles`
- `circuits`, `circuit_sources`
- `shared_neutral_groups`, `shared_neutral_members`
- `panel_feeders`

### Boxes and cabling

- `boxes`, `box_ports`, `asset_mounts`
- `cables`, `cable_ends`
- `conductors`, `conductor_ends`

### Electrical graph and control

- `electrical_nodes`, `terminals`, `splices`, `open_endpoints`, `bond_points`
- `internal_connections`, including contact-state group and state metadata
- `asset_circuit_assertions`, `trace_gaps`
- `control_groups`, `control_members`, `control_links`

### Evidence, planning, and history

- `evidence`, `evidence_links`, `attachments`
- `upgrade_items`, `upgrade_requirements`, `upgrade_observations`, `proposed_products`
- `capture_drafts`, `change_events`, `property_revisions`

### Schema rules

- Use database checks for valid end designations, normalized positions, positive counts, gang spans, and closed enum domains where SQLite/Drizzle support remains maintainable.
- Use unique constraints for property-scoped permanent codes, panel positions/subpositions, cable/conductor end slots, mounted gang occupancy, and asset-function keys.
- Use restrictive foreign keys for electrical truth and archival state instead of cascading deletion through topology.
- Add indexes only for planned query paths: workspace properties; property asset code/name/kind; room inventory; panel positions; circuit sources; box contents; both conductor-end directions; node terminals; control membership; upgrade status; attachment ownership; and change history.
- Run representative `EXPLAIN QUERY PLAN` checks and `PRAGMA optimize` after migrations.
- Keep graph-derived circuit results reproducible. Begin with request-time computation keyed by `property_revisions.topology_revision`; add a D1 result cache only if the large-house performance fixture demonstrates a need.

## 6. Pure domain services

Implement these before diagram UI so behavior is testable without a browser.

### IDs and naming

- Generate UUIDs and transactional/retry-safe property code sequences.
- Keep location-based locator labels editable and aliases searchable.
- Provide generic configurable naming defaults only; no runtime seed contains a real house, room, or panel.

### Preset expansion

- Convert an editable generic preset into functions, terminals, nodes, and internal connections.
- Initial presets cover single-pole, multi-way endpoint, repeatable crossover/intermediate, ordinary/split duplex, GFCI line/load, smart switch/dimmer, smart companion/aux, wireless controller, relay, simple/multi-lamp fixture, fan/light, integrated LED, and splice-only box.
- Presets never infer conductor function from color and never encode a controller-count maximum.

### Topology validation

- Separate blocking structural failures from saveable warnings.
- Enforce two ends per cable/conductor, one node per conductor end, box containment, gang occupancy, property boundaries, and non-branching cables.
- Warn about conductor-count/gauge discrepancies, conflicting sources, incomplete arbitrary multi-way patterns, circuit-assertion conflicts, and missing documented smart-device prerequisites.

### Graph traversal

- Build a typed adjacency graph from conductors, electrical nodes, terminal ownership, and device-internal connections.
- Support focused traversal from a breaker pole, circuit, asset function, box, cable, conductor, or node.
- For supply reachability, traverse conductors, common splices, fixed feed-throughs, and the union of valid conditional contact states.
- Stop at load impedance, isolation/transformer, electronic signal boundaries, and equipment-ground/bond networks.
- Track roots, predecessors, relationship kind, certainty, and explicit trace gaps so results are explainable.
- Aggregate graph results to assets without forcing a single breaker; preserve zero, one, or multiple sources.
- Merge graph-derived results with manual assertions without overwriting either and report conflicts.
- Represent arbitrary multi-way systems as repeatable endpoint/intermediate contact graphs. The traversal implementation contains no branch on switch count.

### Upgrade readiness

- Calculate a factual checklist from documented observations and product requirements.
- Return `known`, `missing`, or `conflicting`; never return an electrical-safety or compatibility guarantee.

### Import and export

- Define a versioned JSON manifest with stable IDs, records, relationships, attachment metadata, checksums, and schema version.
- Export one property at a time with an optional downloadable archive containing private assets.
- Validate imports in memory first, show counts/warnings/conflicts, then add or merge after explicit confirmation.
- Never create cross-property links or replace an existing property destructively.

## 7. Implementation phases

### Phase 0 — Platform and library spikes

1. Enable local D1/R2 bindings and confirm a minimal authenticated, property-scoped read/write flow.
2. Prove the chosen topology canvas, automatic layout, and PDF renderer load client-side and pass a production build.
3. Establish test commands, isolated test data, and accessibility checks.

Checkpoint: production build succeeds with each critical runtime dependency; no product schema is shaped around an incompatible library.

### Phase 1 — Foundation and reusable property shell

1. Replace and remove the starter preview and its dependency/metadata.
2. Add product metadata, responsive design tokens, accessible primitives, global search shell, desktop/mobile navigation, and error/empty/loading states.
3. Implement authenticated workspace creation, property onboarding, property selector, rename/archive, and property-scoped routing.
4. Create the first migration for workspace/property/location/code-counter records and the migration runner.
5. Add fictional data only under isolated test fixtures; production starts with onboarding and an empty database.

Checkpoint: two unrelated test properties can coexist, URLs and queries remain property-scoped, and switching properties clears selection/filter state.

### Phase 2 — Spatial inventory, panels, and product details

1. Add structures, levels, spaces, walls/zones, stable asset identities, aliases, and location editing.
2. Add panels, positions, tandem/multi-pole breakers, circuits, sources, shared-neutral metadata, and subpanel feeders.
3. Add boxes, mounted devices/functions, fixtures, appliances, lamp holders/light sources, and installed product details.
4. Add search, inventory filters, common inspector, evidence status, archival, and change history.
5. Implement manual asset-to-circuit assertions so useful breaker/device lookup works before every conductor is traced.

Checkpoint: breaker-first and asset-first lookup answer both primary questions from explicit assertions on phone and desktop, including split receptacles and multi-pole sources.

### Phase 3 — Cable, conductor, and control graph

1. Add cables with wiring method, raw jacket marking, insulated-conductor count, equipment-ground count, two endpoints, and optional gauge; add individual conductors, terminals, splices, open endpoints, bonds, pigtails, jumpers, and internal device contacts.
2. Add generic presets and editable terminal/contact definitions.
3. Add many-to-many control groups and explicit physical, switched, aux, wireless, app, scene, and automation methods.
4. Implement hard validation, warnings, evidence, topology revisioning, graph traversal, explainable paths, unresolved gaps, and assertion conflicts.
5. Connect graph-derived results to breaker and asset inspectors.

Checkpoint: all topology fixtures pass, including two-, three-, four-, and six-controller multi-way systems generated by the same algorithm; there is no maximum controller count in schema, validation, traversal, or UI.

### Phase 4 — Box diagrams and mobile room-walk capture

1. Implement the gang-box physical-layout SVG with standardized orientation, gangs, device spans, cable sides/offsets, and back entries.
2. Implement the termination editor and synchronized textual form for conductor endpoints, terminals, splices, caps/open ends, bonds, and unknowns.
3. Implement a resumable mobile capture wizard with photos, autosave state, ordered mutations, crash recovery, review warnings, and concise safety language.
4. Add local undo/redo for active diagram sessions and revision-conflict recovery.

Checkpoint: a multi-gang, multi-circuit box with multiple entries on one side, pigtails, a splice, and an unknown conductor can be saved, reopened, edited on desktop, and reviewed on a phone.

### Phase 5 — Wiring visualization

1. Implement focused topology canvas, automatic layout, expansion controls, relationship legend, gaps, confidence, and conflicts.
2. Implement synchronized trace tree/table and plain-language path summary.
3. Add source breaker, asset, box, cable, conductor, and node entry points.
4. Bound initial rendering to the focused trace; offer progressive expansion for dense properties.

Checkpoint: every visual path has an equivalent textual path, and arbitrary multi-way fixtures remain understandable without conflating possible switch state with energized state.

### Phase 6 — Floor plans and private files

1. Add authenticated multipart upload, MIME/signature checks, size limits, sanitized names, opaque R2 keys, private streaming/download routes, and attachment metadata.
2. Support image backgrounds and client-rendered PDF pages with accessible descriptions.
3. Add normalized placements, pan/zoom/fit, drag plus keyboard/numeric positioning, rotation, filters, breaker highlights, and selection synchronization.
4. Add an optional dashed topology overlay carrying the persistent label `Connection only — concealed route unknown`.
5. Add background-replacement preview and explicit preserve/remap confirmation.

Checkpoint: uploaded plans/photos are inaccessible without the owning workspace/property context, and map/list/circuit selection remains synchronized across viewport sizes.

### Phase 7 — Smart-upgrade planning

1. Add current smart/dumb capabilities for switches, controllers, receptacles, fixtures, bulbs/light engines, and appliances.
2. Add upgrade workflow/status, product candidates, factual requirements, evidence, and readiness summaries.
3. Add dedicated replacement flow that archives the prior installed product while preserving the box, conductors, aliases, evidence, and history.
4. Add upgrade filters to inventory and floor plans.

Checkpoint: a dumb switch plus smart bulbs, a wired smart switch, and an aux/wireless companion are modeled independently; planned state never changes current topology until installation is recorded.

### Phase 8 — Portability and hardening

1. Implement versioned property JSON export, optional attachment archive, import preview, add/merge behavior, and checksums.
2. Complete responsive, keyboard, reduced-motion, screen-reader, error/retry, loading, empty, and conflict states.
3. Run large-property performance checks and add a graph-result cache or worker layout only if measurements justify them.
4. Replace starter README content with product setup, data model, migration, backup, and safety documentation.
5. Update the approved specs if implementation details materially change while preserving behavior.

Checkpoint: an exported fictional property imports as an independent property and produces equivalent lookup and topology results with no source-code changes.

### Phase 9 — Final verification and publishing

1. Run schema/migration, type, lint, unit, integration, component, accessibility, end-to-end, and production-build checks.
2. Test phone, tablet, and desktop layouts plus keyboard-only flows.
3. Verify no real property data, secret, upload, local database, or generated export is tracked in source control or bundled into the client.
4. Create a generic Circuit Atlas social-preview image containing no property data, validate its text, and wire the site metadata.
5. Publish the private site, smoke-test onboarding and authenticated storage, then stop the development process.

Checkpoint: return the private deployed URL, test summary, any deliberately deferred limitations, and the next source-control approval step.

## 8. Verification matrix

### Unit tests

- ID generation, aliases, and property scoping
- hard validation versus warnings
- preset expansion
- graph adjacency and stop rules
- source aggregation and conflict merging
- arbitrary multi-way generation/traversal for 2, 3, 4, 6, and parameterized larger controller counts
- readiness checklist logic
- import schema, relationship validation, and checksum handling
- diagram adapters remain pure and never create electrical facts

### Database/integration tests

- migrations apply from empty storage and reject invalid foreign relationships
- composite property boundaries prevent cross-property connections
- concurrency/revision conflicts do not lose newer edits
- archive/replace preserves referenced topology and history
- optional gauge accepts null while end/cardinality invariants remain enforced
- breaker-first and asset-first repository queries return correct multi-source results
- R2 authorization blocks another workspace/property and anonymous production access
- export/import round trip retains IDs, relationships, evidence, and attachment references
- representative indexes are used by their intended query plans

### Component and accessibility tests

- property switcher, navigation, search, inspector, dialogs, tabs, forms, and status badges
- incomplete records and unknown values remain saveable
- conductor color and function remain independent controls
- diagrams mirror their content into a navigable text/tree representation
- focus management, live save announcements, non-color status cues, and reduced motion
- floor-plan placement has keyboard and numeric alternatives to dragging

### End-to-end scenarios

- first-run property onboarding and a second independent property
- simple breaker → switch → fixture
- source-at-fixture switch loop with reidentified white conductor
- arbitrary multi-way control with 2, 3, 4, and 6 controllers
- multiple controllers and multiple parallel fixtures
- multi-circuit gang box
- split/half-switched duplex receptacle
- GFCI line/load feed-through
- fan/light with separate switched conductors
- smart bulbs with constant power, wireless control, and physical cutoff
- smart aux/companion wire distinct from travelers
- shared-neutral branch circuit and multi-pole/subpanel source
- abandoned conductor and unknown endpoint
- fixture with mixed bulbs and integrated LED
- assertion versus graph conflict
- floor-plan selection/filter synchronization
- device replacement preserving history
- full property export/import round trip

### Manual checks

- camera/photo capture on a phone-sized viewport
- dense termination editing on a tablet/desktop
- keyboard-only lookup, editing, diagram navigation, and placement
- screen-reader labels and path summaries
- private file access and unsafe direct-link behavior
- all safety copy avoids implying de-energization or code compliance

## 9. Risks and mitigations

- **Domain breadth and migration churn:** establish the full normalized identity/connectivity spine early, then add feature-specific fields in later migrations; keep specs current.
- **Dense conductor diagrams:** start focused, expand progressively, provide a text trace, and measure before adding caching/worker complexity.
- **Arbitrary multi-way correctness:** generate parameterized fixtures and test the generic contact graph rather than maintaining switch-count-specific code paths.
- **Incomplete real-world knowledge:** unknown endpoints and warnings are first-class; only impossible structure blocks saving.
- **Autosave races:** serialize mutations and require revision tokens; expose conflict recovery instead of last-write-wins.
- **Cross-property leakage:** property-scoped URLs are convenience only; composite ownership checks are mandatory in the database/repository layer and file routes.
- **Mobile diagram limitations:** all data remains editable through structured forms/lists; canvas manipulation is an enhancement.
- **Floor-plan ambiguity:** normalized placements are positions only; topology overlays are visibly schematic and no route geometry is persisted.
- **Private upload exposure:** use opaque keys and authenticated streaming; never emit public bucket URLs.
- **Runtime incompatibility:** complete React Flow, ELK, and PDF build spikes before depending on them.
- **Electrical interpretation risk:** keep color separate from role, preserve provenance/conflicts, and avoid compatibility/safety conclusions.

## 10. Pause conditions during implementation

The approved plan authorizes normal implementation and private publishing. Pause and return for direction only if:

- Sites cannot provide the required private access or storage bindings;
- a required library cannot be replaced without changing an approved user-visible behavior;
- the implementation reveals a domain-model contradiction that would lose or misrepresent electrical information;
- a migration would need to destroy existing user data;
- credentials, hardware, or an external electrical interpretation are required.

## 11. Smart-device metadata extension plan

This extension implements the approved smart-device identity and commissioning behavior without adding house-specific code or changing electrical topology. No new runtime dependency is expected.

### 11.1 Initial schema update

The software is not yet in use and has no production data to preserve. This extension changes the initial schema directly; it does not add an upgrade migration, data backfill, or compatibility path for an older deployed database. Disposable local/test databases may be rebuilt from the updated baseline.

1. Add nullable `hardware_revision` and `firmware_version` fields to the baseline `installed_products` definition.
2. Add `installed_device_details` with property scope, installed-product ownership, canonical/custom kind, label, exact value, optional normalized value, sensitivity (`ordinary`, `identifier`, or `secret`), notes, verification state/date, lifecycle state, optimistic revision, and timestamps.
3. Add composite property/owner foreign keys, enum/check constraints, an installed-product lookup index, and a normalized-identifier index used only for non-secret duplicate detection and authenticated search.
4. Update the existing initial database artifacts and verify that a clean database is created successfully with all constraints and indexes.

Likely files: `db/schema.ts`, the existing initial Drizzle SQL/metadata, and clean-schema integrity tests.

### 11.2 Validation and reusable detail catalog

1. Define shared types and Zod contracts for installed-product fields and repeatable device details.
2. Provide canonical kinds for MAC, Zigbee IEEE/EUI-64, Matter device/node ID, manufacturer/ecosystem ID, setup/pairing/install code, onboarding/QR payload, hub/bridge, ecosystem name, and custom values.
3. Add pure normalization/format-warning helpers that preserve exact input, normalize recognized identifiers only for comparison, and never reject unfamiliar vendor formats.
4. Add reusable suggestion rules based on recorded manufacturer and protocol. Hue and Inovelli suggestions are convenience metadata only; users can add, rename, remove, or classify any custom field.
5. Default known setup/onboarding kinds to secret while allowing the user to classify custom values explicitly.

Likely files: `features/inventory/types.ts`, a focused module under `lib/device-details/`, `app/api/p/[propertyId]/assets/_schema.ts`, and unit tests.

### 11.3 Persistence and API boundaries

1. Extend aggregate create/update persistence for hardware revision, firmware version, and device-detail collections on both top-level assets and individual fixture light sources.
2. Change ordinary installed-product edits to update the active instance in place. Preserve the existing archive-and-replace behavior only for an explicit replacement action so identifiers never become detached during routine edits.
3. Preserve stable detail IDs where supplied, create new rows where needed, and archive removed details under the parent asset revision guard. Mutations must not echo secret values or place them in change-event summaries.
4. Add an authenticated, property-scoped detail read for the editor. Inventory, circuit, topology, map, search, and other summary responses expose at most safe detail counts/labels and never secret values.
5. Extend authenticated search to non-secret identifiers using their normalized/display values. Setup codes and user-marked secrets remain unsearchable.

Likely files: `db/repositories/aggregates.ts`, `db/repositories/view-models.ts`, a focused device-detail repository, `app/api/p/[propertyId]/assets/[id]/device-details/route.ts`, asset routes, search query code, and route/repository tests.

### 11.4 Inventory editing experience

1. Add hardware revision and firmware fields to installed-product editing.
2. Add a repeatable “Device identifiers & setup details” editor for switches, receptacles, relays/controllers, fixtures, light sources, appliances, hubs/bridges, and custom smart devices.
3. Show suggested Hue and Inovelli fields when relevant while retaining a vendor-neutral “Add custom detail” path.
4. Render secret values as masked by default with explicit accessible reveal/hide and copy controls; do not put values in URL state or browser persistence.
5. Load exact values only after an authenticated edit-detail request. Show independent loading/error states without blocking the safe inventory list, and keep unsaved values in memory only.
6. Support the same per-unit detail editor inside each fixture light-source card so every Hue bulb can have its own MAC, setup code, Matter ID, and product information.

Likely files: `features/inventory/AssetEditor.tsx`, `features/inventory/types.ts`, inventory styles/components, `app/p/[propertyId]/inventory/inventory-client.tsx`, and component tests.

### 11.5 Portability, privacy, and compatibility

1. Add `installed_device_details` to property export/import ordering after `installed_products`. No compatibility reader for a previously deployed smart-detail schema is needed because the software has not been used.
2. Preserve secrets in complete authenticated exports and imports, and add a clear warning in the export UI that the downloaded backup contains commissioning credentials.
3. Verify that export previews display counts, not secret values, and that rejected imports never leak values through error messages.
4. Audit search results, asset list responses, trace/map/circuit view models, errors, and logging paths to confirm setup codes and onboarding payloads are absent.

Likely files: `db/repositories/portability.ts`, settings export/import UI, import/export tests, and privacy-focused route tests.

### 11.6 Verification and completion

1. Unit-test canonical kinds, normalization, format warnings, sensitivity defaults, and suggestion behavior.
2. Test clean database creation, constraints, property isolation, duplicate warnings, optimistic conflicts, stable edit behavior, explicit replacement preservation, and light-source ownership.
3. Component-test custom fields, Hue/Inovelli suggestions, secret masking/reveal/copy, and per-bulb editing.
4. Test authenticated search exclusion/inclusion and complete export/import preservation without preview leakage.
5. Run the full type, lint, unit/component, clean-schema, production-build, and dependency-audit suite.
6. Manually verify desktop and phone inventory editing in the local browser with fictional Hue and Inovelli records; no real house or device identifiers enter source code or test fixtures.

Checkpoint: company/model/hardware/firmware plus arbitrary per-unit details round-trip for switches and bulbs; Hue and Inovelli identifiers are convenient to enter; secrets remain masked and out of all summary/search surfaces; replacement history and a complete private backup retain the correct values.

Extension verification completed 2026-08-20. A clean local database stored a fictional Hue-style setup code on a fixture and a separate MAC address on its bulb. The authenticated detail response returned both exact values; the ordinary inventory response returned neither; search found the non-secret MAC and returned no result for the setup code; a records-only export retained both detail records. Desktop and 390-pixel phone layouts showed no horizontal overflow, setup credentials remained password-masked, and Hue/Inovelli suggestion behavior passed automated component tests.

Source-control commit, push, pull request, merge, branch deletion, and release remain separately approval-gated under the SDD workflow.
