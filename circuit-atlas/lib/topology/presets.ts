import type {
  AssetFunction,
  AssetFunctionKind,
  Certainty,
  Conductor,
  ConductorElectricalClass,
  ConductorEnd,
  ConductorKind,
  ConnectionDirectionality,
  ConnectionState,
  ContactStateGroup,
  ControlGroup,
  ControlLink,
  ControlMember,
  ControlMethod,
  ControlRole,
  ElectricalNode,
  ElectricalTopology,
  InternalConnection,
  InternalConnectionKind,
  PanelFeeder,
  SharedNeutralGroup,
  SharedNeutralMember,
  TerminalSemanticRole,
} from "../domain/electrical";

export type BuiltInElectricalPresetId =
  | "single-pole-switch"
  | "multi-way-endpoint"
  | "multi-way-intermediate"
  | "duplex-receptacle"
  | "split-duplex-receptacle"
  | "gfci-receptacle"
  | "smart-switch"
  | "smart-aux-companion"
  | "relay"
  | "simple-light-fixture"
  | "multi-lamp-fixture"
  | "fan-light-fixture"
  | "smart-bulb";

export type ElectricalPresetCategory =
  | "controller"
  | "receptacle"
  | "relay"
  | "fixture"
  | "light-source";

export interface PresetFunctionDefinition {
  key: string;
  kind: AssetFunctionKind;
  label: string;
}

export interface PresetTerminalDefinition {
  key: string;
  label: string;
  role: TerminalSemanticRole;
  functionKey?: string;
}

export interface PresetConnectionDefinition {
  key: string;
  fromTerminalKey: string;
  toTerminalKey: string;
  kind: InternalConnectionKind;
  label?: string;
  directionality?: ConnectionDirectionality;
  state?: ConnectionState;
  contactStateGroupKey?: string;
  contactState?: string;
}

export interface PresetContactStateGroupDefinition {
  key: string;
  role: "endpoint" | "intermediate" | "custom";
  expectedStateCount?: number;
  terminalKeys: readonly string[];
}

export interface PresetLampHolderDefinition {
  key: string;
  functionKey: string;
  label: string;
}

export interface PresetProtectionBoundaryDefinition {
  key: string;
  kind: "gfci-protected-feed-through";
  lineTerminalKeys: readonly [string, string];
  loadTerminalKeys: readonly [string, string];
}

export interface PresetControlInterfaceDefinition {
  functionKey: string;
  role: ControlRole;
  method: ControlMethod;
}

/**
 * Property-neutral, editable template. It contains generic device behavior but
 * no property IDs, locations, labels, circuit IDs, or observed topology.
 */
export interface ElectricalPresetDefinition {
  id: BuiltInElectricalPresetId | (string & {});
  version: number;
  label: string;
  category: ElectricalPresetCategory;
  description: string;
  functions: readonly PresetFunctionDefinition[];
  terminals: readonly PresetTerminalDefinition[];
  internalConnections: readonly PresetConnectionDefinition[];
  contactStateGroups?: readonly PresetContactStateGroupDefinition[];
  lampHolders?: readonly PresetLampHolderDefinition[];
  protectionBoundaries?: readonly PresetProtectionBoundaryDefinition[];
  controlInterfaces?: readonly PresetControlInterfaceDefinition[];
}

export interface ExpandedLampHolder {
  id: string;
  propertyId: string;
  assetId: string;
  assetFunctionId: string;
  positionKey: string;
  label: string;
}

export interface ExpandedProtectionBoundary {
  id: string;
  propertyId: string;
  assetId: string;
  kind: PresetProtectionBoundaryDefinition["kind"];
  lineNodeIds: readonly [string, string];
  loadNodeIds: readonly [string, string];
}

export interface ExpandedControlInterface {
  assetFunctionId: string;
  role: ControlRole;
  method: ControlMethod;
}

export interface ExpandedElectricalPreset {
  presetId: string;
  presetVersion: number;
  propertyId: string;
  assetId: string;
  functionIds: Readonly<Record<string, string>>;
  terminalNodeIds: Readonly<Record<string, string>>;
  topology: ElectricalTopology;
  lampHolders: readonly ExpandedLampHolder[];
  protectionBoundaries: readonly ExpandedProtectionBoundary[];
  controlInterfaces: readonly ExpandedControlInterface[];
}

export interface ExpandElectricalPresetOptions {
  propertyId: string;
  assetId: string;
  containingBoxId?: string;
  idPrefix?: string;
  certainty?: Certainty;
  connectionStateOverrides?: Readonly<Record<string, ConnectionState>>;
}

function assertNonEmpty(value: string, name: string): void {
  if (!value.trim()) throw new TypeError(`${name} is required.`);
}

function assertUniqueKeys(
  values: readonly { key: string }[],
  collection: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    assertNonEmpty(value.key, `${collection} key`);
    if (seen.has(value.key)) {
      throw new TypeError(`Duplicate ${collection} key: ${value.key}.`);
    }
    seen.add(value.key);
  }
}

