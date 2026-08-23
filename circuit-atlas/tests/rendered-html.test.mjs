import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import test, { after, before } from "node:test";

let applicationProcess;
let applicationOrigin;
let applicationOutput = "";
let dataDirectory;

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

before(async () => {
  const [port, backendPort] = await Promise.all([availablePort(), availablePort()]);
  dataDirectory = await mkdtemp(path.join(tmpdir(), "circuit-atlas-rendered-"));
  applicationOrigin = `http://127.0.0.1:${port}`;
  applicationProcess = spawn(
    process.execPath,
    [fileURLToPath(new URL("../runtime/start.mjs", import.meta.url))],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...process.env,
        CIRCUIT_ATLAS_PORT: String(port),
        CIRCUIT_ATLAS_BACKEND_PORT: String(backendPort),
        CIRCUIT_ATLAS_DATA_DIR: dataDirectory,
        CIRCUIT_ATLAS_TRUSTED_INGRESS_PROXIES: "127.0.0.1",
        NODE_ENV: "production",
        NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [applicationProcess.stdout, applicationProcess.stderr]) {
    stream.on("data", (chunk) => {
      applicationOutput = `${applicationOutput}${chunk}`.slice(-12_000);
    });
  }

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (applicationProcess.exitCode !== null) {
      throw new Error(
        `The production application stopped before it was ready.\n${applicationOutput}`,
      );
    }
    try {
      const response = await fetch(`${applicationOrigin}/health`);
      if (response.ok) return;
    } catch {
      // The local application is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `The production application did not become ready.\n${applicationOutput}`,
  );
});

after(async () => {
  if (applicationProcess?.exitCode === null) {
    applicationProcess.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => applicationProcess.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  }
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true });
});

function ingressHeaders(prefix = "") {
  return {
    "x-remote-user-id": "rendered-test-owner",
    "x-remote-user-display-name": "Rendered Test Owner",
    ...(prefix ? { "x-ingress-path": prefix } : {}),
  };
}

test("server-renders Circuit Atlas onboarding through trusted Home Assistant identity", async () => {
  const response = await fetch(`${applicationOrigin}/`, {
    headers: { accept: "text/html", ...ingressHeaders() },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Circuit Atlas<\/title>/i);
  assert.match(html, /Map the house behind the walls\./);
  assert.match(html, /Create your first property/);
  assert.match(html, /Trace every circuit/);
  assert.match(html, /See inside each box/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("rewrites framework assets beneath a representative ingress prefix", async () => {
  const prefix = "/api/hassio_ingress/test-token";
  const response = await fetch(`${applicationOrigin}${prefix}/`, {
    headers: { accept: "text/html", ...ingressHeaders(prefix) },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  const scriptPath = html.match(/<script[^>]+src="([^"]+)/)?.[1];
  assert.ok(scriptPath?.startsWith(`${prefix}/__circuit_atlas/_next/static/`));

  const asset = await fetch(`${applicationOrigin}${scriptPath}`, {
    headers: ingressHeaders(prefix),
  });
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type") ?? "", /javascript/i);
});

test("fails closed on the exposed origin without upstream identity", async () => {
  const response = await fetch(`${applicationOrigin}/properties`);
  assert.equal(response.status, 401);
  assert.match(await response.text(), /authentication is required/i);
});

test("initializes only local private storage", async () => {
  assert.ok(
    (await stat(path.join(dataDirectory, "circuit-atlas.sqlite"))).isFile(),
  );
  assert.ok((await stat(path.join(dataDirectory, "files"))).isDirectory());
});
