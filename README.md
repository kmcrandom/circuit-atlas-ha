# Circuit Atlas for Home Assistant

Circuit Atlas is a private, local-first web app for documenting a home's
electrical system. It maps panels and breakers to switches, receptacles,
fixtures, appliances, cables, and individual conductors. It supports arbitrary
n-way switching, physical gang-box layouts, smart-device records, and floor
plans without putting house-specific information in the source code.

This repository packages Circuit Atlas as a Home Assistant App for a Home
Assistant Yellow (`aarch64`). The app stores its SQLite database and private
files in Home Assistant's backed-up `/data` volume.

## Install

1. In Home Assistant, open **Settings → Apps → App store**.
2. Open the store menu, choose **Repositories**, and add:
   `https://github.com/kmcrandom/circuit-atlas-ha`
3. Install **Circuit Atlas**, start it, and open it from the Home Assistant
   sidebar.

Home Assistant Ingress authenticates sidebar access. Port `8099` is also
published for a Cloudflare Tunnel, but direct requests fail closed unless a
valid Cloudflare Access assertion is supplied. See
[`circuit-atlas/DOCS.md`](circuit-atlas/DOCS.md) for the Cloudflare setup,
backups, and recovery steps.

## Development

The application source and Home Assistant package live in `circuit-atlas/`.
Node.js 22.22.2 or newer is required.

```bash
cd circuit-atlas
npm ci
npm run lint
npm test
```

The GitHub workflows verify the app, build its `linux/arm64` image, and publish
versioned images to `ghcr.io/kmcrandom/circuit-atlas-ha` when a matching `v*`
tag is pushed.

## Safety

Circuit Atlas is a documentation aid, not a substitute for testing, permits,
code compliance, or a qualified electrician. Treat all conductors as energized
until a suitable tester proves otherwise, and de-energize and verify before
opening or working in electrical boxes.

Licensed under the [MIT License](LICENSE).
