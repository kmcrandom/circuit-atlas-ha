export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  message?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = payload?.error?.code;
    this.details = payload?.error?.details;
  }
}

function isJsonResponse(response: Response): boolean {
  return response.headers.get("content-type")?.includes("application/json") ?? false;
}

async function readError(response: Response): Promise<ApiError> {
  let payload: ApiErrorPayload | undefined;
  if (isJsonResponse(response)) {
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // A malformed error body should not hide the useful HTTP status.
    }
  }

  const message =
    payload?.error?.message ??
    payload?.message ??
    (response.status === 404
      ? "The requested record could not be found."
      : response.status === 409
        ? "This record changed elsewhere. Reload it before trying again."
        : response.status >= 500
          ? "Circuit Atlas could not reach its data store."
          : "The request could not be completed.");

  return new ApiError(message, response.status, payload);
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(withRuntimeBasePath(path), {
    ...init,
    headers: {
      accept: "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) throw await readError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiMutation<TResponse, TInput = unknown>(
  path: string,
  method: "POST" | "PATCH" | "PUT",
  input: TInput,
  signal?: AbortSignal,
): Promise<TResponse> {
  return apiRequest<TResponse>(path, {
    method,
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function apiDelete<TResponse, TInput = unknown>(
  path: string,
  input: TInput,
  signal?: AbortSignal,
): Promise<TResponse> {
  return apiRequest<TResponse>(path, {
    method: "DELETE",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function propertyApiPath(
  propertyId: string,
  path = "",
): string {
  const suffix = path ? `/${path.replace(/^\/+/, "")}` : "";
  return `/api/p/${encodeURIComponent(propertyId)}${suffix}`;
}

export function appendQuery(
  path: string,
  values: Record<string, string | number | boolean | null | undefined>,
): string {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}
import { withRuntimeBasePath } from "./runtime-path";
