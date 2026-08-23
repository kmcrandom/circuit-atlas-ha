import {
  patchBoxTermination,
  removeBoxTermination,
} from "@/db/repositories/box-termination";
import {
  parsedJson,
  routeParams,
  writeRoute,
} from "@/lib/http/route-utils";

import {
  patchTerminationSchema,
  removeTerminationSchema,
  terminationKind,
} from "../../_schemas";

type Params = {
  params: Promise<{
    propertyId: string;
    boxId: string;
    kind: string;
    id: string;
  }>;
};

export async function PATCH(request: Request, context: Params) {
  const { propertyId, boxId, kind: rawKind, id } = await routeParams(context.params);
  return writeRoute(request, async (identity) => {
    const input = await parsedJson(request, patchTerminationSchema);
    const kind = terminationKind(rawKind);
    return {
      termination: await patchBoxTermination(
        { identity, propertyId, requestId: input.requestId },
        boxId,
        id,
        input.revision,
        { kind, values: input.values } as Parameters<typeof patchBoxTermination>[4],
      ),
    };
  });
}

export async function DELETE(request: Request, context: Params) {
  const { propertyId, boxId, kind: rawKind, id } = await routeParams(context.params);
  return writeRoute(request, async (identity) => {
    const input = await parsedJson(request, removeTerminationSchema);
    return {
      termination: await removeBoxTermination(
        { identity, propertyId, requestId: input.requestId },
        boxId,
        terminationKind(rawKind),
        id,
        input.revision,
      ),
    };
  });
}
