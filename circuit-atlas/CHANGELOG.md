# Changelog

## 0.3.0 - 2026-08-24

- Preserve current, planned, and historical wiring configurations so conventional multi-way wiring remains documented after smart-switch upgrades.
- Track every conductor end independently as connected, capped, spare, abandoned, repurposed, or unknown, with configuration-specific roles and terminations.
- Clone current or historical wiring into an editable plan, compare it with current wiring, and explicitly activate it without mutating prior history.
- Migrate existing properties into a baseline current configuration and include configuration history in private exports and imports.
- Open a sole property directly from the root route, retain the property chooser for multiple houses, and fix the property-card action/statistic overlap.

## 0.2.1 - 2026-08-23

- Fix primary action buttons whose labels could blend into their background until hover.
- Add desktop and mobile browser coverage for the affected settings actions and hover state.

## 0.2.0 - 2026-08-23

- Generate internal structure, level, space, and wall/zone identifiers automatically while keeping administrative codes out of ordinary workflows.
- Add wall/zone creation and preserve useful electrical identifiers for physical labeling and traceability.
- Record structured details for each bulb or integrated light engine, including wattage, equivalent wattage, lumens, color-temperature values or ranges, color capability, and dimmability.
- Preserve imported location relationships while safely remapping conflicting internal identifiers.

## 0.1.0 - 2026-08-22

- Initial Home Assistant App package for Home Assistant Yellow (`aarch64`).
- Store structured data in SQLite and private uploads in `/data`.
- Support authenticated Home Assistant Ingress at arbitrary ingress paths.
- Support direct Cloudflare Tunnel access verified with Cloudflare Access JWTs.
- Fail closed for unauthenticated direct access and strip forged identity headers.
