# Circuit Atlas

Circuit Atlas documents breakers, switches, receptacles, fixtures, bulbs,
appliances, cables, individual conductors, and smart-device details for one Home
Assistant installation. It supports arbitrary n-way switching and floor-plan
visualization.

## Open from Home Assistant

Start the app, then select **Circuit Atlas** in the Home Assistant sidebar.
Home Assistant Ingress supplies the authenticated identity. The sidebar entry
is restricted to Home Assistant administrators by default.

## Cloudflare Tunnel access

Port `8099` exists for a Cloudflare Tunnel. It is not a second unprotected login
page: Circuit Atlas accepts direct traffic only when Cloudflare Access supplies
a valid signed assertion.

1. In Cloudflare Zero Trust, create a **Self-hosted** Access application for the
   Circuit Atlas hostname and add the desired Access policies.
2. In the tunnel's public hostname, route that hostname to
   `http://<home-assistant-address>:8099`.
3. Copy the Access **Application Audience (AUD) Tag**.
4. In the Circuit Atlas app configuration, enter:
   - `team_domain`: the exact `<team>.cloudflareaccess.com` hostname.
   - `audience`: the Access application AUD tag.
5. Save the configuration and restart Circuit Atlas.

Cloudflare Tunnel provides routing; Cloudflare Access provides authentication.
Both pieces are required. Do not add a router port-forward for `8099`. Requests
with a missing, expired, incorrectly signed, wrong-issuer, or wrong-audience JWT
are rejected.

If Access has not been configured, the Home Assistant sidebar still works, but
all direct requests to port `8099` fail closed.

## Storage and backups

Circuit Atlas keeps all persistent data inside `/data`:

- `/data/circuit-atlas.sqlite` — structured electrical records and audit history
- `/data/files/` — floor plans, evidence photos, and other private files
- `/data/options.json` — Home Assistant-managed app options

The app requests a **cold** Home Assistant backup so SQLite and files are copied
while the app is stopped. Include Circuit Atlas when creating a Home Assistant
backup. To restore, restore the app and its data together through Home
Assistant's backup interface.

The application can also create portable exports. Treat backups and exports as
sensitive: they may reveal a home's layout, electrical system, smart-device
identifiers, setup codes, and network details.

## Troubleshooting

- **Sidebar fails:** confirm the app is running and review its log. Ingress is
  accepted only from Home Assistant's authenticated ingress proxy.
- **Cloudflare URL returns 403:** configure both `team_domain` and `audience`.
- **Cloudflare URL returns 401:** confirm the hostname uses the intended Access
  application and that its AUD tag and team domain exactly match the app options.
- **App is starting:** wait a few seconds for database migrations and the web
  runtime, then reload.

## Electrical safety

Circuit Atlas is a documentation aid, not a substitute for testing, permits,
code compliance, or a qualified electrician. Treat all conductors as energized
until a suitable tester proves otherwise, and de-energize and verify before
opening or working in electrical boxes.
