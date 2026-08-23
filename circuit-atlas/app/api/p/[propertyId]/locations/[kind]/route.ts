import { z } from "zod";
import { createResource, nextLocationCode, type LocationResourceKind } from "@/db/repositories";
import { InvalidRequestError } from "@/lib/http/responses";
import { parsedJson, requestIdSchema, routeParams, writeRoute } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string; kind: string }> };
const kinds: Record<string, LocationResourceKind> = { structures: "structures", levels: "levels", spaces: "spaces", "wall-zones": "wall-zones" };
const inputSchema = z.object({ requestId: requestIdSchema, name: z.string().trim().min(1).max(120), structureId: z.string().uuid().optional(), levelId: z.string().uuid().optional(), spaceId: z.string().uuid().optional(), parentSpaceId: z.string().uuid().nullable().optional(), kind: z.string().trim().max(60).optional(), orientation: z.string().trim().max(120).nullable().optional(), notes: z.string().max(4000).nullable().optional(), sortOrder: z.number().int().optional(), elevationOrder: z.number().int().optional() }).strict();
export async function POST(request: Request, context: Params) {
  const { propertyId, kind } = await routeParams(context.params);
  const resourceKind = kinds[kind];
  if (!resourceKind) return Response.json({ error: { message: "Unknown location kind.", type: "InvalidRequestError" } }, { status: 400 });
  return writeRoute(request, async (identity) => {
    const input = await parsedJson(request, inputSchema);
    if (resourceKind === "levels" && !input.structureId) throw new InvalidRequestError("structureId is required for a level.");
    if (resourceKind === "spaces" && !input.levelId) throw new InvalidRequestError("levelId is required for a space.");
    if (resourceKind === "wall-zones" && !input.spaceId) throw new InvalidRequestError("spaceId is required for a wall zone.");
    const item = await createResource(
      { identity, propertyId, requestId: input.requestId },
      resourceKind,
      { ...input, code: await nextLocationCode(identity, propertyId, resourceKind) },
    );
    return { item };
  }, 201);
}
