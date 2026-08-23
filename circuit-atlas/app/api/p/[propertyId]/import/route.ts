import { z } from "zod";
import {
  applyOwnedPropertyImport,
  previewOwnedPropertyImport,
} from "@/db/repositories/portability";
import { getRequestIdentity } from "@/lib/auth/identity";
import {
  assertSameOrigin,
  errorResponse,
  InvalidRequestError,
} from "@/lib/http/responses";

export const dynamic = "force-dynamic";

const routeId = z.string().trim().min(1).max(128);
const requestSchema = z
  .object({
    mode: z.enum(["add", "merge"]),
    manifest: z.unknown(),
    confirmationToken: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ propertyId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const propertyIdResult = routeId.safeParse(
      (await context.params).propertyId,
    );
    if (!propertyIdResult.success) {
      throw new InvalidRequestError("The property identifier is invalid.");
    }
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new InvalidRequestError("Request body is not valid JSON.");
    }
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidRequestError(
        parsed.error.issues.map((issue) => issue.message).join("; "),
      );
    }
    const identity = await getRequestIdentity();
    if (!parsed.data.confirmationToken) {
      return Response.json({
        preview: await previewOwnedPropertyImport(
          identity,
          propertyIdResult.data,
          parsed.data.manifest,
          parsed.data.mode,
        ),
      });
    }
    const result = await applyOwnedPropertyImport(
      identity,
      propertyIdResult.data,
      parsed.data.manifest,
      parsed.data.mode,
      parsed.data.confirmationToken,
    );
    return Response.json(
      { import: result },
      { status: result.mode === "add" ? 201 : 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