/** Expands a reusable definition into property-scoped, editable graph rows. */
export function expandElectricalPreset(
  definition: ElectricalPresetDefinition,
  options: ExpandElectricalPresetOptions,
): ExpandedElectricalPreset {
  assertNonEmpty(options.propertyId, "propertyId");
  assertNonEmpty(options.assetId, "assetId");
  assertUniqueKeys(definition.functions, "function");
  assertUniqueKeys(definition.terminals, "terminal");
  assertUniqueKeys(definition.internalConnections, "connection");
  assertUniqueKeys(definition.contactStateGroups ?? [], "contact-state group");

  const prefix = options.idPrefix?.trim() || options.assetId;
  const certainty = options.certainty ?? "assumed";
  const functionIds = Object.fromEntries(
    definition.functions.map((item) => [
      item.key,
      `${prefix}:function:${item.key}`,
    ]),
  );
  const terminalNodeIds = Object.fromEntries(
    definition.terminals.map((terminal) => [
      terminal.key,
      `${prefix}:terminal:${terminal.key}`,
    ]),
  );

  const functions: AssetFunction[] = definition.functions.map((item) => ({
    id: functionIds[item.key],
    propertyId: options.propertyId,
    assetId: options.assetId,
    key: item.key,
    kind: item.kind,
    label: item.label,
  }));
  const nodes: ElectricalNode[] = definition.terminals.map((terminal) => {
    if (terminal.functionKey && !functionIds[terminal.functionKey]) {
      throw new TypeError(
        `Terminal ${terminal.key} references unknown function ${terminal.functionKey}.`,
      );
    }
    return {
      id: terminalNodeIds[terminal.key],
      propertyId: options.propertyId,
      kind: "terminal",
      label: terminal.label,
      containingBoxId: options.containingBoxId,
      containingAssetId: options.assetId,
      ownerAssetId: options.assetId,
      ownerFunctionId: terminal.functionKey
        ? functionIds[terminal.functionKey]
        : undefined,
      terminalRole: terminal.role,
      certainty,
    };
  });
  const groupIds = Object.fromEntries(
    (definition.contactStateGroups ?? []).map((group) => [
      group.key,
      `${prefix}:contact-group:${group.key}`,
    ]),
  );

  const connections: InternalConnection[] = definition.internalConnections.map(
    (connection) => {
      const fromNodeId = terminalNodeIds[connection.fromTerminalKey];
      const toNodeId = terminalNodeIds[connection.toTerminalKey];
      if (!fromNodeId || !toNodeId) {
        throw new TypeError(
          `Connection ${connection.key} references an unknown terminal.`,
        );
      }
      if (
        connection.contactStateGroupKey &&
        !groupIds[connection.contactStateGroupKey]
      ) {
        throw new TypeError(
          `Connection ${connection.key} references unknown contact-state group ${connection.contactStateGroupKey}.`,
        );
      }
      return {
        id: `${prefix}:connection:${connection.key}`,
        propertyId: options.propertyId,
        fromNodeId,
        toNodeId,
        kind: connection.kind,
        label: connection.label,
        directionality: connection.directionality ?? "bidirectional",
        state:
          options.connectionStateOverrides?.[connection.key] ??
          connection.state,
        contactStateGroup: connection.contactStateGroupKey
          ? groupIds[connection.contactStateGroupKey]
          : undefined,
        contactState: connection.contactState,
        certainty,
      };
    },
  );
  const contactStateGroups: ContactStateGroup[] = (
    definition.contactStateGroups ?? []
  ).map((group) => {
    const terminalIds = group.terminalKeys.map((key) => terminalNodeIds[key]);
    if (terminalIds.some((id) => !id)) {
      throw new TypeError(
        `Contact-state group ${group.key} references an unknown terminal.`,
      );
    }
    return {
      id: groupIds[group.key],
      propertyId: options.propertyId,
      ownerAssetId: options.assetId,
      role: group.role,
      expectedStateCount: group.expectedStateCount,
      terminalNodeIds: terminalIds,
    };
  });
  const lampHolders = (definition.lampHolders ?? []).map((holder) => {
    const assetFunctionId = functionIds[holder.functionKey];
    if (!assetFunctionId) {
      throw new TypeError(
        `Lamp holder ${holder.key} references unknown function ${holder.functionKey}.`,
      );
    }
    return {
      id: `${prefix}:lamp-holder:${holder.key}`,
      propertyId: options.propertyId,
      assetId: options.assetId,
      assetFunctionId,
      positionKey: holder.key,
      label: holder.label,
    };
  });
  const protectionBoundaries = (definition.protectionBoundaries ?? []).map(
    (boundary) => {
      const lineNodeIds = boundary.lineTerminalKeys.map(
        (key) => terminalNodeIds[key],
      ) as [string, string];
      const loadNodeIds = boundary.loadTerminalKeys.map(
        (key) => terminalNodeIds[key],
      ) as [string, string];
      if ([...lineNodeIds, ...loadNodeIds].some((id) => !id)) {
        throw new TypeError(
          `Protection boundary ${boundary.key} references an unknown terminal.`,
        );
      }
      return {
        id: `${prefix}:protection-boundary:${boundary.key}`,
        propertyId: options.propertyId,
        assetId: options.assetId,
        kind: boundary.kind,
        lineNodeIds,
        loadNodeIds,
      };
    },
  );
  const controlInterfaces = (definition.controlInterfaces ?? []).map(
    (controlInterface) => {
      const assetFunctionId = functionIds[controlInterface.functionKey];
      if (!assetFunctionId) {
        throw new TypeError(
          `Control interface references unknown function ${controlInterface.functionKey}.`,
        );
      }
      return {
        assetFunctionId,
        role: controlInterface.role,
        method: controlInterface.method,
      };
    },
  );

  return {
    presetId: definition.id,
    presetVersion: definition.version,
    propertyId: options.propertyId,
    assetId: options.assetId,
    functionIds,
    terminalNodeIds,
    topology: {
      propertyId: options.propertyId,
      nodes,
      conductors: [],
      conductorEnds: [],
      internalConnections: connections,
      sources: [],
      contactStateGroups,
      assetFunctions: functions,
    },
    lampHolders,
    protectionBoundaries,
    controlInterfaces,
  };
}

