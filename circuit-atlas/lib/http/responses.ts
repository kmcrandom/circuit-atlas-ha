import { AuthenticationRequiredError } from "@/lib/auth/identity";

export class NotFoundError extends Error {
  readonly status = 404;
}

export class ConflictError extends Error {
  readonly status = 409;
}

export class InvalidRequestError extends Error {
  readonly status = 400;
}

type ErrorLike = Error & { status?: number };

export function errorResponse(error: unknown): Response {
  if (error && typeof error === "object" && "issues" in error) {
    return Response.json(
      { error: { message: "The request is invalid.", type: "ValidationError" } },
      { status: 400 },
    );
  }
  const normalized: ErrorLike =
    error instanceof Error
      ? (error as ErrorLike)
      : (new Error("Unknown error") as ErrorLike);
  const status =
    normalized instanceof AuthenticationRequiredError
      ? normalized.status
      : normalized.status ?? 500;

  return Response.json(
    {
      error: {
        message:
          status >= 500 ? "An unexpected error occurred." : normalized.message,
        type: normalized.name,
      },
    },
    { status },
  );
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const requestOrigin =
    forwardedHost && (forwardedProtocol === "http" || forwardedProtocol === "https")
      ? `${forwardedProtocol}://${forwardedHost}`
      : requestUrl.origin;
  if (new URL(origin).origin !== new URL(requestOrigin).origin) {
    throw new InvalidRequestError("The request origin is not allowed.");
  }
}
