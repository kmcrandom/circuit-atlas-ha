import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  getDb,
  runStatementsAtomically,
  type AtomicStatement,
} from "@/db";
import * as s from "@/db/schema";
import type { RequestIdentity } from "@/lib/auth/identity";
import {
  databaseDeviceDetailKind,
  databaseDeviceDetailVerification,
  normalizedDeviceDetailValue,
  type InstalledDeviceDetail,
} from "@/lib/device-details";
import { ConflictError, InvalidRequestError } from "@/lib/http/responses";
import { requireOwnedProperty } from "./workspaces";
import { bumpPropertyRevision, nextPropertyCode } from "./core";

export type PanelCreateInput = {
  displayName: string;
  role: (typeof s.panelRoles)[number];
  columnCount: number;
  rowCount: number;
  nominalVoltage?: number | null;
  maxAmps?: number | null;
  notes?: string | null;
};

export async function createPanelAggregate(
  identity: RequestIdentity,
  propertyId: string,
  input: PanelCreateInput,
) {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const assetId = crypto.randomUUID();
  const permanentCode = await nextPropertyCode(identity, propertyId, "PNL");
  const positionRows = Array.from(
    { length: input.columnCount * input.rowCount },
    (_, index) => {
      const columnIndex = index % input.columnCount;
      const row = Math.floor(index / input.columnCount) + 1;
      return {
        id: crypto.randomUUID(),
        propertyId,
        panelAssetId: assetId,
        slotNumber: index + 1,
        side: input.columnCount === 1 ? "single" as const : columnIndex === 0 ? "left" as const : columnIndex === 1 ? "right" as const : "custom" as const,
        columnLabel: input.columnCount === 1 ? "A" : String.fromCharCode(65 + columnIndex),
        label: input.columnCount === 1 ? String(row) : `${String.fromCharCode(65 + columnIndex)}${row}`,
      };
    },
  );
  runStatementsAtomically([
    db.insert(s.assets).values({ id: assetId, propertyId, permanentCode, kind: "panel", displayName: input.displayName, notes: input.notes }),
    db.insert(s.panels).values({ assetId, propertyId, role: input.role, nominalVoltage: input.nominalVoltage, maxAmps: input.maxAmps }),
    ...(positionRows.length ? [db.insert(s.panelPositions).values(positionRows)] : []),
  ]);
  await bumpPropertyRevision(propertyId);
  return { assetId, permanentCode };
}

export async function getPanelAggregate(identity: RequestIdentity, propertyId: string, assetId: string) {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const [asset, panel] = await Promise.all([
    db.query.assets.findFirst({ where: and(eq(s.assets.propertyId, propertyId), eq(s.assets.id, assetId), ne(s.assets.lifecycleState, "archived")) }),
    db.query.panels.findFirst({ where: and(eq(s.panels.propertyId, propertyId), eq(s.panels.assetId, assetId)) }),
  ]);
  if (!asset || !panel) throw new InvalidRequestError("Panel not found in this property.");
  return { ...panel, displayName: asset.displayName, permanentCode: asset.permanentCode, notes: asset.notes, revision: asset.revision };
}

export async function updatePanelAggregate(
  identity: RequestIdentity,
  propertyId: string,
  assetId: string,
  revision: number,
  input: Partial<Pick<PanelCreateInput, "displayName" | "role" | "nominalVoltage" | "maxAmps" | "notes">> & { phaseCount?: number | null; systemNotes?: string | null },
) {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const assetPatch: Record<string, unknown> = { revision: sql`${s.assets.revision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` };
  if (input.displayName !== undefined) assetPatch.displayName = input.displayName;
  if (input.notes !== undefined) assetPatch.notes = input.notes;
  const updated = await db.update(s.assets).set(assetPatch).where(and(eq(s.assets.propertyId, propertyId), eq(s.assets.id, assetId), eq(s.assets.revision, revision), ne(s.assets.lifecycleState, "archived"))).returning({ id: s.assets.id });
  if (!updated[0]) throw new ConflictError("This panel changed after it was loaded.");
  const panelPatch: Record<string, unknown> = {};
  for (const field of ["role", "nominalVoltage", "maxAmps", "phaseCount", "systemNotes"] as const) if (input[field] !== undefined) panelPatch[field] = input[field];
  if (Object.keys(panelPatch).length) await db.update(s.panels).set(panelPatch).where(and(eq(s.panels.propertyId, propertyId), eq(s.panels.assetId, assetId)));
  await bumpPropertyRevision(propertyId);
  return getPanelAggregate(identity, propertyId, assetId);
}

