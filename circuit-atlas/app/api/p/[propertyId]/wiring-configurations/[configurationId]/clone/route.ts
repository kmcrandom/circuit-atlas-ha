import { z } from "zod";
import { cloneWiringConfiguration } from "@/db/repositories";
import { parsedJson, routeParams, writeRoute } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string; configurationId: string }> };
const schema = z.object({ name: z.string().trim().min(1).max(120), status: z.enum(["draft", "planned"]).optional(), summary: z.string().trim().max(2_000).nullable().optional() }).strict();
export async function POST(request: Request, context: Params) { const { propertyId, configurationId } = await routeParams(context.params); return writeRoute(request, async (identity) => ({ item: await cloneWiringConfiguration(identity, propertyId, configurationId, await parsedJson(request, schema)) }), 201); }
