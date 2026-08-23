# Circuit Atlas — Home Assistant App Implementation Plan

Status: Implemented and locally verified 2026-08-22; source-control publication pending
Branch: `sdd/home-assistant-app`
Date: 2026-08-22
Approved inputs: `specs/product-spec.md`, `specs/domain-model.md`, `specs/home-assistant-app.md`

## 1. Outcome

Convert the completed Circuit Atlas web application from its unused ChatGPT Sites/Cloudflare runtime into an installable Home Assistant App for Home Assistant Yellow, keep the product behavior intact, verify the local and ARM64 container builds, and prepare a new public `kmcrandom/circuit-atlas-ha` repository following the Family Menu and MinuteMetrics conventions.

Implementation ends with locally verified source on `sdd/home-assistant-app`. Creating the GitHub repository, committing, pushing, and opening the pull request occur only after the separate SDD source-control approval. Merging and publishing `v0.1.0` remain later approval gates.

This revision supports the owner's established Cloudflare Tunnel origin pattern by exposing port `8099`, validating Cloudflare Access JWTs at the application boundary, sharing one installation workspace across both authenticated access paths, and testing both prefixed ingress and root-mounted Tunnel traffic.

Implementation record: all locally actionable phases are complete. The current
Home Assistant App linter requires the package to rely on defaults for startup,
automatic boot, ingress port `8099`, and administrator-only panel visibility,
so redundant metadata keys described in the original plan were omitted. The
verified implementation otherwise follows this plan. Detailed evidence is in
`specs/verification-home-assistant-app.md`.

## 2. Working constraints

- Preserve the current untracked application files; do not reset, discard, or overwrite the completed implementation.
- Keep all production code and fixtures property-neutral. Do not inspect or copy live Home Assistant data into the repository.
- Do not migrate the unused local D1/R2 state.
- Do not deploy to ChatGPT Sites or preserve Sites as a second production target.
- Do not create or modify the owner's Cloudflare Tunnel, DNS record, Access application, identity-provider configuration, or Access policy. Circuit Atlas only exposes and protects the origin expected by that separately managed setup.
- Do not commit a real Cloudflare team domain, Access audience, public hostname, tunnel identifier, network address, or identity. Use generated test keys and fictional identifiers in automated coverage.
- Do not create the remote repository, push code, tag a version, publish GHCR images, or access the Home Assistant Yellow during implementation without the applicable later approval or access.
- Use official Home Assistant and Next.js behavior as the compatibility baseline. Where the generated ingress prefix conflicts with Next.js build-time `basePath`, prove the adapter before broad source changes.

## 3. Phase 0 — Baseline and private-data audit

1. Record the current branch, file manifest, ignored paths, dependency versions, and current verification commands.
2. Run the existing type, lint, unit/schema, production-build, and rendered-page checks before changing runtime code. Distinguish pre-existing failures from conversion regressions.
3. Inspect ignored local runtime directories (`.wrangler`, generated builds, test output, exports, databases, and uploads) without staging them.
4. Scan source and fixtures for real addresses, room names, device identifiers, setup codes, credentials, local network addresses, or other house-specific data. Replace only accidental tracked/source candidates; preserve ignored user data.
5. Confirm the target GitHub repository name is still available and the authenticated GitHub account is `kmcrandom`, without creating anything.

Checkpoint: the completed Cloudflare-targeted application has a documented baseline, and the intended public source set contains no private installation data.

## 4. Phase 1 — Compatibility spikes

Resolve the two highest-risk runtime questions in small reversible slices before moving the repository layout or rewriting all repositories.

### 4.1 Node/SQLite/ARM64 spike

1. Replace the production build command in an isolated compatibility slice with a standard Next.js Node build and standalone output.
2. Add a minimal Node SQLite connection using Drizzle and the candidate synchronous SQLite driver.
3. Prove schema creation/migration, foreign-key enforcement, a transaction rollback, and clean shutdown on the development architecture.
4. Build a minimal `linux/arm64` container under QEMU/Buildx and confirm the native SQLite dependency loads and performs a read/write transaction.
5. Prefer a pinned Node 22 glibc-based multi-stage image if that materially reduces native module risk; retain Home Assistant-compatible OCI labels and an ARM64 final image.

### 4.2 Dynamic ingress-prefix and direct-origin spike

Next.js `basePath` is compiled into client bundles, while Home Assistant assigns an ingress path at runtime. Test an ingress adapter using a representative prefix such as `/api/hassio_ingress/test-token`.

The spike must prove both the Home Assistant ingress path and the separate root-mounted origin path:

