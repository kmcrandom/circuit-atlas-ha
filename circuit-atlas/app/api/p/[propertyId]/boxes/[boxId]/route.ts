import { boxDetailViewModel, resolveWiringConfiguration } from "@/db/repositories";
import { getBoxTerminationModel } from "@/db/repositories/box-termination";
import { readRoute, routeParams } from "@/lib/http/route-utils";
type Params = { params: Promise<{ propertyId: string; boxId: string }> };
export async function GET(request: Request, context: Params) {
  const { propertyId, boxId } = await routeParams(context.params);
  return readRoute(async (identity) => {
    const configurationId = new URL(request.url).searchParams.get("configurationId");
    const [detail, termination, wiringConfiguration] = await Promise.all([
      boxDetailViewModel(identity, propertyId, boxId, configurationId),
      getBoxTerminationModel(identity, propertyId, boxId, configurationId),
      resolveWiringConfiguration(identity, propertyId, configurationId),
    ]);
    return { ...detail, termination, wiringConfiguration: { id: wiringConfiguration.id, name: wiringConfiguration.name, status: wiringConfiguration.status } };
  });
}
