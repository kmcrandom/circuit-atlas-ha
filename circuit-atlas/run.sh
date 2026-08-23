#!/usr/bin/env sh
set -eu

mkdir -p /data/files
exec node /app/runtime/start.mjs
