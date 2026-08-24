import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as dbs from "@/db/schema";
import type { RequestIdentity } from "@/lib/auth/identity";
import type {
  BreakerPanelModel,
  BreakerSummary,
  ConnectedAsset,
} from "@/features/circuits";
import type {
  InventoryAsset,
  InventoryAssetKind,
  LightSourceDetails,
  LocationOption,
  SmartState,
} from "@/features/inventory";
import type { BoxPhysicalLayoutModel } from "@/features/boxes";
import type { FloorPlanPlacement } from "@/features/map";
import type { UpgradePlanItem } from "@/features/upgrades";
import { requireOwnedProperty } from "./workspaces";
import {
  breakerConnectedLookup,
  loadElectricalTopology,
  topologyEntityCircuitLookup,
} from "./topology";
import { NotFoundError } from "@/lib/http/responses";
import { decodeAssetNotes } from "./aggregates";
import { resolveWiringConfiguration } from "./wiring-configurations";

function verification(value: string | null | undefined) {
  if (value === "visually_observed") return "observed" as const;
  if (value === "test_verified") return "test-verified" as const;
  if (value === "documentation_verified") return "documentation-verified" as const;
  return (value ?? "unknown").replaceAll("_", "-") as InventoryAsset["verification"];
}

function smart(value: string | null | undefined): SmartState {
  return (value ?? "unknown").replaceAll("_", "-") as SmartState;
}

function assetKind(
  asset: { kind: string },
  device?: { deviceKind: string } | null,
): InventoryAssetKind {
  if (asset.kind === "device") {
    return device?.deviceKind === "receptacle" || device?.deviceKind === "gfci_receptacle"
      ? "receptacle"
      : "switch";
  }
  if (asset.kind === "light_source") return "light-source";
  if (asset.kind === "junction_point") return "junction";
  if (["panel", "box", "fixture", "appliance", "cable"].includes(asset.kind)) {
    return asset.kind as InventoryAssetKind;
  }
  return "other";
}

export async function locationViewModels(
  identity: RequestIdentity,
  propertyId: string,
) {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const [structures, levels, spaces, wallZones] = await Promise.all([
    db.select().from(dbs.structures).where(and(eq(dbs.structures.propertyId, propertyId), ne(dbs.structures.lifecycleState, "archived"))).orderBy(asc(dbs.structures.sortOrder)),
    db.select().from(dbs.levels).where(and(eq(dbs.levels.propertyId, propertyId), ne(dbs.levels.lifecycleState, "archived"))).orderBy(asc(dbs.levels.elevationOrder)),
    db.select().from(dbs.spaces).where(and(eq(dbs.spaces.propertyId, propertyId), ne(dbs.spaces.lifecycleState, "archived"))).orderBy(asc(dbs.spaces.sortOrder)),
    db.select().from(dbs.wallZones).where(and(eq(dbs.wallZones.propertyId, propertyId), ne(dbs.wallZones.lifecycleState, "archived"))).orderBy(asc(dbs.wallZones.sortOrder)),
  ]);
  const structureById = new Map(structures.map((row) => [row.id, row]));
  const levelById = new Map(levels.map((row) => [row.id, row]));
  const options: LocationOption[] = spaces.map((space) => {
    const level = levelById.get(space.levelId);
    const structure = level ? structureById.get(level.structureId) : undefined;
    return {
      id: space.id,
      label: [structure?.name, level?.name, space.name].filter(Boolean).join(" · "),
    };
  });
  return { structures, levels, spaces, wallZones, options };
}

