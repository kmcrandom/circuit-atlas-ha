import { describe, expect, it } from "vitest";
import { z } from "zod";
import { InvalidRequestError, errorResponse } from "@/lib/http/responses";
import { parsedJson } from "@/lib/http/route-utils";

describe("API validation boundary", () => {
  it("turns invalid JSON into a client error", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    await expect(parsedJson(request, z.object({ name: z.string() }))).rejects.toBeInstanceOf(
      InvalidRequestError,
    );
  });

  it("reports request validation as 400", async () => {
    const response = errorResponse(new InvalidRequestError("Bad input."));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "Bad input." },
    });
  });
});
