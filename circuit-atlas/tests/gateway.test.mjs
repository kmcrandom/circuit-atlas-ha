import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import {
  authorizeRequest,
  createCloudflareAccessVerifier,
  normalizeCloudflareAccessConfig,
  rewriteRuntimePaths,
  sanitizedProxyHeaders,
} from "../runtime/gateway-core.mjs";
import { startGateway } from "../runtime/gateway.mjs";

const config = normalizeCloudflareAccessConfig({
  team_domain: "fictional-team.cloudflareaccess.com",
  audience: "fictional_audience",
});

async function signingFixture(kid = "key-1") {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  return {
    privateKey,
    jwk: { ...jwk, alg: "RS256", kid, use: "sig" },
    sign(claims = {}, overrides = {}) {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({
        email: "owner@example.test",
        ...claims,
      })
        .setProtectedHeader({ alg: "RS256", kid })
        .setIssuer(overrides.issuer ?? config.issuer)
        .setAudience(overrides.audience ?? config.audience)
        .setSubject(overrides.subject ?? "cloudflare-user-1")
        .setIssuedAt(now)
        .setExpirationTime(overrides.expiration ?? now + 300)
        .sign(privateKey);
    },
  };
}

test("Cloudflare Access configuration is restricted to the configured team origin", () => {
  assert.deepEqual(config, {
    issuer: "https://fictional-team.cloudflareaccess.com",
    audience: "fictional_audience",
    jwksUrl:
      "https://fictional-team.cloudflareaccess.com/cdn-cgi/access/certs",
  });
  assert.equal(
    normalizeCloudflareAccessConfig({ team_domain: "", audience: "" }),
    null,
  );
  assert.equal(
    normalizeCloudflareAccessConfig({
      team_domain: "fictional-team.cloudflareaccess.com",
      audience: "",
    }),
    null,
  );
  assert.throws(() =>
    normalizeCloudflareAccessConfig({
      team_domain: "https://attacker.example",
      audience: "fictional_audience",
    }),
  );
});

test("a valid Cloudflare Access assertion produces a provider-scoped identity", async () => {
  const fixture = await signingFixture();
  const verifier = createCloudflareAccessVerifier(config, {
    jwks: createLocalJWKSet({ keys: [fixture.jwk] }),
  });
  const identity = await verifier(await fixture.sign());
  assert.deepEqual(identity, {
    provider: "cloudflare-access",
    subject: "cloudflare-user-1",
    email: "owner@example.test",
    displayName: "owner@example.test",
  });
});

test("Cloudflare Access verification rejects wrong scope, expiry, identity, and signature", async () => {
  const fixture = await signingFixture();
  const other = await signingFixture("other-key");
  const verifier = createCloudflareAccessVerifier(config, {
    jwks: createLocalJWKSet({ keys: [fixture.jwk] }),
  });
  await assert.rejects(
    verifier(await fixture.sign({}, { issuer: "https://other.cloudflareaccess.com" })),
  );
  await assert.rejects(
    verifier(await fixture.sign({}, { audience: "wrong_audience" })),
  );
  await assert.rejects(verifier(await fixture.sign({}, { expiration: 1 })));
  await assert.rejects(verifier(await fixture.sign({ email: undefined })));
  await assert.rejects(verifier(await other.sign()));
});

test("the verifier can refresh to a rotated signing key without an unsafe fallback", async () => {
  const first = await signingFixture("key-1");
  const second = await signingFixture("key-2");
  let activeKeySet = createLocalJWKSet({ keys: [first.jwk] });
  const verifier = createCloudflareAccessVerifier(config, {
    jwks: (...arguments_) => activeKeySet(...arguments_),
  });
  await verifier(await first.sign());
  activeKeySet = createLocalJWKSet({ keys: [second.jwk] });
  await verifier(await second.sign());
  await assert.rejects(verifier(await first.sign()));
});

