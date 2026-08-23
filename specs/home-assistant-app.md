# Circuit Atlas — Home Assistant App Specification

Status: Approved and implemented; locally verified 2026-08-22, publication pending
Branch: `sdd/home-assistant-app`
Date: 2026-08-21

## 1. Purpose

Convert Circuit Atlas from a ChatGPT Sites/Cloudflare Worker deployment into a local Home Assistant App that runs on Home Assistant Yellow, while preserving the existing electrical model, user workflows, property neutrality, privacy protections, and import/export format.

The installed app must open from the Home Assistant sidebar, keep all authoritative data on the Home Assistant host, survive app restarts and upgrades, and remain distributable through a public GitHub Home Assistant App repository without including any house-specific data.

## 2. User-visible behavior

- A Home Assistant administrator can add `https://github.com/kmcrandom/circuit-atlas-ha` as an App repository, install Circuit Atlas, start it, and open it from the sidebar.
- The existing Map, Circuits, Inventory, Wiring, Upgrade Plan, Capture, Settings, search, inspector, import, and export workflows remain available.
- A clean installation opens the normal property onboarding flow with no seeded house, room, panel, circuit, device, or floor-plan data.
- Data, floor plans, evidence photos, capture drafts, and smart-device commissioning details survive app restart and upgrade.
- Local sidebar use is through Home Assistant ingress. Remote use is through the owner's Cloudflare Tunnel hostname protected by Cloudflare Access. No separately managed Circuit Atlas password is required.
- Home Assistant ingress and validated Cloudflare Access requests open the same installation workspace rather than creating two independent copies of the property data.
- The same source remains runnable for local development at a root URL without Home Assistant.
- The app displays a clear error rather than a blank screen when storage initialization, schema migration, authentication, or upload persistence fails.

## 3. Target repository and distribution shape

Create a new public repository at `kmcrandom/circuit-atlas-ha`, matching the broad conventions of `kmcrandom/family-menu-ha` and `kmcrandom/minutemetrics-ha`.

Target layout:

```text
repository.yaml
circuit-atlas/
  config.yaml
  CHANGELOG.md
  Dockerfile
  run.sh
  README.md
  .dockerignore
  package.json
  package-lock.json
  app/
  components/
  db/
  drizzle/
  features/
  lib/
  public/
  tests/
  next.config.ts
  tsconfig.json
  ...other runtime and test configuration
specs/
.github/workflows/
README.md
LICENSE
CONTRIBUTING.md
SECURITY.md
AGENTS.md
```

The installable `circuit-atlas/` directory is the complete Docker build context so Home Assistant can build a copied local App when the `image` field is removed. Published installations pull a pre-built image and do not compile the application on Home Assistant Yellow.

Initial repository metadata:

- repository name: `Circuit Atlas`
- repository URL: `https://github.com/kmcrandom/circuit-atlas-ha`
- image: `ghcr.io/kmcrandom/circuit-atlas-ha`
- initial version: `0.1.0`
- initial architecture: `aarch64`
- lifecycle stage: `experimental`
- license: MIT

The repository contains reusable application code, generic electrical presets, fictional test fixtures, and documentation only. Local databases, uploads, exports, Home Assistant options, tokens, network addresses, and real property information are ignored and excluded from commits and image layers.

## 4. Home Assistant App metadata

`circuit-atlas/config.yaml` must define:

- `slug: circuit_atlas`
- `init: false`
- `ingress: true`
- `panel_title: Circuit Atlas`
- an appropriate Material Design electrical/home icon
- `arch: [aarch64]`
- host port `8099` mapped to the App's port `8099` so the existing Cloudflare Tunnel can reach the root-mounted application origin
- no host networking, hardware access, Supervisor API access, Home Assistant Core API access, or writable host-folder mappings beyond the standard app `/data` volume
- a health/watchdog endpoint when supported by the App metadata contract

The package relies on Home Assistant's documented defaults for application
startup, automatic boot, ingress port `8099`, and administrator-only panel
visibility. Their equivalent explicit keys are omitted because the current
Home Assistant App linter treats the redundant default values as errors.
The app uses Docker's native `HEALTHCHECK`; the legacy App-level `watchdog`
metadata is omitted because the current linter marks it obsolete.

The exposed port is not an unauthenticated application surface. Requests arriving through it require a valid Cloudflare Access application JWT. A direct LAN request without that JWT receives `401`/`403`, even if it forges Cloudflare email or Home Assistant identity headers.

## 5. Runtime architecture

### 5.1 Web runtime