export async function inventoryViewModels(
  identity: RequestIdentity,
  propertyId: string,
): Promise<{ items: Array<InventoryAsset & { revision: number }>; locations: LocationOption[] }> {
  const wiringConfiguration = await resolveWiringConfiguration(identity, propertyId);
  const db = getDb();
  const [assetRows, deviceRows, fixtureRows, applianceRows, lightRows, holderRows, locationRows, installedRows, assertionRows, sourceRows, poleRows, breakerRows, panelAssets, upgradeRows, mountRows] = await Promise.all([
    db.select().from(dbs.assets).where(and(eq(dbs.assets.propertyId, propertyId), ne(dbs.assets.lifecycleState, "archived"))).orderBy(asc(dbs.assets.displayName)),
    db.select().from(dbs.devices).where(eq(dbs.devices.propertyId, propertyId)),
    db.select().from(dbs.fixtures).where(eq(dbs.fixtures.propertyId, propertyId)),
    db.select().from(dbs.appliances).where(eq(dbs.appliances.propertyId, propertyId)),
    db.select().from(dbs.lightSources).where(eq(dbs.lightSources.propertyId, propertyId)),
    db.select().from(dbs.lampHolders).where(eq(dbs.lampHolders.propertyId, propertyId)),
    db.select().from(dbs.assetLocations).where(eq(dbs.assetLocations.propertyId, propertyId)),
    db.select().from(dbs.installedProducts).where(and(eq(dbs.installedProducts.propertyId, propertyId), ne(dbs.installedProducts.lifecycleState, "archived"))),
    db.select().from(dbs.assetCircuitAssertions).where(and(eq(dbs.assetCircuitAssertions.propertyId, propertyId), eq(dbs.assetCircuitAssertions.wiringConfigurationId, wiringConfiguration.id), eq(dbs.assetCircuitAssertions.status, "active"))),
    db.select().from(dbs.circuitSources).where(eq(dbs.circuitSources.propertyId, propertyId)),
    db.select().from(dbs.breakerPoles).where(eq(dbs.breakerPoles.propertyId, propertyId)),
    db.select().from(dbs.breakers).where(eq(dbs.breakers.propertyId, propertyId)),
    db.select().from(dbs.assets).where(and(eq(dbs.assets.propertyId, propertyId), eq(dbs.assets.kind, "panel"))),
    db.select().from(dbs.upgradeItems).where(eq(dbs.upgradeItems.propertyId, propertyId)),
    db.select().from(dbs.assetMounts).where(and(eq(dbs.assetMounts.propertyId, propertyId), eq(dbs.assetMounts.wiringConfigurationId, wiringConfiguration.id))),
  ]);
  const locations = await locationViewModels(identity, propertyId);
  const locationLabelById = new Map(locations.options.map((row) => [row.id, row.label]));
  const devices = new Map(deviceRows.map((row) => [row.assetId, row]));
  const fixtures = new Map(fixtureRows.map((row) => [row.assetId, row]));
  const appliances = new Map(applianceRows.map((row) => [row.assetId, row]));
  const lights = new Map(lightRows.map((row) => [row.assetId, row]));
  const holderById = new Map(holderRows.map((row) => [row.id, row]));
  const assetById = new Map(assetRows.map((row) => [row.id, row]));
  const locationsByAsset = new Map(locationRows.map((row) => [row.assetId, row]));
  const installedByAsset = new Map(installedRows.map((row) => [row.assetId, row]));
  const poleById = new Map(poleRows.map((row) => [row.id, row]));
  const breakerById = new Map(breakerRows.map((row) => [row.id, row]));
  const panelById = new Map(panelAssets.map((row) => [row.id, row]));
  const upgradeByAsset = new Map(upgradeRows.map((row) => [row.targetAssetId, row]));
  const mountByAsset = new Map(mountRows.map((row) => [row.mountedAssetId, row]));
  const sourcesByCircuit = new Map<string, typeof sourceRows>();
  sourceRows.forEach((row) => sourcesByCircuit.set(row.circuitId, [...(sourcesByCircuit.get(row.circuitId) ?? []), row]));
  const assertionsByAsset = new Map<string, typeof assertionRows>();
  assertionRows.forEach((row) => assertionsByAsset.set(row.assetId, [...(assertionsByAsset.get(row.assetId) ?? []), row]));
  const items = assetRows.map((asset): InventoryAsset & { revision: number } => {
    const storedNotes = decodeAssetNotes(asset.notes);
    const device = devices.get(asset.id);
    const fixture = fixtures.get(asset.id);
    const appliance = appliances.get(asset.id);
    const light = lights.get(asset.id);
    const location = locationsByAsset.get(asset.id);
    const mount = mountByAsset.get(asset.id);
    const installed = installedByAsset.get(asset.id);
    const fixtureLightRows = asset.kind === "fixture"
      ? lightRows.filter((row) => row.fixtureAssetId === asset.id)
      : [];
    let installedCapabilities: Record<string, unknown> = {};
    try {
      installedCapabilities = installed ? JSON.parse(installed.capabilitiesJson) as Record<string, unknown> : {};
    } catch {
      installedCapabilities = {};
    }
    const subtype = device?.deviceKind ?? fixture?.fixtureKind ?? appliance?.connectionKind ?? light?.technology ?? null;
    const lightSmartStates = new Set(fixtureLightRows.map((row) => row.smartState));
    const derivedFixtureSmartState = lightSmartStates.has("smart") && lightSmartStates.has("dumb")
      ? "mixed"
      : undefined;
    const smartState = derivedFixtureSmartState ?? device?.smartState ?? fixture?.smartState ?? appliance?.smartState ?? light?.smartState ?? installed?.smartState ?? "not_applicable";
    const breakerReferences = (assertionsByAsset.get(asset.id) ?? []).flatMap((assertion) =>
      (sourcesByCircuit.get(assertion.circuitId) ?? []).flatMap((source) => {
        const pole = poleById.get(source.breakerPoleId);
        const breaker = pole ? breakerById.get(pole.breakerId) : undefined;
        const panel = breaker ? panelById.get(breaker.panelAssetId) : undefined;
        return breaker ? [{ id: breaker.id, permanentCode: breaker.permanentCode, label: breaker.label, panelName: panel?.displayName, relationship: "asserted" as const }] : [];
      }),
    );
    return {
      id: asset.id,
      revision: asset.revision,
      permanentCode: asset.permanentCode,
      displayName: asset.displayName,
      kind: assetKind(asset, device),
      subtype,
      locationId: location?.spaceId,
      locatorLabel: location?.locatorLabel,
      locationLabel: location?.spaceId ? locationLabelById.get(location.spaceId) : undefined,
      boxId: mount?.boxAssetId,
      boxLabel: mount ? assetById.get(mount.boxAssetId)?.displayName : undefined,
      gangPosition: mount
        ? mount.gangSpan > 1
          ? `G${mount.startGangIndex}–G${mount.startGangIndex + mount.gangSpan - 1}`
          : `G${mount.startGangIndex}`
        : undefined,
      verification: storedNotes.verification !== "unknown" ? verification(storedNotes.verification) : verification(location?.certainty),
      smartState: smart(smartState),
      operationalStatus: storedNotes.operationalStatus.replaceAll("_", "-") as InventoryAsset["operationalStatus"],
      lifecycleState: asset.lifecycleState === "archived" ? "archived" : "active",
      breakerReferences,
      assertedCircuitIds: (assertionsByAsset.get(asset.id) ?? []).map((assertion) => assertion.circuitId),
      switchConfiguration: device?.deviceKind === "switch"
        ? (device.configurationLabel?.replaceAll("_", "-") as InventoryAsset["switchConfiguration"])
        : undefined,
      receptacleConfiguration: device?.deviceKind === "receptacle" || device?.deviceKind === "gfci_receptacle"
        ? (device.configurationLabel?.replaceAll("_", "-") as InventoryAsset["receptacleConfiguration"])
        : undefined,
      installedProduct: installed ? {
        manufacturer: installed.manufacturer,
        model: installed.model,
        serialNumber: installed.serialNumber,
        hardwareRevision: installed.hardwareRevision,
        installationDate: installed.installedAt,
        protocol: typeof installedCapabilities.protocol === "string" ? installedCapabilities.protocol : null,
        ecosystem: typeof installedCapabilities.ecosystem === "string" ? installedCapabilities.ecosystem : null,
        hub: typeof installedCapabilities.hub === "string" ? installedCapabilities.hub : null,
        firmware: installed.firmwareVersion,
      } : null,
      lightSources: asset.kind === "fixture" ? fixtureLightRows.map((row) => {
        const holder = row.lampHolderId ? holderById.get(row.lampHolderId) : undefined;
        const sourceAsset = assetById.get(row.assetId);
        const sourceProduct = installedByAsset.get(row.assetId);
        let sourceCapabilities: Record<string, unknown> = {};
        try { sourceCapabilities = sourceProduct ? JSON.parse(sourceProduct.capabilitiesJson) as Record<string, unknown> : {}; } catch { sourceCapabilities = {}; }
        return {
          id: row.assetId,
          holderLabel: holder?.positionKey ?? sourceAsset?.displayName ?? row.assetId,
          sourceType: row.integrated ? "integrated" : "replaceable",
          smartState: smart(row.smartState),
          baseType: row.baseType,
          shape: row.bulbType,
          technology: row.technology,
          wattage: row.watts,
          equivalentWattage: row.equivalentWatts,
          lumens: row.lumens,
          colorTemperatureKelvin: row.colorTemperatureKelvin,
          colorTemperatureMinKelvin: row.colorTemperatureMinKelvin,
          colorTemperatureMaxKelvin: row.colorTemperatureMaxKelvin,
          colorCapability: row.colorCapability
            ? row.colorCapability.replaceAll("_", "-") as NonNullable<LightSourceDetails["colorCapability"]>
            : null,
          dimmable: row.dimmable ?? (typeof sourceCapabilities.dimmable === "boolean" ? sourceCapabilities.dimmable : null),
          manufacturer: sourceProduct?.manufacturer,
          model: sourceProduct?.model,
          serialNumber: sourceProduct?.serialNumber,
          hardwareRevision: sourceProduct?.hardwareRevision,
          firmware: sourceProduct?.firmwareVersion,
          protocol: typeof sourceCapabilities.protocol === "string" ? sourceCapabilities.protocol : null,
          ecosystem: typeof sourceCapabilities.ecosystem === "string" ? sourceCapabilities.ecosystem : null,
          hub: typeof sourceCapabilities.hub === "string" ? sourceCapabilities.hub : null,
        };
      }) : undefined,
      notes: storedNotes.text,
      tags: storedNotes.tags,
      upgradeStatus: upgradeByAsset.get(asset.id)?.status ?? null,
    };
  });
  return { items, locations: locations.options };
}

