import { locationViewModels } from "@/db/repositories";
import { readRoute, routeParams } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string }> };
export async function GET(_request: Request, context: Params) {
  const { propertyId } = await routeParams(context.params);
  return readRoute(async (identity) => locationViewModels(identity, propertyId));
}
