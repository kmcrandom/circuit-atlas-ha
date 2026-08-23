# Circuit Atlas — Product Specification

Status: Approved, including the Home Assistant App and Cloudflare Access deployment amendments
Branch: `sdd/home-assistant-app`
Date: 2026-08-13
Implementation verified, including smart-device metadata: 2026-08-20

## 1. Purpose

Circuit Atlas is a private web application for documenting a home's as-observed electrical system and planning smart-device upgrades.

It must answer two questions quickly:

1. When a breaker is selected, what switches, receptacles, light fixtures, light sources, appliances, boxes, and known conductors belong to or depend on that circuit?
2. When any switch, receptacle, light, appliance, box, cable, or conductor is selected, which breaker or breakers supply it and what is the known electrical path?

The application records cable endpoints and individual-conductor connectivity. It does not require or pretend to know cable length or the concealed physical route between endpoints.

## 2. Product principles

- **Observed reality over assumptions.** Incomplete and uncertain records are valid and visibly identified.
- **Three distinct views.** Floor plans answer where an item is; topology diagrams answer what is electrically connected; box diagrams answer how a box is physically arranged and terminated.
- **No false route precision.** A connection shown on a floor plan is schematic and must never imply the concealed cable route.
- **Stable identity.** Moving, renaming, or replacing an item never silently changes its permanent identifier.
- **Power and control are different.** Physical power, switched power, wired control, and wireless/app control are separate relationships.
- **Current and planned state are different.** Smart-upgrade planning never overwrites the current as-built record.
- **Safety-aware language.** The application records observations; it does not declare a conductor safe, de-energized, code-compliant, or suitable for work.
- **Properties are data, not code.** The same application build works for any house; addresses, rooms, panels, labels, devices, topology, and floor plans exist only in stored property data.

## 3. Initial release assumptions

- One private workspace can contain one or more independent properties. Every electrical record is scoped to exactly one property.
- The initial deployment target is a private Home Assistant App running on Home Assistant OS. Local sidebar access uses Home Assistant ingress; remote access may use an exposed App port only through the owner's Cloudflare Tunnel and Cloudflare Access application. The application validates the identity assertion supplied by either trusted access path and does not introduce a separate username/password system.
- Structured data is stored durably in a local SQLite database under the Home Assistant App's persistent `/data` volume.
- Floor-plan files and evidence photos are stored as private files under the same persistent `/data` volume and are served only through authenticated application routes.
- The app remains usable in a root-mounted local development server without Home Assistant. Deployment-specific paths, identities, and storage locations are adapters rather than house-specific application code.
- Desktop/tablet provides the full editing experience. Mobile supports lookup, photos, room-by-room capture, and straightforward connection entry.
- The initial release uses uploaded floor-plan images or PDF pages. Drawing a complete architectural floor plan inside the application is out of scope.
- The application supports multiple properties, panels, subpanels, floors, and structures without code changes or fixed maximums.

### 3.1 Property independence and reuse

- First-run onboarding creates a property record rather than relying on seeded house details.
- A property selector lets the user create, open, rename, export, import, or archive independent houses.
- Address, name, structures, floors, room/area vocabulary, wall/zone codes, panel layouts, breaker labels, device inventory, product choices, diagrams, and floor plans are user data.
- Source code and production database migrations contain no real or assumed house-specific values.
- Generic electrical-domain presets may ship with the application, but they are reusable, editable templates and never contain property names or topology.
- Development/test fixtures use clearly fictional data and are never inserted into a production property.
- Records and searches cannot form relationships across properties. Permanent codes need only be unique within their property because internal UUIDs provide global identity.
- A complete property can be exported and imported into another installation without changing application code.

## 4. Information architecture

Primary navigation contains:

