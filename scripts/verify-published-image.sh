#!/usr/bin/env bash
set -euo pipefail

version="${1:?app version is required}"
image="ghcr.io/kmcrandom/circuit-atlas-ha:${version}"
manifest="$(docker buildx imagetools inspect "${image}")"

printf '%s\n' "${manifest}"
if ! grep --extended-regexp --quiet \
  'Platform:[[:space:]]+linux/arm64' <<< "${manifest}"; then
  printf 'Public image %s does not advertise linux/arm64.\n' "${image}" >&2
  exit 1
fi
