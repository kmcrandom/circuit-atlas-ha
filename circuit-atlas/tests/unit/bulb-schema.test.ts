import { describe, expect, it } from "vitest";
import { assetCreateSchema } from "@/app/api/p/[propertyId]/assets/_schema";

function fixtureWith(source: Record<string, unknown>) {
  return {
    displayName: "Fictional fixture",
    kind: "fixture",
    lightSources: [{
      holderLabel: "Lamp 1",
      sourceType: "replaceable",
      smartState: "unknown",
      ...source,
    }],
  };
}

describe("bulb specification contract", () => {
  it("accepts fixed and ranged color temperatures with distinct power ratings", () => {
    expect(assetCreateSchema.safeParse(fixtureWith({
      wattage: 8.5,
      equivalentWattage: 60,
      lumens: 800,
      colorTemperatureKelvin: 2700,
      colorTemperatureMinKelvin: 2200,
      colorTemperatureMaxKelvin: 6500,
      colorCapability: "tunable-white",
      dimmable: true,
    })).success).toBe(true);
  });

  it("permits partial knowledge and rejects invalid measurements", () => {
    expect(assetCreateSchema.safeParse(fixtureWith({
      colorTemperatureMinKelvin: 2200,
    })).success).toBe(true);
    expect(assetCreateSchema.safeParse(fixtureWith({ wattage: -1 })).success).toBe(false);
    expect(assetCreateSchema.safeParse(fixtureWith({
      colorTemperatureMinKelvin: 6500,
      colorTemperatureMaxKelvin: 2200,
    })).success).toBe(false);
  });
});