test("a cached signing key survives a JWKS outage but a cold verifier fails closed", async () => {
  const fixture = await signingFixture();
  let available = true;
  let fetches = 0;
  const fetch = async () => {
    fetches += 1;
    if (!available) throw new Error("fictional JWKS outage");
    return Response.json(
      { keys: [fixture.jwk] },
      { headers: { "cache-control": "public, max-age=3600" } },
    );
  };
  const verifier = createCloudflareAccessVerifier(config, { fetch });
  const assertion = await fixture.sign();
  await verifier(assertion);
  available = false;
  await verifier(assertion);
  assert.equal(fetches, 1);

  const coldVerifier = createCloudflareAccessVerifier(config, { fetch });
  await assert.rejects(coldVerifier(assertion));
});

test("Home Assistant identity is accepted only from the Supervisor ingress peer", async () => {
  const headers = {
    "x-remote-user-id": "ha-user-1",
    "x-remote-user-display-name": "HA Owner",
    "x-ingress-path": "/api/hassio_ingress/test-token",
  };
  const trusted = await authorizeRequest({
    headers,
    peerAddress: "172.30.32.2",
    pathname: "/api/hassio_ingress/test-token/properties",
    accessVerifier: null,
    environment: { NODE_ENV: "production" },
  });
  assert.deepEqual(trusted.identity, {
    provider: "home-assistant",
    subject: "ha-user-1",
    email: null,
    displayName: "HA Owner",
  });
  assert.equal(trusted.basePath, "/api/hassio_ingress/test-token");

  await assert.rejects(
    authorizeRequest({
      headers,
      peerAddress: "192.0.2.10",
      pathname: "/properties",
      accessVerifier: null,
      environment: { NODE_ENV: "production" },
    }),
    (error) => error.status === 403,
  );
});

test("the proxy strips spoofed identity headers and injects only verified identity", () => {
  const headers = sanitizedProxyHeaders(
    {
      host: "atlas.example.test",
      "x-remote-user-id": "forged",
      "cf-access-jwt-assertion": "secret-token",
      "x-circuit-atlas-auth-subject": "forged",
    },
    {
      provider: "cloudflare-access",
      subject: "verified-subject",
      email: "owner@example.test",
      displayName: "owner@example.test",
    },
    "",
  );
  assert.equal(headers["x-remote-user-id"], undefined);
  assert.equal(headers["cf-access-jwt-assertion"], undefined);
  assert.equal(headers["x-circuit-atlas-auth-subject"], "verified-subject");
});

test("runtime rewriting changes only reserved application paths", () => {
  const source =
    '<script src="/__circuit_atlas/_next/static/app.js"></script><link href="/favicon.svg"><p>/properties</p>';
  assert.equal(
    rewriteRuntimePaths(source, "/api/hassio_ingress/test-token"),
    '<script src="/api/hassio_ingress/test-token/__circuit_atlas/_next/static/app.js"></script><link href="/api/hassio_ingress/test-token/favicon.svg"><p>/properties</p>',
  );
});

test("the root-mounted gateway authenticates Cloudflare Access before proxying", async (context) => {
  const fixture = await signingFixture();
  const verifier = createCloudflareAccessVerifier(config, {
    jwks: createLocalJWKSet({ keys: [fixture.jwk] }),
  });
  const backend = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        path: request.url,
        provider: request.headers["x-circuit-atlas-auth-provider"],
        subject: request.headers["x-circuit-atlas-auth-subject"],
        forged: request.headers["x-remote-user-id"],
      }),
    );
  });
  await new Promise((resolve, reject) => {
    backend.once("error", reject);
    backend.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => backend.close(resolve)));
  const backendPort = backend.address().port;
  const gateway = await startGateway({
    host: "127.0.0.1",
    port: 0,
    backendPort,
    accessVerifier: verifier,
    environment: { NODE_ENV: "production" },
  });
  context.after(() => new Promise((resolve) => gateway.close(resolve)));
  const origin = `http://127.0.0.1:${gateway.address().port}`;

  const denied = await fetch(`${origin}/properties`);
  assert.equal(denied.status, 401);

  const allowed = await fetch(`${origin}/properties?view=all`, {
    headers: {
      "cf-access-jwt-assertion": await fixture.sign(),
      "x-remote-user-id": "forged-ha-user",
      "x-circuit-atlas-auth-subject": "forged-internal-user",
    },
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), {
    path: "/properties?view=all",
    provider: "cloudflare-access",
    subject: "cloudflare-user-1",
  });
});
