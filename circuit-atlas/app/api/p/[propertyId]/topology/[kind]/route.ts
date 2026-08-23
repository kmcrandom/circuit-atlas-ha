import { z } from "zod";
import { createResource, listResource, resourceTables, type ResourceKind } from "@/db/repositories";
import { InvalidRequestError } from "@/lib/http/responses";
import { parsedJson, readRoute, requestIdSchema, routeParams, writeRoute } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string; kind: string }> };
const allowed = new Set<ResourceKind>(["boxes", "box-ports", "asset-mounts", "cables", "cable-ends", "conductors", "nodes", "terminals", "splices", "conductor-ends", "connections", "circuit-sources", "control-groups", "control-members", "control-links"]);
const schema = z.object({ requestId: requestIdSchema, values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) }).strict();
function resourceKind(value: string): ResourceKind { if (!(value in resourceTables) || !allowed.has(value as ResourceKind)) throw new InvalidRequestError("Unknown topology resource kind."); return value as ResourceKind; }
export async function GET(_request: Request, context: Params) { const { propertyId, kind } = await routeParams(context.params); return readRoute(async (identity) => ({ items: await listResource(identity, propertyId, resourceKind(kind)) })); }
export async function POST(request: Request, context: Params) { const { propertyId, kind } = await routeParams(context.params); return writeRoute(request, async (identity) => { const input = await parsedJson(request, schema); return { item: await createResource({ identity, propertyId, requestId: input.requestId }, resourceKind(kind), input.values) }; }, 201); }