- Preserve the React/Next.js App Router UI and route-handler design.
- Replace the Cloudflare/vinext Worker production target with a Node.js 22 production server suitable for an ARM64 container.
- Produce a production bundle during the GitHub/Docker image build, not on Home Assistant Yellow.
- Run one application process on `0.0.0.0:8099` inside the container.
- Expose `GET /health` as a non-sensitive liveness/readiness response. It may report only healthy/unhealthy status and must not expose database paths, identities, property counts, versions of private records, or secrets.

### 5.2 Ingress compatibility

Home Assistant serves Apps beneath a generated ingress prefix. Circuit Atlas must therefore:

- load scripts, styles, fonts, icons, and images without assuming `/` is the browser origin root;
- route all client API calls, downloads, uploads, navigation, redirects, and Next.js/RSC requests through the active ingress prefix;
- preserve direct root-mounted local development behavior;
- use the trusted ingress prefix/header only as routing context, never as authorization by itself;
- pass automated coverage for root-mounted and representative prefixed paths;
- show all primary routes correctly from the Home Assistant sidebar instead of rendering a blank page or escaping to the Home Assistant root.

The implementation may use an ingress-aware application adapter or a small internal reverse proxy, but it must avoid runtime source rebuilding, token-specific image builds, or fragile blanket rewriting of private user content.

## 6. Authentication and authorization

### 6.1 Home Assistant ingress

- Sidebar requests may authenticate with Home Assistant Supervisor ingress headers, including `X-Remote-User-Id` and the available name/display-name fields.
- Home Assistant identity headers are trusted only when the connection comes from the documented Supervisor ingress proxy source. A direct-port client cannot authenticate by copying those header names.
- The ingress-generated base path is routing context only and never proves identity on its own.

### 6.2 Cloudflare Tunnel and Access

- The App exposes host port `8099` as the origin used by the owner's existing Cloudflare Tunnel pattern.
- The public hostname must be protected by a Cloudflare Access self-hosted application and an allow policy before it is used for Circuit Atlas.
- Origin requests authenticate with the `Cf-Access-Jwt-Assertion` header. The application verifies the JWT signature through Cloudflare Access's rotating public JWKS and verifies the configured issuer/team domain, application audience (`aud`), expiry, and required identity claims.
- The application never trusts `Cf-Access-Authenticated-User-Email`, an unverified JWT payload, a `CF_Authorization` cookie by itself, or any other forwarded identity header as proof of access.
- The configured team domain must be a valid HTTPS Cloudflare Access team origin, and JWKS retrieval is restricted to that configured origin to avoid arbitrary server-side requests.
- Cloudflare signing keys are cached according to the verification library's safe behavior and refreshed for key rotation. If verification or key refresh fails and no cached valid key can verify the assertion, the direct request fails closed.
- Cloudflare Access may be left unconfigured for ingress-only use. When either the team domain or audience is missing, direct-port application requests remain disabled rather than falling back to anonymous access.

### 6.3 Shared installation workspace

- Any request authenticated through the allowed Home Assistant ingress or Cloudflare Access path maps to the same installation-scoped Circuit Atlas workspace.
- The provider and stable authenticated subject are retained separately as the actor identity for change events and diagnostics.
- Anyone admitted by the Home Assistant administrator boundary or Cloudflare Access policy can see the installation's properties and sensitive details. Those upstream policies are therefore the user-membership boundary for the initial release.
- First-class per-user roles, property sharing, and provider-account linking remain out of scope.
- Requests without either trusted identity fail closed with `401`/`403`, except for `GET /health` and immutable public application assets that contain no property data.
- Client-supplied identity values are never accepted from request bodies, query strings, application-created cookies, or browser JavaScript.
- Property-scoped repository guards remain in force, and sensitive smart-device values remain masked by default and available only from authenticated property-scoped detail endpoints.
- Non-production local development may use the explicit local owner identity; production must never silently fall back to it.

## 7. Structured persistence

- Replace Cloudflare D1 with a local SQLite database at `/data/circuit-atlas.sqlite` by default.
- Preserve the approved relational schema, foreign keys, checks, indexes, optimistic revisions, transactions, and property-isolation rules.
- Use the Node SQLite Drizzle adapter selected and verified during implementation; repository callers must not depend on Cloudflare `D1Database`, prepared-statement, or batch types.
- Execute committed schema migrations automatically and idempotently before the server accepts normal application traffic.
- Enable SQLite foreign keys on every connection and use a local-safe journaling/busy-timeout configuration appropriate for one application process.
- Multi-statement mutations that were atomic through D1 batch operations remain atomic through SQLite transactions.
- If initialization or migration fails, the app remains unavailable, logs a concise actionable error, and does not partially serve writes.
- Database files, journal/WAL files, and runtime migration state remain under `/data` and outside Git/image layers.

No D1-to-SQLite data migration or preservation path is required for version `0.1.0`; the software has not entered use. The committed initial schema must still create a correct empty database and preserve the existing JSON import/export contract for future portability.

