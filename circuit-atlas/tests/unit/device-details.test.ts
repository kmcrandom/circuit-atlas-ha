import { describe, expect, it } from "vitest";
import {
  definitionForDeviceDetail,
  deviceDetailFormatWarning,
  normalizedDeviceDetailValue,
  suggestedDeviceDetails,
} from "@/lib/device-details";

describe("smart-device details", () => {
  it("normalizes address identifiers without changing the entered value", () => {
    expect(normalizedDeviceDetailValue("mac-address", "AA:bb:CC:dd:EE:f0", "identifier")).toBe("AABBCCDDEEF0");
    expect(normalizedDeviceDetailValue("zigbee-ieee", "00-12-4b-00-12-34-56-78", "identifier")).toBe("00124B0012345678");
  });

  it("never creates a normalized searchable value for a secret", () => {
    expect(normalizedDeviceDetailValue("setup-code", "111-22-333", "secret")).toBeNull();
    expect(definitionForDeviceDetail("setup-code").sensitivity).toBe("secret");
    expect(definitionForDeviceDetail("onboarding-payload").sensitivity).toBe("secret");
  });

  it("warns about familiar address formats without rejecting custom data", () => {
    expect(deviceDetailFormatWarning("mac-address", "not-yet-readable")).toMatch(/usually contains 12/i);
    expect(deviceDetailFormatWarning("zigbee-ieee", "00:12:4B:00:12:34:56:78")).toBeNull();
    expect(deviceDetailFormatWarning("custom", "any vendor format")).toBeNull();
  });

  it("suggests reusable Hue and Inovelli fields from product facts", () => {
    const hue = suggestedDeviceDetails("Philips Hue", "Matter over Wi-Fi").map((item) => item.kind);
    expect(hue).toEqual(expect.arrayContaining(["mac-address", "setup-code", "matter-device-id", "hub-bridge"]));

    const inovelli = suggestedDeviceDetails("Inovelli", "Zigbee").map((item) => item.kind);
    expect(inovelli).toEqual(expect.arrayContaining(["zigbee-ieee", "hub-bridge"]));
    expect(inovelli).not.toContain("setup-code");
  });
});
