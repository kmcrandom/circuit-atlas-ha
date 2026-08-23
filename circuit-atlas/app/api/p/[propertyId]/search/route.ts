import { z } from "zod";
import { searchProperty } from "@/db/repositories";
import { InvalidRequestError } from "@/lib/http/responses";
import { readRoute, routeParams } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string }> };
export async function GET(request: Request, context: Params) { const { propertyId } = await routeParams(context.params); return readRoute(async (identity) => { const url = new URL(request.url); const q = url.searchParams.get("q") ?? ""; if (q.length > 200) throw new InvalidRequestError("Search query is too long."); const limit = z.coerce.number().int().min(1).max(100).catch(30).parse(url.searchParams.get("limit") ?? 30); return { items: await searchProperty(identity, propertyId, q, limit) }; }); }