- initial HTML and framework chunks;
- CSS, fonts, icons, and public files;
- a server-rendered page and React hydration;
- navigation between at least two App Router pages;
- client API GET and mutation requests;
- a file upload and authenticated download URL;
- redirects and not-found/error handling;
- direct root-mounted local development;
- a root-mounted request authenticated by a JWT signed by a local test issuer/JWKS server;
- rejection of the same direct request without a valid assertion.

Preferred implementation order:

1. Use a small internal ingress gateway in front of the Next server.
2. Inject a trusted request-time base-path value into the rendered shell.
3. Rewrite only reserved framework/public URL attributes at the gateway boundary.
4. Centralize application API URLs, navigation URLs, redirects, and downloadable URLs in prefix-aware helpers.
5. Use full-page navigation where Next's client router cannot safely represent a runtime prefix.

Do not use runtime source rebuilding, token-specific Docker images, a service worker controlling the Home Assistant origin, or blanket response rewriting that could alter user-entered property data.

Hard pause: if the Node/SQLite ARM64 build or representative ingress flow cannot be made reliable without changing the approved product architecture, update the specification and plan and request approval before continuing.

Checkpoint: a minimal Node/SQLite build runs on ARM64, the chosen ingress strategy works for a page, API mutation, and private file round trip under a runtime prefix, and the root-mounted origin is usable only with a verified Access assertion.

## 5. Phase 2 — Repository and runtime reshaping

1. Move the complete runnable Node project beneath `circuit-atlas/` so that directory is a self-contained Home Assistant Docker build context.
2. Leave product specifications and public repository governance files at the repository root.
3. Replace vinext/Wrangler/Sites scripts and configuration with standard Next.js development, build, typecheck, and start scripts.
4. Enable standalone output and ensure `public`, `.next/static`, migrations, and required native/runtime files are present in the final image.
5. Remove `.openai/hosting.json`, Sites build glue, the Cloudflare Worker entry point, Cloudflare runtime type dependencies, and generated Cloudflare-only artifacts after their replacements work.
6. Update TypeScript, ESLint, test, Playwright, Drizzle, and path-alias configuration for the nested App directory.
7. Preserve root-mounted local development with a local data directory that is ignored by Git.

Likely files and areas:

- `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`
- `vite.config.ts`, `worker/`, `build/`, `.openai/`
- runtime source and tests moved under `circuit-atlas/`
- root `.gitignore`, `AGENTS.md`, and repository metadata

Checkpoint: `npm ci`, local development, and the standard Next.js production build work from `circuit-atlas/` without Cloudflare runtime packages.

## 6. Phase 3 — Local SQLite persistence

1. Replace `cloudflare:workers` and `drizzle-orm/d1` initialization with a singleton local SQLite connection using `drizzle-orm/better-sqlite3` or the driver proven in Phase 1.
2. Configure the database path from a safe server-only runtime setting, defaulting to `/data/circuit-atlas.sqlite` in production and an ignored local path in development/tests.
3. Enable `foreign_keys`, a bounded `busy_timeout`, an appropriate journal mode, and any other required one-process durability settings when the connection opens.
4. Add an idempotent startup migration runner using the committed Drizzle SQL journal. Block readiness until migration succeeds.
5. Replace every D1 `batch`, `prepare`, `bind`, raw result, and D1 type dependency with SQLite transactions, prepared statements, or Drizzle repository operations.
6. Preserve the optimistic revision guards and verify that a failed child mutation rolls back its parent revision/event changes.
7. Convert portability/import operations to local transactions without changing the versioned export schema or preview/confirmation behavior.
8. Centralize database lifecycle so tests can create isolated temporary databases and the server can close cleanly on termination.

Primary files:

- `db/index.ts`, `db/schema.ts`, `drizzle/`, `drizzle.config.ts`
- `db/repositories/core.ts`
- `db/repositories/box-termination.ts`
- `db/repositories/capture.ts`
- `db/repositories/aggregates.ts`
- `db/repositories/workspaces.ts`
- `db/repositories/portability.ts`
- integration and clean-schema tests

Focused verification:

- empty schema creation and re-running migrations;
- foreign-key/integrity checks;
- property isolation;
- optimistic conflicts;
- box termination atomicity;
- capture completion atomicity and idempotency;
- import add/merge rollback;
- concurrent/busy error behavior;
- restart persistence.

Checkpoint: all structured workflows pass against local SQLite with no D1 runtime or type reference remaining.

## 7. Phase 4 — Private filesystem adapter

