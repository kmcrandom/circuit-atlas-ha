import type {
  Certainty,
  Conductor,
  ConductorEnd,
  ContactStateGroup,
  ElectricalNode,
  ElectricalTopology,
  InternalConnection,
} from "../domain/electrical";

export interface MultiWayPresetOptions {
  propertyId: string;
  controllerCount: number;
  idPrefix?: string;
  circuitId?: string;
  breakerPoleId?: string;
  loadAssetId?: string;
  loadFunctionId?: string;
  certainty?: Certainty;
}

export interface MultiWayControllerPreset {
  index: number;
  assetId: string;
  functionId: string;
  role: "endpoint" | "intermediate";
  terminalNodeIds: readonly string[];
  leftTravelerNodeIds: readonly [string, string];
  rightTravelerNodeIds: readonly [string, string];
  commonNodeId?: string;
  contactStateGroupId: string;
}

export interface MultiWayPreset {
  topology: ElectricalTopology;
  controllerCount: number;
  controllers: readonly MultiWayControllerPreset[];
  sourceNodeId: string;
  loadLineNodeId: string;
  loadNeutralNodeId: string;
  loadAssetId: string;
  loadFunctionId: string;
  travelerConductorIds: readonly string[];
}

interface BuildContext {
  propertyId: string;
  idPrefix: string;
  certainty: Certainty;
  nodes: ElectricalNode[];
  internalConnections: InternalConnection[];
  contactStateGroups: ContactStateGroup[];
}

function terminalNode(
  context: BuildContext,
  assetId: string,
  functionId: string,
  key: string,
): string {
  const id = `${assetId}:terminal:${key}`;
  context.nodes.push({
    id,
    propertyId: context.propertyId,
    kind: "terminal",
    label: key,
    ownerAssetId: assetId,
    containingAssetId: assetId,
    ownerFunctionId: functionId,
    certainty: context.certainty,
  });
  return id;
}

function addContact(
  context: BuildContext,
  groupId: string,
  state: string,
  ordinal: number,
  fromNodeId: string,
  toNodeId: string,
): void {
  context.internalConnections.push({
    id: `${groupId}:${state}:${ordinal}`,
    propertyId: context.propertyId,
    fromNodeId,
    toNodeId,
    kind: "conditional-contact",
    directionality: "bidirectional",
    contactStateGroup: groupId,
    contactState: state,
    certainty: context.certainty,
  });
}

function createEndpoint(
  context: BuildContext,
  index: number,
): MultiWayControllerPreset {
  const assetId = `${context.idPrefix}:controller:${index}`;
  const functionId = `${assetId}:function:switch`;
  const common = terminalNode(context, assetId, functionId, "common");
  const travelerA = terminalNode(context, assetId, functionId, "traveler-a");
  const travelerB = terminalNode(context, assetId, functionId, "traveler-b");
  const groupId = `${assetId}:contact-group`;
  addContact(context, groupId, "position-a", 0, common, travelerA);
  addContact(context, groupId, "position-b", 0, common, travelerB);
  context.contactStateGroups.push({
    id: groupId,
    propertyId: context.propertyId,
    ownerAssetId: assetId,
    role: "endpoint",
    expectedStateCount: 2,
    terminalNodeIds: [common, travelerA, travelerB],
  });
  return {
    index,
    assetId,
    functionId,
    role: "endpoint",
    terminalNodeIds: [common, travelerA, travelerB],
    leftTravelerNodeIds: [travelerA, travelerB],
    rightTravelerNodeIds: [travelerA, travelerB],
    commonNodeId: common,
    contactStateGroupId: groupId,
  };
}

function createIntermediate(
  context: BuildContext,
  index: number,
): MultiWayControllerPreset {
  const assetId = `${context.idPrefix}:controller:${index}`;
  const functionId = `${assetId}:function:switch`;
  const leftA = terminalNode(context, assetId, functionId, "left-traveler-a");
  const leftB = terminalNode(context, assetId, functionId, "left-traveler-b");
  const rightA = terminalNode(context, assetId, functionId, "right-traveler-a");
  const rightB = terminalNode(context, assetId, functionId, "right-traveler-b");
  const groupId = `${assetId}:contact-group`;
  addContact(context, groupId, "straight", 0, leftA, rightA);
  addContact(context, groupId, "straight", 1, leftB, rightB);
  addContact(context, groupId, "cross", 0, leftA, rightB);
  addContact(context, groupId, "cross", 1, leftB, rightA);
  context.contactStateGroups.push({
    id: groupId,
    propertyId: context.propertyId,
    ownerAssetId: assetId,
    role: "intermediate",
    expectedStateCount: 2,
    terminalNodeIds: [leftA, leftB, rightA, rightB],
  });
  return {
    index,
    assetId,
    functionId,
    role: "intermediate",
    terminalNodeIds: [leftA, leftB, rightA, rightB],
    leftTravelerNodeIds: [leftA, leftB],
    rightTravelerNodeIds: [rightA, rightB],
    contactStateGroupId: groupId,
  };
}

