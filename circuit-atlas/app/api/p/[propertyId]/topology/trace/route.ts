import { z } from "zod";
import { breakerConnectedLookup, loadElectricalTopology, topologyVisualModel, tracePropertyTopology } from "@/db/repositories";
import { traceTopology } from "@/lib/topology/trace";
import { validateTopology } from "@/lib/validation/topology";
import { InvalidRequestError } from "@/lib/http/responses";
import { readRoute, routeParams } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string }> };
const rootKind = z.enum(["breaker", "breaker-pole", "circuit", "asset", "asset-function", "box", "cable", "conductor", "node"]);
export async function GET(request: Request, context: Params) {
  const { propertyId } = await routeParams(context.params);
  return readRoute(async (identity) => {
    const url = new URL(request.url);
    const kind = rootKind.safeParse(url.searchParams.get("rootKind"));
    const id = url.searchParams.get("rootId");
    if (!kind.success || !id) throw new InvalidRequestError("rootKind and rootId are required.");
    if (kind.data === "breaker") {
      const lookup = await breakerConnectedLookup(identity, propertyId, id);
      const topology = await loadElectricalTopology(identity, propertyId);
      const trace = traceTopology(topology, lookup.poles.map((pole) => ({ kind: "breaker-pole" as const, id: pole.id })));
      return { topology, trace, validation: validateTopology(topology), visualModel: topologyVisualModel(topology, trace, lookup.breaker.label) };
    }
    return tracePropertyTopology(identity, propertyId, { kind: kind.data, id });
  });
}
