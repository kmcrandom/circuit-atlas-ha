# Repository guidance

- Keep all house-specific information in runtime data, never in source or fixtures.
- Treat floor plans, photos, exports, network identifiers, and setup codes as private.
- Run commands from `circuit-atlas/` unless a workflow or repository file is being changed.
- Preserve Home Assistant Ingress and Cloudflare Access authentication boundaries.
- Update the approved specifications in `specs/` when behavior or architecture changes.
- Run `npm run lint` and `npm test` before proposing a release.
