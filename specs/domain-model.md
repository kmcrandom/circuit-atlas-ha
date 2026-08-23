# Circuit Atlas — Domain Model

Status: Approved, including the Home Assistant App storage and Cloudflare Access identity amendments
Companion to: `specs/product-spec.md`
Implementation verified, including smart-device metadata: 2026-08-20
Approved amendment: automatic hidden identifiers and structured bulb specifications (`sdd/automatic-location-codes`, 2026-08-23)

## 1. Modeling approach

The electrical system is a graph stored in a relational database. Four relationship types remain deliberately separate:

1. **Physical containment** — a device is mounted in a box; a conductor belongs to a cable.
2. **Electrical continuity** — conductor ends meet terminals, splices, open ends, or bonds.
3. **Power/circuit membership** — breaker poles source circuits; assets may have asserted or graph-derived membership.
4. **Logical control** — controllers affect loads mechanically, by auxiliary wiring, wirelessly, through an app, scene, or automation.

No device has a single mandatory `breaker_id`. Circuit membership is expressed at source poles, electrical nodes, functions, and assertions so split receptacles, multi-pole loads, shared neutrals, multiple circuits in one box, and incomplete maps remain representable.

## 2. Entity groups

### 2.1 Workspace, property, and spatial entities

- `workspace`: private application owner and non-property-specific preferences
- `property`: independent house/site dataset, hidden application-generated administrative code, name, optional address, preferences, lifecycle state
- `structure`: house, detached garage, shed, addition, or other building; stable application-generated internal code and editable display name
- `level`: basement, floor, attic, exterior level, or custom; stable application-generated internal code and editable display name
- `space`: room, closet, hall, outdoor area, or custom nested area; stable application-generated internal code and editable display name
- `wall_zone`: optional named wall or sub-area within a space; stable application-generated internal code
- `floor_plan`: background asset, scale/calibration, orientation, revision
- `plan_placement`: asset anchor, normalized coordinates, rotation, optional wall/height

### 2.2 Identity and common asset metadata

- `asset`: stable UUID, immutable permanent code, kind, lifecycle state, display name, notes, timestamps
- `asset_alias`: prior or alternate human labels
- `asset_location`: structure/level/space/wall-zone relationship plus confidence/evidence
- `product_model`: manufacturer, model, category, documented capabilities and requirements shared by a product model
- `installed_product`: asset, product model or freeform manufacturer/model, serial number, hardware revision, firmware version, installed/removed dates
- `installed_device_detail`: installed-product instance, canonical or custom detail kind, display label, exact value, optional normalized comparison value, sensitivity, notes, and verification metadata
- `attachment`: private photo or document metadata and relationship to an asset, assertion, or evidence record

`installed_device_detail` holds facts belonging to one installed physical unit rather than to every unit of a product model. Linking it to the installed-product instance keeps the details with an archived/replaced unit even when the reusable asset location and wiring remain in service. Canonical kinds include MAC address, Zigbee IEEE/EUI-64, Matter device/node identifier, manufacturer/ecosystem device ID, setup/pairing/install code, onboarding/QR payload, hub/bridge association, ecosystem display name, and custom. The list is extensible without vendor-specific tables or house-specific code.

Sensitivity is explicit: `identifier` for addresses and IDs, `secret` for setup/install/onboarding credentials, and `ordinary` for non-sensitive installation details. Known setup-code and onboarding kinds default to `secret`, and a user can mark any custom value secret. Exact values are preserved; an optional normalized value supports duplicate warnings and authenticated lookup without replacing the observed text.

Panels, boxes, installed devices, fixtures, light sources, appliances, junction points, and cables have asset identities where the UI needs direct selection/history.

Every property-specific record is owned directly or transitively by one `property`. Cross-property foreign-key relationships are invalid. No property is created by a production migration; first-run onboarding or an explicit import creates it as data.

Spatial codes for structures, levels, spaces, and wall/zones are persistence identifiers, not user-facing locator labels. Normal create operations allocate them server-side using a collision-safe mechanism within the schema's uniqueness scope. Normal update operations cannot change them, and changing a display name, parent, or sort order does not regenerate them. Ordinary view models and search results omit them; complete export/import and compatibility API responses may retain them. Import preserves a valid non-conflicting code and remaps a collision belonging to a different stable record while maintaining relationships by UUID.

