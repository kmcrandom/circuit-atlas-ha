import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { startGateway } from "./gateway.mjs";

const development = process.argv.includes("--development");
const backendPort = Number(process.env.CIRCUIT_ATLAS_BACKEND_PORT || 3000);
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const standaloneRoot = fileURLToPath(
  new URL("../.next/standalone/", import.meta.url),
);
const standaloneServer = fileURLToPath(
  new URL("../.next/standalone/server.js", import.meta.url),
);
const useStandalone = !development && existsSync(standaloneServer);
const command = useStandalone
  ? standaloneServer
  : fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const arguments_ = useStandalone
  ? [command]
  : [command, development ? "dev" : "start", "-H", "127.0.0.1", "-p", String(backendPort)];
const child = spawn(
  process.execPath,
  arguments_,
  {
    cwd: useStandalone ? standaloneRoot : projectRoot,
    env: {
      ...process.env,
      CIRCUIT_ATLAS_BACKEND_PORT: String(backendPort),
      HOSTNAME: "127.0.0.1",
      PORT: String(backendPort),
    },
    stdio: "inherit",
  },
);

let gateway;
try {
  gateway = await startGateway({ backendPort });
} catch (error) {
  child.kill("SIGTERM");
  throw error;
}

let stopping = false;
async function stop(signal) {
  if (stopping) return;
  stopping = true;
  await new Promise((resolve) => gateway.close(resolve));
  child.kill(signal);
}

process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
child.on("exit", (code, signal) => {
  if (!stopping) gateway.close();
  process.exitCode = stopping ? 0 : (code ?? (signal ? 1 : 0));
});
