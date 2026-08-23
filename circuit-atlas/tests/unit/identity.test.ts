import { describe, expect, it } from "vitest";
import {
  AuthenticationRequiredError,
  identityFromHeaders,
} from "@/lib/auth/identity";

describe("request identity", () => {
  it("uses only gateway-verified identity headers", () => {
    const requestHeaders = new Headers({
      "x-circuit-atlas-auth-provider": "cloudflare-access",
      "x-circuit-atlas-auth-subject": "user-123",
      "x-circuit-atlas-auth-email": "owner@example.test",
      "x-circuit-atlas-auth-display-name": "House Owner",
    });

    expect(identityFromHeaders(requestHeaders, "production")).toEqual({
      provider: "cloudflare-access",
      subject: "user-123",
      externalUserId: "cloudflare-access:user-123",
      email: "owner@example.test",
      displayName: "House Owner",
      isLocalDevelopment: false,
    });
  });

  it("allows an explicit non-production preview identity", () => {
    expect(identityFromHeaders(new Headers(), "development")).toMatchObject({
      provider: "local-development",
      subject: "owner",
      externalUserId: "local-development:owner",
      isLocalDevelopment: true,
    });
  });

  it("does not accept legacy or browser-forgeable identity headers", () => {
    const requestHeaders = new Headers({
      "oai-authenticated-user-id": "legacy-user",
      "oai-authenticated-user-email": "owner@example.test",
      "x-remote-user-id": "forged-home-assistant-user",
      "cf-access-authenticated-user-email": "forged@example.test",
    });

    expect(() => identityFromHeaders(requestHeaders, "production")).toThrow(
      AuthenticationRequiredError,
    );
  });

  it("fails closed without production identity headers", () => {
    expect(() => identityFromHeaders(new Headers(), "production")).toThrow(
      AuthenticationRequiredError,
    );
  });
});