const singlePoleSwitch: ElectricalPresetDefinition = {
  id: "single-pole-switch",
  version: 1,
  label: "Single-pole switch",
  category: "controller",
  description: "One line terminal and one switched-load terminal.",
  functions: [{ key: "switch", kind: "switch-channel", label: "Switch" }],
  terminals: [
    { key: "line", label: "Line", role: "LINE", functionKey: "switch" },
    { key: "load", label: "Load", role: "LOAD", functionKey: "switch" },
  ],
  internalConnections: [
    {
      key: "contact-on",
      fromTerminalKey: "line",
      toTerminalKey: "load",
      kind: "conditional-contact",
      contactStateGroupKey: "mechanism",
      contactState: "on",
      label: "Closed when on",
    },
  ],
  contactStateGroups: [
    {
      key: "mechanism",
      role: "custom",
      expectedStateCount: 1,
      terminalKeys: ["line", "load"],
    },
  ],
  controlInterfaces: [
    { functionKey: "switch", role: "controller", method: "hardwired-relay" },
  ],
};

const multiWayEndpoint: ElectricalPresetDefinition = {
  id: "multi-way-endpoint",
  version: 1,
  label: "Multi-way endpoint switch",
  category: "controller",
  description: "A common terminal selects one of two traveler terminals.",
  functions: [{ key: "switch", kind: "switch-channel", label: "Switch" }],
  terminals: [
    { key: "common", label: "Common", role: "COMMON", functionKey: "switch" },
    { key: "traveler-a", label: "Traveler 1", role: "TRAVELER_1", functionKey: "switch" },
    { key: "traveler-b", label: "Traveler 2", role: "TRAVELER_2", functionKey: "switch" },
  ],
  internalConnections: [
    {
      key: "position-a",
      fromTerminalKey: "common",
      toTerminalKey: "traveler-a",
      kind: "conditional-contact",
      contactStateGroupKey: "mechanism",
      contactState: "position-a",
    },
    {
      key: "position-b",
      fromTerminalKey: "common",
      toTerminalKey: "traveler-b",
      kind: "conditional-contact",
      contactStateGroupKey: "mechanism",
      contactState: "position-b",
    },
  ],
  contactStateGroups: [
    {
      key: "mechanism",
      role: "endpoint",
      expectedStateCount: 2,
      terminalKeys: ["common", "traveler-a", "traveler-b"],
    },
  ],
  controlInterfaces: [
    { functionKey: "switch", role: "controller", method: "mechanical-traveler" },
  ],
};

