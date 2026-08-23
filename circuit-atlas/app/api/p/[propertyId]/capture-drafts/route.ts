import { z } from "zod";

import {
  captureDraftPayloadSchema,
  createCaptureDraft,
  listCaptureDrafts,
} from "@/db/repositories/capture";
import { parsedJson, readRoute, routeParams, writeRoute } from "@/lib/http/route-utils";

type Params = { params: Promise<{ propertyId: string }> };

const requestIdSchema = z.string().trim().min(1).max(160);
const createSchema = z.object({
  requestId: requestIdSchema,
  status: z.enum(["in_progress", "abandoned"]).default("in_progress"),
  currentStep: z.string().trim().max(80).nullable().optional(),
  targetType: z.string().trim().max(80).nullable().optional(),
  targetId: z.string().uuid().nullable().optional(),
  payload: captureDraftPayloadSchema,
}).strict();

export async function GET(_request: Request, context: Params) {
  const { propertyId } = await routeParams(context.params);
  return readRoute(async (identity) => ({
    items: await listCaptureDrafts(identity, propertyId),
  }));
}

export async function POST(request: Request, context: Params) {
  const { propertyId } = await routeParams(context.params);
  return writeRoute(request, async (identity) => {
    const input = await parsedJson(request, createSchema);
    return {
      item: await createCaptureDraft(
        { identity, propertyId, requestId: input.requestId },
        input,
      ),
    };
  }, 201);
}
