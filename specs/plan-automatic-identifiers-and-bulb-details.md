# Circuit Atlas — Automatic Identifiers and Bulb Details Implementation Plan

Status: Implemented and verified
Branch: `sdd/automatic-location-codes`
Date: 2026-08-23
Companions: `specs/product-spec.md`, `specs/domain-model.md`

## 1. Scope

This change implements two approved product amendments:

1. Circuit Atlas generates stable internal codes for structures, levels, spaces, and wall/zones without asking the user to name or edit them. Ordinary UI also hides administrative property and upgrade-item codes while retaining useful electrical and topology identifiers.
2. Each installed bulb or integrated light engine can store structured actual/equivalent wattage, lumens, fixed or ranged color-temperature values, color capability, and dimmability in addition to its existing smart/product details.

The change remains property-neutral. It does not seed location names, bulb products, identifiers, or other house-specific information.

## 2. Identifier behavior

### 2.1 Server-generated spatial codes

- Remove `code` from ordinary location create and update request schemas.
- Allocate codes on the server with property-scoped prefixes: `STR`, `LVL`, `SPC`, and `WZN`.
- Reuse the transactional property code counter and skip any value already present in the destination table. This makes allocation safe when older or imported records contain codes that were not reserved through the counter.
- Use a property-wide sequence for each location kind even where the existing database uniqueness constraint is parent-scoped. This is deliberately stricter and makes diagnostics and imports less ambiguous without changing the relational keys.
- Treat codes as immutable in ordinary repository updates. Renaming, reordering, moving, or archiving a location does not alter its code.
- Keep codes in compatibility API records and complete exports, but do not expose them in ordinary UI view models.

Likely files:

- `circuit-atlas/app/api/p/[propertyId]/locations/[kind]/route.ts`
- `circuit-atlas/app/api/p/[propertyId]/locations/[kind]/[id]/route.ts`
- `circuit-atlas/db/repositories/core.ts`
- focused repository and route tests

### 2.2 UI visibility

- Remove structure, level, and space code inputs, helper copy, hierarchy labels, and code suffixes in parent selectors.
- Add the currently missing wall/zone setup form with space, name, optional orientation, and notes fields; its internal code is generated and never requested or displayed.
- Show wall/zone names and optional orientation under their space in the hierarchy rather than showing only a count or an internal code.
- Remove spatial code matching/display from global search. Search locations by human name, hierarchy, and notes.
- Hide `PROP-…` from property cards and settings and hide `UPG-…` from ordinary upgrade inspectors.
- Continue showing generated permanent codes for panels, breakers, circuits, boxes, installed devices, fixtures, appliances, cables, conductors, light sources, and control groups. Those codes remain useful for physical labels, diagrams, trace results, and disambiguation.
- Do not change the masking or entry behavior of smart-device setup/pairing/install codes; those are credentials, not record identifiers.

Likely files:

- `circuit-atlas/app/p/[propertyId]/settings/settings-client.tsx`
- `circuit-atlas/app/properties/property-onboarding.tsx`
- `circuit-atlas/app/p/[propertyId]/record-inspector.tsx`
- `circuit-atlas/app/p/[propertyId]/property-app-shell.tsx`
- `circuit-atlas/db/repositories/view-models.ts`
- settings, search, onboarding, and inspector component tests

### 2.3 Export and import

- Preserve valid spatial codes in complete exports and same-record merges.
- Before applying an imported create, compare its spatial code with destination records in the applicable uniqueness scope.
- If a different destination record already owns that code, allocate a new internal code for the incoming record. UUID-based parent and asset relationships remain unchanged because no relationship uses the spatial code as a foreign key.
- Ensure future server-generated codes skip codes preserved from imports even if an imported counter is absent or stale.
- Keep property import behavior that assigns a destination-owned `PROP-…` administrative code.

Likely files:

- `circuit-atlas/db/repositories/portability.ts`
- `circuit-atlas/lib/import-export/*` only if preview metadata needs to report a non-blocking remap
- portability and import/export tests

## 3. Structured bulb specifications

### 3.1 Storage

Retain the existing `light_sources.watts`, `lumens`, and `color_temperature_kelvin` columns as actual watts, lumen output, and fixed/nominal kelvin. Add nullable columns for:

- `equivalent_watts` (non-negative decimal);
- `color_temperature_min_kelvin` (positive integer);
- `color_temperature_max_kelvin` (positive integer);
- `color_capability` (`fixed_white`, `tunable_white`, `full_color`, `custom`, or null/unknown);
- `dimmable` (nullable boolean so unknown is distinct from false).