const multiWayIntermediate: ElectricalPresetDefinition = {
  id: "multi-way-intermediate",
  version: 1,
  label: "Multi-way intermediate switch",
  category: "controller",
  description: "A repeatable straight/crossover traveler mechanism.",
  functions: [{ key: "switch", kind: "switch-channel", label: "Switch" }],
  terminals: [
    { key: "left-a", label: "Left traveler 1", role: "TRAVELER_1", functionKey: "switch" },
    { key: "left-b", label: "Left traveler 2", role: "TRAVELER_2", functionKey: "switch" },
    { key: "right-a", label: "Right traveler 1", role: "TRAVELER_1", functionKey: "switch" },
    { key: "right-b", label: "Right traveler 2", role: "TRAVELER_2", functionKey: "switch" },
  ],
  internalConnections: [
    { key: "straight-a", fromTerminalKey: "left-a", toTerminalKey: "right-a", kind: "conditional-contact", contactStateGroupKey: "mechanism", contactState: "straight" },
    { key: "straight-b", fromTerminalKey: "left-b", toTerminalKey: "right-b", kind: "conditional-contact", contactStateGroupKey: "mechanism", contactState: "straight" },
    { key: "cross-a", fromTerminalKey: "left-a", toTerminalKey: "right-b", kind: "conditional-contact", contactStateGroupKey: "mechanism", contactState: "cross" },
    { key: "cross-b", fromTerminalKey: "left-b", toTerminalKey: "right-a", kind: "conditional-contact", contactStateGroupKey: "mechanism", contactState: "cross" },
  ],
  contactStateGroups: [
    {
      key: "mechanism",
      role: "intermediate",
      expectedStateCount: 2,
      terminalKeys: ["left-a", "left-b", "right-a", "right-b"],
    },
  ],
  controlInterfaces: [
    { functionKey: "switch", role: "controller", method: "mechanical-traveler" },
  ],
};

function duplexReceptacle(
  id: "duplex-receptacle" | "split-duplex-receptacle",
  hotTabState: ConnectionState,
): ElectricalPresetDefinition {
  return {
    id,
    version: 1,
    label: id === "duplex-receptacle" ? "Duplex receptacle" : "Split duplex receptacle",
    category: "receptacle",
    description: "Two independently addressable receptacle halves with explicit tab state.",
    functions: [
      { key: "top", kind: "receptacle-half", label: "Top receptacle" },
      { key: "bottom", kind: "receptacle-half", label: "Bottom receptacle" },
    ],
    terminals: [
      { key: "top-hot", label: "Top hot", role: "LINE", functionKey: "top" },
      { key: "top-neutral", label: "Top neutral", role: "NEUTRAL", functionKey: "top" },
      { key: "bottom-hot", label: "Bottom hot", role: "LINE", functionKey: "bottom" },
      { key: "bottom-neutral", label: "Bottom neutral", role: "NEUTRAL", functionKey: "bottom" },
    ],
    internalConnections: [
      { key: "hot-tab", fromTerminalKey: "top-hot", toTerminalKey: "bottom-hot", kind: "breakable-tab", state: hotTabState, label: "Hot-side tab" },
      { key: "neutral-tab", fromTerminalKey: "top-neutral", toTerminalKey: "bottom-neutral", kind: "breakable-tab", state: "connected", label: "Neutral-side tab" },
    ],
  };
}

const gfciReceptacle: ElectricalPresetDefinition = {
  id: "gfci-receptacle",
  version: 1,
  label: "GFCI line/load receptacle",
  category: "receptacle",
  description: "Distinct line, local receptacle, and downstream protected-load terminals.",
  functions: [
    { key: "local", kind: "receptacle-half", label: "Local receptacle" },
    { key: "downstream", kind: "custom", label: "Protected downstream feed" },
  ],
  terminals: [
    { key: "line-hot", label: "LINE hot", role: "LINE" },
    { key: "line-neutral", label: "LINE neutral", role: "NEUTRAL" },
    { key: "receptacle-hot", label: "Local hot", role: "LINE", functionKey: "local" },
    { key: "receptacle-neutral", label: "Local neutral", role: "NEUTRAL", functionKey: "local" },
    { key: "load-hot", label: "LOAD hot", role: "LOAD", functionKey: "downstream" },
    { key: "load-neutral", label: "LOAD neutral", role: "NEUTRAL", functionKey: "downstream" },
  ],
  internalConnections: [
    { key: "local-hot-feed", fromTerminalKey: "line-hot", toTerminalKey: "receptacle-hot", kind: "fixed-feed-through" },
    { key: "local-neutral-feed", fromTerminalKey: "line-neutral", toTerminalKey: "receptacle-neutral", kind: "fixed-feed-through" },
    { key: "protected-hot-feed", fromTerminalKey: "line-hot", toTerminalKey: "load-hot", kind: "fixed-feed-through", label: "GFCI-protected feed-through" },
    { key: "protected-neutral-feed", fromTerminalKey: "line-neutral", toTerminalKey: "load-neutral", kind: "fixed-feed-through", label: "GFCI-protected neutral feed-through" },
  ],
  protectionBoundaries: [
    {
      key: "line-load",
      kind: "gfci-protected-feed-through",
      lineTerminalKeys: ["line-hot", "line-neutral"],
      loadTerminalKeys: ["load-hot", "load-neutral"],
    },
  ],
};

