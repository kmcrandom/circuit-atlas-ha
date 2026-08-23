import { z } from "zod";
import {
  createPrivateFile,
  listPrivateFiles,
  PRIVATE_FILE_OWNER_TYPES,
} from "@/db/repositories/files";
import { getRequestIdentity } from "@/lib/auth/identity";
import {
  DEFAULT_PRIVATE_FILE_MAX_BYTES,
  PRIVATE_FILE_CATEGORIES,
} from "@/lib/files";
import {
  assertSameOrigin,
  errorResponse,
  InvalidRequestError,
} from "@/lib/http/responses";
import {
  privateFileJson,
  propertyIdFromContext,
  requestIdFrom,
  routeIdSchema,
} from "./_shared";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ propertyId: string }>;
};

const ownerTypeSchema = z.enum(PRIVATE_FILE_OWNER_TYPES);
const categorySchema = z.enum(PRIVATE_FILE_CATEGORIES);
const optionalPositiveInteger = z.preprocess(
  (value) => (value == null || value === "" ? undefined : Number(value)),
  z.number().int().positive().optional(),
);
const uploadMetadataSchema = z
  .object({
    ownerType: ownerTypeSchema,
    ownerId: z.string().trim().min(1).max(128),
    category: categorySchema.optional(),
    altText: z.string().trim().max(1_000).optional(),
    widthPixels: optionalPositiveInteger,
    heightPixels: optionalPositiveInteger,
    pageCount: optionalPositiveInteger,
  })
  .strict();

function asOptionalFormValue(value: FormDataEntryValue | null) {
  if (value == null || (typeof value === "string" && !value.trim())) {
    return undefined;
  }
  return value;
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value === "string") return false;
  const candidate = value as File;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.arrayBuffer === "function"
  );
}

function defaultCategory(ownerType: z.infer<typeof ownerTypeSchema>) {
  if (ownerType === "floor_plan") return "floor-plan" as const;
  if (ownerType === "evidence") return "evidence" as const;
  return "attachment" as const;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const propertyId = await propertyIdFromContext(context);
    const identity = await getRequestIdentity();
    const url = new URL(request.url);
    const ownerTypeValue = url.searchParams.get("ownerType") ?? undefined;
    const ownerTypeResult = ownerTypeValue
      ? ownerTypeSchema.safeParse(ownerTypeValue)
      : null;
    if (ownerTypeResult && !ownerTypeResult.success) {
      throw new InvalidRequestError("The file owner type is invalid.");
    }
    const ownerIdValue = url.searchParams.get("ownerId")?.trim() || undefined;
    const ownerIdResult = ownerIdValue
      ? routeIdSchema.safeParse(ownerIdValue)
      : null;
    if (ownerIdResult && !ownerIdResult.success) {
      throw new InvalidRequestError("The file owner identifier is invalid.");
    }
    const includeArchivedValue = url.searchParams.get("includeArchived");
    if (
      includeArchivedValue != null &&
      includeArchivedValue !== "true" &&
      includeArchivedValue !== "false"
    ) {
      throw new InvalidRequestError(
        "includeArchived must be either true or false.",
      );
    }

    const files = await listPrivateFiles(identity, propertyId, {
      ownerType: ownerTypeResult?.success ? ownerTypeResult.data : undefined,
      ownerId: ownerIdResult?.success ? ownerIdResult.data : undefined,
      includeArchived: includeArchivedValue === "true",
    });
    return Response.json({
      items: files.map((file) => privateFileJson(propertyId, file)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("multipart/form-data")) {
      throw new InvalidRequestError(
        "Private files must be uploaded as multipart form data.",
      );
    }

    const propertyId = await propertyIdFromContext(context);
    const identity = await getRequestIdentity();
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new InvalidRequestError("The multipart upload could not be read.");
    }
    const allowedFields = new Set([
      "file",
      "ownerType",
      "ownerId",
      "category",
      "altText",
      "widthPixels",
      "heightPixels",
      "pageCount",
    ]);
    for (const key of form.keys()) {
      if (!allowedFields.has(key)) {
        throw new InvalidRequestError(`Unexpected upload field: ${key}.`);
      }
      if (form.getAll(key).length > 1) {
        throw new InvalidRequestError(`Upload field ${key} may appear only once.`);
      }
    }
    const metadataResult = uploadMetadataSchema.safeParse({
      ownerType: form.get("ownerType"),
      ownerId: form.get("ownerId"),
      category: asOptionalFormValue(form.get("category")),
      altText: asOptionalFormValue(form.get("altText")),
      widthPixels: asOptionalFormValue(form.get("widthPixels")),
      heightPixels: asOptionalFormValue(form.get("heightPixels")),
      pageCount: asOptionalFormValue(form.get("pageCount")),
    });
    if (!metadataResult.success) {
      throw new InvalidRequestError(
        metadataResult.error.issues[0]?.message ??
          "The private-file metadata is invalid.",
      );
    }

    const upload = form.get("file");
    if (!isUploadedFile(upload)) {
      throw new InvalidRequestError("A file is required.");
    }
    if (upload.size <= 0) {
      throw new InvalidRequestError("The file must contain at least one byte.");
    }
    if (upload.size > DEFAULT_PRIVATE_FILE_MAX_BYTES) {
      throw new InvalidRequestError(
        `The file exceeds the ${DEFAULT_PRIVATE_FILE_MAX_BYTES}-byte limit.`,
      );
    }

    const bytes = await upload.arrayBuffer();
    if (bytes.byteLength !== upload.size) {
      throw new InvalidRequestError("The uploaded file was incomplete.");
    }
    const metadata = metadataResult.data;
    const file = await createPrivateFile(
      {
        identity,
        propertyId,
        requestId: requestIdFrom(request),
      },
      {
        ownerType: metadata.ownerType,
        ownerId: metadata.ownerId,
        category: metadata.category ?? defaultCategory(metadata.ownerType),
        originalFileName: upload.name,
        declaredMimeType: upload.type,
        bytes,
        altText: metadata.altText,
        widthPixels: metadata.widthPixels,
        heightPixels: metadata.heightPixels,
        pageCount: metadata.pageCount,
      },
    );
    return Response.json(
      { file: privateFileJson(propertyId, file) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
