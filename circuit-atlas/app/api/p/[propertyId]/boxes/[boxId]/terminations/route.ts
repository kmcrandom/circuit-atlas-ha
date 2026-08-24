import {
  createBoxTermination,
  getBoxTerminationModel,
} from "@/db/repositories/box-termination";
import {
  parsedJson,
  readRoute,
  routeParams,
  writeRoute,
} from "@/lib/http/route-utils";

import { createTerminationSchema } from "./_schemas";

type Params = { params: Promise<{ propertyId: string; boxId: string }> };

export async function GET(request: Request, context: Params) {
  const { propertyId, boxId } = await routeParams(context.params);
  return readRoute(async (identity) => ({
    termination: await getBoxTerminationModel(identity, propertyId, boxId, new URL(request.url).searchParams.get("configurationId")),
  }));
}

export async function POST(request: Request, context: Params) {
  const { propertyId, boxId } = await routeParams(context.params);
  return writeRoute(request, async (identity) => {
    const input = await parsedJson(request, createTerminationSchema);
    const { requestId, ...values } = input;
    return {
      termination: await createBoxTermination(
        { identity, propertyId, requestId, wiringConfigurationId: new URL(request.url).searchParams.get("configurationId") },
        boxId,
        values,
      ),
    };
  }, 201);
}