Property and upgrade-item permanent codes are administrative identifiers and are likewise omitted from ordinary user-facing view models while remaining stable in storage and complete exports. Permanent codes for electrical assets and topology records remain available to the user because they provide durable labels for field identification, diagrams, tracing, and disambiguation.

### 2.3 Panels, breakers, and circuits

- `panel`: asset subtype, main/subpanel role, voltage/system notes
- `panel_position`: panel, slot number, side/column, tandem subposition
- `breaker`: physical breaker assembly, label, rating, kind, AFCI/GFCI/dual-function flags
- `breaker_pole`: breaker, panel position, pole index, phase/leg, handle-tie relationship
- `circuit`: logical branch/feeder circuit, name, nominal voltage, purpose, lifecycle state
- `circuit_source`: circuit, breaker pole, leg/role
- `shared_neutral_group`: explicitly associates circuits/conductors where observed
- `panel_feeder`: upstream circuit and downstream panel

A breaker may occupy one or more panel positions and source one or more related circuit records. A circuit may have more than one source pole.

### 2.4 Boxes and physical layout

- `box`: asset subtype, type, material, gang count, orientation, optional dimensions/depth
- `box_port`: box, side (`top`, `bottom`, `left`, `right`, `back`), normalized offset, knockout label
- `asset_mount`: installed device, box, gang index, span, vertical position, rotation
- `diagram_annotation`: optional structured note anchored to a box element

Each cable end attaches to a box and optionally to a specific box port. Geometry is recorded locally within the box; it does not describe the concealed route between boxes.

### 2.5 Devices, functions, loads, and light sources

- `device`: asset subtype for switch, dimmer, relay, receptacle, GFCI, sensor, timer, scene controller, smart companion, or custom device
- `fixture`: asset subtype for light, fan, fan/light, or other permanently installed load enclosure
- `appliance`: asset subtype for hardwired or plug-connected equipment
- `asset_function`: independently addressable function/channel belonging to a device, fixture, or appliance
- `lamp_holder`: fixture function/position with base type and rating details
- `light_source`: asset subtype installed in a lamp holder, or an integrated engine associated with a fixture; optional actual watts, incandescent-equivalent watts, lumens, fixed/nominal kelvin, supported minimum/maximum kelvin, color capability, dimmability, and smart state
- `plug_connection`: dated appliance-to-receptacle-function relationship for movable loads

Examples of functions include a switch channel, a receptacle half, a relay channel, a fixture light load, a fan motor, a lamp holder, or a scene button.

### 2.6 Cable and conductor records

- `cable`: asset subtype, wiring method (`NM-B`, `UF-B`, `MC`, conduit, unknown, custom), raw jacket marking, insulated-conductor count, equipment-ground count, optional cable gauge, notes
- `cable_end`: cable, end designation A/B, containing box or endpoint asset, optional box port, certainty
- `conductor`: permanent code, parent cable when applicable, kind, observed insulation color, re-identification marking, optional gauge/material, observed or assigned role
- `conductor_end`: conductor, end designation A/B, connected electrical node, termination method

Conductor kinds include:

- cable core;
- cable equipment ground;
- pigtail;
- jumper;
- device lead;
- standalone conductor in raceway;
- unknown/custom.

The cable description follows standard notation such as `14/2 NM-B with ground`: `/2` is the count of insulated conductors, while the equipment-ground count is stored separately. Gauge is optional at both cable and conductor level; a conductor value can override the cable value with a warning on mismatch.

### 2.7 Electrical connectivity graph

- `electrical_node`: node kind and containing box/asset
- `terminal`: node subtype, owning asset/function, manufacturer label, semantic role
- `splice`: node subtype, containing box, connector type
- `open_endpoint`: node subtype for capped, abandoned, unconnected, or unknown termination
- `bond_point`: node subtype for an equipment-grounding/bonding point
- `internal_connection`: relation between terminal nodes describing device-internal behavior

Terminal roles include `LINE`, `LOAD`, `COMMON`, `TRAVELER_1`, `TRAVELER_2`, `NEUTRAL`, `GROUND`, `AUX`, manufacturer-specific labels, and unknown.

Internal-connection types include:

- always connected/feed-through;
- conditional contact;
- breakable tab;
- load impedance;
- transformer/isolation boundary;
- electronic or signal-only relationship.

A conductor has exactly two modeled physical ends. Each end terminates at exactly one electrical node. Branching occurs at an electrical node, never in the middle of a cable. A splice node can have any number of conductor ends and represents their common electrical connection.

