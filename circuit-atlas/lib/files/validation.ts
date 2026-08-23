export const PRIVATE_FILE_MIME_TYPES = [
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PrivateFileMimeType = (typeof PRIVATE_FILE_MIME_TYPES)[number];

export const DEFAULT_PRIVATE_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const DEFAULT_PRIVATE_FILE_MAX_NAME_BYTES = 255;

const MIME_ALIASES: Readonly<Record<string, PrivateFileMimeType>> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
};

const EXTENSIONS_BY_MIME: Readonly<
  Record<PrivateFileMimeType, readonly string[]>
> = {
  "application/pdf": ["pdf"],
  "image/heic": ["heic", "heif"],
  "image/heif": ["heif", "heic"],
  "image/jpeg": ["jpg", "jpeg", "jpe"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

export type PrivateFileValidationCode =
  | "empty_file"
  | "file_too_large"
  | "invalid_file_name"
  | "missing_extension"
  | "unsupported_extension"
  | "unsupported_mime_type"
  | "unknown_file_signature"
  | "mime_signature_mismatch";

export interface PrivateFileValidationIssue {
  code: PrivateFileValidationCode;
  field: "fileName" | "mimeType" | "sizeBytes" | "header";
  message: string;
}

export interface PrivateFileInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** At least the first 16 bytes. The complete file is not required. */
  header: ArrayBuffer | ArrayBufferView;
}

export interface PrivateFilePolicy {
  allowedMimeTypes?: readonly PrivateFileMimeType[];
  maxBytes?: number;
  maxNameBytes?: number;
  requireMatchingExtension?: boolean;
}

export type PrivateFileValidationResult =
  | {
      valid: true;
      sanitizedName: string;
      mimeType: PrivateFileMimeType;
      sizeBytes: number;
      issues: [];
    }
  | {
      valid: false;
      sanitizedName: string;
      mimeType: PrivateFileMimeType | null;
      sizeBytes: number;
      issues: PrivateFileValidationIssue[];
    };

function toBytes(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  return new Uint8Array(value);
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return (
    bytes.length >= signature.length &&
    signature.every((expected, index) => bytes[index] === expected)
  );
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** Detects only formats that the private-file pipeline is prepared to serve. */
export function detectPrivateFileMimeType(
  header: ArrayBuffer | ArrayBufferView,
): PrivateFileMimeType | null {
  const bytes = toBytes(header);

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "application/pdf";
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return "image/webp";
  }

  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) {
      return "image/heic";
    }
    if (["heif", "heim", "heis", "mif1", "msf1"].includes(brand)) {
      return "image/heif";
    }
  }

  return null;
}

export function normalizePrivateFileMimeType(
  value: string,
): PrivateFileMimeType | null {
  const mimeType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const normalized = MIME_ALIASES[mimeType] ?? mimeType;

  return PRIVATE_FILE_MIME_TYPES.includes(normalized as PrivateFileMimeType)
    ? (normalized as PrivateFileMimeType)
    : null;
}

/**
 * Produces a display-only filename. Storage keys must never be derived from it.
 */
export function sanitizePrivateFileName(value: string): string {
  const normalized = value.normalize("NFC").trim();
  const withoutPaths = normalized.replace(/[\\/]+/g, "-");
  const withoutControls = withoutPaths.replace(/[\u0000-\u001f\u007f]/g, "");
  const withoutUnsafeRuns = withoutControls
    .replace(/[^\p{L}\p{N}._()\- ]/gu, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .trim();

  return withoutUnsafeRuns || "upload";
}

function extensionOf(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return null;
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

export function validatePrivateFile(
  input: PrivateFileInput,
  policy: PrivateFilePolicy = {},
): PrivateFileValidationResult {
  const allowedMimeTypes = policy.allowedMimeTypes ?? PRIVATE_FILE_MIME_TYPES;
  const maxBytes = policy.maxBytes ?? DEFAULT_PRIVATE_FILE_MAX_BYTES;
  const maxNameBytes =
    policy.maxNameBytes ?? DEFAULT_PRIVATE_FILE_MAX_NAME_BYTES;
  const requireMatchingExtension = policy.requireMatchingExtension ?? true;
  const issues: PrivateFileValidationIssue[] = [];
  const sanitizedName = sanitizePrivateFileName(input.fileName);
  const normalizedMimeType = normalizePrivateFileMimeType(input.mimeType);
  const detectedMimeType = detectPrivateFileMimeType(input.header);

  if (
    !input.fileName.trim() ||
    input.fileName === "." ||
    input.fileName === ".." ||
    /[\\/\u0000-\u001f\u007f]/.test(input.fileName) ||
    new TextEncoder().encode(input.fileName.normalize("NFC")).byteLength >
      maxNameBytes
  ) {
    issues.push({
      code: "invalid_file_name",
      field: "fileName",
      message:
        "The filename is empty, too long, or contains path/control characters.",
    });
  }

  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    issues.push({
      code: "empty_file",
      field: "sizeBytes",
      message: "The file must contain at least one byte.",
    });
  } else if (input.sizeBytes > maxBytes) {
    issues.push({
      code: "file_too_large",
      field: "sizeBytes",
      message: `The file exceeds the ${maxBytes}-byte limit.`,
    });
  }

  if (!normalizedMimeType || !allowedMimeTypes.includes(normalizedMimeType)) {
    issues.push({
      code: "unsupported_mime_type",
      field: "mimeType",
      message: "The declared media type is not allowed.",
    });
  }

  if (!detectedMimeType) {
    issues.push({
      code: "unknown_file_signature",
      field: "header",
      message: "The file signature does not match a supported format.",
    });
  } else if (
    normalizedMimeType &&
    // HEIC and HEIF are compatible labels for the same ISO-BMFF family.
    !(
      [normalizedMimeType, detectedMimeType].every((mimeType) =>
        ["image/heic", "image/heif"].includes(mimeType),
      ) || normalizedMimeType === detectedMimeType
    )
  ) {
    issues.push({
      code: "mime_signature_mismatch",
      field: "header",
      message: "The declared media type does not match the file signature.",
    });
  }

  if (requireMatchingExtension && normalizedMimeType) {
    const extension = extensionOf(input.fileName);
    if (!extension) {
      issues.push({
        code: "missing_extension",
        field: "fileName",
        message: "The filename must include an extension matching its media type.",
      });
    } else if (!EXTENSIONS_BY_MIME[normalizedMimeType].includes(extension)) {
      issues.push({
        code: "unsupported_extension",
        field: "fileName",
        message: "The filename extension does not match its declared media type.",
      });
    }
  }

  if (issues.length > 0 || !normalizedMimeType) {
    return {
      valid: false,
      sanitizedName,
      mimeType: normalizedMimeType,
      sizeBytes: input.sizeBytes,
      issues,
    };
  }

  return {
    valid: true,
    sanitizedName,
    mimeType: normalizedMimeType,
    sizeBytes: input.sizeBytes,
    issues: [],
  };
}
