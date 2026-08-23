import { z } from "zod";
import { createResource, placementViewModels } from "@/db/repositories";
import { parsedJson, readRoute, requestIdSchema, routeParams, writeRoute } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string }> };
const schema = z.object({ requestId: requestIdSchema, floorPlanId: z.string().uuid(), assetId: z.string().uuid(), xNormalized: z.number().min(0).max(1), yNormalized: z.number().min(0).max(1), rotationDegrees: z.number().optional(), wallOffset: z.number().min(0).max(1).nullable().optional(), height: z.number().nullable().optional(), heightUnit: z.enum(["in", "ft", "mm", "cm", "m"]).nullable().optional() }).strict();
export async function GET(request: Request, context: Params) { const { propertyId } = await routeParams(context.params); return readRoute(async (identity) => ({ items: await placementViewModels(identity, propertyId, new URL(request.url).searchParams.get("floorPlanId") ?? undefined) })); }
export async function POST(request: Request, context: Params) { const { propertyId } = await routeParams(context.params); return writeRoute(request, async (identity) => { const input = await parsedJson(request, schema); return { item: await createResource({ identity, propertyId, requestId: input.requestId }, "placements", input) }; }, 201); }
