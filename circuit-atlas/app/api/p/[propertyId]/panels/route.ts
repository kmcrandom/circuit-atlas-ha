import { z } from "zod";
import { createPanelAggregate, listResource } from "@/db/repositories";
import { parsedJson, readRoute, routeParams, writeRoute } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string }> };
const createSchema = z.object({ displayName: z.string().trim().min(1).max(120), role: z.enum(["main", "subpanel", "distribution", "disconnect", "other", "unknown"]).default("unknown"), columnCount: z.number().int().min(1).max(8), rowCount: z.number().int().min(1).max(120), nominalVoltage: z.number().int().positive().nullable().optional(), maxAmps: z.number().int().positive().nullable().optional(), notes: z.string().max(4000).nullable().optional() }).strict();
export async function GET(_request: Request, context: Params) { const { propertyId } = await routeParams(context.params); return readRoute(async (identity) => ({ items: await listResource(identity, propertyId, "panels") })); }
export async function POST(request: Request, context: Params) { const { propertyId } = await routeParams(context.params); return writeRoute(request, async (identity) => ({ item: await createPanelAggregate(identity, propertyId, await parsedJson(request, createSchema)) }), 201); }