function addConductor(
  context: BuildContext,
  conductors: Conductor[],
  conductorEnds: ConductorEnd[],
  id: string,
  fromNodeId: string,
  toNodeId: string,
  electricalClass: Conductor["electricalClass"],
): void {
  conductors.push({
    id,
    propertyId: context.propertyId,
    kind: "standalone",
    electricalClass,
    certainty: context.certainty,
  });
  conductorEnds.push(
    {
      id: `${id}:end:a`,
      propertyId: context.propertyId,
      conductorId: id,
      designation: "A",
      nodeId: fromNodeId,
      certainty: context.certainty,
    },
    {
      id: `${id}:end:b`,
      propertyId: context.propertyId,
      conductorId: id,
      designation: "B",
      nodeId: toNodeId,
      certainty: context.certainty,
    },
  );
}

/**
 * Generates a complete, editable mechanical multi-way contact graph.
 *
 * The construction is always endpoint + repeated intermediate + endpoint. It
 * has no cases for familiar 3/4/5-way labels and therefore no controller-count
 * ceiling. `controllerCount` means physical controllers, not a trade nickname.
 */
export function generateMultiWayPreset(
  options: MultiWayPresetOptions,
): MultiWayPreset {
  if (!Number.isSafeInteger(options.controllerCount) || options.controllerCount < 2) {
    throw new RangeError("A mechanical multi-way preset requires at least two controllers.");
  }
  if (!options.propertyId) {
    throw new TypeError("propertyId is required.");
  }

  const idPrefix = options.idPrefix?.trim() || "multi-way";
  const certainty = options.certainty ?? "assumed";
  const context: BuildContext = {
    propertyId: options.propertyId,
    idPrefix,
    certainty,
    nodes: [],
    internalConnections: [],
    contactStateGroups: [],
  };
  const conductors: Conductor[] = [];
  const conductorEnds: ConductorEnd[] = [];

  const controllers: MultiWayControllerPreset[] = [
    createEndpoint(context, 0),
    ...Array.from({ length: options.controllerCount - 2 }, (_, offset) =>
      createIntermediate(context, offset + 1),
    ),
    createEndpoint(context, options.controllerCount - 1),
  ];

  const sourceNodeId = `${idPrefix}:source:line`;
  context.nodes.push({
    id: sourceNodeId,
    propertyId: options.propertyId,
    kind: "source",
    label: "Line source",
    certainty,
  });

  const loadAssetId = options.loadAssetId ?? `${idPrefix}:load`;
  const loadFunctionId =
    options.loadFunctionId ?? `${loadAssetId}:function:load`;
  const loadLineNodeId = terminalNode(
    context,
    loadAssetId,
    loadFunctionId,
    "line",
  );
  const loadNeutralNodeId = terminalNode(
    context,
    loadAssetId,
    loadFunctionId,
    "neutral",
  );

  addConductor(
    context,
    conductors,
    conductorEnds,
    `${idPrefix}:conductor:line-feed`,
    sourceNodeId,
    controllers[0].commonNodeId as string,
    "power",
  );

  const travelerConductorIds: string[] = [];
  for (const [index, pair] of controllers.slice(0, -1).entries()) {
    const next = controllers[index + 1];
    for (const lane of [0, 1] as const) {
      const id = `${idPrefix}:conductor:travelers:${index}:${lane}`;
      travelerConductorIds.push(id);
      addConductor(
        context,
        conductors,
        conductorEnds,
        id,
        pair.rightTravelerNodeIds[lane],
        next.leftTravelerNodeIds[lane],
        "traveler",
      );
    }
  }

  addConductor(
    context,
    conductors,
    conductorEnds,
    `${idPrefix}:conductor:switched-load`,
    controllers.at(-1)?.commonNodeId as string,
    loadLineNodeId,
    "switched-power",
  );
  context.internalConnections.push({
    id: `${idPrefix}:load:impedance`,
    propertyId: options.propertyId,
    fromNodeId: loadLineNodeId,
    toNodeId: loadNeutralNodeId,
    kind: "load-impedance",
    directionality: "bidirectional",
    certainty,
  });

  const circuitId = options.circuitId ?? `${idPrefix}:circuit`;
  const breakerPoleId = options.breakerPoleId ?? `${idPrefix}:breaker-pole`;
  const topology: ElectricalTopology = {
    propertyId: options.propertyId,
    nodes: context.nodes,
    conductors,
    conductorEnds,
    internalConnections: context.internalConnections,
    sources: [
      {
        id: `${idPrefix}:circuit-source`,
        propertyId: options.propertyId,
        circuitId,
        breakerPoleId,
        nodeId: sourceNodeId,
        certainty,
      },
    ],
    traceGaps: [],
    contactStateGroups: context.contactStateGroups,
  };

  return {
    topology,
    controllerCount: options.controllerCount,
    controllers,
    sourceNodeId,
    loadLineNodeId,
    loadNeutralNodeId,
    loadAssetId,
    loadFunctionId,
    travelerConductorIds,
  };
}
