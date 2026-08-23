# Contributing

Circuit Atlas is early-stage software. Please open an issue before undertaking
a large change so the data model and Home Assistant deployment constraints can
be agreed first.

## Local checks

```bash
cd circuit-atlas
npm ci
npm run lint
npm test
```

Keep all examples fictional. Never commit a real address, floor plan, panel
schedule, device identifier, setup code, MAC address, Zigbee IEEE address,
database, upload, or export.

Changes to behavior, the data model, security, or deployment should update the
corresponding files in `specs/`. Changes to the Home Assistant package should
also update `circuit-atlas/CHANGELOG.md` and increment
`circuit-atlas/config.yaml` when released.

## Release checks

After an approved change is merged, create a `v<version>` tag matching
`circuit-atlas/config.yaml`. The publish workflow builds the `linux/arm64`
image and publishes the version plus `latest` tags to GitHub Container
Registry. Because the workflow links the image to this public repository, the
package normally inherits public visibility. Confirm that anonymous pulls are
enabled and run:

```bash
bash scripts/verify-published-image.sh <version>
```
