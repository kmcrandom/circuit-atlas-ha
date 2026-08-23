import { z } from "zod";
import {
  archiveFloorPlan,
  getFloorPlan,
  updateFloorPlan,
} from "@/db/repositories/floor-plans";
import { getRequestIdentity } from "@/lib/auth/identity";
import {
  assertSameOrigin,
  errorResponse,
  InvalidRequestError,
} from "@/lib/http/responses";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  propertyId: z.string().min(1).max(128),
  floorPlanId: z.string().min(1).max(128),
});
const updateSchema = z
  .object({
    revision: z.number().int().positive(),
    levelId: z.string().min(1).max(128).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    backgroundAttachmentId: z.string().min(1).max(128).nullable().optional(),
    pageNumber: z.number().int().min(1).nullable().optional(),
    unitsPerPlanUnit: z.number().positive().nullable().optional(),
    calibrationUnit: z.enum(["in", "ft", "mm", "cm", "m"]).nullable().optional(),
    orientationDegrees: z.number().finite().min(-3600).max(3600).optional(),
  })
  .strict();
const archiveSchema = z.object({ revision: z.number().int().positive() }).strict();

type RouteContext = {
  params: Promise<{ propertyId: string; floorPlanId: string }>;
};

function invalidRequest(error: unknown): unknown {
  if (error instanceof z.ZodError) {
    return new InvalidRequestError(
      error.issues.map((issue) => issue.message).join("; "),
    );
  }
  if (error instanceof SyntaxError) {
    return new InvalidRequestError("Request body is not valid JSON.");
  }
  return error;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { propertyId, floorPlanId } = paramsSchema.parse(await context.params);
    const identity = await getRequestIdentity();
    return Response.json({
      floorPlan: await getFloorPlan(identity, propertyId, floorPlanId),
    });
  } catch (error) {
    return errorResponse(invalidRequest(error));
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const { propertyId, floorPlanId } = paramsSchema.parse(await context.params);
    const identity = await getRequestIdentity();
    const input = updateSchema.parse(await request.json());
    return Response.json({
      floorPlan: await updateFloorPlan(
        identity,
        propertyId,
        floorPlanId,
        input,
      ),
    });
  } catch (error) {
    return errorResponse(invalidRequest(error));
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const { propertyId, floorPlanId } = paramsSchema.parse(await context.params);
    const identity = await getRequestIdentity();
    const input = archiveSchema.parse(await request.json());
    return Response.json({
      floorPlan: await archiveFloorPlan(
        identity,
        propertyId,
        floorPlanId,
        input.revision,
      ),
    });
  } catch (error) {
    return errorResponse(invalidRequest(error));
  }
}