- **Map** — floor-plan exploration and placement
- **Circuits** — panels, breakers, circuit membership, and connected assets
- **Inventory** — rooms, boxes, devices, fixtures, light sources, appliances, cables, and products
- **Wiring** — conductor-level topology and box termination diagrams
- **Upgrade Plan** — current smart/dumb state, candidates, requirements, and proposed replacements

A property selector is always available above the primary navigation and makes the currently active house unambiguous.

A global search finds records by permanent ID, locator label, display name, room, breaker, manufacturer, model, smart protocol, or notes.

Every selected record opens a consistent inspector with the applicable sections:

- Overview
- Power and control
- Connections
- Diagram
- Product details
- Location
- Evidence/photos
- Upgrade plan

Selection is synchronized: choosing an item in a list, topology diagram, box diagram, or floor plan selects that same item everywhere.

## 5. Required workflows

### 5.1 Initial setup

The user can:

1. Create or select a property, then define its structures, levels, rooms/areas, and optional wall/zone labels.
2. Upload one or more floor-plan backgrounds per level.
3. Create panels and reproduce their breaker positions, including tandems and multi-pole breakers.
4. Add boxes, fixtures, appliances, and other assets, then position them on a floor plan.

### 5.2 Breaker-first lookup

Selecting a breaker displays:

- its panel position(s), poles, amperage, protection type, label, and verification status;
- all graph-derived and manually asserted connected assets;
- results grouped by location and asset type;
- the relationship to each result, such as directly supplied, switched load, control device, downstream protected device, or unresolved assertion;
- confidence and evidence for each relationship;
- the known conductor/topology path and explicit gaps;
- synchronized highlights on the floor plan;
- conflicts, incomplete branches, and records needing review.

Multi-pole breakers appear as one selectable assembly while retaining pole-level source information.

### 5.3 Asset-first lookup

Selecting a switch, receptacle, fixture, light source, appliance, box, cable, or conductor displays:

- one, several, or no currently known source breakers;
- whether each breaker relationship is graph-derived, manually asserted, or conflicting;
- the known path to the breaker and the point at which the path becomes unknown;
- what the asset physically supplies, switches, or protects;
- what it controls by wired, wireless, app, scene, or automation means;
- other controllers and loads in the same control group;
- its box, gang position, room, and floor-plan position;
- its current device/product details and planned-upgrade state.

A split receptacle can report a different source or switching state for each half.

### 5.4 Room-walk capture

The mobile-friendly capture flow lets the user:

1. Select a room, box, or fixture.
2. Add overview and close-up photos.
3. Record the box and the devices mounted in each gang.
4. Record cables and where they enter the box.
5. Add the cable's conductors, colors, markings, and optional gauge.
6. Attach conductor ends to device terminals, splices, caps/open ends, bonds, or an explicit unknown point.
7. Save incomplete work as needing review.

Unknown information never blocks saving.

### 5.5 Wiring trace

The wiring workspace lets the user start from a breaker, box, device, fixture, cable, or conductor and follow known connections in either direction.

The view distinguishes:

- cable-contained conductors;
- pigtails, jumpers, and device leads;
- terminals;
- multi-conductor splices;
- grounding/bonding connections;
- normally fixed feed-through connections;
- state-dependent switch contacts;
- load boundaries;
- unknown or open endpoints;
- physical power paths versus logical/wireless control.

The trace view can show the union of valid switch states so an off switch does not hide the breaker that supplies its load. It must not trace circuit power through a load impedance, transformer/isolation boundary, wireless relationship, or equipment-grounding path.

Mechanical multi-way switching has no controller-count limit. The model and editor support two endpoint switches plus zero or more intermediate crossover switches, as well as nontraditional smart/aux arrangements. A four-switch installation controlling one load (often described as a five-way switching arrangement) is represented by the same reusable contact graph as any larger arrangement, not by a special `five-way` schema or hard-coded case.

### 5.6 Smart-upgrade planning

Each installed controller, receptacle, fixture, light source, or appliance records its current capabilities independently from any proposed replacement.

The user can mark an item or location as:

- Keep
- Investigate
- Candidate
- Planned
- Purchased
- Installed
- Verified

For a proposed smart-switch, smart-relay, smart-receptacle, or smart-light upgrade, the application summarizes documented facts without making an electrical-suitability guarantee:

- neutral observed in the box;
- equipment ground observed;
- line and load identified;
- multi-way role understood;
- box size/depth known;
- load type, lamp technology, wattage, and dimmability known;
- smart bulbs or integrated smart fixtures already present;
- preferred protocol/ecosystem and hub requirements;
- missing or conflicting facts.

The planned product and notes remain separate from the currently installed product. Installing a replacement archives the prior installed instance and preserves the box, conductors, history, and prior observations.

## 6. Naming and identification convention

Every record has:

- a generated immutable permanent ID used for links and data relationships;
- an editable human display name;
- an optional structured locator label based on floor, room, wall/zone, and sequence;
- aliases retained after a rename so old labels remain searchable.

Default permanent ID prefixes are:

| Record | Example |
| --- | --- |
| Panel | `PNL-0001` |
| Breaker assembly | `BRK-0001` |
| Circuit | `CKT-0001` |
| Box | `BOX-0042` |
| Installed device | `DEV-0087` |
| Fixture | `FIX-0018` |
| Appliance | `APL-0011` |
| Cable | `CBL-0104` |
| Control group | `CTL-0021` |

Contextual sub-identifiers use their parent ID:

- breaker position: `PNL-0001/B12` or a grouped range such as `PNL-0001/B12-14`;
- gang position: `BOX-0042/G1`, numbered left-to-right while facing the finished wall;
- receptacle function: `DEV-0087/TOP` and `DEV-0087/BOTTOM`;
- conductor: `CBL-0104/C1`, with color shown separately rather than embedded as identity;
- cable end: `CBL-0104/A` and `CBL-0104/B`.

Example display label: `First floor · Kitchen · North wall · Sink switches`.
Example optional locator label: `L1-KIT-N-BX03`.

Location is not part of permanent identity because room names and placement can change. Replacing a device creates a new installed-device record in the same box/gang rather than reusing the old device identity.

## 7. Gang-box diagrams

The application provides two linked structured diagrams for a box.

### 7.1 Physical layout view

For a wall box, the standard view is from the finished-room side looking into the open box; diagram top means toward the ceiling. Gang positions run left-to-right. For a ceiling box, the standard view is from below and includes an orientation marker.

The user can record:

- box type, material, gang count, and optional dimensions/depth;
- mounted device position, span, and rotation;
- cable entry side: top, bottom, left, right, or back;
- entry offset along a side so multiple cables on the same side remain distinguishable;
- multiple cables through one entry when observed;
- cable end identity and observed jacket marking.

### 7.2 Termination view

The termination view renders:

- device terminals and manufacturer terminal labels;
- every modeled conductor end;
- splices/connectors and their members;
- pigtails, jumpers, and device leads;
- capped/open conductors;
- ground/bond points;
- unresolved endpoints;
- conductor observed color, re-identification marking, and assigned/unknown function.

The diagram is rendered from structured records; the saved image is not the source of truth.

Ordinary switch, multi-way endpoint, repeatable multi-way intermediate, dimmer, duplex receptacle, GFCI, and common smart-device presets can create editable terminal templates. Familiar three-way and four-way names can appear in the UI, but the underlying model and editor impose no maximum number of switches. Presets must not silently assign conductor function from insulation color.

## 8. Floor-plan visualization

The user can upload and name floor-plan backgrounds for each level and place panels, boxes, receptacles, fixtures, appliances, and junction points on them.

The map supports:

- pan and zoom;
- item selection and the common inspector;
- filters for breaker/circuit, room, asset type, smart/dumb state, upgrade status, and confidence;
- breaker-based highlighting;
- distinct icons for boxes, switches, receptacles, fixtures, appliances, and panels;
- optional wall association, height, rotation, and placement notes;
- an optional schematic-connection overlay labeled `Connection only — concealed route unknown`.