1. Introduce a private file-store interface so repository code depends on put/get/delete/list behavior rather than R2 types.
2. Implement the production adapter under `/data/files` and a temporary-directory adapter for tests.
3. Validate and normalize opaque object keys before resolving them; reject absolute paths, traversal, separator tricks, and property-scope mismatches.
4. Write uploads to a temporary sibling path, flush/close them, and atomically rename only after validation.
5. Keep attachment metadata and file persistence consistent across create/archive/import operations, with cleanup or quarantine for partial failure.
6. Convert file streaming to Node/Web streams supported by Next route handlers without exposing filesystem paths.
7. Preserve MIME/signature/size validation, content-disposition behavior, checksums, complete export archives, and property authorization.
8. Remove R2 imports, environment bindings, mocks, and Cloudflare-only tests after equivalent coverage passes.

Primary files:

- `db/repositories/files.ts`
- `db/repositories/portability.ts`
- `lib/files/` and API file routes
- upload, download, export/import, and path-safety tests

Checkpoint: a floor plan/photo can be uploaded, restarted, downloaded, exported, imported, and archived through authenticated routes while the backing directory remains private.

## 8. Phase 5 — Home Assistant identity, Cloudflare Access, and complete ingress adaptation

1. Replace OpenAI/ChatGPT authentication with a centralized identity resolver that returns an authenticated provider, stable subject, and display metadata without using those values as the installation workspace key.
2. Accept `X-Remote-User-Id`, `X-Remote-User-Name`, `X-Remote-User-Display-Name`, and ingress routing headers only when the network peer is the documented Home Assistant Supervisor ingress proxy source (`172.30.32.2` under the supported Supervisor network contract). Reject copied Home Assistant headers on the exposed port.
3. Add Cloudflare Access assertion verification with `jose`: validate the `Cf-Access-Jwt-Assertion` signature against the configured team's rotating JWKS, exact issuer, application audience, expiry, and required subject/email identity claims.
4. Validate and canonicalize the configured team domain before constructing its issuer and JWKS URL. Restrict retrieval to that HTTPS Cloudflare Access origin, cache keys through the verification library, refresh safely on rotation, and fail closed when no cached valid key can verify an assertion.
5. Load the optional `cloudflare_access.team_domain` and `cloudflare_access.audience` group from `/data/options.json`, with environment overrides only for local integration tests. If either value is blank or missing, disable direct-origin application requests while retaining Home Assistant ingress.
6. Map every authenticated Home Assistant or Cloudflare Access request to one fixed installation-scoped workspace. Retain the provider and subject separately as the actor on change events so audit attribution is not lost.
7. Remove ChatGPT sign-in/sign-out/callback UI and redirects. Preserve the explicit non-production local identity and fail closed in production.
8. Add `GET /health` with storage/migration readiness and no private details. Keep it outside the identity requirement while preventing it from exposing record counts, paths, identities, or configuration. Permit immutable build assets without identity only when they cannot disclose installation data; require identity for HTML, APIs, downloads, and all other application routes.
9. Apply the proven runtime-prefix adapter to all framework assets, public assets, links, router operations, redirects, API helpers, file URLs, PDF loads, search result URLs, selection state, and capture/settings navigation. Preserve root-mounted direct-origin and local-development behavior.
10. Ensure missing or malformed identity produces a useful authentication error state rather than onboarding under a fake owner.
11. Add targeted security coverage for forged Home Assistant and Cloudflare identity headers, missing/bad assertions, workspace sharing across providers, actor attribution, and existing property-scoped authorization.

Primary files:

- `lib/auth/identity.ts`, Cloudflare Access verifier/options loader, and removal/replacement of `app/chatgpt-auth.ts`
- root layout/home/onboarding authentication handling
- `lib/client/api.ts` plus a new base-path/navigation helper
- components and feature code containing root-absolute links or requests
- ingress gateway/launcher and health route
- auth/JWKS, navigation, rendered HTML, direct-origin, and prefixed-path tests

Checkpoint: the complete app works with a representative ingress prefix and the protected root-mounted origin, both paths open the same installation workspace, direct-root development still works, and production identity fails closed.

## 9. Phase 6 — Home Assistant packaging and public repository files

