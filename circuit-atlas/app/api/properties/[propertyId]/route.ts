import { z } from "zod";

import { requireOwnedProperty, updateProperty } from "@/db/repositories";
import { getRequestIdentity } from "@/lib/auth/identity";
import {
  assertSameOrigin,
  errorResponse,
  InvalidRequestError,
} from "@/lib/http/responses";

export const dynamic = "force-dynamic";

const routeSchema = z.object({ propertyId: z.string().uuid() });
const updateSchema = z
  .object({
    revision: z.number().int().positive(),
    requestId: z.string().trim().min(1).max(128).nullable().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    address: z.string().trim().max(240).nullable().optional(),
    lifecycleState: z.enum(["active", "archived"]).optional(),
  })
  .strict()
  .refine(
    ({ name, address, lifecycleState }) =>
      name !== undefined || address !== undefined || lifecycleState !== undefined,
    { message: "At least one property change is required." },
  );

type Context = { params: Promise<{ propertyId: string }> };

async function propertyIdFrom(context: Context): Promise<string> {
  const result = routeSchema.safeParse(await context.params);
  if (!result.success) throw new InvalidRequestError("Property not found.");
  return result.data.propertyId;
}

async function updateInputFrom(request: Request) {
  try {
    return updateSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new InvalidRequestError(
        error.issues.map((issue) => issue.message).join("; "),
      );
    }
    if (error instanceof SyntaxError) {
      throw new InvalidRequestError("Request body is not valid JSON.");
    }
    throw error;
  }
}

export async function GET(_request: Request, context: Context) {
  try {
    const identity = await getRequestIdentity();
    const property = await requireOwnedProperty(
      identity,
      await propertyIdFrom(context),
    );
    return Response.json({ property });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const identity = await getRequestIdentity();
    const propertyId = await propertyIdFrom(context);
    const input = await updateInputFrom(request);
    return Response.json({
      property: await updateProperty(identity, propertyId, input),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
