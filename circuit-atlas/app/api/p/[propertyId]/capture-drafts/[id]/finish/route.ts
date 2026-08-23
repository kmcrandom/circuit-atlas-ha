import { z } from "zod";

import { finishCaptureDraft } from "@/db/repositories/capture";
import {
  parsedJson,
  revisionSchema,
  routeParams,
  writeRoute,
} from "@/lib/http/route-utils";

type Params = { params: Promise<{ propertyId: string; id: string }> };

const finishSchema = z.object({
  requestId: z.string().trim().min(1).max(160),
  revision: revisionSchema,
}).strict();

export async function POST(request: Request, context: Params) {
  const { propertyId, id } = await routeParams(context.params);
  return writeRoute(request, async (identity) => {
    const input = await parsedJson(request, finishSchema);
    return finishCaptureDraft(
      { identity, propertyId, requestId: input.requestId },
      id,
      input.revision,
    );
  });
}
