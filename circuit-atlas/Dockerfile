ARG NODE_VERSION=22.22.2
FROM node:${NODE_VERSION}-bookworm-slim AS dependencies

WORKDIR /app
RUN apt-get update \
    && apt-get install --yes --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS runner

ARG BUILD_ARCH=aarch64
ARG BUILD_VERSION=0.1.0

LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    io.hass.arch="${BUILD_ARCH}" \
    org.opencontainers.image.title="Circuit Atlas" \
    org.opencontainers.image.description="Local-first home electrical system documentation" \
    org.opencontainers.image.source="https://github.com/kmcrandom/circuit-atlas-ha" \
    org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    CIRCUIT_ATLAS_HOST=0.0.0.0 \
    CIRCUIT_ATLAS_PORT=8099 \
    CIRCUIT_ATLAS_BACKEND_HOST=127.0.0.1 \
    CIRCUIT_ATLAS_BACKEND_PORT=3000 \
    CIRCUIT_ATLAS_DATA_DIR=/data \
    CIRCUIT_ATLAS_DATABASE_PATH=/data/circuit-atlas.sqlite \
    CIRCUIT_ATLAS_FILES_DIR=/data/files \
    CIRCUIT_ATLAS_OPTIONS_PATH=/data/options.json \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY --from=builder /app/.next/standalone /app/.next/standalone
COPY --from=builder /app/runtime /app/runtime
# The gateway runs outside Next's standalone dependency trace.
COPY --from=dependencies /app/node_modules/jose /app/node_modules/jose
COPY run.sh /run.sh
RUN chmod a+x /run.sh

EXPOSE 8099
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "/app/runtime/healthcheck.mjs"]
CMD ["/run.sh"]