function protection(row: typeof dbs.breakers.$inferSelect): BreakerSummary["protection"] {
  if (row.hasAfci && row.hasGfci) return "dual-function";
  if (row.hasAfci) return "afci";
  if (row.hasGfci) return "gfci";
  return row.kind === "standard" ? "standard" : "unknown";
}

function connectedKind(value: InventoryAssetKind): ConnectedAsset["kind"] {
  return value === "light-source" ? "light-source" : value === "junction" || value === "other" ? "other" : value;
}

export async function circuitWorkspaceViewModel(
  identity: RequestIdentity,
  propertyId: string,
): Promise<{ panels: BreakerPanelModel[]; breakers: BreakerSummary[]; connectedAssetsByBreaker: Record<string, ConnectedAsset[]> }> {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const [panelAssetRows, panelRows, positionRows, breakerRows, poleRows, circuitRows, sourceRows] = await Promise.all([
    db.select().from(dbs.assets).where(and(eq(dbs.assets.propertyId, propertyId), eq(dbs.assets.kind, "panel"), ne(dbs.assets.lifecycleState, "archived"))),
    db.select().from(dbs.panels).where(eq(dbs.panels.propertyId, propertyId)),
    db.select().from(dbs.panelPositions).where(eq(dbs.panelPositions.propertyId, propertyId)),
    db.select().from(dbs.breakers).where(and(eq(dbs.breakers.propertyId, propertyId), ne(dbs.breakers.lifecycleState, "archived"))),
    db.select().from(dbs.breakerPoles).where(eq(dbs.breakerPoles.propertyId, propertyId)),
    db.select().from(dbs.circuits).where(and(eq(dbs.circuits.propertyId, propertyId), ne(dbs.circuits.lifecycleState, "archived"))),
    db.select().from(dbs.circuitSources).where(eq(dbs.circuitSources.propertyId, propertyId)),
  ]);
  const panelAssetById = new Map(panelAssetRows.map((row) => [row.id, row]));
  const poleByPosition = new Map(poleRows.map((row) => [row.panelPositionId, row]));
  const sourceByPole = new Map<string, typeof sourceRows>();
  sourceRows.forEach((row) => sourceByPole.set(row.breakerPoleId, [...(sourceByPole.get(row.breakerPoleId) ?? []), row]));
  const circuitById = new Map(circuitRows.map((row) => [row.id, row]));
  const inventory = await inventoryViewModels(identity, propertyId);
  const inventoryById = new Map(inventory.items.map((row) => [row.id, row]));
  const panels: BreakerPanelModel[] = panelRows.map((panel) => {
    const asset = panelAssetById.get(panel.assetId);
    const positions = positionRows.filter((row) => row.panelAssetId === panel.assetId);
    return {
      id: panel.assetId,
      permanentCode: asset?.permanentCode ?? panel.assetId,
      name: asset?.displayName ?? "Panel",
      role: panel.role === "main" ? "main" : panel.role === "subpanel" ? "subpanel" : "other",
      columns: [...new Set(positions.map((row) => row.columnLabel ?? row.side))],
      positions: positions.map((row) => {
        const pole = poleByPosition.get(row.id);
        return { id: row.id, label: row.label ?? String(row.slotNumber), row: row.slotNumber, column: row.columnLabel ?? row.side, subposition: row.tandemSubposition, breakerId: pole?.breakerId, poleIndex: pole?.poleIndex };
      }),
      voltageDescription: panel.nominalVoltage ? `${panel.nominalVoltage} V` : null,
    };
  });
  const connectedAssetsByBreaker: Record<string, ConnectedAsset[]> = {};
  const breakerSummaries: BreakerSummary[] = [];
  for (const breaker of breakerRows) {
    const poles = poleRows.filter((row) => row.breakerId === breaker.id);
    const circuitsForBreaker = [...new Set(poles.flatMap((pole) => (sourceByPole.get(pole.id) ?? []).map((source) => source.circuitId)))].flatMap((id) => {
      const circuit = circuitById.get(id);
      return circuit ? [{ id: circuit.id, permanentCode: circuit.permanentCode, name: circuit.name, nominalVoltage: circuit.nominalVoltage, purpose: circuit.purpose }] : [];
    });
    const lookup = await breakerConnectedLookup(identity, propertyId, breaker.id);
    const tracedIds = new Set(lookup.traces.flatMap((trace) => trace.reached.assetIds));
    const assertedIds = new Set(inventory.items.filter((item) => item.breakerReferences.some((ref) => ref.id === breaker.id)).map((item) => item.id));
    connectedAssetsByBreaker[breaker.id] = lookup.connectedAssets.map((asset) => {
      const item = inventoryById.get(asset.id);
      const traced = tracedIds.has(asset.id);
      const asserted = assertedIds.has(asset.id);
      const traceHasGap = lookup.traces.some((trace) => trace.reached.assetIds.includes(asset.id) && trace.gaps.length > 0);
      const controlled = lookup.controlAssetIds.includes(asset.id) && !traced && !asserted;
      return { id: asset.id, permanentCode: asset.permanentCode, name: asset.displayName, kind: connectedKind(item?.kind ?? "other"), locationLabel: item?.locationLabel, relationship: controlled ? "controller" : traced ? "directly-supplied" : "manually-associated", source: traced && asserted ? "both" : traced || controlled ? "graph" : "assertion", verification: item?.verification ?? "unknown", traceHasGap, traceSummary: controlled ? "Related through a documented control group." : traced ? "Reached through recorded conductor topology." : "Manually associated with this circuit." };
    });
    breakerSummaries.push({
      id: breaker.id,
      permanentCode: breaker.permanentCode,
      label: breaker.label,
      panelId: breaker.panelAssetId,
      panelName: panelAssetById.get(breaker.panelAssetId)?.displayName ?? "Panel",
      positionLabels: poles.flatMap((pole) => {
        const position = positionRows.find((row) => row.id === pole.panelPositionId);
        return position ? [position.label ?? String(position.slotNumber)] : [];
      }),
      amperage: breaker.ratingAmps,
      poles: breaker.poleCount,
      protection: protection(breaker),
      verification: "unknown",
      circuits: circuitsForBreaker,
      notes: breaker.notes,
      connectedCount: connectedAssetsByBreaker[breaker.id].length,
    });
  }
  return { panels, breakers: breakerSummaries, connectedAssetsByBreaker };
}