Add database checks for numeric bounds and `max >= min` when both temperature bounds are present. Use a new additive Drizzle migration so an existing Home Assistant installation can upgrade safely; existing single-temperature and wattage data remain valid.

Likely files:

- `circuit-atlas/db/schema.ts`
- a new generated file under `circuit-atlas/drizzle/` and its metadata
- `circuit-atlas/tests/schema/migration.test.mjs`

### 3.2 API and persistence mapping

- Replace the ambiguous free-text `colorTemperature` request property with nullable numeric `colorTemperatureKelvin`, `colorTemperatureMinKelvin`, and `colorTemperatureMaxKelvin` properties.
- Add nullable `equivalentWattage`, `colorCapability`, and `dimmable` properties while keeping existing `wattage` as actual wattage for API compatibility.
- Validate all numeric values, permit either supported-temperature bound to be unknown, and reject an inverted complete range.
- Persist and return these fields directly on each light-source record. Stop using installed-product capability JSON as the authoritative store for dimmability, while leaving unrelated protocol/ecosystem capabilities intact.
- Complete export/import picks up the additive table columns without introducing house-specific transformation logic.

Likely files:

- `circuit-atlas/app/api/p/[propertyId]/assets/_schema.ts`
- `circuit-atlas/db/repositories/aggregates.ts`
- `circuit-atlas/db/repositories/view-models.ts`
- aggregate, validation, and portability tests

### 3.3 Fixture editor

- Keep one card per lamp holder or integrated engine.
- Label the two power fields explicitly as “Actual wattage” and “Wattage equivalent.”
- Use number inputs with visible units for lumens and kelvin rather than a free-text temperature field.
- Provide optional fixed/nominal, minimum, and maximum kelvin fields so fixed, tunable, and partially observed bulbs remain representable.
- Add a color-capability selector and a three-state dimmability control (`Unknown`, `Yes`, `No`).
- Retain smart state, source type, base/socket, shape, technology, manufacturer/model, protocol/ecosystem, identifiers, and secret setup details for each bulb.
- Preserve every neighboring holder record when one bulb is edited or replaced.

Likely files:

- `circuit-atlas/features/inventory/types.ts`
- `circuit-atlas/features/inventory/AssetEditor.tsx`
- `circuit-atlas/app/p/[propertyId]/inventory/inventory-client.tsx`
- inventory component and route tests

## 4. Verification

Automated coverage will verify:

1. Structure, level, space, and wall/zone creation succeeds without a client-supplied code.
2. Generated spatial codes are stable, immutable, and non-conflicting under repeated and concurrent allocation.
3. Imported preserved codes do not break later allocation, and a merge collision is remapped without changing UUID relationships.
4. Location codes, property codes, and upgrade-item codes are absent from ordinary rendered views and global search results.
5. Useful electrical, asset, cable, and conductor codes remain visible where they aid selection and tracing.
6. A fixture can round-trip mixed conventional and smart bulbs with actual watts, equivalent watts, lumens, fixed kelvin, tunable kelvin bounds, color capability, and dimmability.
7. Unknown/partial bulb values save successfully, while negative measurements or an inverted complete kelvin range are rejected.
8. Export/import preserves all new light-source values.
9. Existing smart-device secret masking and property/authentication boundaries remain unchanged.

Run from `circuit-atlas/`:

- `npm run lint`
- focused Vitest and schema tests during implementation
- `npm test`
- `npm run test:e2e` for the affected setup/inventory flows

Manually verify the location setup and fixture editor at desktop and phone widths using fictional data only. Confirm that labels clearly distinguish actual versus equivalent wattage and that no hidden identifier is needed to complete a workflow.

Verification completed 2026-08-23: lint, the full unit/schema/gateway/build/rendered-HTML suite, and all eight desktop/mobile end-to-end checks passed. The in-app browser could not open the isolated port for an additional visual pass, so the responsive verification used the approved Playwright desktop and phone projects.

## 5. Non-goals

- Automatically identifying a bulb from a scanned barcode or network discovery
- Live synchronization with Hue, Home Assistant, or another device registry
- Inferring lumens, equivalent wattage, or color-temperature range from manufacturer/model
- Tracking live power consumption or current color temperature
- Hiding permanent identifiers that support physical electrical labeling and conductor traceability
- Changing Home Assistant ingress or Cloudflare Access authentication
- Publishing, releasing, or deploying as part of implementation without separate approval
