import { z } from "zod";
import { resolveWiringConfiguration, updateWiringConfiguration } from "@/db/repositories";
import { parsedJson, readRoute, routeParams, writeRoute } from "@/lib/http/route-utils";

type Params = { params: Promise<{ propertyId: string; configurationId: string }> };
const updateSchema = z.object({ revision: z.number().int().positive(), name: z.string().trim().min(1).max(120).optional(), summary: z.string().trim().max(2_000).nullable().optional(), verificationState: z.enum(["unknown", "assumed", "inferred", "visually_observed", "test_verified", "documentation_verified", "conflicting"]).optional(), capturedAt: z.string().datetime().nullable().optional() }).strict();

export async function GET(_request: Request, context: Params) {
  const { propertyId, configurationId } = await routeParams(context.params);
  return readRoute(async (identity) => ({ item: await resolveWiringConfiguration(identity, propertyId, configurationId) }));
}
export async function PATCH(request: Request, context: Params) {
  const { propertyId, configurationId } = await routeParams(context.params);
  return writeRoute(request, async (identity) => ({ item: await updateWiringConfiguration(identity, propertyId, configurationId, await parsedJson(request, updateSchema)) }));
}
