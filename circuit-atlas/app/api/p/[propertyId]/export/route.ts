import { z } from "zod";
import { serializePropertyExport } from "@/db/repositories/portability";
import { getRequestIdentity } from "@/lib/auth/identity";
import {
  errorResponse,
  InvalidRequestError,
} from "@/lib/http/responses";

export const dynamic = "force-dynamic";

const routeId = z.string().trim().min(1).max(128);

type RouteContext = { params: Promise<{ propertyId: string }> };

function includeFilesFrom(request: Request): boolean {
  const value = new URL(request.url).searchParams.get("includeFiles");
  if (value == null || value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  throw new InvalidRequestError("includeFiles must be a boolean value.");
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const parsed = routeId.safeParse((await context.params).propertyId);
    if (!parsed.success) {
      throw new InvalidRequestError("The property identifier is invalid.");
    }
    const identity = await getRequestIdentity();
    const document = await serializePropertyExport(identity, parsed.data, {
      includeFiles: includeFilesFrom(request),
    });
    const safeFileId = parsed.data.replace(/[^A-Za-z0-9._-]/g, "-");
    return new Response(document, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="circuit-atlas-property-${safeFileId}.json"`,
        "Content-Type": "application/json; charset=utf-8",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