const smartSwitch: ElectricalPresetDefinition = {
  id: "smart-switch",
  version: 1,
  label: "Smart switch",
  category: "controller",
  description: "Powered controller with a switched output and an isolated aux/data interface.",
  functions: [{ key: "switch", kind: "switch-channel", label: "Smart switch" }],
  terminals: [
    { key: "line", label: "Line", role: "LINE", functionKey: "switch" },
    { key: "load", label: "Load", role: "LOAD", functionKey: "switch" },
    { key: "neutral", label: "Neutral", role: "NEUTRAL", functionKey: "switch" },
    { key: "aux-data", label: "Aux/data", role: "AUX", functionKey: "switch" },
  ],
  internalConnections: [
    { key: "relay-on", fromTerminalKey: "line", toTerminalKey: "load", kind: "conditional-contact", contactStateGroupKey: "relay", contactState: "on" },
    { key: "aux-electronics", fromTerminalKey: "aux-data", toTerminalKey: "neutral", kind: "signal-only", label: "Auxiliary data input" },
  ],
  contactStateGroups: [
    { key: "relay", role: "custom", expectedStateCount: 1, terminalKeys: ["line", "load"] },
  ],
  controlInterfaces: [
    { functionKey: "switch", role: "controller", method: "hardwired-relay" },
    { functionKey: "switch", role: "controller", method: "wired-auxiliary-data" },
    { functionKey: "switch", role: "controller", method: "hub-app" },
  ],
};

const smartAuxCompanion: ElectricalPresetDefinition = {
  id: "smart-aux-companion",
  version: 1,
  label: "Smart aux/data companion",
  category: "controller",
  description: "A companion signaling interface, not a mechanical traveler switch.",
  functions: [{ key: "companion", kind: "scene-button", label: "Companion" }],
  terminals: [
    { key: "aux-data", label: "Aux/data", role: "AUX", functionKey: "companion" },
    { key: "neutral", label: "Neutral/reference", role: "NEUTRAL", functionKey: "companion" },
  ],
  internalConnections: [
    { key: "aux-signal", fromTerminalKey: "aux-data", toTerminalKey: "neutral", kind: "signal-only", label: "Auxiliary data signal" },
  ],
  controlInterfaces: [
    { functionKey: "companion", role: "companion", method: "wired-auxiliary-data" },
  ],
};

const relay: ElectricalPresetDefinition = {
  id: "relay",
  version: 1,
  label: "Relay module",
  category: "relay",
  description: "A relay contact with a separate signal/control input.",
  functions: [{ key: "relay", kind: "relay-channel", label: "Relay" }],
  terminals: [
    { key: "line", label: "Line", role: "LINE", functionKey: "relay" },
    { key: "load", label: "Load", role: "LOAD", functionKey: "relay" },
    { key: "neutral", label: "Neutral", role: "NEUTRAL", functionKey: "relay" },
    { key: "control", label: "Control input", role: "AUX", functionKey: "relay" },
  ],
  internalConnections: [
    { key: "contact-on", fromTerminalKey: "line", toTerminalKey: "load", kind: "conditional-contact", contactStateGroupKey: "relay", contactState: "on" },
    { key: "control-signal", fromTerminalKey: "control", toTerminalKey: "neutral", kind: "signal-only" },
  ],
  contactStateGroups: [
    { key: "relay", role: "custom", expectedStateCount: 1, terminalKeys: ["line", "load"] },
  ],
  controlInterfaces: [
    { functionKey: "relay", role: "controller", method: "hardwired-relay" },
  ],
};

const simpleLightFixture: ElectricalPresetDefinition = {
  id: "simple-light-fixture",
  version: 1,
  label: "Simple light fixture",
  category: "fixture",
  description: "One lamp holder/load between line and neutral.",
  functions: [{ key: "light", kind: "lamp-holder", label: "Lamp holder" }],
  terminals: [
    { key: "line", label: "Line", role: "LINE", functionKey: "light" },
    { key: "neutral", label: "Neutral", role: "NEUTRAL", functionKey: "light" },
  ],
  internalConnections: [
    { key: "lamp-load", fromTerminalKey: "line", toTerminalKey: "neutral", kind: "load-impedance", label: "Lamp load" },
  ],
  lampHolders: [{ key: "lamp-1", functionKey: "light", label: "Lamp 1" }],
  controlInterfaces: [
    { functionKey: "light", role: "controlled-load", method: "hardwired-relay" },
  ],
};

