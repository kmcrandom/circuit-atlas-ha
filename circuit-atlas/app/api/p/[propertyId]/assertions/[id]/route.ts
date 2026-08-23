import { z } from "zod";
import { updateResource } from "@/db/repositories";
import { parsedJson, requestIdSchema, revisionSchema, routeParams, writeRoute } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string; id: string }> };
const schema = z.object({ requestId: requestIdSchema, revision: revisionSchema, status: z.enum(["active", "superseded", "rejected", "conflicting"]).optional(), certainty: z.enum(["unknown", "assumed", "inferred", "visually_observed", "test_verified", "documentation_verified", "conflicting"]).optional(), notes: z.string().max(4000).nullable().optional() }).strict();
export async function PATCH(request: Request, context: Params) { const { propertyId, id } = await routeParams(context.params); return writeRoute(request, async (identity) => { const input = await parsedJson(request, schema); const { revision, requestId, ...values } = input; return { item: await updateResource({ identity, propertyId, requestId }, "assertions", id, revision, values) }; }); }
