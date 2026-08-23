const SHA_256 = "SHA-256";

export type DigestInput = ArrayBuffer | ArrayBufferView | string;

function toDigestBytes(value: DigestInput): Uint8Array {
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  return new Uint8Array(value);
}

/** Returns a lower-case SHA-256 digest without depending on Node-only APIs. */
export async function sha256Hex(value: DigestInput): Promise<string> {
  const bytes = toDigestBytes(value);
  // Copy into an ArrayBuffer-backed view so this remains compatible with the
  // DOM BufferSource type even when a caller supplies a SharedArrayBuffer view.
  const digestBytes = new Uint8Array(bytes.byteLength);
  digestBytes.set(bytes);
  const digest = await globalThis.crypto.subtle.digest(
    SHA_256,
    digestBytes.buffer,
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