export async function boxDetailViewModel(identity: RequestIdentity, propertyId: string, boxId: string, configurationId?: string | null) {
  const wiringConfiguration = await resolveWiringConfiguration(identity, propertyId, configurationId);
  const inventory = await inventoryViewModels(identity, propertyId);
  const item = inventory.items.find((asset) => asset.id === boxId && asset.kind === "box");
  if (!item) throw new NotFoundError("Box not found.");
  const db = getDb();
  const [box, ports, mounts, cableEndRows, cableAssetRows, cableRows, mountedAssets] = await Promise.all([
    db.query.boxes.findFirst({ where: and(eq(dbs.boxes.propertyId, propertyId), eq(dbs.boxes.assetId, boxId)) }),
    db.select().from(dbs.boxPorts).where(and(eq(dbs.boxPorts.propertyId, propertyId), eq(dbs.boxPorts.boxAssetId, boxId))),
    db.select().from(dbs.assetMounts).where(and(eq(dbs.assetMounts.propertyId, propertyId), eq(dbs.assetMounts.wiringConfigurationId, wiringConfiguration.id), eq(dbs.assetMounts.boxAssetId, boxId))),
    db.select().from(dbs.cableEnds).where(and(eq(dbs.cableEnds.propertyId, propertyId), eq(dbs.cableEnds.boxAssetId, boxId))),
    db.select().from(dbs.assets).where(and(eq(dbs.assets.propertyId, propertyId), eq(dbs.assets.kind, "cable"))),
    db.select().from(dbs.cables).where(eq(dbs.cables.propertyId, propertyId)),
    db.select().from(dbs.assets).where(eq(dbs.assets.propertyId, propertyId)),
  ]);
  if (!box) throw new NotFoundError("Box not found.");
  const assetById = new Map(mountedAssets.map((row) => [row.id, row]));
  const cableAssetById = new Map(cableAssetRows.map((row) => [row.id, row]));
  const cableById = new Map(cableRows.map((row) => [row.assetId, row]));
  const layout: BoxPhysicalLayoutModel = {
    id: boxId,
    permanentCode: item.permanentCode,
    label: item.displayName,
    gangCount: box.gangCount,
    orientation: "custom",
    boxType: box.boxKind,
    material: box.material,
    width: box.width && box.dimensionUnit ? `${box.width} ${box.dimensionUnit}` : undefined,
    height: box.height && box.dimensionUnit ? `${box.height} ${box.dimensionUnit}` : undefined,
    depth: box.depth && box.dimensionUnit ? `${box.depth} ${box.dimensionUnit}` : undefined,
    mounts: mounts.map((mount) => {
      const asset = assetById.get(mount.mountedAssetId);
      return { id: mount.id, assetId: mount.mountedAssetId, permanentCode: asset?.permanentCode ?? mount.mountedAssetId, label: asset?.displayName ?? "Mounted asset", kind: asset?.kind ?? "custom", gangStart: mount.startGangIndex, gangSpan: mount.gangSpan, verticalPosition: mount.verticalPosition, rotationDegrees: mount.rotationDegrees, detail: mount.faceLabel ?? undefined };
    }),
    cableEntries: ports.map((port) => ({
      id: port.id,
      side: port.side,
      offset: port.offsetNormalized,
      knockoutLabel: port.knockoutLabel ?? undefined,
      cables: cableEndRows.filter((end) => end.boxPortId === port.id).map((end) => {
        const asset = cableAssetById.get(end.cableAssetId);
        const cable = cableById.get(end.cableAssetId);
        return { cableId: end.cableAssetId, cableEndId: end.id, permanentCode: asset?.permanentCode ?? end.cableAssetId, label: asset?.displayName, jacketMarking: cable?.jacketMarking ?? undefined };
      }),
      detail: port.notes ?? undefined,
    })),
  };
  const topology = await loadElectricalTopology(identity, propertyId, wiringConfiguration.id);
  const nodeIds = topology.nodes.filter((node) => node.containingBoxId === boxId).map((node) => node.id);
  return {
    item,
    layout,
    topology: {
      nodes: topology.nodes.filter((node) => nodeIds.includes(node.id)),
      conductors: topology.conductors.filter((conductor) => topology.conductorEnds.some((end) => end.conductorId === conductor.id && nodeIds.includes(end.nodeId))),
      conductorEnds: topology.conductorEnds.filter((end) => nodeIds.includes(end.nodeId)),
      internalConnections: topology.internalConnections.filter((connection) => nodeIds.includes(connection.fromNodeId) || nodeIds.includes(connection.toNodeId)),
    },
    power: await topologyEntityCircuitLookup(identity, propertyId, { kind: "box", id: boxId }, wiringConfiguration.id),
  };
}

