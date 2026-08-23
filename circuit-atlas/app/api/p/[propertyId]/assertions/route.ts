import { z } from "zod";
import { createResource, listResource } from "@/db/repositories";
import { parsedJson, readRoute, requestIdSchema, routeParams, writeRoute } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string }> };
const schema = z.object({ requestId: requestIdSchema, assetId: z.string().uuid(), assetFunctionId: z.string().uuid().nullable().optional(), circuitId: z.string().uuid(), certainty: z.enum(["unknown", "assumed", "inferred", "visually_observed", "test_verified", "documentation_verified", "conflicting"]).default("unknown"), evidenceId: z.string().uuid().nullable().optional(), notes: z.string().max(4000).nullable().optional() }).strict();
export async function GET(_request: Request, context: Params) { const { propertyId } = await routeParams(context.params); return readRoute(async (identity) => ({ items: await listResource(identity, propertyId, "assertions") })); }
export async function POST(request: Request, context: Params) { const { propertyId } = await routeParams(context.params); return writeRoute(request, async (identity) => { const input = await parsedJson(request, schema); return { item: await createResource({ identity, propertyId, requestId: input.requestId }, "assertions", input) }; }, 201); }
