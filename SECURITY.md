# Security Policy

Circuit Atlas stores sensitive information about a home's physical electrical
system and smart devices. Do not publish its database, private files, exports,
Cloudflare Access audience, setup codes, MAC addresses, or Zigbee identifiers.

Please report suspected vulnerabilities privately through GitHub's **Report a
vulnerability** feature rather than a public issue. Do not include real house
data in a report; use a minimal fictional reproduction.

Only the latest release is supported. Keep Home Assistant, Circuit Atlas, and
Cloudflare Tunnel updated. Expose port `8099` only through a Cloudflare Tunnel
protected by Cloudflare Access; do not port-forward it from a router.

The Home Assistant package remains in protected mode and requests no host
network, hardware device, Supervisor API, Home Assistant API, or host-folder
access. Its only writable persistent location is the Supervisor-managed
`/data` volume.