export async function placementViewModels(identity: RequestIdentity, propertyId: string, floorPlanId?: string): Promise<Array<FloorPlanPlacement<{ revision: number }> & { revision: number }>> {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const rows = await db.select().from(dbs.planPlacements).where(floorPlanId ? and(eq(dbs.planPlacements.propertyId, propertyId), eq(dbs.planPlacements.floorPlanId, floorPlanId)) : eq(dbs.planPlacements.propertyId, propertyId));
  const inventory = await inventoryViewModels(identity, propertyId);
  const byId = new Map(inventory.items.map((row) => [row.id, row]));
  return rows.flatMap((row) => {
    const item = byId.get(row.assetId);
    if (!item) return [];
    const markerKind: FloorPlanPlacement["kind"] =
      item.kind === "light-source" ? "fixture" :
      item.kind === "junction" ? "junction" :
      item.kind === "cable" || item.kind === "other" ? "junction" :
      item.kind;
    const mapSmart = item.smartState === "not-applicable" ? "unknown" : item.smartState;
    const mapConfidence: FloorPlanPlacement["confidence"] =
      item.verification === "test-verified" || item.verification === "documentation-verified"
        ? "verified"
        : item.verification === "conflicting"
          ? "conflicting"
          : item.verification === "observed"
            ? "observed"
            : item.verification;
    return [{ id: row.id, assetId: row.assetId, permanentCode: item.permanentCode, label: item.displayName, kind: markerKind, x: row.xNormalized, y: row.yNormalized, rotationDegrees: row.rotationDegrees, roomId: item.locationId ?? undefined, roomLabel: item.locationLabel ?? undefined, smartState: mapSmart, upgradeStatus: item.upgradeStatus ?? undefined, confidence: mapConfidence, revision: row.revision, data: { revision: row.revision } }];
  });
}

