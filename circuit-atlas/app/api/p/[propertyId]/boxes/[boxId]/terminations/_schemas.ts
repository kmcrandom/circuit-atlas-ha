import { z } from "zod";

import {
  BOX_CONDUCTOR_FUNCTIONS,
  BOX_CONDUCTOR_KINDS,
  BOX_OPEN_ENDPOINT_KINDS,
  BOX_TERMINAL_ROLES,
  BOX_TERMINATION_CERTAINTIES,
  BOX_TERMINATION_METHODS,
} from "@/features/boxes";
import {
  boxTerminationKinds,
  type BoxTerminationKind,
} from "@/db/repositories/box-termination";
import { InvalidRequestError } from "@/lib/http/responses";
import { requestIdSchema, revisionSchema } from "@/lib/http/route-utils";

const optionalText = z.string().max(500).nullable().optional();

export const patchTerminationSchema = z.object({
  requestId: requestIdSchema,
  revision: revisionSchema,
  values: z.union([
    z.object({ terminalKey: z.string().trim().min(1).max(120).optional(), manufacturerLabel: optionalText, semanticRole: z.enum(BOX_TERMINAL_ROLES).optional(), terminalGroup: optionalText }).strict(),
    z.object({ label: optionalText, connectorType: optionalText }).strict(),
    z.object({ endpointKind: z.enum(BOX_OPEN_ENDPOINT_KINDS).optional(), label: optionalText, description: z.string().max(4000).nullable().optional() }).strict(),
    z.object({ label: optionalText, description: z.string().max(4000).nullable().optional() }).strict(),
    z.object({ kind: z.enum(BOX_CONDUCTOR_KINDS).optional(), observedInsulationColor: optionalText, reidentificationMarking: optionalText, assignedFunction: z.enum(BOX_CONDUCTOR_FUNCTIONS).nullable().optional(), gauge: optionalText }).strict(),
    z.object({ nodeId: z.string().uuid().optional(), terminationMethod: z.enum(BOX_TERMINATION_METHODS).optional(), certainty: z.enum(BOX_TERMINATION_CERTAINTIES).optional() }).strict(),
  ]),
}).strict();

export const createTerminationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("terminals"), requestId: requestIdSchema, owningAssetId: z.string().uuid(), terminalKey: z.string().trim().min(1).max(120), manufacturerLabel: optionalText, semanticRole: z.enum(BOX_TERMINAL_ROLES).optional(), terminalGroup: optionalText }).strict(),
  z.object({ kind: z.literal("splices"), requestId: requestIdSchema, label: z.string().trim().min(1).max(500), connectorType: optionalText }).strict(),
  z.object({ kind: z.literal("open-endpoints"), requestId: requestIdSchema, label: optionalText, endpointKind: z.enum(BOX_OPEN_ENDPOINT_KINDS).optional(), description: z.string().max(4000).nullable().optional() }).strict(),
  z.object({ kind: z.literal("bond-points"), requestId: requestIdSchema, label: z.string().trim().min(1).max(500), description: z.string().max(4000).nullable().optional() }).strict(),
  z.object({ kind: z.literal("conductors"), requestId: requestIdSchema, conductorKind: z.enum(BOX_CONDUCTOR_KINDS).optional(), observedInsulationColor: optionalText, gauge: optionalText }).strict(),
  z.object({ kind: z.literal("conductor-ends"), requestId: requestIdSchema, conductorId: z.string().uuid(), designation: z.enum(["A", "B"]), nodeId: z.string().uuid(), terminationMethod: z.enum(BOX_TERMINATION_METHODS).optional(), certainty: z.enum(BOX_TERMINATION_CERTAINTIES).optional(), revision: revisionSchema }).strict(),
]);

export const removeTerminationSchema = z.object({
  requestId: requestIdSchema,
  revision: revisionSchema,
}).strict();

export function terminationKind(value: string): BoxTerminationKind {
  if (!boxTerminationKinds.includes(value as BoxTerminationKind)) {
    throw new InvalidRequestError("Unknown gang-box termination kind.");
  }
  return value as BoxTerminationKind;
}