export type BreakerCreateInput = {
  panelId: string;
  label: string;
  ratingAmps?: number | null;
  poleCount: number;
  kind: (typeof s.breakerKinds)[number];
  hasAfci?: boolean;
  hasGfci?: boolean;
  notes?: string | null;
  poles: Array<{ panelPositionId: string; poleIndex: number; phaseLeg?: (typeof s.phaseLegs)[number] }>;
};

export async function createBreakerAggregate(identity: RequestIdentity, propertyId: string, input: BreakerCreateInput) {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const panel = await db.query.panels.findFirst({ where: and(eq(s.panels.propertyId, propertyId), eq(s.panels.assetId, input.panelId)) });
  if (!panel) throw new InvalidRequestError("Panel not found in this property.");
  const positions = await db.select().from(s.panelPositions).where(and(eq(s.panelPositions.propertyId, propertyId), eq(s.panelPositions.panelAssetId, input.panelId), inArray(s.panelPositions.id, input.poles.map((pole) => pole.panelPositionId))));
  if (positions.length !== input.poles.length || input.poles.length !== input.poleCount) throw new InvalidRequestError("Every breaker pole must use a unique position in the selected panel.");
  const id = crypto.randomUUID();
  const permanentCode = await nextPropertyCode(identity, propertyId, "BRK");
  runStatementsAtomically([
    db.insert(s.breakers).values({ id, propertyId, panelAssetId: input.panelId, permanentCode, label: input.label, ratingAmps: input.ratingAmps, poleCount: input.poleCount, kind: input.kind, hasAfci: input.hasAfci, hasGfci: input.hasGfci, notes: input.notes }),
    db.insert(s.breakerPoles).values(input.poles.map((pole) => ({ id: crypto.randomUUID(), propertyId, panelAssetId: input.panelId, breakerId: id, panelPositionId: pole.panelPositionId, poleIndex: pole.poleIndex, phaseLeg: pole.phaseLeg ?? "unknown" }))),
  ]);
  await bumpPropertyRevision(propertyId, true);
  return { id, permanentCode };
}

export type AssetInstalledProductDraft = {
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  hardwareRevision?: string | null;
  smartState?: "smart" | "dumb" | "unknown" | "not-applicable";
  protocol?: string | null;
  ecosystem?: string | null;
  hub?: string | null;
  firmware?: string | null;
  installationDate?: string | null;
  deviceDetails?: InstalledDeviceDetail[];
};

export type AssetDraft = {
  displayName: string;
  kind: "panel" | "box" | "switch" | "receptacle" | "fixture" | "light-source" | "appliance" | "cable" | "junction" | "other";
  subtype?: string | null;
  smartState?: "smart" | "dumb" | "mixed" | "unknown" | "not-applicable";
  notes?: string | null;
  locationId?: string | null;
  locatorLabel?: string | null;
  boxId?: string | null;
  gangPosition?: string | number | null;
  installedProduct?: AssetInstalledProductDraft | null;
  assertedCircuitIds?: string[];
  lightSources?: Array<{
    id?: string;
    holderLabel: string;
    sourceType: "replaceable" | "integrated" | "unknown";
    smartState: "smart" | "dumb" | "unknown" | "not-applicable";
    baseType?: string | null;
    shape?: string | null;
    technology?: string | null;
    wattage?: number | null;
    equivalentWattage?: number | null;
    lumens?: number | null;
    colorTemperatureKelvin?: number | null;
    colorTemperatureMinKelvin?: number | null;
    colorTemperatureMaxKelvin?: number | null;
    colorCapability?: "fixed-white" | "tunable-white" | "full-color" | "custom" | null;
    dimmable?: boolean | null;
    manufacturer?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    hardwareRevision?: string | null;
    firmware?: string | null;
    protocol?: string | null;
    ecosystem?: string | null;
    hub?: string | null;
    deviceDetails?: InstalledDeviceDetail[];
  }>;
  tags?: string[];
  verification?: string;
  operationalStatus?: string;
  switchConfiguration?: string;
  receptacleConfiguration?: string;
};