export function createMultiLampFixturePreset(
  lampCount: number,
): ElectricalPresetDefinition {
  if (!Number.isSafeInteger(lampCount) || lampCount < 1) {
    throw new RangeError("A multi-lamp fixture requires at least one lamp holder.");
  }
  const functions = Array.from({ length: lampCount }, (_, index) => ({
    key: `lamp-${index + 1}`,
    kind: "lamp-holder" as const,
    label: `Lamp ${index + 1}`,
  }));
  const lampTerminals = functions.flatMap((item) => [
    { key: `${item.key}-line`, label: `${item.label} line`, role: "LINE" as const, functionKey: item.key },
    { key: `${item.key}-neutral`, label: `${item.label} neutral`, role: "NEUTRAL" as const, functionKey: item.key },
  ]);
  const connections = functions.flatMap((item) => [
    { key: `${item.key}-line-feed`, fromTerminalKey: "line", toTerminalKey: `${item.key}-line`, kind: "fixed-feed-through" as const },
    { key: `${item.key}-neutral-feed`, fromTerminalKey: "neutral", toTerminalKey: `${item.key}-neutral`, kind: "fixed-feed-through" as const },
    { key: `${item.key}-load`, fromTerminalKey: `${item.key}-line`, toTerminalKey: `${item.key}-neutral`, kind: "load-impedance" as const },
  ]);
  return {
    id: "multi-lamp-fixture",
    version: 1,
    label: "Multi-lamp fixture",
    category: "fixture",
    description: "Any positive number of parallel lamp holders on one fixture feed.",
    functions,
    terminals: [
      { key: "line", label: "Fixture line", role: "LINE" },
      { key: "neutral", label: "Fixture neutral", role: "NEUTRAL" },
      ...lampTerminals,
    ],
    internalConnections: connections,
    lampHolders: functions.map((item) => ({ key: item.key, functionKey: item.key, label: item.label })),
    controlInterfaces: functions.map((item) => ({ functionKey: item.key, role: "controlled-load" as const, method: "hardwired-relay" as const })),
  };
}

const fanLightFixture: ElectricalPresetDefinition = {
  id: "fan-light-fixture",
  version: 1,
  label: "Fan/light fixture",
  category: "fixture",
  description: "Independent fan and light loads with a shared neutral input.",
  functions: [
    { key: "light", kind: "fixture-light-load", label: "Light" },
    { key: "fan", kind: "fan-motor", label: "Fan" },
  ],
  terminals: [
    { key: "light-line", label: "Light line", role: "LINE", functionKey: "light" },
    { key: "fan-line", label: "Fan line", role: "LINE", functionKey: "fan" },
    { key: "neutral", label: "Shared neutral", role: "NEUTRAL" },
    { key: "light-neutral", label: "Light neutral", role: "NEUTRAL", functionKey: "light" },
    { key: "fan-neutral", label: "Fan neutral", role: "NEUTRAL", functionKey: "fan" },
  ],
  internalConnections: [
    { key: "light-neutral-feed", fromTerminalKey: "neutral", toTerminalKey: "light-neutral", kind: "fixed-feed-through" },
    { key: "fan-neutral-feed", fromTerminalKey: "neutral", toTerminalKey: "fan-neutral", kind: "fixed-feed-through" },
    { key: "light-load", fromTerminalKey: "light-line", toTerminalKey: "light-neutral", kind: "load-impedance" },
    { key: "fan-load", fromTerminalKey: "fan-line", toTerminalKey: "fan-neutral", kind: "load-impedance" },
  ],
  lampHolders: [{ key: "light", functionKey: "light", label: "Light" }],
  controlInterfaces: [
    { functionKey: "light", role: "controlled-load", method: "hardwired-relay" },
    { functionKey: "fan", role: "controlled-load", method: "hardwired-relay" },
  ],
};

const smartBulb: ElectricalPresetDefinition = {
  id: "smart-bulb",
  version: 1,
  label: "Smart bulb",
  category: "light-source",
  description: "A powered lamp load whose logical controls are separate from its power cutoff.",
  functions: [{ key: "light", kind: "fixture-light-load", label: "Smart light" }],
  terminals: [
    { key: "line", label: "Line", role: "LINE", functionKey: "light" },
    { key: "neutral", label: "Neutral", role: "NEUTRAL", functionKey: "light" },
  ],
  internalConnections: [
    { key: "lamp-load", fromTerminalKey: "line", toTerminalKey: "neutral", kind: "load-impedance", label: "Smart bulb load" },
  ],
  controlInterfaces: [
    { functionKey: "light", role: "controlled-load", method: "wireless-direct" },
    { functionKey: "light", role: "controlled-load", method: "hub-app" },
    { functionKey: "light", role: "controlled-load", method: "scene-automation" },
  ],
};

const staticPresets: Readonly<
  Record<Exclude<BuiltInElectricalPresetId, "multi-lamp-fixture">, ElectricalPresetDefinition>
> = {
  "single-pole-switch": singlePoleSwitch,
  "multi-way-endpoint": multiWayEndpoint,
  "multi-way-intermediate": multiWayIntermediate,
  "duplex-receptacle": duplexReceptacle("duplex-receptacle", "connected"),
  "split-duplex-receptacle": duplexReceptacle("split-duplex-receptacle", "disconnected"),
  "gfci-receptacle": gfciReceptacle,
  "smart-switch": smartSwitch,
  "smart-aux-companion": smartAuxCompanion,
  relay,
  "simple-light-fixture": simpleLightFixture,
  "fan-light-fixture": fanLightFixture,
  "smart-bulb": smartBulb,
};

