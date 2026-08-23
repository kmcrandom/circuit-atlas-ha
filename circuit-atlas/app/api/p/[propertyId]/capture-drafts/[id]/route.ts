import { z } from "zod";

import {
  captureDraftPayloadSchema,
  getCaptureDraft,
  saveCaptureDraft,
} from "@/db/repositories/capture";
import {
  parsedJson,
  readRoute,
  revisionSchema,
  routeParams,
  writeRoute,
} from "@/lib/http/route-utils";

type Params = { params: Promise<{ propertyId: string; id: string }> };

const updateSchema = z.object({
  requestId: z.string().trim().min(1).max(160),
  revision: revisionSchema,
  status: z.enum(["in_progress", "abandoned"]).default("in_progress"),
  currentStep: z.string().trim().max(80).nullable().optional(),
  targetType: z.string().trim().max(80).nullable().optional(),
  targetId: z.string().uuid().nullable().optional(),
  payload: captureDraftPayloadSchema,
}).strict();

export async function GET(_request: Request, context: Params) {
  const { propertyId, id } = await routeParams(context.params);
  return readRoute(async (identity) => ({
    item: await getCaptureDraft(identity, propertyId, id),
  }));
}

export async function PATCH(request: Request, context: Params) {
  const { propertyId, id } = await routeParams(context.params);
  return writeRoute(request, async (identity) => {
    const input = await parsedJson(request, updateSchema);
    const { revision, requestId, ...draft } = input;
    return {
      item: await saveCaptureDraft(
        { identity, propertyId, requestId },
        id,
        revision,
        draft,
      ),
    };
  });
}