## 8. Private file persistence

- Replace R2 with a local private file store rooted at `/data/files` by default.
- Keep attachment metadata in SQLite and preserve opaque, property-scoped object keys.
- Resolve every key relative to the configured file root and reject absolute paths, traversal, invalid separators, or keys outside that root.
- Validate file type, signature, size, and ownership before persistence as the current product requires.
- Write new files atomically so an interrupted upload cannot become a valid attachment.
- Keep file download/streaming behind authenticated property-scoped routes; no static file server exposes `/data/files`.
- Archive/delete operations keep database and filesystem state consistent and report recoverable failures visibly.
- Complete property exports continue to include attachments and sensitive commissioning data with the existing warning.

## 9. Configuration

Runtime defaults:

- database: `/data/circuit-atlas.sqlite`
- private files: `/data/files`
- host: `0.0.0.0`
- port: `8099`

Home Assistant App options add an optional `cloudflare_access` group:

- `team_domain`: the owner's Cloudflare Access team domain/issuer, blank to disable direct access
- `audience`: the Audience (`AUD`) tag of the Circuit Atlas Access application, blank to disable direct access

Both values are non-secret identifiers, but they remain installation configuration and are not committed with real values. Environment-variable overrides support local integration tests.

Local development may override the data directory, host, port, and explicit development identity through documented environment variables. Home Assistant deployment uses fixed safe `/data` defaults and does not expose arbitrary filesystem paths as ordinary App options in the initial release.

Circuit Atlas does not require an OpenAI API key, Cloudflare API token, Tunnel token, cloud database credential, object-storage credential, or Home Assistant API token. The separately operated Tunnel retains its own credentials; Circuit Atlas receives and validates only the Access application assertion.

## 10. Container and resource behavior

- Build an ARM64 image through GitHub Actions using Buildx/QEMU conventions consistent with the comparison repositories.
- Use a pinned, supported Node 22 Alpine-compatible runtime/build base or a Home Assistant base plus a pinned Node runtime, with Home Assistant/OCI labels carrying the App version and source repository.
- Run as a non-root user when compatible with the Home Assistant `/data` volume and App runtime; otherwise document and minimize the required filesystem permissions.
- Do not mount host devices, Docker, D-Bus, GPIO, USB, UART, or Home Assistant configuration.
- Keep generated frontend/build caches and development dependencies out of the final runtime image.
- Handle `SIGTERM` cleanly and close/flush SQLite before exit.
- The app should fit a normal Home Assistant Yellow installation; image size, idle memory, startup time, and representative large-property behavior are recorded during verification.

## 11. CI, publishing, and repository controls

CI on pull requests and pushes to `main` must:

- install pinned Node dependencies with `npm ci`;
- run type checking, linting, unit/integration/schema tests, and the production build;
- validate the Home Assistant App metadata and changelog/version alignment;
- build the `linux/arm64` container without pushing it;
- exercise the health endpoint and a representative prefixed-ingress page/API flow in the built container where practical;
- scan tracked files and the final image context for ignored database/upload/export artifacts and known private fixture markers.

A tag-triggered and manually dispatchable publish workflow must:

- read the version from `circuit-atlas/config.yaml`;
- require a matching top-level entry in `circuit-atlas/CHANGELOG.md`;
- publish `ghcr.io/kmcrandom/circuit-atlas-ha:<version>` and `:latest` for `linux/arm64`;
- use GitHub's scoped token and package permissions without repository secrets beyond the standard workflow token;
- attach accurate OCI source, description, version, and license labels.

Dependabot should cover npm, Docker, and GitHub Actions. Branch protection and repository settings may be configured after the initial push if desired, but no release image is published merely by creating or pushing the repository. The SDD release sequence will explicitly ask whether to tag and publish `v0.1.0` after the initial implementation PR is merged.

## 12. Documentation

The root README and App README must document:

- installation through the Home Assistant App repository URL;
- Home Assistant Yellow/aarch64 support;
- administrator-only Home Assistant ingress plus the optional Cloudflare Tunnel/Access path;
- persistent database and private-file locations at a conceptual level;
- backup/export and restore expectations;
- local development and verification;
- tagged release/GHCR behavior;
- privacy of floor plans, wiring information, and commissioning secrets;
- electrical-safety limitations;
- how to diagnose startup, storage, migration, ingress, and image-pull failures.

Repository contribution, security, license, changelog, and agent-instruction files should follow the same professional public-repository conventions as the comparison projects.

## 13. Backward compatibility and removals