1. Add root `repository.yaml` for Circuit Atlas.
2. Add `circuit-atlas/config.yaml` for `aarch64`, administrator-only ingress on port `8099`, automatic boot, experimental stage, host mapping `8099/tcp: 8099`, a clear port description, and no unnecessary permissions.
3. Add the optional `cloudflare_access` options group and schema for `team_domain` and `audience`. Keep both blank by default so an unconfigured installation remains ingress-only and direct application requests fail closed.
4. Add a multi-stage ARM64-capable Dockerfile, `.dockerignore`, and `run.sh` that starts the ingress gateway/application, stores authoritative state only under `/data`, and handles termination cleanly.
5. Add App-local `README.md` and `CHANGELOG.md` with a `0.1.0` entry. Explain that Tunnel provides routing while Access provides the required direct-origin authorization, and document where to copy the team domain and Audience tag without including real values.
6. Add root README, MIT license, contribution guide, security policy, and repo instructions modeled on Family Menu and MinuteMetrics while documenting Circuit Atlas's private electrical/floor-plan and commissioning data.
7. Add CI for Node verification, schema tests, standard production build, App metadata/version validation, ARM64 image build, container health, prefixed-ingress smoke tests, and protected direct-origin smoke tests with generated signing keys.
8. Add tag/manual GHCR publishing for version and `latest`, using only the standard GitHub workflow token.
9. Add Dependabot coverage for npm, Docker, and GitHub Actions.
10. Add a release-image verification helper that confirms the configured version exists in GHCR after a later release workflow finishes.

Primary files:

- `repository.yaml`
- `circuit-atlas/config.yaml`, `Dockerfile`, `.dockerignore`, `run.sh`, `README.md`, `CHANGELOG.md`
- `.github/workflows/ci.yml`
- `.github/workflows/publish-home-assistant-app.yml`
- `.github/dependabot.yml`
- root `README.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md`
- validation/release scripts

Checkpoint: Home Assistant recognizes the repository shape and options, the App image builds for `linux/arm64` without compiling on Yellow, both entry points are covered, and no release image has been pushed.

## 10. Phase 7 — Full verification

Run and record:

1. Clean dependency installation from the nested App directory.
2. Strict TypeScript check and lint.
3. Unit, component, repository, migration, security, portability, and rendered-page tests.
4. Standard Next.js production build.
5. Root-mounted local browser checks for onboarding, breaker lookup, asset lookup, box termination, map/file upload, smart-device secret masking, and export/import.
6. Representative prefixed-ingress browser checks for the same navigation shell plus page transitions, API mutation, upload/download, and refresh/deep-link behavior.
7. Root-mounted direct-origin browser checks using a generated signing key and local JWKS fixture, including navigation, an API mutation, upload/download, refresh, and deep links.
8. Authentication/security tests covering: Home Assistant headers accepted only from the Supervisor proxy; forged Cloudflare email headers; missing JWT; bad signature; wrong issuer; wrong audience; expired assertion; absent subject/email; signing-key rotation; JWKS outage with a usable cached key; and JWKS outage with no usable key.
9. Cross-provider tests proving Home Assistant ingress and Cloudflare Access reach the same installation workspace while change events retain distinct provider/subject actors.
10. Direct-port tests proving unauthenticated application and private-file requests return `401`/`403`, the health response remains minimal, and blank/incomplete Access options disable direct application access.
11. `linux/arm64` Docker build under Buildx/QEMU.
12. Container startup with temporary `/data`, health readiness, both authenticated access paths, onboarding, persistence across restart, and SQLite/file integrity.
13. Image metadata, layer contents, final size, startup time, idle memory where measurable, and termination behavior.
14. Dependency vulnerability audit and tracked-file/final-context private-data scan, including team domains, audiences, hostnames, network addresses, JWTs, and generated-test-key separation.
15. Repository metadata, App metadata/options, changelog/version, workflow syntax, and GHCR tag-name validation.

Do not claim physical Home Assistant Yellow installation success before a release image exists and is installed on the device. Pre-release completion may claim local/QEMU ARM64 container compatibility only. After an approved `v0.1.0` release, verify the GHCR manifest and ask the user to install it on Yellow or provide authorized access for a hardware smoke test.

Checkpoint: all locally available checks pass, any hardware-only validation is explicitly identified, and the source is ready for the approval-gated GitHub wrap-up.

## 11. Phase 8 — Approval-gated GitHub publication

After implementation and verification, stop and summarize the result. Ask for approval to commit, create the public repository, push, and open a ready-for-review pull request.

Because this checkout has no commits, the approved publication sequence is:

1. Create an empty local root commit while leaving the completed files unstaged.
2. Point local `main` at that empty root commit.
3. Stage only the reviewed Circuit Atlas source/spec/documentation/workflow files on `sdd/home-assistant-app`.
4. Commit the complete implementation as the feature-branch child of `main`.
5. Create public `kmcrandom/circuit-atlas-ha` without initializing unrelated files.
6. Add the exact remote, push `main`, then push `sdd/home-assistant-app`.
7. Open a ready-for-review PR from `sdd/home-assistant-app` to `main` containing the specification, implementation, privacy, and verification summary.
8. Report the repository and PR URLs, then ask for approval to merge and delete the branch locally/remotely.
9. After merge approval, merge the PR, remove the feature branch, switch local checkout to `main`, and confirm a clean synchronized repository.
10. Ask separately whether to create the initial `v0.1.0` GitHub Release and publish the GHCR image.