export const BUILT_IN_ELECTRICAL_PRESETS: readonly {
  id: BuiltInElectricalPresetId;
  label: string;
  category: ElectricalPresetCategory;
  parameterized?: "lamp-count";
}[] = [
  ...Object.values(staticPresets).map(({ id, label, category }) => ({
    id: id as BuiltInElectricalPresetId,
    label,
    category,
  })),
  {
    id: "multi-lamp-fixture",
    label: "Multi-lamp fixture",
    category: "fixture",
    parameterized: "lamp-count",
  },
];

export function getBuiltInElectricalPreset(
  id: BuiltInElectricalPresetId,
  parameters: { lampCount?: number } = {},
): ElectricalPresetDefinition {
  if (id === "multi-lamp-fixture") {
    return createMultiLampFixturePreset(parameters.lampCount ?? 2);
  }
  return staticPresets[id];
}

function mergeRecords<T extends { id: string }>(
  collection: string,
  records: readonly (readonly T[] | undefined)[],
): T[] {
  const merged = records.flatMap((items) => items ?? []);
  const seen = new Set<string>();
  for (const item of merged) {
    if (seen.has(item.id)) {
      throw new TypeError(`Duplicate ${collection} ID while merging: ${item.id}.`);
    }
    seen.add(item.id);
  }
  return merged;
}

/** Combines preset fragments without silently crossing property boundaries. */
export function mergeElectricalTopologies(
  propertyId: string,
  ...topologies: readonly ElectricalTopology[]
): ElectricalTopology {
  assertNonEmpty(propertyId, "propertyId");
  for (const topology of topologies) {
    if (topology.propertyId !== propertyId) {
      throw new TypeError(
        `Cannot merge topology for property ${topology.propertyId} into ${propertyId}.`,
      );
    }
  }
  return {
    propertyId,
    nodes: mergeRecords("node", topologies.map((item) => item.nodes)),
    conductors: mergeRecords("conductor", topologies.map((item) => item.conductors)),
    conductorEnds: mergeRecords("conductor end", topologies.map((item) => item.conductorEnds)),
    internalConnections: mergeRecords("internal connection", topologies.map((item) => item.internalConnections)),
    sources: mergeRecords("source", topologies.map((item) => item.sources)),
    cables: mergeRecords("cable", topologies.map((item) => item.cables)),
    cableEnds: mergeRecords("cable end", topologies.map((item) => item.cableEnds)),
    traceGaps: mergeRecords("trace gap", topologies.map((item) => item.traceGaps)),
    assertions: mergeRecords("assertion", topologies.map((item) => item.assertions)),
    contactStateGroups: mergeRecords("contact-state group", topologies.map((item) => item.contactStateGroups)),
    assetFunctions: mergeRecords("asset function", topologies.map((item) => item.assetFunctions)),
    controlGroups: mergeRecords("control group", topologies.map((item) => item.controlGroups)),
    controlMembers: mergeRecords("control member", topologies.map((item) => item.controlMembers)),
    controlLinks: mergeRecords("control link", topologies.map((item) => item.controlLinks)),
    sharedNeutralGroups: mergeRecords("shared-neutral group", topologies.map((item) => item.sharedNeutralGroups)),
    sharedNeutralMembers: mergeRecords("shared-neutral member", topologies.map((item) => item.sharedNeutralMembers)),
    panelFeeders: mergeRecords("panel feeder", topologies.map((item) => item.panelFeeders)),
  };
}

export interface ConductorConnectionOptions {
  propertyId: string;
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind?: ConductorKind;
  electricalClass?: ConductorElectricalClass;
  cableId?: string;
  certainty?: Certainty;
}

/** Creates the conductor and its mandatory A/B endpoint pair together. */
export function createConductorConnection(
  options: ConductorConnectionOptions,
): { conductor: Conductor; ends: readonly [ConductorEnd, ConductorEnd] } {
  assertNonEmpty(options.propertyId, "propertyId");
  assertNonEmpty(options.id, "conductor id");
  assertNonEmpty(options.fromNodeId, "fromNodeId");
  assertNonEmpty(options.toNodeId, "toNodeId");
  const certainty = options.certainty ?? "assumed";
  return {
    conductor: {
      id: options.id,
      propertyId: options.propertyId,
      kind: options.kind ?? "standalone",
      electricalClass: options.electricalClass ?? "unknown",
      cableId: options.cableId,
      certainty,
    },
    ends: [
      { id: `${options.id}:end:a`, propertyId: options.propertyId, conductorId: options.id, designation: "A", nodeId: options.fromNodeId, certainty },
      { id: `${options.id}:end:b`, propertyId: options.propertyId, conductorId: options.id, designation: "B", nodeId: options.toNodeId, certainty },
    ],
  };
}

export interface ControlEndpointInput {
  functionId: string;
  method?: ControlMethod;
}

export interface ManyToManyControlOptions {
  propertyId: string;
  idPrefix: string;
  label?: string;
  controllers: readonly ControlEndpointInput[];
  loads: readonly ControlEndpointInput[];
  companions?: readonly ControlEndpointInput[];
  method?: ControlMethod;
  certainty?: Certainty;
}

