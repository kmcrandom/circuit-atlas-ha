import { z } from "zod";
import { updateResource } from "@/db/repositories";
import { parsedJson, requestIdSchema, revisionSchema, routeParams, writeRoute } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string; id: string }> };
const schema = z.object({ requestId: requestIdSchema, revision: revisionSchema, xNormalized: z.number().min(0).max(1).optional(), yNormalized: z.number().min(0).max(1).optional(), rotationDegrees: z.number().optional(), wallOffset: z.number().min(0).max(1).nullable().optional(), height: z.number().nullable().optional(), heightUnit: z.enum(["in", "ft", "mm", "cm", "m"]).nullable().optional() }).strict();
export async function PATCH(request: Request, context: Params) { const { propertyId, id } = await routeParams(context.params); return writeRoute(request, async (identity) => { const input = await parsedJson(request, schema); const { revision, requestId, ...values } = input; return { item: await updateResource({ identity, propertyId, requestId }, "placements", id, revision, values) }; }); }
