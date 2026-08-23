import { z } from "zod";
import { getResource, updateResource, upgradeViewModels } from "@/db/repositories";
import { NotFoundError } from "@/lib/http/responses";
import { parsedJson, readRoute, requestIdSchema, revisionSchema, routeParams, writeRoute } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string; id: string }> };
const schema = z.object({ requestId: requestIdSchema, revision: revisionSchema, status: z.enum(["keep", "investigate", "candidate", "planned", "purchased", "installed", "verified"]).optional(), goal: z.string().trim().min(1).max(500).optional(), priority: z.number().int().min(0).optional(), notes: z.string().max(4000).nullable().optional() }).strict();
export async function GET(_request: Request, context: Params) { const { propertyId, id } = await routeParams(context.params); return readRoute(async (identity) => { const row = await getResource(identity, propertyId, "upgrades", id); const item = (await upgradeViewModels(identity, propertyId)).find((candidate) => candidate.id === id); if (!item) throw new NotFoundError("Upgrade item not found."); return { item, revision: row.revision }; }); }
export async function PATCH(request: Request, context: Params) { const { propertyId, id } = await routeParams(context.params); return writeRoute(request, async (identity) => { const input = await parsedJson(request, schema); const { revision, requestId, ...values } = input; return { item: await updateResource({ identity, propertyId, requestId }, "upgrades", id, revision, values) }; }); }