export interface ManyToManyControlPreset {
  group: ControlGroup;
  members: readonly ControlMember[];
  links: readonly ControlLink[];
}

/** Creates a Cartesian many-controller-to-many-load logical control graph. */
export function createManyToManyControlPreset(
  options: ManyToManyControlOptions,
): ManyToManyControlPreset {
  assertNonEmpty(options.propertyId, "propertyId");
  assertNonEmpty(options.idPrefix, "idPrefix");
  if (options.controllers.length === 0 || options.loads.length === 0) {
    throw new RangeError("A control group requires at least one controller and one load.");
  }
  const group: ControlGroup = {
    id: `${options.idPrefix}:control-group`,
    propertyId: options.propertyId,
    label: options.label,
  };
  const defaultMethod = options.method ?? "custom";
  const controllers = [...new Map(options.controllers.map((item) => [item.functionId, item])).values()];
  const loads = [...new Map(options.loads.map((item) => [item.functionId, item])).values()];
  const companions = [...new Map((options.companions ?? []).map((item) => [item.functionId, item])).values()];
  const memberInputs: readonly [ControlRole, ControlEndpointInput[]][] = [
    ["controller", controllers],
    ["companion", companions],
    ["controlled-load", loads],
  ];
  const members = memberInputs.flatMap(([role, items]) =>
    items.map((item, index) => ({
      id: `${options.idPrefix}:member:${role}:${index}`,
      propertyId: options.propertyId,
      controlGroupId: group.id,
      assetFunctionId: item.functionId,
      role,
      method: item.method ?? defaultMethod,
      sortOrder: index,
    })),
  );
  const controlSources = [...controllers, ...companions];
  const links = controlSources.flatMap((controller, controllerIndex) =>
    loads.map((load, loadIndex) => ({
      id: `${options.idPrefix}:link:${controllerIndex}:${loadIndex}`,
      propertyId: options.propertyId,
      controlGroupId: group.id,
      fromFunctionId: controller.functionId,
      toFunctionId: load.functionId,
      method: controller.method ?? options.method ?? load.method ?? defaultMethod,
      certainty: options.certainty ?? "assumed",
    })),
  );
  return { group, members, links };
}

export interface SharedNeutralPresetOptions {
  propertyId: string;
  idPrefix: string;
  label?: string;
  circuitIds: readonly string[];
  conductorIds?: readonly string[];
  certainty?: Certainty;
}

export interface SharedNeutralPreset {
  sourceGroupId: string;
  group: SharedNeutralGroup;
  members: readonly SharedNeutralMember[];
}

export function createSharedNeutralPreset(
  options: SharedNeutralPresetOptions,
): SharedNeutralPreset {
  assertNonEmpty(options.propertyId, "propertyId");
  assertNonEmpty(options.idPrefix, "idPrefix");
  const circuitIds = [...new Set(options.circuitIds)];
  const conductorIds = [...new Set(options.conductorIds ?? [])];
  if (circuitIds.length < 2) {
    throw new RangeError("A shared-neutral group requires at least two circuits.");
  }
  const group: SharedNeutralGroup = {
    id: `${options.idPrefix}:shared-neutral-group`,
    propertyId: options.propertyId,
    label: options.label,
    certainty: options.certainty ?? "assumed",
  };
  const members: SharedNeutralMember[] = [
    ...circuitIds.map((circuitId, index) => ({
      id: `${options.idPrefix}:shared-neutral:circuit:${index}`,
      propertyId: options.propertyId,
      sharedNeutralGroupId: group.id,
      circuitId,
      role: "circuit",
    })),
    ...conductorIds.map((conductorId, index) => ({
      id: `${options.idPrefix}:shared-neutral:conductor:${index}`,
      propertyId: options.propertyId,
      sharedNeutralGroupId: group.id,
      conductorId,
      role: "neutral-conductor",
    })),
  ];
  return { sourceGroupId: group.id, group, members };
}

export interface PanelFeederPresetOptions {
  propertyId: string;
  idPrefix: string;
  upstreamCircuitId: string;
  downstreamPanelAssetId: string;
}

export function createPanelFeederPreset(
  options: PanelFeederPresetOptions,
): PanelFeeder {
  assertNonEmpty(options.propertyId, "propertyId");
  assertNonEmpty(options.idPrefix, "idPrefix");
  assertNonEmpty(options.upstreamCircuitId, "upstreamCircuitId");
  assertNonEmpty(options.downstreamPanelAssetId, "downstreamPanelAssetId");
  return {
    id: `${options.idPrefix}:panel-feeder`,
    propertyId: options.propertyId,
    upstreamCircuitId: options.upstreamCircuitId,
    downstreamPanelAssetId: options.downstreamPanelAssetId,
  };
}
