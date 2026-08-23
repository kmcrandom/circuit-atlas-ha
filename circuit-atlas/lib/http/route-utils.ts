import { z } from "zod";
import { getRequestIdentity } from "@/lib/auth/identity";
import { assertSameOrigin, errorResponse, InvalidRequestError } from "./responses";

export const routeIdSchema = z.string().uuid();
export const revisionSchema = z.number().int().positive();
export const requestIdSchema = z.string().trim().min(1).max(160).optional();

export async function routeParams<T extends Record<string, string>>(
  params: Promise<T>,
): Promise<T> {
  return params;
}

export async function parsedJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  try {
    return schema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new InvalidRequestError(error.issues.map((issue) => issue.message).join("; "));
    }
    if (error instanceof SyntaxError) throw new InvalidRequestError("Request body is not valid JSON.");
    throw error;
  }
}

export async function readRoute<T>(work: (identity: Awaited<ReturnType<typeof getRequestIdentity>>) => Promise<T>): Promise<Response> {
  try {
    const identity = await getRequestIdentity();
    return Response.json(await work(identity));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function writeRoute<T>(request: Request, work: (identity: Awaited<ReturnType<typeof getRequestIdentity>>) => Promise<T>, status = 200): Promise<Response> {
  try {
    assertSameOrigin(request);
    const identity = await getRequestIdentity();
    return Response.json(await work(identity), { status });
  } catch (error) {
    return errorResponse(error);
  }
}