The initial repository push does not itself publish an installable image. A usable Home Assistant repository installation requires the later approved `v0.1.0` tag/release workflow to create `ghcr.io/kmcrandom/circuit-atlas-ha:0.1.0` and `:latest`.

## 12. Risks and mitigations

### Dynamic ingress prefix

Risk: Next.js normally requires a build-time base path, while Home Assistant's ingress prefix is installation-specific.

Mitigation: prove the request-time gateway and centralized client URL strategy before broad conversion; cover deep links, RSC/navigation, API, and private files. Stop for a spec change if the spike is unreliable.

### Native SQLite dependency on ARM64

Risk: the local development architecture may pass while the native module fails in the Yellow image.

Mitigation: build and execute the SQLite smoke test inside the ARM64 image during Phase 1 and CI; use a pinned glibc Node image if necessary.

### D1 batch-to-SQLite transaction semantics

Risk: mechanical API replacement could weaken optimistic guards or allow partial topology/capture/import writes.

Mitigation: central transaction helpers plus focused rollback, stale-revision, idempotency, and import-failure tests before removing D1 code.

### Filesystem/database consistency

Risk: a crash between file and metadata operations can leave an orphan or broken attachment.

Mitigation: atomic temporary-file rename, compensating cleanup/quarantine, checksum verification, and startup/integrity diagnostics.

### Exposed direct-origin port

Risk: mapping host port `8099` lets other local-network clients reach the origin even when the intended consumer is the Cloudflare Tunnel.

Mitigation: require a cryptographically verified Cloudflare Access assertion for every direct-origin application/data request; reject forged Home Assistant and Cloudflare identity headers; keep only the minimal health endpoint and non-sensitive immutable build assets outside authentication; document optional network-level restriction as defense in depth.

### Cloudflare Access JWKS availability and key rotation

Risk: an unavailable JWKS endpoint or signing-key rotation could either lock out valid remote users or tempt an unsafe verification fallback.

Mitigation: use the maintained `jose` remote-JWKS verifier, validate the configured issuer and audience, cache verified keys, refresh safely on an unknown key, and fail closed whenever no currently usable key verifies the assertion. Cover cached/outage and rotation cases with generated-key integration tests.

### Shared workspace across two identity providers

Risk: keying workspaces to upstream users would split the property data, while collapsing identity entirely would remove useful attribution. Access policies that admit an unintended person would expose the whole installation workspace.

Mitigation: use one installation-scoped workspace identifier, store the authenticated provider/subject separately on change events, and document that Home Assistant administrators plus the Cloudflare Access allow policy are the initial release's membership boundary.

### Repository has no baseline commit

Risk: pushing the feature branch first could make it the default branch or prevent a normal PR to `main`.

Mitigation: create the approved empty root commit and `main` pointer locally during the publication gate, then commit the implementation as its child and push `main` first.

### No physical Yellow verification before release

Risk: a QEMU-compatible image can still expose a Supervisor- or device-specific issue.

Mitigation: do not overstate validation; publish only after approval, verify the GHCR manifest, then perform a documented Yellow installation smoke test as the first release follow-up.

## 13. Completion criteria

Implementation is ready for GitHub publication when:

- the approved Home Assistant App specification remains current;
- no Cloudflare Worker, Sites, D1, or R2 production runtime/storage dependency remains; Cloudflare Access is used only to authenticate the separately managed Tunnel origin;
- local SQLite and private filesystem persistence pass atomicity, isolation, restart, and portability checks;
- Home Assistant ingress identity/dynamic-prefix behavior and Cloudflare Access direct-origin behavior pass security and browser tests;
- direct-origin requests fail closed without a valid assertion, including when Access options are blank or incomplete;
- both authenticated providers reach the same installation workspace while provider/subject attribution remains distinct;
- the ARM64 container builds, starts, reports healthy, and preserves `/data` across restart;
- the Home Assistant repository/App metadata and CI/publish workflows validate;
- no house-specific data, commissioning value, credential, database, upload, or export is included;
- all locally available verification is green and hardware-only validation is disclosed;
- the work remains uncommitted and unpushed until the user explicitly approves the GitHub wrap-up.
