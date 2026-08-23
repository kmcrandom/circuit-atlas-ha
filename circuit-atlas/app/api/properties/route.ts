import { z } from "zod";
import { createProperty, listProperties } from "@/db/repositories";
import { getRequestIdentity } from "@/lib/auth/identity";
import { assertSameOrigin, errorResponse } from "@/lib/http/responses";

export const dynamic = "force-dynamic";

const createPropertySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().max(240).nullable().optional(),
  })
  .strict();

export async function GET() {
  try {
    const identity = await getRequestIdentity();
    return Response.json({ items: await listProperties(identity) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = await getRequestIdentity();
    const input = createPropertySchema.parse(await request.json());
    const property = await createProperty(identity, input);
    return Response.json({ property }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
