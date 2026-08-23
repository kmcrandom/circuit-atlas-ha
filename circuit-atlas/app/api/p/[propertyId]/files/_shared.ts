import { z } from "zod";
import type { PrivateFileInfo } from "@/db/repositories/files";
import { InvalidRequestError } from "@/lib/http/responses";

export const routeIdSchema = z.string().trim().min(1).max(128);

export async function propertyIdFromContext(context: {
  params: Promise<{ propertyId: string }>;
}): Promise<string> {
  const result = routeIdSchema.safeParse((await context.params).propertyId);
  if (!result.success) {
    throw new InvalidRequestError("The property identifier is invalid.");
  }
  return result.data;
}

export async function fileIdsFromContext(context: {
  params: Promise<{ propertyId: string; fileId: string }>;
}): Promise<{ propertyId: string; fileId: string }> {
  const params = await context.params;
  const result = z
    .object({ propertyId: routeIdSchema, fileId: routeIdSchema })
    .safeParse(params);
  if (!result.success) {
    throw new InvalidRequestError("The property or file identifier is invalid.");
  }
  return result.data;
}

export function privateFileJson(propertyId: string, file: PrivateFileInfo) {
  const contentPath =
    file.lifecycleState === "active"
      ? `/api/p/${encodeURIComponent(propertyId)}/files/${encodeURIComponent(file.id)}`
      : null;
  return {
    ...file,
    contentPath,
    /** Compatibility alias; this is an authenticated route, never a storage path. */
    downloadUrl: contentPath,
  };
}

export function requestIdFrom(request: Request): string | null {
  const value = request.headers.get("x-request-id")?.trim();
  return value && value.length <= 128 ? value : null;
}
