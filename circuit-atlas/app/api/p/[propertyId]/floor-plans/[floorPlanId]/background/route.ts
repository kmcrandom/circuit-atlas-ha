import { z } from "zod";
import { createPrivateFile } from "@/db/repositories/files";
import {
  getFloorPlan,
  setFloorPlanBackground,
} from "@/db/repositories/floor-plans";
import { getRequestIdentity } from "@/lib/auth/identity";
import { DEFAULT_PRIVATE_FILE_MAX_BYTES } from "@/lib/files";
import {
  assertSameOrigin,
  ConflictError,
  errorResponse,
  InvalidRequestError,
} from "@/lib/http/responses";

export const dynamic = "force-dynamic";

const routeId = z.string().trim().min(1).max(128);
const metadataSchema = z.object({
  revision: z.coerce.number().int().positive(),
  altText: z.string().trim().max(1_000).optional(),
  widthPixels: z.coerce.number().int().positive().optional(),
  heightPixels: z.coerce.number().int().positive().optional(),
  pageCount: z.coerce.number().int().positive().optional(),
});

type RouteContext = {
  params: Promise<{ propertyId: string; floorPlanId: string }>;
};

function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requestIdFrom(request: Request) {
  const requestId = request.headers.get("x-request-id")?.trim();
  return requestId && requestId.length <= 128 ? requestId : null;
}

function invalidRequest(error: unknown): unknown {
  if (error instanceof z.ZodError) {
    return new InvalidRequestError(
      error.issues.map((issue) => issue.message).join("; "),
    );
  }
  return error;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
      throw new InvalidRequestError("Floor-plan backgrounds must use multipart form data.");
    }
    const parsedParams = z
      .object({ propertyId: routeId, floorPlanId: routeId })
      .parse(await context.params);
    const identity = await getRequestIdentity();
    const current = await getFloorPlan(
      identity,
      parsedParams.propertyId,
      parsedParams.floorPlanId,
    );
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new InvalidRequestError("The multipart upload could not be read.");
    }
    const metadata = metadataSchema.parse({
      revision: field(form, "revision"),
      altText: field(form, "altText"),
      widthPixels: field(form, "widthPixels"),
      heightPixels: field(form, "heightPixels"),
      pageCount: field(form, "pageCount"),
    });
    if (metadata.revision !== current.revision) {
      throw new ConflictError("The floor plan changed after it was loaded.");
    }
    const upload = form.get("file");
    if (!(upload instanceof File) || upload.size <= 0) {
      throw new InvalidRequestError("A background file is required.");
    }
    if (upload.size > DEFAULT_PRIVATE_FILE_MAX_BYTES) {
      throw new InvalidRequestError(
        `The file exceeds the ${DEFAULT_PRIVATE_FILE_MAX_BYTES}-byte limit.`,
      );
    }
    const file = await createPrivateFile(
      {
        identity,
        propertyId: parsedParams.propertyId,
        requestId: requestIdFrom(request),
      },
      {
        ownerType: "floor_plan",
        ownerId: parsedParams.floorPlanId,
        category: "floor-plan",
        originalFileName: upload.name,
        declaredMimeType: upload.type,
        bytes: await upload.arrayBuffer(),
        altText: metadata.altText,
        widthPixels: metadata.widthPixels,
        heightPixels: metadata.heightPixels,
        pageCount: metadata.pageCount,
      },
    );
    const floorPlan = await setFloorPlanBackground(
      identity,
      parsedParams.propertyId,
      parsedParams.floorPlanId,
      file.id,
      current.revision,
    );
    return Response.json({ floorPlan }, { status: 201 });
  } catch (error) {
    return errorResponse(invalidRequest(error));
  }
}
