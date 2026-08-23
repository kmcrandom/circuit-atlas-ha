import { sha256Hex, type DigestInput } from "../files/digest";
import {
  propertyManifestV1Schema,
  type PropertyManifestV1,
  type UnsealedPropertyManifestV1,
} from "./schema";
import { canonicalJson, normalizePropertyManifestOrder } from "./serialize";

export function getManifestChecksumPayload(
  manifest: PropertyManifestV1,
): string {
  const checksums = {
    algorithm: manifest.checksums.algorithm,
    attachments: manifest.checksums.attachments,
  };
  return canonicalJson({
    ...manifest,
    checksums,
  });
}

export async function calculateManifestChecksum(
  manifest: PropertyManifestV1,
): Promise<string> {
  return sha256Hex(getManifestChecksumPayload(manifest));
}

export async function sealPropertyManifest(
  unsealed: UnsealedPropertyManifestV1,
): Promise<PropertyManifestV1> {
  const candidate = propertyManifestV1Schema.parse({
    ...unsealed,
    checksums: {
      ...unsealed.checksums,
      manifestSha256: "0".repeat(64),
    },
  });
  const normalized = normalizePropertyManifestOrder(candidate);
  const manifestSha256 = await calculateManifestChecksum(normalized);

  return {
    ...normalized,
    checksums: {
      ...normalized.checksums,
      manifestSha256,
    },
  };
}

export async function verifyManifestChecksum(
  manifest: PropertyManifestV1,
): Promise<boolean> {
  return (
    (await calculateManifestChecksum(manifest)) ===
    manifest.checksums.manifestSha256
  );
}

export async function calculateAttachmentChecksum(
  contents: DigestInput,
): Promise<string> {
  return sha256Hex(contents);
}

export async function verifyAttachmentChecksum(
  contents: DigestInput,
  expectedSha256: string,
): Promise<boolean> {
  return (await calculateAttachmentChecksum(contents)) === expectedSha256;
}
