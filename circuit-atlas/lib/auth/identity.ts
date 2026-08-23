import { headers } from "next/headers";

const PROVIDER_HEADER = "x-circuit-atlas-auth-provider";
const SUBJECT_HEADER = "x-circuit-atlas-auth-subject";
const EMAIL_HEADER = "x-circuit-atlas-auth-email";
const DISPLAY_NAME_HEADER = "x-circuit-atlas-auth-display-name";

export type IdentityProvider =
  | "home-assistant"
  | "cloudflare-access"
  | "local-development";

export type RequestIdentity = {
  provider: IdentityProvider;
  subject: string;
  /** Provider-qualified subject retained by the existing audit schema. */
  externalUserId: string;
  email: string | null;
  displayName: string;
  isLocalDevelopment: boolean;
};

export class AuthenticationRequiredError extends Error {
  readonly status = 401;

  constructor() {
    super("Authentication is required.");
    this.name = "AuthenticationRequiredError";
  }
}

export function identityFromHeaders(
  requestHeaders: Headers,
  runtime = process.env.NODE_ENV,
): RequestIdentity {
  const provider = requestHeaders.get(PROVIDER_HEADER);
  const subject = requestHeaders.get(SUBJECT_HEADER)?.trim();
  if (
    (provider === "home-assistant" || provider === "cloudflare-access") &&
    subject &&
    subject.length <= 512
  ) {
    const email = requestHeaders.get(EMAIL_HEADER)?.trim() || null;
    const displayName =
      requestHeaders.get(DISPLAY_NAME_HEADER)?.trim() || email || subject;
    return {
      provider,
      subject,
      externalUserId: `${provider}:${subject}`,
      email,
      displayName,
      isLocalDevelopment: false,
    };
  }

  if (runtime !== "production") {
    return {
      provider: "local-development",
      subject: "owner",
      externalUserId: "local-development:owner",
      email: "local@circuit-atlas.invalid",
      displayName: "Local owner",
      isLocalDevelopment: true,
    };
  }

  throw new AuthenticationRequiredError();
}

export async function getRequestIdentity(): Promise<RequestIdentity> {
  return identityFromHeaders(await headers());
}
