import { z } from "zod";
import { updateResource, type ResourceKind } from "@/db/repositories";
import { parsedJson, requestIdSchema, revisionSchema, routeParams, writeRoute } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string; kind: string; id: string }> };
const kinds: Record<string, ResourceKind> = { structures: "structures", levels: "levels", spaces: "spaces", "wall-zones": "wall-zones" };
const schema = z.object({ requestId: requestIdSchema, revision: revisionSchema, name: z.string().trim().min(1).max(120).optional(), notes: z.string().max(4000).nullable().optional(), sortOrder: z.number().int().optional(), elevationOrder: z.number().int().optional(), lifecycleState: z.enum(["active", "archived"]).optional() }).strict();
export async function PATCH(request: Request, context: Params) {
  const { propertyId, kind, id } = await routeParams(context.params);
  const resourceKind = kinds[kind];
  if (!resourceKind) return Response.json({ error: { message: "Unknown location kind." } }, { status: 400 });
  return writeRoute(request, async (identity) => {
    const input = await parsedJson(request, schema);
    const { revision, requestId, ...values } = input;
    return { item: await updateResource({ identity, propertyId, requestId }, resourceKind, id, revision, values) };
  });
}