### 2.8 Circuit assertions and derived results

- `asset_circuit_assertion`: user-stated circuit membership for an asset/function, with status and evidence
- `node_circuit_result`: cached graph-derived source membership and derivation metadata
- `conductor_circuit_result`: cached graph-derived source membership and derivation metadata
- `trace_gap`: explicit unresolved relationship between known topology sections

Derived records are reproducible cache/results, not user-authored source-of-truth facts. Assertions are never discarded when the graph disagrees.

Tracing from a source traverses conductors, splice nodes, fixed feed-throughs, and possible switch-contact states. It stops at loads, isolation, signal-only links, and grounding/bonding paths. Trace results record enough predecessor information for the UI to display the path and explain why an asset was included.

### 2.9 Control relationships

- `control_group`: named coordination of one or more controller and load functions
- `control_member`: control group, asset function, role, method, notes
- `control_link`: optional directed relationship for precise controller-to-load behavior within a group

Control roles include controller, companion, and controlled load. Methods include:

- mechanical traveler;
- wired auxiliary/data;
- hardwired relay;
- wireless direct;
- hub/app;
- scene/automation;
- custom.

The many-to-many model supports multiple switches controlling one light, one or more switches controlling several fixtures, and wireless controllers that have no load conductor.

Mechanical multi-way topology is not represented by a fixed `way_count` or separate schema for every switch count. It uses repeatable devices and their terminal/contact graphs:

- an endpoint device normally has a common terminal and two traveler terminals;
- an intermediate crossover device normally has two traveler pairs and straight/cross internal states;
- a control group/topology can contain two endpoint devices and any number of intermediate devices;
- manufacturer-specific auxiliary/data-wire and wireless companions use their observed terminal and control-link behavior rather than being forced into the traveler pattern.

The familiar labels three-way, four-way, or colloquial five-way are presentation metadata and reusable presets. They do not impose a maximum or select a different persistence model. Circuit tracing evaluates the generic contact graph and the union of valid contact states, so arbitrary `n`-way arrangements use the same algorithm.

### 2.10 Upgrade planning

- `upgrade_item`: target box/function/asset, status, goal, priority, notes
- `upgrade_requirement`: neutral, ground, line/load identity, box capacity, multi-way role, load compatibility, protocol, hub, or custom requirement
- `upgrade_observation`: requirement, known value, certainty, evidence
- `proposed_product`: upgrade item and product model/freeform candidate

Upgrade records point to the current installed topology but do not mutate it. Completion creates or associates a new installed-product record and archives the displaced instance.

### 2.11 Evidence and history

- `evidence`: method, date, observer, notes, confidence/status
- `evidence_link`: evidence to fact, relationship, or asset
- `change_event`: create/update/archive/replace/import event with timestamp and summary

Supported fact/relationship states are unknown, assumed, inferred, visually observed, test verified, documentation verified, and conflicting.

## 3. Relationship summary

```text
Panel -> Breaker -> Breaker Pole -> Circuit Source -> Circuit
                                             |
                                             v
                                     Electrical graph
                                             |
Cable -> Conductors -> Conductor Ends -> Nodes <- Terminals/Splices/Open Ends
  |                                          |
  +-> Cable Ends -> Box Ports -> Boxes <- Mounted Devices -> Functions
                                             |
                                             +-> Control Groups <-> Loads

Floor Plan -> Placements -> Boxes / Fixtures / Panels / Appliances

Installed State -> Upgrade Item -> Proposed Product
```

Arrows show data relationships, not current flow or hidden cable routes.

## 4. Required invariants

### Hard database/application constraints

- Permanent asset codes are unique within a property and never reused.
- Structure, level, space, and wall/zone internal codes are generated server-side, unique within their declared database scope, stable after creation, and unavailable as ordinary user-editable fields.
- Every property-owned relationship connects records from the same property.
- A cable has exactly two end slots, A and B; an unknown end is an explicit unresolved endpoint rather than a missing row.
- A conductor has exactly two end slots, A and B.
- A conductor end connects to exactly one electrical node.
- A cable-contained conductor's endpoint boxes agree with its parent cable's endpoint boxes when both are known.
- Terminals, splices, bond points, and local open ends are contained by one box or endpoint asset.
- An installed device cannot overlap another mount unless its explicit gang span permits it.
- Control membership references an asset function, not an ambiguous whole multi-function asset.
- Archived records retain their permanent codes and historical relationships.
- Installed-device details belong to exactly one property and one installed-product instance; replacing a product never automatically copies unit-unique identifiers or secrets to its replacement.
- Secret detail values are excluded from search indexes, URL state, change-event summaries, analytics, logs, and general asset/list view models. They are fetched only through an authenticated property-scoped detail boundary and are masked by default in the client.
- Light-source actual wattage, equivalent wattage, and lumens are optional non-negative observations; kelvin values are optional and positive when present. If both supported color-temperature bounds are known, the maximum is greater than or equal to the minimum. These fields belong to the installed light source at one holder position, not to the fixture as an undifferentiated total.