- Preserve the current product routes, data model, export schema, permanent IDs, property-neutral presets, and user-visible behavior unless an ingress prefix requires an equivalent URL adapter.
- Preserve root-mounted local development URLs.
- Remove ChatGPT Sites sign-in/sign-out flows, OpenAI identity headers, `.openai/hosting.json`, vinext/Sites build glue, Cloudflare Worker entry points, Wrangler runtime configuration, D1 bindings, and R2 bindings from the production application. Retaining Cloudflare Access JWT verification for the owner's Tunnel does not retain the Cloudflare Worker runtime.
- Remove Cloudflare-only dependencies and tests after equivalent Node/SQLite/filesystem coverage exists.
- No deployed Sites environment, Git remote, D1 database, or R2 bucket currently exists, so no remote teardown or data migration is part of this change.

## 14. Failure and recovery behavior

- Missing or unwritable `/data` storage prevents startup with a clear log message.
- A locked/busy SQLite database retries only within a bounded configured timeout, then returns a retryable error without losing the prior committed state.
- Failed schema migration leaves the last committed database state intact and prevents application writes.
- Failed upload persistence does not create a usable attachment row; failed metadata persistence removes or quarantines the just-written file.
- Missing private file content returns a not-found/integrity response without exposing its filesystem path.
- Missing ingress identity returns an authentication response, not a local-owner fallback.
- Unsupported architecture or unavailable image tags are caught by documentation and CI/release verification rather than producing an untested architecture claim.
- The user can recover application data through a Home Assistant backup or Circuit Atlas complete export; neither mechanism is replaced by GitHub source control.

## 15. Explicit non-goals

- Migrating or preserving the unused local Cloudflare D1/R2 development state
- Hosting Circuit Atlas simultaneously on ChatGPT Sites and Home Assistant
- Public or direct-LAN application access without validated Home Assistant ingress or Cloudflare Access identity
- Creating or managing the owner's Cloudflare Tunnel, DNS hostname, Access application, identity provider, or Access policy from Circuit Atlas
- A native Home Assistant integration, entities, services, discovery, or automations
- Automatic import of Home Assistant areas, devices, entities, Zigbee identifiers, or Matter credentials
- Multi-user property sharing or role administration inside Circuit Atlas
- `amd64` publishing before an image is separately built and tested
- Publishing a GHCR image or GitHub Release before explicit release approval

## 16. Acceptance criteria

1. A clean Home Assistant Yellow/aarch64 install can pull the published image, start it, and open Circuit Atlas from the administrator sidebar.
2. Every primary route and client/API interaction works through a representative Home Assistant ingress prefix, a root-mounted Cloudflare Access origin request, and root-mounted local development.
3. Production requests without trusted Home Assistant ingress identity or a valid Cloudflare Access JWT fail closed; forged identity headers and wrong issuer/audience/expired assertions are rejected.
4. A clean `/data` directory initializes the complete SQLite schema and opens property onboarding without sample house data.
5. Structured edits remain durable and atomic across restart, including complex box termination and capture completion mutations previously implemented with D1 batches.
6. Floor plans, photos, and complete export bundles persist under `/data`, are not directly enumerable, and stream only through authenticated property-scoped routes.
7. Hue setup codes, Matter onboarding values, Zigbee identifiers, and user-marked secrets remain masked and excluded from ordinary search/list/log output.
8. Existing records-only and complete export/import tests pass against local SQLite/filesystem adapters with equivalent data and attachment results.
9. Home Assistant App metadata, changelog, repository metadata, public documentation, CI, Dependabot, and tag-triggered GHCR publishing match the established `family-menu-ha`/`minutemetrics-ha` conventions.
10. CI passes Node verification, schema checks, production build, ARM64 image build, container health, and prefixed-ingress smoke coverage.
11. The tracked repository and final image contain no local database, upload, export, credential, network address, or real property data.
12. Home Assistant ingress and validated Cloudflare Access requests reach the same installation workspace while retaining distinct actor identities for change events.
13. The GitHub repository is created as public `kmcrandom/circuit-atlas-ha` and receives the approved source through the SDD commit/push/PR workflow.

## 17. Open questions resolved by this proposal

- **Repository visibility:** public, matching the two comparison repositories; application data remains local and untracked.
- **Initial architecture:** `aarch64` only for Home Assistant Yellow.
- **Normal access:** administrator-only Home Assistant ingress plus host port `8099` for the owner's Cloudflare Tunnel; direct requests require a validated Cloudflare Access application JWT.
- **Workspace identity:** one installation workspace shared by both authenticated access paths, with provider/subject retained for attribution.
- **Data migration:** none; initialize an empty local database because the application is not in use.
- **Cloud coexistence:** none; the Home Assistant App becomes the production target.
- **Release:** repository creation and push are included after implementation approval; the first version tag/GHCR publication remains a separate explicit release decision.
