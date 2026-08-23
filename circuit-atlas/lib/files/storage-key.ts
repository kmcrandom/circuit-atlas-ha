import { sha256Hex } from "./digest";

export const PRIVATE_FILE_CATEGORIES = [
  "attachment",
  "evidence",
  "export",
  "floor-plan",
] as const;

export type PrivateFileCategory = (typeof PRIVATE_FILE_CATEGORIES)[number];

const PROPERTY_ID_MAX_LENGTH = 128;
const OPAQUE_TOKEN = /^[a-zA-Z0-9_-]{16,128}$/;

function assertPropertyId(propertyId: string): void {
  if (
    propertyId.length === 0 ||
    propertyId.length > PROPERTY_ID_MAX_LENGTH ||
    propertyId.trim() !== propertyId
  ) {
    throw new TypeError("propertyId must be a non-empty, trimmed identifier.");
  }
}

function assertOpaqueToken(token: string): void {
  if (!OPAQUE_TOKEN.test(token)) {
    throw new TypeError(
      "The generated object token must be an opaque URL-safe identifier.",
    );
  }
}

/**
 * Hashing keeps human-readable property IDs and labels out of bucket listings.
 * Authorization must still check the authenticated property before using a key.
 */
export async function getPrivatePropertyFilePrefix(
  propertyId: string,
): Promise<string> {
  assertPropertyId(propertyId);
  const propertyScope = await sha256Hex(`circuit-atlas-property:${propertyId}`);
  return `private/p/${propertyScope}`;
}

export interface PrivatePropertyFileKeyOptions {
  propertyId: string;
  category: PrivateFileCategory;
  /** Injectable for deterministic tests; defaults to a fresh UUID. */
  createOpaqueToken?: () => string;
}

export async function createPrivatePropertyFileKey({
  propertyId,
  category,
  createOpaqueToken = () => globalThis.crypto.randomUUID(),
}: PrivatePropertyFileKeyOptions): Promise<string> {
  const prefix = await getPrivatePropertyFilePrefix(propertyId);
  const token = createOpaqueToken().replaceAll("-", "");
  assertOpaqueToken(token);
  return `${prefix}/${category}/${token}`;
}

export async function isPrivateFileKeyScopedToProperty(
  key: string,
  propertyId: string,
): Promise<boolean> {
  const prefix = await getPrivatePropertyFilePrefix(propertyId);
  return key.startsWith(`${prefix}/`);
}
