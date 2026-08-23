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

export async function GET(_request: Request, context: Params) {
  const { propertyId, boxId } = await routeParams(context.params);
  return readRoute(async (identity) => ({
    termination: await getBoxTerminationModel(identity, propertyId, boxId),
  }));
}

export async function POST(request: Request, context: Params) {
  const { propertyId, boxId } = await routeParams(context.params);
  return writeRoute(request, async (identity) => {
    const input = await parsedJson(request, createTerminationSchema);
    const { requestId, ...values } = input;
    return {
      termination: await createBoxTermination(
        { identity, propertyId, requestId },
        boxId,
        values,
      ),
    };
  }, 201);
}
