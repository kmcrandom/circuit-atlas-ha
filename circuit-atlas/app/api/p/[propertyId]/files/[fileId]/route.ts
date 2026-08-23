import { z } from "zod";
import {
  archivePrivateFile,
  readPrivateFile,
} from "@/db/repositories/files";
import { getRequestIdentity } from "@/lib/auth/identity";
import {
  assertSameOrigin,
  errorResponse,
  InvalidRequestError,
} from "@/lib/http/responses";
import { sanitizePrivateFileName } from "@/lib/files";
import {
  fileIdsFromContext,
  privateFileJson,
  requestIdFrom,
} from "../_shared";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ propertyId: string; fileId: string }>;
};

const archiveBodySchema = z
  .object({ revision: z.number().int().positive() })
  .strict();

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function contentDisposition(fileName: string, download: boolean): string {
  const safeFileName = sanitizePrivateFileName(fileName);
  const fallback =
    safeFileName
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_") || "download";
  return `${download ? "attachment" : "inline"}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(safeFileName)}`;
}

async function archiveRevision(request: Request): Promise<number> {
  const fromQuery = new URL(request.url).searchParams.get("revision");
  if (fromQuery && /^\d+$/.test(fromQuery)) return Number(fromQuery);

  const ifMatch = request.headers.get("if-match")?.trim();
  const match = ifMatch?.match(/^(?:W\/)?"?(\d+)"?$/);
  if (match) return Number(match[1]);

  if (request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new InvalidRequestError("The archive request must contain valid JSON.");
    }
    const result = archiveBodySchema.safeParse(input);
    if (result.success) return result.data.revision;
  }
  throw new InvalidRequestError(
    "A positive revision is required in JSON, the revision query parameter, or If-Match.",
  );
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { propertyId, fileId } = await fileIdsFromContext(context);
    const identity = await getRequestIdentity();
    const downloadValue = new URL(request.url).searchParams.get("download");
    if (
      downloadValue != null &&
      downloadValue !== "1" &&
      downloadValue !== "true" &&
      downloadValue !== "0" &&
      downloadValue !== "false"
    ) {
      throw new InvalidRequestError(
        "download must be a boolean value.",
      );
    }
    const download = downloadValue === "1" || downloadValue === "true";
    const file = await readPrivateFile(identity, propertyId, fileId);
    return new Response(file.body, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": contentDisposition(
          file.info.originalFileName,
          download,
        ),
        "Content-Length": String(file.size),
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Content-Type": file.info.mimeType,
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE archives metadata; the private object is retained for recovery. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const { propertyId, fileId } = await fileIdsFromContext(context);
    const identity = await getRequestIdentity();
    const revision = await archiveRevision(request);
    const file = await archivePrivateFile(
      {
        identity,
        propertyId,
        requestId: requestIdFrom(request),
      },
      fileId,
      revision,
    );
    return Response.json({ file: privateFileJson(propertyId, file) });
  } catch (error) {
    return errorResponse(error);
  }
}
