import { z } from "zod";
import { createWiringConfiguration, listWiringConfigurations } from "@/db/repositories";
import { parsedJson, readRoute, routeParams, writeRoute } from "@/lib/http/route-utils";

type Params = { params: Promise<{ propertyId: string }> };
const createSchema = z.object({ name: z.string().trim().min(1).max(120), status: z.enum(["draft", "planned"]).optional(), summary: z.string().trim().max(2_000).nullable().optional(), sourceConfigurationId: z.string().uuid().nullable().optional() }).strict();

export async function GET(_request: Request, context: Params) {
  const { propertyId } = await routeParams(context.params);
  return readRoute(async (identity) => ({ items: await listWiringConfigurations(identity, propertyId) }));
}

export async function POST(request: Request, context: Params) {
  const { propertyId } = await routeParams(context.params);
  return writeRoute(request, async (identity) => ({ item: await createWiringConfiguration(identity, propertyId, await parsedJson(request, createSchema)) }), 201);
}