No cable route line is stored or displayed as a physical route in the initial release. Replacing a floor-plan background preserves normalized placements where possible and otherwise requires an explicit remapping step.

## 9. Device and product details

All installed assets support display name, description, manufacturer/company, model number, serial number if useful, hardware revision, firmware version, installation/verification dates, notes, photos, lifecycle state, and tags. Product-model facts are kept separate from identifiers and commissioning information that belong to one installed physical unit.

Applicable device-specific details include:

- category and subtype;
- smart, dumb, smart-companion, or wireless-remote role;
- switch configuration: single-pole, multi-way endpoint, multi-way intermediate/crossover, multi-channel, relay, dimmer, sensor, timer, scene controller, or custom;
- receptacle configuration: duplex, split, switched half, GFCI, USB, smart, or custom;
- supported smart protocol/ecosystem, hub, firmware, and integration notes;
- terminal schema and load limits when documented;
- line/load/traveler/neutral/ground requirements stated by the product documentation;
- current operational and verification status.

### 9.1 Smart-device identity and commissioning details

For smart switches, receptacles, relays, sensors, fixtures, light sources, appliances, hubs, bridges, and companion devices, the user can store zero or more structured per-unit details. Built-in detail types include:

- MAC address;
- Zigbee IEEE/EUI-64 address, including the IEEE number printed on an Inovelli switch;
- Matter device/node identifier and related non-secret Matter identifiers when known;
- manufacturer device ID or ecosystem-specific ID, including a Hue device ID;
- setup, pairing, install, or onboarding code, including Hue, Matter, HomeKit, and vendor-specific codes;
- QR/onboarding payload or a private photo of the printed label;
- associated hub/bridge and the device name used in that ecosystem;
- a custom labeled identifier or installation detail for vendor fields not built into the application.

Each detail records a type, user-visible label, exact value, optional notes, verification state/date, and sensitivity classification. Formatting assistance may normalize a value for comparison, but the exact entered value remains available and exportable. The application must not infer one identifier from another or reject an unfamiliar vendor format; malformed familiar formats produce a warning rather than data loss.

MAC addresses, Zigbee IEEE addresses, Matter IDs, serial numbers, and similar unit identifiers are visibly distinguished from secrets. Setup codes, install codes, onboarding payloads, and any user-marked secret are masked by default, require an explicit reveal/copy action, and are excluded from global search, URLs, analytics, client logs, and ordinary list responses. Non-secret identifiers may be searched by an authenticated property owner.

The details editor suggests relevant fields from the selected protocols or vendor without making them mandatory. Hue devices therefore offer MAC address, setup code, Matter ID, bridge, firmware, and custom fields; Inovelli Zigbee devices offer Zigbee IEEE, firmware, hardware revision, hub, and custom fields. These are reusable suggestions only—vendor names, device values, and house-specific information remain stored property data rather than code.

Replacing or archiving a smart device keeps its identifiers, secrets, photos, and history with the old installed asset. A replacement receives new per-unit details instead of inheriting unique identifiers automatically.

Light fixtures contain lamp holders or integrated light engines. Each holder/engine can identify an installed light source so fixture bulb count is derived rather than stored as an unverified total. Bulk creation supports multi-lamp fixtures.

Light-source details include:

- replaceable bulb or integrated engine;
- smart or dumb;
- base/socket type;
- shape and technology;
- wattage, lumens, color temperature/color capability, and dimmability;
- manufacturer, model, protocol/ecosystem, and notes.

A fixture may mix different light-source types. An integrated LED fixture can have zero replaceable bulbs.

## 10. Uncertainty, evidence, and conflicts

Verification is attached to facts and relationships, not only to whole records. Available statuses are:

- Unknown
- Assumed
- Inferred
- Visually observed
- Test verified
- Documentation verified
- Conflicting

