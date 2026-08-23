import { z } from "zod";
import { requestIdSchema, revisionSchema } from "@/lib/http/route-utils";

const deviceDetailSchema = z.object({
  id: z.string().uuid().optional(),
  revision: z.number().int().positive().optional(),
  kind: z.enum(["mac-address", "zigbee-ieee", "matter-device-id", "manufacturer-device-id", "setup-code", "pairing-code", "install-code", "onboarding-payload", "hub-bridge", "ecosystem-name", "custom"]),
  label: z.string().trim().min(1).max(120),
  value: z.string().min(1).max(2048),
  sensitivity: z.enum(["ordinary", "identifier", "secret"]),
  notes: z.string().max(1000).nullable().optional(),
  verification: z.enum(["unknown", "assumed", "inferred", "observed", "test-verified", "documentation-verified", "conflicting"]),
  verifiedAt: z.string().max(40).nullable().optional(),
}).strict();

const installedProductSchema = z.object({
  manufacturer: z.string().max(120).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  serialNumber: z.string().max(160).nullable().optional(),
  hardwareRevision: z.string().max(120).nullable().optional(),
  smartState: z.enum(["smart", "dumb", "unknown", "not-applicable"]).optional(),
  protocol: z.string().max(120).nullable().optional(),
  ecosystem: z.string().max(120).nullable().optional(),
  hub: z.string().max(120).nullable().optional(),
  firmware: z.string().max(120).nullable().optional(),
  installationDate: z.string().max(40).nullable().optional(),
  deviceDetails: z.array(deviceDetailSchema).max(100).optional(),
}).strict();

const lightSourceSchema = z.object({
  id: z.string().uuid().optional(),
  holderLabel: z.string().trim().min(1).max(120),
  sourceType: z.enum(["replaceable", "integrated", "unknown"]),
  smartState: z.enum(["smart", "dumb", "unknown", "not-applicable"]),
  baseType: z.string().max(80).nullable().optional(),
  shape: z.string().max(80).nullable().optional(),
  technology: z.string().max(80).nullable().optional(),
  wattage: z.number().min(0).nullable().optional(),
  equivalentWattage: z.number().min(0).nullable().optional(),
  lumens: z.number().min(0).nullable().optional(),
  colorTemperatureKelvin: z.number().int().positive().nullable().optional(),
  colorTemperatureMinKelvin: z.number().int().positive().nullable().optional(),
  colorTemperatureMaxKelvin: z.number().int().positive().nullable().optional(),
  colorCapability: z.enum(["fixed-white", "tunable-white", "full-color", "custom"]).nullable().optional(),
  dimmable: z.boolean().nullable().optional(),
  manufacturer: z.string().max(120).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  serialNumber: z.string().max(160).nullable().optional(),
  hardwareRevision: z.string().max(120).nullable().optional(),
  firmware: z.string().max(120).nullable().optional(),
  protocol: z.string().max(120).nullable().optional(),
  ecosystem: z.string().max(120).nullable().optional(),
  hub: z.string().max(120).nullable().optional(),
  deviceDetails: z.array(deviceDetailSchema).max(100).optional(),
}).strict().superRefine((value, context) => {
  if (
    value.colorTemperatureMinKelvin != null &&
    value.colorTemperatureMaxKelvin != null &&
    value.colorTemperatureMaxKelvin < value.colorTemperatureMinKelvin
  ) {
    context.addIssue({
      code: "custom",
      path: ["colorTemperatureMaxKelvin"],
      message: "Maximum color temperature must be greater than or equal to the minimum.",
    });
  }
});

export const assetCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  kind: z.enum(["panel", "box", "switch", "receptacle", "fixture", "light-source", "appliance", "cable", "junction", "other"]),
  subtype: z.string().max(120).nullable().optional(),
  smartState: z.enum(["smart", "dumb", "mixed", "unknown", "not-applicable"]).optional(),
  notes: z.string().max(4000).nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  locatorLabel: z.string().max(160).nullable().optional(),
  boxId: z.string().uuid().nullable().optional(),
  gangPosition: z.union([z.string(), z.number()]).nullable().optional(),
  installedProduct: installedProductSchema.nullable().optional(),
  assertedCircuitIds: z.array(z.string().uuid()).optional(),
  lightSources: z.array(lightSourceSchema).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).optional(),
  verification: z.string().max(80).optional(),
  operationalStatus: z.string().max(80).optional(),
  switchConfiguration: z.string().max(120).optional(),
  receptacleConfiguration: z.string().max(120).optional(),
}).strict();

export const assetUpdateSchema = assetCreateSchema.omit({ kind: true }).partial().extend({
  requestId: requestIdSchema,
  revision: revisionSchema,
  lifecycleState: z.enum(["active", "archived"]).optional(),
}).strict();
