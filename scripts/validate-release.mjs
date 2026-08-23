import { readFile } from "node:fs/promises";

const config = await readFile("circuit-atlas/config.yaml", "utf8");
const packageJson = JSON.parse(
  await readFile("circuit-atlas/package.json", "utf8"),
);
const changelog = await readFile("circuit-atlas/CHANGELOG.md", "utf8");
const dockerfile = await readFile("circuit-atlas/Dockerfile", "utf8");
const repository = await readFile("repository.yaml", "utf8");

const version = config.match(/^version:\s*["']?([^\s"']+)/m)?.[1];
if (!version) throw new Error("config.yaml has no app version.");

const expected = [
  [packageJson.version === version, "package.json version must match config.yaml"],
  [changelog.includes(`## ${version} -`), "CHANGELOG must contain the app version"],
  [
    dockerfile.includes(`ARG BUILD_VERSION=${version}`),
    "Dockerfile BUILD_VERSION must match config.yaml",
  ],
  [config.includes("  - aarch64"), "Home Assistant Yellow requires aarch64"],
  [
    config.includes("image: ghcr.io/kmcrandom/circuit-atlas-ha"),
    "config.yaml must reference the release image",
  ],
  [
    repository.includes("https://github.com/kmcrandom/circuit-atlas-ha"),
    "repository.yaml must reference the public repository",
  ],
];

for (const [valid, message] of expected) {
  if (!valid) throw new Error(message);
}

const tag = process.env.GITHUB_REF_NAME;
if (tag?.startsWith("v") && tag.slice(1) !== version) {
  throw new Error(`Tag ${tag} does not match app version ${version}.`);
}

console.log(`Circuit Atlas release metadata is consistent at ${version}.`);