Evidence can record date, method, observer, notes, and supporting photos.

Manual breaker assertions remain distinct from graph-derived breaker results. If they disagree, both remain visible and the application flags a conflict. The application never overwrites a user's observation with an inference.

Deletion is archival by default. Referenced objects cannot be permanently removed without resolving or explicitly preserving their relationships.

## 11. Persistence, privacy, and portability

- Product records persist across browsers, sessions, app restarts, and app upgrades in the Home Assistant App's local `/data` storage.
- Floor-plan files and evidence images are private and are not exposed through guessable public object URLs.
- Write operations are checked on the server; client state is not authoritative.
- User-entered text is treated as untrusted when rendered.
- Sensitive commissioning details are returned only by authenticated, property-scoped detail requests; summary, search, trace, and floor-plan responses omit their values.
- Sensitive values are masked by default in the interface and are never placed in URL state, analytics, or application logs.
- The application provides a complete versioned JSON export containing structured records and references to exported assets.
- Complete exports include smart-device identifiers and commissioning secrets so they can serve as backups, but the export flow warns that the downloaded file contains sensitive access/commissioning information.
- The application can import its own export format with validation and a preview before applying changes.
- Destructive replacement imports are not part of the initial release; import adds or merges only after explicit confirmation.
- Home Assistant backups may preserve the app's `/data` volume, but Circuit Atlas exports remain the documented application-level, deployment-independent backup format.
- No existing D1/R2 database or upload migration is required for the first Home Assistant release because the application has not entered use. The Home Assistant installation starts from an empty schema and onboarding flow.

## 12. Validation behavior

The application distinguishes hard structural errors from incomplete knowledge.

Hard errors include:

- a conductor end connected to more than one electrical node;
- a cable or conductor with more than two physical ends;
- a cable conductor whose endpoint box contradicts its cable endpoint;
- overlapping gang-mounted devices without an explicit multi-gang span;
- a splice or terminal placed outside its containing box;
- a branch represented in the middle of a cable rather than at a splice/terminal;
- duplicate permanent IDs within a property;
- any relationship that crosses property boundaries.

Warnings that do not block saving include:

- missing cable gauge;
- unknown cable endpoint;
- unknown conductor function;
- modeled conductor count differing from the jacket description;
- cable and conductor gauge disagreement;
- unrelated live sources appearing on a common node;
- explicit circuit membership disagreeing with graph-derived membership;
- an incomplete or discontinuous multi-way traveler/contact pattern;
- a smart-device plan whose documented requirements are not yet observed;
- an unresolved or abandoned conductor.

## 13. Required responsive and accessibility behavior

- All lookup flows work on phone, tablet, and desktop.
- Diagram editing may use a simplified form/list representation on small screens; no information is desktop-only.
- Interactive graphics have a corresponding navigable list/tree and text summary.
- Controls have visible labels, keyboard operation, and clear focus states.
- Status is never communicated by color alone.
- Touch targets and zoom/pan gestures do not prevent normal page navigation.
- Autosaved drafts and undo protect longer topology edits from accidental loss.

## 14. Safety language

Conductor and box-editing screens display a concise warning to de-energize and independently verify before inspection or work. A recorded breaker state is labeled `Recorded off`, never `Safe` or `De-energized`.

The application does not:

- detect voltage;
- verify that equipment is de-energized;
- provide electrical-code approval;
- calculate conductor ampacity, box fill, or load suitability;
- replace inspection or work by a qualified electrician.

## 15. Explicit non-goals for the initial release

- Cable length measurement
- Concealed physical route mapping or route inference
- Live breaker switching, smart-home control, or energy monitoring
- Automatic discovery of wiring or devices
- Electrical-code compliance certification
- Load-flow, short-circuit, or energized-state simulation
- Box-fill or service-load calculations
- Architectural floor-plan drawing tools
- Contractor work orders, purchasing, or price comparison
- Public sharing or multi-user real-time collaboration
- Native mobile applications

