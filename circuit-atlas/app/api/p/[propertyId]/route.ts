import { z } from "zod";
import { getPropertyOverview, updateProperty } from "@/db/repositories";
import { parsedJson, readRoute, revisionSchema, routeParams, writeRoute } from "@/lib/http/route-utils";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ propertyId: string }> };

export async function GET(_request: Request, context: Params) {
  const { propertyId } = await routeParams(context.params);
  return readRoute(async (identity) => getPropertyOverview(identity, propertyId));
}

const patchSchema = z.object({
  revision: revisionSchema,
  name: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().max(240).nullable().optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
  namingConfig: z.record(z.string(), z.unknown()).optional(),
  lifecycleState: z.enum(["active", "archived"]).optional(),
}).strict();

export async function PATCH(request: Request, context: Params) {
  const { propertyId } = await routeParams(context.params);
  return writeRoute(request, async (identity) => {
    const input = await parsedJson(request, patchSchema);
    const property = await updateProperty(identity, propertyId, {
      revision: input.revision,
      name: input.name,
      address: input.address,
      preferencesJson: input.preferences ? JSON.stringify(input.preferences) : undefined,
      namingConfigJson: input.namingConfig ? JSON.stringify(input.namingConfig) : undefined,
      lifecycleState: input.lifecycleState,
    });
    return { item: property };
  });
}