### Non-blocking consistency warnings

- Jacket conductor count does not equal the modeled cable-core count.
- Cable gauge and conductor override disagree.
- Two unrelated source circuits reach one non-load electrical node.
- A breaker pole appears to source unrelated circuit records.
- A multi-way topology has a missing, duplicated, or discontinuous traveler/contact path.
- A planned smart device requires a neutral but no verified neutral is present.
- A manual circuit assertion conflicts with a graph-derived result.
- A device terminal semantic role conflicts with an observed conductor role.
- A familiar identifier does not match its expected display format, or the same normalized unit identifier is recorded on more than one active asset in a property.

## 5. Presets versus source of truth

Presets accelerate entry for common devices but only create editable structured records. The source of truth remains the resulting functions, terminals, internal connections, cables, conductors, nodes, and control relationships.

Initial presets should include:

- ordinary single-pole switch;
- multi-way endpoint switch (commonly called a three-way switch);
- repeatable multi-way intermediate/crossover switch (commonly called a four-way switch);
- ordinary and split duplex receptacle;
- GFCI line/load receptacle;
- single- and multi-channel smart switch/dimmer;
- smart companion/aux device;
- wireless scene controller;
- relay module;
- simple light fixture;
- multi-lamp fixture;
- fan/light combination;
- integrated LED fixture;
- junction/splice-only box.

## 6. Storage mapping

- Relational product and graph data use one local SQLite database in the Home Assistant App's persistent `/data` volume. The relational schema and invariants remain deployment-neutral; repositories use a local SQLite adapter instead of Cloudflare D1.
- Floor plans, evidence photos, and exported asset bundles use a private local file store rooted under `/data`. Database attachment rows retain opaque property-scoped object keys; the filesystem adapter resolves those keys without allowing absolute paths or traversal outside the configured root.
- Smart-device secrets remain in private structured storage and are exposed only by authenticated property-scoped detail reads. Complete exports retain them with an explicit sensitive-backup warning; search and ordinary list/graph responses never include them.
- SQLite foreign keys and server-side authorization protect workspace and property ownership boundaries.
- All property queries require an explicit property scope; no query relies on a hard-coded default house identifier.
- Common breaker-first, asset-first, room, box, and graph traversal entry points receive indexes based on their actual queries.
- Graph-result caches are invalidated when a conductor end, node, terminal, internal connection, circuit source, or relevant assertion changes.
- Authentication accepts either trusted Home Assistant ingress identity or a cryptographically verified Cloudflare Access application JWT. Both paths map to the one installation workspace so the same properties are visible through the Home Assistant sidebar and the protected public hostname; the authenticated provider/subject remains available for change attribution. Requests without a trusted identity fail closed in production, except for a non-sensitive health endpoint. Local development uses an explicit development identity only outside production.

Exact table columns, migrations, and indexes are defined during the implementation-plan phase after this conceptual model is approved.

## 7. Reusable-code boundary

The following are code/configuration because they describe the reusable product:

- entity schemas and validation rules;
- generic electrical symbols and device/contact presets;
- naming-pattern defaults;
- diagram rendering and graph-tracing behavior;
- feature flags and deployment configuration.

The following are always property data:

- property names and addresses;
- structures, levels, rooms, walls/zones, and locator abbreviations;
- floor-plan backgrounds and placements;
- panels, breaker positions, circuits, boxes, cables, conductors, devices, fixtures, light sources, appliances, and their labels;
- electrical connections, control groups, observations, photos, conflicts, and upgrade plans;
- user-customized naming conventions and reusable product selections.

Production startup must work with an empty database and present onboarding. Automated tests may load fictional property fixtures into isolated test storage, but application runtime code and production migrations must never depend on those fixtures.

The automatic spatial-identifier and structured bulb-field amendments were implemented and verified on 2026-08-23.
