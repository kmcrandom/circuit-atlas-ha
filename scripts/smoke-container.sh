#!/usr/bin/env bash
set -euo pipefail

image="${1:?container image is required}"
container="circuit-atlas-smoke-${GITHUB_RUN_ID:-local}"
data_dir="$(mktemp -d "${PWD}/.container-smoke.XXXXXX")"

cleanup() {
  docker rm --force "${container}" >/dev/null 2>&1 || true
  rm -rf "${data_dir}"
}
trap cleanup EXIT

printf '{"cloudflare_access":{"team_domain":"","audience":""}}\n' \
  > "${data_dir}/options.json"
docker run --detach --name "${container}" \
  --publish 18099:8099 \
  --volume "${data_dir}:/data" \
  "${image}" >/dev/null

for _ in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:18099/health >/dev/null; then
    break
  fi
  sleep 1
done

curl --fail --silent http://127.0.0.1:18099/health \
  | grep --quiet '"status":"ok"'
docker exec "${container}" node /app/runtime/healthcheck.mjs
status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  http://127.0.0.1:18099/)"
test "${status}" = "403"
test -f "${data_dir}/circuit-atlas.sqlite"
test -d "${data_dir}/files"
