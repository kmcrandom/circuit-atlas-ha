import { z } from "zod";
import {
  createFloorPlan,
  listFloorPlans,
} from "@/db/repositories/floor-plans";
import { getRequestIdentity } from "@/lib/auth/identity";
import {
  assertSameOrigin,
  errorResponse,
  InvalidRequestError,
} from "@/lib/http/responses";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ propertyId: z.string().min(1).max(128) });
const createSchema = z
  .object({
    id: z.string().min(1).max(128).optional(),
    levelId: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(160),
    backgroundAttachmentId: z.string().min(1).max(128).nullable().optional(),
    pageNumber: z.number().int().min(1).nullable().optional(),
    unitsPerPlanUnit: z.number().positive().nullable().optional(),
    calibrationUnit: z.enum(["in", "ft", "mm", "cm", "m"]).nullable().optional(),
    orientationDegrees: z.number().finite().min(-3600).max(3600).optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ propertyId: string }> };

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
    const { propertyId } = paramsSchema.parse(await context.params);
    const identity = await getRequestIdentity();
    return Response.json({ items: await listFloorPlans(identity, propertyId) });
  } catch (error) {
    return errorResponse(invalidRequest(error));
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const { propertyId } = paramsSchema.parse(await context.params);
    const identity = await getRequestIdentity();
    const input = createSchema.parse(await request.json());
    const floorPlan = await createFloorPlan(identity, propertyId, input);
    return Response.json({ floorPlan }, { status: 201 });
  } catch (error) {
    return errorResponse(invalidRequest(error));
  }
}
