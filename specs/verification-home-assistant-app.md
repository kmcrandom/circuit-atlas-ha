# Circuit Atlas — Home Assistant App Verification

Status: Locally verified 2026-08-22; GitHub publication and physical Yellow installation pending
Branch: `sdd/home-assistant-app`

## Verified outcome

Circuit Atlas is packaged as a reusable, property-neutral Home Assistant App
for `aarch64`. The authoritative SQLite database and private files live under
the App's `/data` volume. The former ChatGPT Sites, Cloudflare Worker, D1, and
R2 production paths have been removed. Cloudflare remains only as an optional
Tunnel and Access authentication boundary configured through installation
data.

## Application and persistence

- ESLint and strict TypeScript checks pass.
- 117 unit/component/repository tests pass.
- Seven schema and migration tests pass, including SQLite transaction and
  local persistence behavior.
- Four production-rendering tests pass, including Home Assistant identity,
  ingress-prefixed assets, fail-closed direct access, and local storage.
- The standard Next.js standalone production build succeeds on pinned Node
  `22.22.2`.
- A clean data directory creates `circuit-atlas.sqlite` and `files/` without
  seeded house data.
- Production dependency audit reports zero vulnerabilities at the configured
  high-severity threshold.

## Authentication and browser behavior

- Nine gateway integration tests pass for Home Assistant proxy trust,
  Cloudflare Access JWT issuer/audience/signature/expiry validation, forged
  header removal, key rotation, cached and cold JWKS outages, ingress rewriting,
  and root-proxy integration.
- Six Chromium journeys pass across desktop, mobile, root-mounted development,
  and a representative Home Assistant ingress prefix. Client API requests and
  navigation use the runtime prefix correctly.
- Requests to the exposed application origin return `403` when Cloudflare
  Access is unconfigured or no valid assertion is present. The health response
  remains available and minimal.
- Home Assistant ingress and Cloudflare Access identities use the same
  installation workspace while retaining provider-qualified actor identity.

## Home Assistant package and ARM64 image

- `repository.yaml`, App metadata, options, translations, documentation,
  changelog, version metadata, and workflow YAML parse successfully.
- Home Assistant's current App linter (`frenck/action-app-linter@v2.21.1`)
  passes the installable `circuit-atlas/` directory.
- The pinned `node:22.22.2-bookworm-slim` multi-stage image builds for
  `linux/arm64`; native SQLite loads and performs real reads and writes.
- The final image reports `arm64`, carries the Home Assistant
  `app`/`aarch64`/`0.1.0` labels, and has an uncompressed content size of
  94,714,513 bytes (about 90.3 MiB).
- Container smoke startup completes in about 1.5 seconds on the local ARM64
  Docker environment. The native Docker health check passes, direct root access
  is rejected, and `/data/circuit-atlas.sqlite` plus `/data/files` are created.
- The container has no host networking, Supervisor/Core API access, hardware
  access, or host-folder mapping beyond the App's standard `/data` volume.

## Source and privacy audit

- The proposed source set contains 275 files after this verification record and
  release helper are included.
- Git ignore and Docker ignore rules exclude dependencies, generated builds,
  browser reports, local databases, uploads, exports, local options, and other
  runtime data.
- The source scan found only fictional `.test` identities, fictional
  `cloudflareaccess.com` issuers, the documented Home Assistant Supervisor proxy
  address, and generic MAC/Zigbee format examples. No real property record,
  floor plan, device identifier, setup code, Cloudflare configuration, token,
  database, upload, or export is in the publication set.
- The Docker build context excludes the same private and generated artifacts.

## Remaining external validation

The following work is intentionally not claimed as complete:

1. Commit the reviewed source, create public `kmcrandom/circuit-atlas-ha`, push
   the feature branch, and complete the initial pull request. This requires the
   SDD source-control approval.
2. After a separate release approval, tag `v0.1.0`, let GitHub Actions publish
   the GHCR image, and verify its public `linux/arm64` manifest.
3. Add the repository to the owner's Home Assistant Yellow, install the App,
   and smoke-test real Supervisor ingress, backup/restore, and the separately
   managed Cloudflare Tunnel/Access route. No Home Assistant or Cloudflare
   installation was changed during local implementation.