export async function upgradeViewModels(identity: RequestIdentity, propertyId: string): Promise<UpgradePlanItem[]> {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const [items, requirements, observations, proposed] = await Promise.all([
    db.select().from(dbs.upgradeItems).where(eq(dbs.upgradeItems.propertyId, propertyId)).orderBy(asc(dbs.upgradeItems.priority)),
    db.select().from(dbs.upgradeRequirements).where(eq(dbs.upgradeRequirements.propertyId, propertyId)),
    db.select().from(dbs.upgradeObservations).where(eq(dbs.upgradeObservations.propertyId, propertyId)),
    db.select().from(dbs.proposedProducts).where(eq(dbs.proposedProducts.propertyId, propertyId)),
  ]);
  const inventory = await inventoryViewModels(identity, propertyId);
  const byId = new Map(inventory.items.map((row) => [row.id, row]));
  return items.flatMap((upgrade) => {
    const asset = byId.get(upgrade.targetAssetId);
    if (!asset) return [];
    const product = proposed.filter((row) => row.upgradeItemId === upgrade.id).sort((a, b) => Number(b.selected) - Number(a.selected) || a.rank - b.rank)[0];
    return [{ id: upgrade.id, assetId: asset.id, upgradePermanentCode: upgrade.permanentCode, permanentCode: asset.permanentCode, goal: upgrade.goal, displayName: asset.displayName, kind: asset.kind, locationLabel: asset.locationLabel, status: upgrade.status, current: { smartState: asset.smartState, manufacturer: asset.installedProduct?.manufacturer, model: asset.installedProduct?.model, protocol: asset.installedProduct?.protocol }, planned: product ? { smartState: "smart", manufacturer: product.manufacturer, model: product.model, productId: product.productModelId } : null, requirements: requirements.filter((row) => row.upgradeItemId === upgrade.id).map((row) => { const observation = observations.filter((item) => item.upgradeRequirementId === row.id).at(-1); return { id: row.id, label: row.customRequirement ?? row.requirementKind.replaceAll("_", " "), state: observation?.readinessState ?? "unknown", observedValue: observation ? JSON.stringify(JSON.parse(observation.observedValueJson)) : null, detail: row.description }; }), notes: upgrade.notes }];
  });
}

