import { readFile } from "node:fs/promises";
import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";

export const AUTH_HEADERS = Object.freeze({
  provider: "x-circuit-atlas-auth-provider",
  subject: "x-circuit-atlas-auth-subject",
  email: "x-circuit-atlas-auth-email",
  displayName: "x-circuit-atlas-auth-display-name",
  basePath: "x-circuit-atlas-base-path",
});

const DEFAULT_OPTIONS_PATH = "/data/options.json";
const DEFAULT_TRUSTED_INGRESS_PROXIES = ["172.30.32.2"];
const INGRESS_PATH = /^\/api\/hassio_ingress\/[A-Za-z0-9_-]{1,256}$/;
const PUBLIC_PATHS = new Set([
  "/favicon.svg",
  "/og.png",
  "/pdf.worker.min.mjs",
]);

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function trimmedHeader(headers, name) {
  return firstHeader(headers[name])?.trim() || "";
}

export function normalizePeerAddress(value) {
  const address = value?.trim() || "";
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

export function trustedIngressProxies(environment = process.env) {
  const configured = environment.CIRCUIT_ATLAS_TRUSTED_INGRESS_PROXIES?.trim();
  if (!configured) return new Set(DEFAULT_TRUSTED_INGRESS_PROXIES);
  return new Set(
    configured
      .split(",")
      .map((item) => normalizePeerAddress(item))
      .filter(Boolean),
  );
}

export function normalizeIngressPath(value) {
  const candidate = value?.trim().replace(/\/+$/, "") || "";
  return INGRESS_PATH.test(candidate) ? candidate : "";
}

export function ingressPathFromRequest(pathname, headers, trustedPeer) {
  if (!trustedPeer) return "";
  const declared = normalizeIngressPath(trimmedHeader(headers, "x-ingress-path"));
  if (declared) return declared;
  const match = pathname.match(
    /^\/api\/hassio_ingress\/[A-Za-z0-9_-]{1,256}(?=\/|$)/,
  );
  return normalizeIngressPath(match?.[0]);
}

export function normalizeCloudflareAccessConfig(raw) {
  const teamDomain = raw?.team_domain?.trim() || "";
  const audience = raw?.audience?.trim() || "";
  if (!teamDomain || !audience) return null;

  const value = teamDomain.includes("://") ? teamDomain : `https://${teamDomain}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Cloudflare Access team_domain is not a valid URL or hostname.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/i.test(
      url.hostname,
    )
  ) {
    throw new Error(
      "Cloudflare Access team_domain must be an HTTPS <team>.cloudflareaccess.com origin.",
    );
  }
  if (audience.length > 512 || !/^[A-Za-z0-9_-]+$/.test(audience)) {
    throw new Error("Cloudflare Access audience is invalid.");
  }
  const issuer = `https://${url.hostname.toLowerCase()}`;
  return {
    issuer,
    audience,
    jwksUrl: `${issuer}/cdn-cgi/access/certs`,
  };
}

export async function loadCloudflareAccessConfig(environment = process.env) {
  const envTeam = environment.CIRCUIT_ATLAS_ACCESS_TEAM_DOMAIN?.trim();
  const envAudience = environment.CIRCUIT_ATLAS_ACCESS_AUDIENCE?.trim();
  if (envTeam || envAudience) {
    return normalizeCloudflareAccessConfig({
      team_domain: envTeam,
      audience: envAudience,
    });
  }

  const optionsPath =
    environment.CIRCUIT_ATLAS_OPTIONS_PATH?.trim() || DEFAULT_OPTIONS_PATH;
  let options;
  try {
    options = JSON.parse(await readFile(optionsPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("Circuit Atlas could not read its Home Assistant options.", {
      cause: error,
    });
  }
  return normalizeCloudflareAccessConfig(options?.cloudflare_access);
}

export function createCloudflareAccessVerifier(config, dependencies = {}) {
  if (!config) return null;
  const remoteOptions = {
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
    timeoutDuration: 5_000,
  };
  if (dependencies.fetch) remoteOptions[customFetch] = dependencies.fetch;
  const keySet =
    dependencies.jwks ||
    createRemoteJWKSet(new URL(config.jwksUrl), remoteOptions);
  return async (assertion) => {
    if (!assertion || assertion.length > 16_384) {
      throw new Error("A Cloudflare Access assertion is required.");
    }
    const { payload } = await jwtVerify(assertion, keySet, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["RS256"],
    });
    const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    if (!subject || !email || subject.length > 512 || email.length > 320) {
      throw new Error("The Cloudflare Access assertion has no usable identity.");
    }
    return {
      provider: "cloudflare-access",
      subject,
      email,
      displayName: email,
    };
  };
}

export function isUnauthenticatedPublicPath(pathname) {
  return (
    pathname === "/health" ||
    pathname.startsWith("/__circuit_atlas/_next/static/") ||
    PUBLIC_PATHS.has(pathname)
  );
}

export async function authorizeRequest({
  headers,
  peerAddress,
  pathname,
  accessVerifier,
  environment = process.env,
}) {
  const peer = normalizePeerAddress(peerAddress);
  const trustedPeer = trustedIngressProxies(environment).has(peer);
  const basePath = ingressPathFromRequest(pathname, headers, trustedPeer);

  if (isUnauthenticatedPublicPath(stripIngressPath(pathname, basePath))) {
    return { identity: null, basePath, trustedPeer };
  }

  if (trustedPeer) {
    const subject = trimmedHeader(headers, "x-remote-user-id");
    if (!subject || subject.length > 512) {
      throw Object.assign(new Error("Home Assistant authentication is required."), {
        status: 401,
      });
    }
    const displayName =
      trimmedHeader(headers, "x-remote-user-display-name") ||
      trimmedHeader(headers, "x-remote-user-name") ||
      subject;
    return {
      identity: {
        provider: "home-assistant",
        subject,
        email: null,
        displayName,
      },
      basePath,
      trustedPeer,
    };
  }

  if (environment.NODE_ENV !== "production") {
    return {
      identity: {
        provider: "local-development",
        subject: "owner",
        email: "local@circuit-atlas.invalid",
        displayName: "Local owner",
      },
      basePath: "",
      trustedPeer,
    };
  }

  if (!accessVerifier) {
    throw Object.assign(
      new Error("Direct access is disabled until Cloudflare Access is configured."),
      { status: 403 },
    );
  }
  try {
    const identity = await accessVerifier(
      trimmedHeader(headers, "cf-access-jwt-assertion"),
    );
    return { identity, basePath: "", trustedPeer };
  } catch {
    throw Object.assign(new Error("Cloudflare Access authentication failed."), {
      status: 401,
    });
  }
}

export function stripIngressPath(pathname, basePath) {
  if (!basePath || !pathname.startsWith(basePath)) return pathname;
  const stripped = pathname.slice(basePath.length);
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

export function sanitizedProxyHeaders(headers, identity, basePath) {
  const forwarded = { ...headers };
  for (const name of Object.keys(forwarded)) {
    if (
      name.toLowerCase().startsWith("x-circuit-atlas-auth-") ||
      name.toLowerCase() === AUTH_HEADERS.basePath ||
      name.toLowerCase() === "cf-access-jwt-assertion" ||
      name.toLowerCase().startsWith("x-remote-user-")
    ) {
      delete forwarded[name];
    }
  }
  forwarded[AUTH_HEADERS.basePath] = basePath;
  forwarded["x-forwarded-host"] ||= firstHeader(headers.host) || "";
  forwarded["x-forwarded-proto"] ||=
    firstHeader(headers["x-forwarded-proto"]) || "http";
  if (identity) {
    forwarded[AUTH_HEADERS.provider] = identity.provider;
    forwarded[AUTH_HEADERS.subject] = identity.subject;
    if (identity.email) forwarded[AUTH_HEADERS.email] = identity.email;
    forwarded[AUTH_HEADERS.displayName] = identity.displayName;
  }
  delete forwarded["content-length"];
  delete forwarded["accept-encoding"];
  return forwarded;
}

export function rewriteRuntimePaths(source, basePath) {
  if (!basePath) return source;
  return source
    .replaceAll("/__circuit_atlas", `${basePath}/__circuit_atlas`)
    .replaceAll('"/favicon.svg"', `"${basePath}/favicon.svg"`)
    .replaceAll('"/og.png"', `"${basePath}/og.png"`)
    .replaceAll(
      '"/pdf.worker.min.mjs"',
      `"${basePath}/pdf.worker.min.mjs"`,
    );
}

export function prefixedLocation(location, basePath) {
  if (!basePath || !location?.startsWith("/") || location.startsWith(basePath)) {
    return location;
  }
  return `${basePath}${location}`;
}
