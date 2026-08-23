import { z } from "zod";
import { getResource, updateResource } from "@/db/repositories";
import { parsedJson, readRoute, requestIdSchema, revisionSchema, routeParams, writeRoute } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string; id: string }> };
const schema = z.object({ requestId: requestIdSchema, revision: revisionSchema, name: z.string().trim().min(1).max(120).optional(), nominalVoltage: z.number().int().positive().nullable().optional(), purpose: z.string().max(240).nullable().optional(), notes: z.string().max(4000).nullable().optional(), lifecycleState: z.enum(["active", "archived"]).optional() }).strict();
export async function GET(_request: Request, context: Params) { const { propertyId, id } = await routeParams(context.params); return readRoute(async (identity) => ({ item: await getResource(identity, propertyId, "circuits", id) })); }
export async function PATCH(request: Request, context: Params) { const { propertyId, id } = await routeParams(context.params); return writeRoute(request, async (identity) => { const input = await parsedJson(request, schema); const { revision, requestId, ...values } = input; return { item: await updateResource({ identity, propertyId, requestId }, "circuits", id, revision, values) }; }); }