export async function searchProperty(identity: RequestIdentity, propertyId: string, query: string, limit = 30) {
  await requireOwnedProperty(identity, propertyId);
  const needle = `%${query.trim()}%`;
  const compactedNeedle = query.trim().replace(/[^a-zA-Z0-9]/g, "").toLocaleLowerCase();
  const normalizedNeedle = compactedNeedle ? `%${compactedNeedle}%` : "\u0000";
  if (!query.trim()) return [];
  const db = getDb();
  const perKindLimit = Math.min(100, limit);
  const [assetRows, circuitRows, breakerRows, spaceRows, productRows, detailRows] = await Promise.all([
    db.select().from(dbs.assets).where(and(
      eq(dbs.assets.propertyId, propertyId),
      ne(dbs.assets.lifecycleState, "archived"),
      or(
        sql`${dbs.assets.displayName} like ${needle}`,
        sql`${dbs.assets.permanentCode} like ${needle}`,
        sql`coalesce(${dbs.assets.notes}, '') like ${needle}`,
      ),
    )).limit(perKindLimit),
    db.select().from(dbs.circuits).where(and(
      eq(dbs.circuits.propertyId, propertyId),
      ne(dbs.circuits.lifecycleState, "archived"),
      or(
        sql`${dbs.circuits.name} like ${needle}`,
        sql`${dbs.circuits.permanentCode} like ${needle}`,
        sql`coalesce(${dbs.circuits.purpose}, '') like ${needle}`,
        sql`coalesce(${dbs.circuits.notes}, '') like ${needle}`,
      ),
    )).limit(perKindLimit),
    db.select().from(dbs.breakers).where(and(
      eq(dbs.breakers.propertyId, propertyId),
      ne(dbs.breakers.lifecycleState, "archived"),
      or(
        sql`${dbs.breakers.label} like ${needle}`,
        sql`${dbs.breakers.permanentCode} like ${needle}`,
        sql`coalesce(${dbs.breakers.notes}, '') like ${needle}`,
      ),
    )).limit(perKindLimit),
    db.select().from(dbs.spaces).where(and(
      eq(dbs.spaces.propertyId, propertyId),
      ne(dbs.spaces.lifecycleState, "archived"),
      or(
        sql`${dbs.spaces.name} like ${needle}`,
        sql`coalesce(${dbs.spaces.notes}, '') like ${needle}`,
      ),
    )).limit(perKindLimit),
    db.select({
      assetId: dbs.assets.id,
      assetName: dbs.assets.displayName,
      assetKind: dbs.assets.kind,
      permanentCode: dbs.assets.permanentCode,
      manufacturer: dbs.installedProducts.manufacturer,
      model: dbs.installedProducts.model,
    }).from(dbs.installedProducts).innerJoin(
      dbs.assets,
      and(
        eq(dbs.assets.propertyId, dbs.installedProducts.propertyId),
        eq(dbs.assets.id, dbs.installedProducts.assetId),
      ),
    ).where(and(
      eq(dbs.installedProducts.propertyId, propertyId),
      ne(dbs.installedProducts.lifecycleState, "archived"),
      ne(dbs.assets.lifecycleState, "archived"),
      or(
        sql`coalesce(${dbs.installedProducts.manufacturer}, '') like ${needle}`,
        sql`coalesce(${dbs.installedProducts.model}, '') like ${needle}`,
        sql`coalesce(${dbs.installedProducts.sku}, '') like ${needle}`,
        sql`coalesce(${dbs.installedProducts.serialNumber}, '') like ${needle}`,
        sql`coalesce(${dbs.installedProducts.capabilitiesJson}, '') like ${needle}`,
        sql`coalesce(${dbs.installedProducts.notes}, '') like ${needle}`,
      ),
    )).limit(perKindLimit),
    db.select({
      assetId: dbs.assets.id,
      assetName: dbs.assets.displayName,
      assetKind: dbs.assets.kind,
      permanentCode: dbs.assets.permanentCode,
      detailLabel: dbs.installedDeviceDetails.label,
    }).from(dbs.installedDeviceDetails).innerJoin(
      dbs.installedProducts,
      and(
        eq(dbs.installedProducts.propertyId, dbs.installedDeviceDetails.propertyId),
        eq(dbs.installedProducts.id, dbs.installedDeviceDetails.installedProductId),
      ),
    ).innerJoin(
      dbs.assets,
      and(
        eq(dbs.assets.propertyId, dbs.installedProducts.propertyId),
        eq(dbs.assets.id, dbs.installedProducts.assetId),
      ),
    ).where(and(
      eq(dbs.installedDeviceDetails.propertyId, propertyId),
      ne(dbs.installedDeviceDetails.sensitivity, "secret"),
      ne(dbs.installedDeviceDetails.lifecycleState, "archived"),
      ne(dbs.installedProducts.lifecycleState, "archived"),
      ne(dbs.assets.lifecycleState, "archived"),
      or(
        sql`${dbs.installedDeviceDetails.value} like ${needle}`,
        sql`coalesce(${dbs.installedDeviceDetails.normalizedValue}, '') like ${normalizedNeedle}`,
        sql`${dbs.installedDeviceDetails.label} like ${needle}`,
      ),
    )).limit(perKindLimit),
  ]);
  const results = [
    ...assetRows.map((row) => ({ id: row.id, label: row.displayName, kind: row.kind, permanentCode: row.permanentCode, description: row.notes, href: `/p/${propertyId}/inventory?selectedKind=${row.kind}&selectedId=${row.id}` })),
    ...circuitRows.map((row) => ({ id: row.id, label: row.name, kind: "circuit", permanentCode: row.permanentCode, description: row.purpose, href: `/p/${propertyId}/circuits?selectedKind=circuit&selectedId=${row.id}` })),
    ...breakerRows.map((row) => ({ id: row.id, label: row.label, kind: "breaker", permanentCode: row.permanentCode, description: row.ratingAmps ? `${row.ratingAmps} A · ${row.poleCount} pole${row.poleCount === 1 ? "" : "s"}` : `${row.poleCount} pole${row.poleCount === 1 ? "" : "s"}`, href: `/p/${propertyId}/circuits?selectedKind=breaker&selectedId=${row.id}` })),
    ...spaceRows.map((row) => ({ id: row.id, label: row.name, kind: row.kind, description: row.notes, href: `/p/${propertyId}/settings#locations` })),
    ...productRows.map((row) => ({ id: row.assetId, label: row.assetName, kind: row.assetKind, permanentCode: row.permanentCode, description: [row.manufacturer, row.model].filter(Boolean).join(" "), href: `/p/${propertyId}/inventory?selectedKind=${row.assetKind}&selectedId=${row.assetId}` })),
    ...detailRows.map((row) => ({ id: row.assetId, label: row.assetName, kind: row.assetKind, permanentCode: row.permanentCode, description: `Matches ${row.detailLabel}`, href: `/p/${propertyId}/inventory?selectedKind=${row.assetKind}&selectedId=${row.assetId}` })),
  ];
  return [...new Map(results.map((row) => [row.id, row])).values()].slice(0, limit);
}
