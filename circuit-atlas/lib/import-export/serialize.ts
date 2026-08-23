import type { JsonValue, PropertyManifestV1 } from "./schema";

function assertJsonValue(value: unknown, path: string): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} contains a non-finite number.`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assertJsonValue(child, `${path}.${key}`);
    }
    return;
  }

  throw new TypeError(`${path} is not JSON-serializable.`);
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key])]),
    );
  }

  return value;
}

/** RFC-8259 JSON with recursively sorted object keys and stable array ordering. */
export function canonicalJson(value: unknown): string {
  assertJsonValue(value, "$.");
  return JSON.stringify(sortJson(value));
}

/**
 * Stable human-readable export. Record arrays retain their explicit source order;
 * callers should use normalizePropertyManifestOrder before sealing an export.
 */
export function serializePropertyManifest(
  manifest: PropertyManifestV1,
  indentation = 2,
): string {
  assertJsonValue(manifest, "$.");
  return JSON.stringify(sortJson(manifest), null, indentation);
}

function byIdentity<T extends { id: string }>(left: T, right: T): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function normalizePropertyManifestOrder<T extends PropertyManifestV1>(
  manifest: T,
): T {
  return {
    ...manifest,
    records: [...manifest.records].sort(byIdentity),
    relationships: [...manifest.relationships].sort(byIdentity),
    attachments: [...manifest.attachments].sort(byIdentity),
    checksums: {
      ...manifest.checksums,
      attachments: [...manifest.checksums.attachments].sort((left, right) =>
        left.attachmentId < right.attachmentId
          ? -1
          : left.attachmentId > right.attachmentId
            ? 1
            : 0,
      ),
    },
  };
}