## 16. Initial release acceptance criteria

1. Selecting a breaker shows every explicitly asserted or graph-reachable asset, grouped by location, with relationship and confidence labels.
2. Selecting any powered asset shows zero, one, or multiple possible source breakers and the known path, including explicit unknown gaps.
3. The system can faithfully represent and display a basic one-switch/one-light circuit.
4. The system can faithfully represent a three-way circuit with source at either switch or at the fixture, distinct common/traveler/load conductors, and the cable(s) connecting the boxes.
5. The same generic contact model supports arbitrary multi-way switching with two endpoints and any number of intermediate crossover switches, without schema changes or a hard-coded maximum. This includes four switches controlling one light and larger arrangements.
6. One control group can contain multiple wired or wireless controllers and multiple loads.
7. Wired power interruption and wireless/app control can coexist for the same smart light without being conflated.
8. A multi-gang box can contain devices from different circuits and show multiple cable entries on top, bottom, sides, or back.
9. A box termination diagram supports terminals, splices, pigtails, jumpers, capped/open conductors, grounds/bonds, and unknown endpoints.
10. Cable method and insulated-conductor count can be recorded while cable and conductor gauge remain optional.
11. The floor plan synchronizes selection with circuit, inventory, and wiring views and clearly marks schematic connections as non-route information.
12. Smart/dumb status and product details can be stored independently for switches/controllers and light sources.
13. A fixture can contain one or many replaceable bulbs, mixed bulb types, or an integrated light engine.
14. Current installed state and planned smart-upgrade state remain separate.
15. Incomplete records save successfully and are visibly marked for review.
16. Permanent IDs remain unchanged when labels or locations change; replaced devices preserve history.
17. Data survives reloads and can be exported in a durable, documented format.
18. The interface is usable for lookup on a phone and for full diagram editing on a desktop/tablet.
19. A second unrelated property can be created or imported and fully documented with the same application build; no labels, rooms, panels, topology, or floor-plan details from another property appear unless entered as data.
20. An installed smart device can retain manufacturer/model information, multiple unit-specific identifiers, vendor commissioning details, and custom labeled fields. Secret values are masked and omitted from search and summary responses, while an authenticated complete export/import round trip preserves them.

## 17. Representative verification scenarios

The implementation must include automated or fixture-based tests for:

- a simple breaker → switch → fixture circuit;
- source-at-fixture switch loop with a reidentified white conductor;
- parameterized multi-way switching with two, three, four, and at least six controllers, including a four-switch/one-light arrangement;
- two switches controlling several parallel fixtures;
- a multi-gang box containing more than one circuit;
- a split or half-switched duplex receptacle;
- GFCI line/load feed-through;
- a fan/light combination with separate switched conductors;
- smart bulbs with constant power plus wireless control and a physical cutoff;
- a smart companion/aux conductor that is not a traveler;
- a shared-neutral/multi-wire branch circuit;
- an abandoned conductor and an unknown cable endpoint;
- a subpanel feeder and a multi-pole breaker;
- a fixture with multiple bulbs and an integrated LED fixture;
- conflict between asserted and graph-derived breaker membership.
- a Hue light with manufacturer/model, MAC address, setup code, Matter ID, bridge association, and firmware;
- an Inovelli switch with manufacturer/model, Zigbee IEEE address, firmware, hardware revision, hub association, and an arbitrary custom field;
- secret setup-code masking plus complete authenticated export/import preservation.

## 18. Deferred decisions

These do not block the initial specification and can be revisited after the core workflow is tested:

- household-member collaboration and per-user change attribution;
- QR-code labels for boxes and cover plates;
- offline capture with later synchronization;
- printable panel directories and electrician handoff reports;
- reusable manufacturer/product templates shared between homes;
- native Home Assistant entities, services, device discovery, or automation integration beyond authenticated ingress hosting.
