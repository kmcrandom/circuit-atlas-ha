import { boxDetailViewModel } from "@/db/repositories";
import { getBoxTerminationModel } from "@/db/repositories/box-termination";
import { readRoute, routeParams } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string; boxId: string }> };
export async function GET(_request: Request, context: Params) {
  const { propertyId, boxId } = await routeParams(context.params);
  return readRoute(async (identity) => {
    const [detail, termination] = await Promise.all([
      boxDetailViewModel(identity, propertyId, boxId),
      getBoxTerminationModel(identity, propertyId, boxId),
    ]);
    return { ...detail, termination };
  });
}