export type AssetStoredNotes = {
  text: string | null;
  tags: string[];
  verification: string;
  operationalStatus: string;
};

export function decodeAssetNotes(value: string | null): AssetStoredNotes {
  if (!value) return { text: null, tags: [], verification: "unknown", operationalStatus: "unknown" };
  try {
    const parsed = JSON.parse(value) as { format?: string; text?: unknown; tags?: unknown; verification?: unknown; operationalStatus?: unknown };
    if (parsed.format === "circuit-atlas.asset-notes.v1") {
      return {
        text: typeof parsed.text === "string" ? parsed.text : null,
        tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === "string") : [],
        verification: typeof parsed.verification === "string" ? parsed.verification : "unknown",
        operationalStatus: typeof parsed.operationalStatus === "string" ? parsed.operationalStatus : "unknown",
      };
    }
  } catch {
    // Plain notes from older records remain user-visible text.
  }
  return { text: value, tags: [], verification: "unknown", operationalStatus: "unknown" };
}

function encodeAssetNotes(value: AssetStoredNotes): string {
  return JSON.stringify({ format: "circuit-atlas.asset-notes.v1", ...value });
}

const prefixByKind: Record<AssetDraft["kind"], string> = { panel: "PNL", box: "BOX", switch: "DEV", receptacle: "DEV", fixture: "FIX", "light-source": "DEV", appliance: "APL", cable: "CBL", junction: "BOX", other: "DEV" };

function deviceDetailValues(
  propertyId: string,
  installedProductId: string,
  detail: InstalledDeviceDetail,
) {
  return {
    id: detail.id ?? crypto.randomUUID(),
    propertyId,
    installedProductId,
    kind: databaseDeviceDetailKind(detail.kind),
    label: detail.label.trim(),
    value: detail.value,
    normalizedValue: normalizedDeviceDetailValue(detail.kind, detail.value, detail.sensitivity),
    sensitivity: detail.sensitivity,
    notes: detail.notes,
    verificationState: databaseDeviceDetailVerification(detail.verification),
    verifiedAt: detail.verifiedAt,
  };
}

