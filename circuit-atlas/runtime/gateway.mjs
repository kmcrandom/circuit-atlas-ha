import http from "node:http";
import {
  authorizeRequest,
  createCloudflareAccessVerifier,
  loadCloudflareAccessConfig,
  prefixedLocation,
  rewriteRuntimePaths,
  sanitizedProxyHeaders,
  stripIngressPath,
} from "./gateway-core.mjs";

function sendError(response, status, message) {
  const body = JSON.stringify({ error: { code: "authentication_required", message } });
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

export async function startGateway({
  host = process.env.CIRCUIT_ATLAS_HOST || "0.0.0.0",
  port = Number(process.env.CIRCUIT_ATLAS_PORT || 8099),
  backendHost = process.env.CIRCUIT_ATLAS_BACKEND_HOST || "127.0.0.1",
  backendPort = Number(process.env.CIRCUIT_ATLAS_BACKEND_PORT || 3000),
  accessVerifier: injectedAccessVerifier,
  environment = process.env,
} = {}) {
  let accessVerifier = injectedAccessVerifier;
  if (accessVerifier === undefined) {
    const accessConfig = await loadCloudflareAccessConfig(environment);
    accessVerifier = createCloudflareAccessVerifier(accessConfig);
  }
  const server = http.createServer(async (request, response) => {
    const originalUrl = new URL(request.url || "/", "http://circuit-atlas.local");
    let authorization;
    try {
      authorization = await authorizeRequest({
        headers: request.headers,
        peerAddress: request.socket.remoteAddress,
        pathname: originalUrl.pathname,
        accessVerifier,
        environment,
      });
    } catch (error) {
      sendError(response, Number(error?.status) || 401, error.message);
      return;
    }

    const backendPath = stripIngressPath(
      originalUrl.pathname,
      authorization.basePath,
    );
    originalUrl.pathname = backendPath;
    const headers = sanitizedProxyHeaders(
      request.headers,
      authorization.identity,
      authorization.basePath,
    );
    const upstream = http.request(
      {
        host: backendHost,
        port: backendPort,
        method: request.method,
        path: `${originalUrl.pathname}${originalUrl.search}`,
        headers,
      },
      (upstreamResponse) => {
        const responseHeaders = { ...upstreamResponse.headers };
        if (responseHeaders.location) {
          responseHeaders.location = prefixedLocation(
            responseHeaders.location,
            authorization.basePath,
          );
        }
        const contentType = String(responseHeaders["content-type"] || "");
        const shouldRewrite =
          Boolean(authorization.basePath) &&
          (contentType.includes("text/html") ||
            contentType.includes("javascript") ||
            contentType.includes("text/x-component"));
        if (!shouldRewrite) {
          response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
          upstreamResponse.pipe(response);
          return;
        }

        const chunks = [];
        upstreamResponse.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        upstreamResponse.on("end", () => {
          const body = Buffer.from(
            rewriteRuntimePaths(
              Buffer.concat(chunks).toString("utf8"),
              authorization.basePath,
            ),
          );
          delete responseHeaders["content-encoding"];
          delete responseHeaders["transfer-encoding"];
          delete responseHeaders.etag;
          responseHeaders["content-length"] = String(body.byteLength);
          responseHeaders["cache-control"] = "private, no-store";
          response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
          response.end(body);
        });
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) {
        sendError(response, 503, "Circuit Atlas is starting.");
      } else {
        response.destroy();
      }
    });
    request.pipe(upstream);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}
