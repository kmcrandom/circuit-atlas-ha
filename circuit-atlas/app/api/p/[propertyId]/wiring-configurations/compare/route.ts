import { z } from "zod";
import { compareWiringConfigurations } from "@/db/repositories";
import { InvalidRequestError } from "@/lib/http/responses";
import { readRoute, routeParams } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string }> };
const schema = z.object({ from: z.string().uuid(), to: z.string().uuid() });
export async function GET(request: Request, context: Params) { const { propertyId } = await routeParams(context.params); return readRoute(async (identity) => { const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams)); if (!parsed.success) throw new InvalidRequestError("Choose two wiring configurations to compare."); return compareWiringConfigurations(identity, propertyId, parsed.data.from, parsed.data.to); }); }
