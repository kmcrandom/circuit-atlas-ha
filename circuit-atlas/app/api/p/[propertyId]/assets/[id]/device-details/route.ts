import { getAssetDeviceDetails } from "@/db/repositories";
import { readRoute, routeParams } from "@/lib/http/route-utils";

type Params = { params: Promise<{ propertyId: string; id: string }> };

export async function GET(_request: Request, context: Params) {
  const { propertyId, id } = await routeParams(context.params);
  const response = await readRoute(async (identity) => getAssetDeviceDetails(identity, propertyId, id));
  response.headers.set("cache-control", "private, no-store");
  return response;
}
