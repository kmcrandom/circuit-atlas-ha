import { z } from "zod";
import { circuitWorkspaceViewModel, createCircuit } from "@/db/repositories";
import { parsedJson, readRoute, routeParams, writeRoute } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string }> };
const schema = z.object({ name: z.string().trim().min(1).max(120), nominalVoltage: z.number().int().positive().nullable().optional(), purpose: z.string().max(240).nullable().optional(), notes: z.string().max(4000).nullable().optional() }).strict();
export async function GET(_request: Request, context: Params) { const { propertyId } = await routeParams(context.params); return readRoute(async (identity) => circuitWorkspaceViewModel(identity, propertyId)); }
export async function POST(request: Request, context: Params) { const { propertyId } = await routeParams(context.params); return writeRoute(request, async (identity) => ({ item: await createCircuit(identity, propertyId, await parsedJson(request, schema)) }), 201); }
