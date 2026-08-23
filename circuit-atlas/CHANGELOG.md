# Changelog

## 0.1.0 - 2026-08-22

- Initial Home Assistant App package for Home Assistant Yellow (`aarch64`).
- Store structured data in SQLite and private uploads in `/data`.
- Support authenticated Home Assistant Ingress at arbitrary ingress paths.
- Support direct Cloudflare Tunnel access verified with Cloudflare Access JWTs.
- Fail closed for unauthenticated direct access and strip forged identity headers.
