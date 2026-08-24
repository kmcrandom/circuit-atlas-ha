import { z } from "zod";
import { activateWiringConfiguration } from "@/db/repositories";
import { parsedJson, routeParams, writeRoute } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string; configurationId: string }> };
const schema = z.object({ revision: z.number().int().positive(), expectedCurrentConfigurationId: z.string().uuid(), effectiveAt: z.string().datetime().nullable().optional() }).strict();
export async function POST(request: Request, context: Params) { const { propertyId, configurationId } = await routeParams(context.params); return writeRoute(request, async (identity) => ({ item: await activateWiringConfiguration(identity, propertyId, configurationId, await parsedJson(request, schema)) })); }