async function syncInstalledDeviceDetails(
  db: ReturnType<typeof getDb>,
  propertyId: string,
  installedProductId: string,
  details: InstalledDeviceDetail[] | undefined,
) {
  if (details === undefined) return;
  const existing = await db.select().from(s.installedDeviceDetails).where(and(
    eq(s.installedDeviceDetails.propertyId, propertyId),
    eq(s.installedDeviceDetails.installedProductId, installedProductId),
    ne(s.installedDeviceDetails.lifecycleState, "archived"),
  ));
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const retained = new Set(details.flatMap((detail) => detail.id ? [detail.id] : []));
  const removedIds = existing.filter((row) => !retained.has(row.id)).map((row) => row.id);
  if (removedIds.length) {
    await db.update(s.installedDeviceDetails).set({
      lifecycleState: "archived",
      revision: sql`${s.installedDeviceDetails.revision} + 1`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(and(eq(s.installedDeviceDetails.propertyId, propertyId), inArray(s.installedDeviceDetails.id, removedIds)));
  }
  for (const detail of details) {
    const values = deviceDetailValues(propertyId, installedProductId, detail);
    if (detail.id && existingById.has(detail.id)) {
      await db.update(s.installedDeviceDetails).set({
        kind: values.kind,
        label: values.label,
        value: values.value,
        normalizedValue: values.normalizedValue,
        sensitivity: values.sensitivity,
        notes: values.notes,
        verificationState: values.verificationState,
        verifiedAt: values.verifiedAt,
        revision: sql`${s.installedDeviceDetails.revision} + 1`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }).where(and(
        eq(s.installedDeviceDetails.propertyId, propertyId),
        eq(s.installedDeviceDetails.installedProductId, installedProductId),
        eq(s.installedDeviceDetails.id, detail.id),
      ));
    } else {
      await db.insert(s.installedDeviceDetails).values({
        ...values,
        id: detail.id && existingById.has(detail.id) ? detail.id : crypto.randomUUID(),
      });
    }
  }
}

async function upsertInstalledProduct(
  db: ReturnType<typeof getDb>,
  propertyId: string,
  assetId: string,
  product: AssetInstalledProductDraft,
  fallbackSmartState: AssetDraft["smartState"],
  extraCapabilities: Record<string, unknown> = {},
) {
  const active = await db.query.installedProducts.findFirst({ where: and(
    eq(s.installedProducts.propertyId, propertyId),
    eq(s.installedProducts.assetId, assetId),
    ne(s.installedProducts.lifecycleState, "archived"),
  ) });
  const capabilitiesJson = JSON.stringify({
    ...extraCapabilities,
    protocol: product.protocol,
    ecosystem: product.ecosystem,
    hub: product.hub,
  });
  const values = {
    manufacturer: product.manufacturer,
    model: product.model,
    serialNumber: product.serialNumber,
    hardwareRevision: product.hardwareRevision,
    firmwareVersion: product.firmware,
    smartState: (product.smartState ?? (fallbackSmartState === "mixed" ? "unknown" : fallbackSmartState) ?? "unknown").replaceAll("-", "_") as (typeof s.smartStates)[number],
    installedAt: product.installationDate,
    capabilitiesJson,
  };
  const installedProductId = active?.id ?? crypto.randomUUID();
  if (active) {
    await db.update(s.installedProducts).set({
      ...values,
      revision: sql`${s.installedProducts.revision} + 1`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(and(eq(s.installedProducts.propertyId, propertyId), eq(s.installedProducts.id, installedProductId)));
  } else {
    await db.insert(s.installedProducts).values({ id: installedProductId, propertyId, assetId, ...values });
  }
  await syncInstalledDeviceDetails(db, propertyId, installedProductId, product.deviceDetails);
  return installedProductId;
}

export async function createAssetAggregate(identity: RequestIdentity, propertyId: string, input: AssetDraft) {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const assetId = crypto.randomUUID();
  const permanentCode = await nextPropertyCode(identity, propertyId, prefixByKind[input.kind]);
  const dbKind = input.kind === "switch" || input.kind === "receptacle" ? "device" : input.kind === "light-source" ? "light_source" : input.kind === "junction" ? "junction_point" : input.kind === "other" ? "custom" : input.kind;
  const smartState = (input.smartState === "mixed" ? "unknown" : input.smartState ?? "unknown").replaceAll("-", "_") as (typeof s.smartStates)[number];
  const notes = encodeAssetNotes({
    text: input.notes ?? null,
    tags: input.tags ?? [],
    verification: input.verification ?? "unknown",
    operationalStatus: input.operationalStatus ?? "unknown",
  });
  const statements: AtomicStatement[] = [
    db.insert(s.assets).values({ id: assetId, propertyId, permanentCode, kind: dbKind as (typeof s.assetKinds)[number], displayName: input.displayName, notes }),
  ];
  if (input.kind === "switch" || input.kind === "receptacle") statements.push(db.insert(s.devices).values({ assetId, propertyId, deviceKind: input.kind === "receptacle" ? (input.subtype === "gfci" ? "gfci_receptacle" : "receptacle") : "switch", smartState, configurationLabel: input.switchConfiguration ?? input.receptacleConfiguration ?? input.subtype }));
  if (input.kind === "fixture") statements.push(db.insert(s.fixtures).values({ assetId, propertyId, fixtureKind: ["light", "fan", "fan_light", "integrated_led", "other", "custom"].includes(input.subtype ?? "") ? input.subtype as (typeof s.fixtureKinds)[number] : "other", smartState }));
  if (input.kind === "appliance") statements.push(db.insert(s.appliances).values({ assetId, propertyId, connectionKind: "unknown", smartState }));
  if (input.kind === "box" || input.kind === "junction") statements.push(db.insert(s.boxes).values({ assetId, propertyId, boxKind: input.kind === "junction" ? "junction" : "device" }));
  if (input.kind === "cable") statements.push(db.insert(s.cables).values({ assetId, propertyId, insulatedConductorCount: null, equipmentGroundCount: null }));
  if (input.kind === "panel") statements.push(db.insert(s.panels).values({ assetId, propertyId }));
  if (input.kind === "light-source") throw new InvalidRequestError("A light source must be created through its parent fixture so its lamp holder is preserved.");
  if (input.locationId || input.locatorLabel) statements.push(db.insert(s.assetLocations).values({ id: crypto.randomUUID(), propertyId, assetId, spaceId: input.locationId, locatorLabel: input.locatorLabel }));
  if (input.boxId && input.gangPosition) {
    const gang = Number(input.gangPosition);
    if (!Number.isSafeInteger(gang) || gang < 1) throw new InvalidRequestError("Gang position must be a positive integer.");
    const mountId = crypto.randomUUID();
    statements.push(db.insert(s.assetMounts).values({ id: mountId, propertyId, boxAssetId: input.boxId, mountedAssetId: assetId, startGangIndex: gang }), db.insert(s.assetMountPositions).values({ propertyId, mountId, boxAssetId: input.boxId, gangIndex: gang }));
  }
  if (input.installedProduct) {
    const installedProductId = crypto.randomUUID();
    statements.push(db.insert(s.installedProducts).values({
      id: installedProductId,
      propertyId,
      assetId,
      manufacturer: input.installedProduct.manufacturer,
      model: input.installedProduct.model,
      serialNumber: input.installedProduct.serialNumber,
      hardwareRevision: input.installedProduct.hardwareRevision,
      firmwareVersion: input.installedProduct.firmware,
      smartState: (input.installedProduct.smartState ?? (input.smartState === "mixed" ? "unknown" : input.smartState) ?? "unknown").replaceAll("-", "_") as (typeof s.smartStates)[number],
      installedAt: input.installedProduct.installationDate,
      capabilitiesJson: JSON.stringify({ protocol: input.installedProduct.protocol, ecosystem: input.installedProduct.ecosystem, hub: input.installedProduct.hub }),
    }));
    if (input.installedProduct.deviceDetails?.length) {
      statements.push(db.insert(s.installedDeviceDetails).values(
        input.installedProduct.deviceDetails.map((detail) => deviceDetailValues(propertyId, installedProductId, detail)),
      ));
    }
  }
  if (input.kind === "fixture") {
    for (const [index, source] of (input.lightSources ?? []).entries()) {
      const holderId = crypto.randomUUID();
      const sourceAssetId = crypto.randomUUID();
      const sourceCode = `${permanentCode}/L${index + 1}`;
      statements.push(
        db.insert(s.lampHolders).values({ id: holderId, propertyId, fixtureAssetId: assetId, positionKey: source.holderLabel || `L${index + 1}`, baseType: source.baseType, lampShape: source.shape }),
        db.insert(s.assets).values({ id: sourceAssetId, propertyId, permanentCode: sourceCode, kind: "light_source", displayName: source.holderLabel || `${input.displayName} light ${index + 1}` }),
        db.insert(s.lightSources).values({ assetId: sourceAssetId, propertyId, fixtureAssetId: assetId, lampHolderId: holderId, technology: source.technology, bulbType: source.shape, baseType: source.baseType, watts: source.wattage, equivalentWatts: source.equivalentWattage, lumens: source.lumens, colorTemperatureKelvin: source.colorTemperatureKelvin, colorTemperatureMinKelvin: source.colorTemperatureMinKelvin, colorTemperatureMaxKelvin: source.colorTemperatureMaxKelvin, colorCapability: (source.colorCapability ? source.colorCapability.replaceAll("-", "_") : source.colorCapability) as (typeof s.lightColorCapabilities)[number] | null | undefined, dimmable: source.dimmable, smartState: source.smartState.replaceAll("-", "_") as (typeof s.smartStates)[number], integrated: source.sourceType === "integrated" }),
      );
      if (source.manufacturer || source.model || source.serialNumber || source.hardwareRevision || source.firmware || source.protocol || source.ecosystem || source.hub || source.deviceDetails?.length) {
        const sourceProductId = crypto.randomUUID();
        statements.push(db.insert(s.installedProducts).values({
          id: sourceProductId,
          propertyId,
          assetId: sourceAssetId,
          manufacturer: source.manufacturer,
          model: source.model,
          serialNumber: source.serialNumber,
          hardwareRevision: source.hardwareRevision,
          firmwareVersion: source.firmware,
          smartState: source.smartState.replaceAll("-", "_") as (typeof s.smartStates)[number],
          capabilitiesJson: JSON.stringify({ protocol: source.protocol, ecosystem: source.ecosystem, hub: source.hub }),
        }));
        if (source.deviceDetails?.length) {
          statements.push(db.insert(s.installedDeviceDetails).values(
            source.deviceDetails.map((detail) => deviceDetailValues(propertyId, sourceProductId, detail)),
          ));
        }
      }
    }
  }
  for (const circuitId of input.assertedCircuitIds ?? []) statements.push(db.insert(s.assetCircuitAssertions).values({ id: crypto.randomUUID(), propertyId, assetId, circuitId, status: "active", certainty: "assumed" }));
  runStatementsAtomically(statements);
  await bumpPropertyRevision(propertyId, true);
  return { assetId, permanentCode };
}

export async function updateAssetAggregate(
  identity: RequestIdentity,
  propertyId: string,
  assetId: string,
  revision: number,
  input: Partial<Omit<AssetDraft, "kind">> & { lifecycleState?: "active" | "archived" },
) {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const existing = await db.query.assets.findFirst({ where: and(eq(s.assets.propertyId, propertyId), eq(s.assets.id, assetId), ne(s.assets.lifecycleState, "archived")) });
  if (!existing) throw new InvalidRequestError("Asset not found in this property.");
  const prior = decodeAssetNotes(existing.notes);
  const assetPatch: Record<string, unknown> = {
    revision: sql`${s.assets.revision} + 1`,
    updatedAt: sql`CURRENT_TIMESTAMP`,
    notes: encodeAssetNotes({
      text: input.notes !== undefined ? input.notes : prior.text,
      tags: input.tags ?? prior.tags,
      verification: input.verification ?? prior.verification,
      operationalStatus: input.operationalStatus ?? prior.operationalStatus,
    }),
  };
  if (input.displayName !== undefined) assetPatch.displayName = input.displayName;
  if (input.lifecycleState !== undefined) assetPatch.lifecycleState = input.lifecycleState;
  const changed = await db.update(s.assets).set(assetPatch).where(and(eq(s.assets.propertyId, propertyId), eq(s.assets.id, assetId), eq(s.assets.revision, revision))).returning({ id: s.assets.id });
  if (!changed[0]) throw new ConflictError("This asset changed after it was loaded.");

  const device = await db.query.devices.findFirst({ where: and(eq(s.devices.propertyId, propertyId), eq(s.devices.assetId, assetId)) });
  if (device && (input.smartState !== undefined || input.subtype !== undefined || input.switchConfiguration !== undefined || input.receptacleConfiguration !== undefined)) {
    await db.update(s.devices).set({
      ...(input.smartState !== undefined ? { smartState: (input.smartState === "mixed" ? "unknown" : input.smartState).replaceAll("-", "_") as (typeof s.smartStates)[number] } : {}),
      ...(input.subtype !== undefined || input.switchConfiguration !== undefined || input.receptacleConfiguration !== undefined ? { configurationLabel: input.switchConfiguration ?? input.receptacleConfiguration ?? input.subtype } : {}),
    }).where(and(eq(s.devices.propertyId, propertyId), eq(s.devices.assetId, assetId)));
  }
  const persistedSmartState = input.smartState === undefined ? undefined : (input.smartState === "mixed" ? "unknown" : input.smartState).replaceAll("-", "_") as (typeof s.smartStates)[number];
  if (persistedSmartState !== undefined) {
    await db.update(s.fixtures).set({ smartState: persistedSmartState }).where(and(eq(s.fixtures.propertyId, propertyId), eq(s.fixtures.assetId, assetId)));
    await db.update(s.appliances).set({ smartState: persistedSmartState }).where(and(eq(s.appliances.propertyId, propertyId), eq(s.appliances.assetId, assetId)));
    await db.update(s.lightSources).set({ smartState: persistedSmartState }).where(and(eq(s.lightSources.propertyId, propertyId), eq(s.lightSources.assetId, assetId)));
  }
  if (input.locationId !== undefined || input.locatorLabel !== undefined) {
    const location = await db.query.assetLocations.findFirst({ where: and(eq(s.assetLocations.propertyId, propertyId), eq(s.assetLocations.assetId, assetId)) });
    if (location) await db.update(s.assetLocations).set({ ...(input.locationId !== undefined ? { spaceId: input.locationId } : {}), ...(input.locatorLabel !== undefined ? { locatorLabel: input.locatorLabel } : {}), revision: sql`${s.assetLocations.revision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(and(eq(s.assetLocations.propertyId, propertyId), eq(s.assetLocations.assetId, assetId)));
    else await db.insert(s.assetLocations).values({ id: crypto.randomUUID(), propertyId, assetId, spaceId: input.locationId, locatorLabel: input.locatorLabel });
  }
  if (input.boxId !== undefined || input.gangPosition !== undefined) {
    const oldMount = await db.query.assetMounts.findFirst({ where: and(eq(s.assetMounts.propertyId, propertyId), eq(s.assetMounts.mountedAssetId, assetId)) });
    if (oldMount) {
      await db.delete(s.assetMountPositions).where(and(eq(s.assetMountPositions.propertyId, propertyId), eq(s.assetMountPositions.mountId, oldMount.id)));
      await db.delete(s.assetMounts).where(and(eq(s.assetMounts.propertyId, propertyId), eq(s.assetMounts.id, oldMount.id)));
    }
    if (input.boxId && input.gangPosition != null) {
      const gang = Number(input.gangPosition);
      if (!Number.isSafeInteger(gang) || gang < 1) throw new InvalidRequestError("Gang position must be a positive integer.");
      const mountId = crypto.randomUUID();
      runStatementsAtomically([
        db.insert(s.assetMounts).values({ id: mountId, propertyId, boxAssetId: input.boxId, mountedAssetId: assetId, startGangIndex: gang }),
        db.insert(s.assetMountPositions).values({ propertyId, mountId, boxAssetId: input.boxId, gangIndex: gang }),
      ]);
    }
  }
  if (input.installedProduct !== undefined) {
    if (input.installedProduct) {
      await upsertInstalledProduct(db, propertyId, assetId, input.installedProduct, input.smartState);
    } else {
      await db.update(s.installedProducts).set({ lifecycleState: "archived", removedAt: sql`CURRENT_TIMESTAMP`, revision: sql`${s.installedProducts.revision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(and(eq(s.installedProducts.propertyId, propertyId), eq(s.installedProducts.assetId, assetId), ne(s.installedProducts.lifecycleState, "archived")));
    }
  }
  if (input.assertedCircuitIds !== undefined) {
    await db.update(s.assetCircuitAssertions).set({ status: "superseded", revision: sql`${s.assetCircuitAssertions.revision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(and(eq(s.assetCircuitAssertions.propertyId, propertyId), eq(s.assetCircuitAssertions.assetId, assetId), eq(s.assetCircuitAssertions.status, "active")));
    if (input.assertedCircuitIds.length) await db.insert(s.assetCircuitAssertions).values(input.assertedCircuitIds.map((circuitId) => ({ id: crypto.randomUUID(), propertyId, assetId, circuitId, status: "active" as const, certainty: "assumed" as const })));
  }
  if (input.lightSources !== undefined) {
    const fixture = await db.query.fixtures.findFirst({ where: and(eq(s.fixtures.propertyId, propertyId), eq(s.fixtures.assetId, assetId)) });
    if (!fixture) throw new InvalidRequestError("Light sources can only be edited on a fixture.");
    const current = await db.select().from(s.lightSources).where(and(eq(s.lightSources.propertyId, propertyId), eq(s.lightSources.fixtureAssetId, assetId)));
    const requestedIds = new Set(input.lightSources.flatMap((source) => source.id ? [source.id] : []));
    const removedIds = current.map((source) => source.assetId).filter((id) => !requestedIds.has(id));
    if (removedIds.length) await db.update(s.assets).set({ lifecycleState: "archived", revision: sql`${s.assets.revision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(and(eq(s.assets.propertyId, propertyId), inArray(s.assets.id, removedIds)));
    for (const [index, source] of input.lightSources.entries()) {
      const sourceAssetId = source.id ?? crypto.randomUUID();
      const existingSource = current.find((row) => row.assetId === sourceAssetId);
      let holderId = existingSource?.lampHolderId ?? null;
      if (!holderId) {
        holderId = crypto.randomUUID();
        await db.insert(s.lampHolders).values({ id: holderId, propertyId, fixtureAssetId: assetId, positionKey: source.holderLabel || `L${index + 1}`, baseType: source.baseType, lampShape: source.shape });
      } else {
        await db.update(s.lampHolders).set({ positionKey: source.holderLabel, baseType: source.baseType, lampShape: source.shape }).where(and(eq(s.lampHolders.propertyId, propertyId), eq(s.lampHolders.id, holderId)));
      }
      if (!existingSource) {
        runStatementsAtomically([
          db.insert(s.assets).values({ id: sourceAssetId, propertyId, permanentCode: `${existing.permanentCode}/L${index + 1}`, kind: "light_source", displayName: source.holderLabel || `${existing.displayName} light ${index + 1}` }),
          db.insert(s.lightSources).values({ assetId: sourceAssetId, propertyId, fixtureAssetId: assetId, lampHolderId: holderId, technology: source.technology, bulbType: source.shape, baseType: source.baseType, watts: source.wattage, equivalentWatts: source.equivalentWattage, lumens: source.lumens, colorTemperatureKelvin: source.colorTemperatureKelvin, colorTemperatureMinKelvin: source.colorTemperatureMinKelvin, colorTemperatureMaxKelvin: source.colorTemperatureMaxKelvin, colorCapability: (source.colorCapability ? source.colorCapability.replaceAll("-", "_") : source.colorCapability) as (typeof s.lightColorCapabilities)[number] | null | undefined, dimmable: source.dimmable, smartState: source.smartState.replaceAll("-", "_") as (typeof s.smartStates)[number], integrated: source.sourceType === "integrated" }),
        ]);
      } else {
        await db.update(s.lightSources).set({ lampHolderId: holderId, technology: source.technology, bulbType: source.shape, baseType: source.baseType, watts: source.wattage, equivalentWatts: source.equivalentWattage, lumens: source.lumens, colorTemperatureKelvin: source.colorTemperatureKelvin, colorTemperatureMinKelvin: source.colorTemperatureMinKelvin, colorTemperatureMaxKelvin: source.colorTemperatureMaxKelvin, colorCapability: (source.colorCapability ? source.colorCapability.replaceAll("-", "_") : source.colorCapability) as (typeof s.lightColorCapabilities)[number] | null | undefined, dimmable: source.dimmable, smartState: source.smartState.replaceAll("-", "_") as (typeof s.smartStates)[number], integrated: source.sourceType === "integrated" }).where(and(eq(s.lightSources.propertyId, propertyId), eq(s.lightSources.assetId, sourceAssetId)));
      }
      if (source.manufacturer || source.model || source.serialNumber || source.hardwareRevision || source.firmware || source.protocol || source.ecosystem || source.hub || source.deviceDetails !== undefined) {
        await upsertInstalledProduct(
          db,
          propertyId,
          sourceAssetId,
          {
            manufacturer: source.manufacturer,
            model: source.model,
            serialNumber: source.serialNumber,
            hardwareRevision: source.hardwareRevision,
            firmware: source.firmware,
            protocol: source.protocol,
            ecosystem: source.ecosystem,
            hub: source.hub,
            deviceDetails: source.deviceDetails,
          },
          source.smartState,
        );
      }
    }
  }
  await bumpPropertyRevision(propertyId, true);
  return { id: assetId, revision: revision + 1 };
}

export async function createCircuit(identity: RequestIdentity, propertyId: string, input: { name: string; nominalVoltage?: number | null; purpose?: string | null; notes?: string | null }) {
  const db = getDb();
  const id = crypto.randomUUID();
  const permanentCode = await nextPropertyCode(identity, propertyId, "CKT");
  await db.insert(s.circuits).values({ id, propertyId, permanentCode, ...input });
  await bumpPropertyRevision(propertyId, true);
  return { id, permanentCode };
}
