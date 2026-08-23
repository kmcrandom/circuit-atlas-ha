import type {
  TopologyDisplayState,
  TopologyEntityKind,
  TopologyRelationshipKind,
  TopologyVisualModel,
  TraceConfidence,
} from "./model";

export const confidenceLabels: Record<TraceConfidence, string> = {
  unknown: "Unknown",
  assumed: "Assumed",
  inferred: "Inferred",
  "visually-observed": "Visually observed",
  "test-verified": "Test verified",
  "documentation-verified": "Documentation verified",
  conflicting: "Conflicting",
};

export const relationshipLabels: Record<TopologyRelationshipKind, string> = {
  conductor: "Conductor",
  "fixed-connection": "Fixed connection",
  "conditional-contact": "Possible switch-state connection",
  "load-boundary": "Load boundary",
  "isolation-boundary": "Isolation boundary",
  "signal-boundary": "Signal-only boundary",
  "grounding-bonding": "Grounding or bonding",
  "wired-control": "Wired control",
  "wireless-control": "Wireless or app control",
  "manual-assertion": "Manual circuit assertion",
  unknown: "Unknown connection",
};

export const entityKindLabels: Record<TopologyEntityKind, string> = {
  panel: "Panel",
  breaker: "Breaker",
  box: "Box",
  device: "Device",
  switch: "Switch",
  receptacle: "Receptacle",
  fixture: "Fixture",
  "light-source": "Light source",
  appliance: "Appliance",
  cable: "Cable",
  conductor: "Conductor",
  terminal: "Terminal",
  splice: "Splice",
  "open-end": "Open end",
  bond: "Bond point",
  "control-group": "Control group",
  connection: "Connection",
  gap: "Unresolved gap",
  unknown: "Unknown item",
  custom: "Custom item",
};

export const stateLabels: Record<TopologyDisplayState, string> = {
  normal: "Documented",
  possible: "Possible path",
  gap: "Unresolved gap",
  boundary: "Trace boundary",
  conflict: "Conflicting information",
};

export interface TopologyLegendItem {
  id: string;
  label: string;
  description: string;
  swatch: "solid" | "dashed" | "dotted" | "double" | "gap";
}

const relationshipLegend: Record<
  TopologyRelationshipKind,
  TopologyLegendItem
> = {
  conductor: {
    id: "conductor",
    label: "Physical conductor",
    description: "A recorded conductor connection between endpoints.",
    swatch: "solid",
  },
  "fixed-connection": {
    id: "fixed-connection",
    label: "Fixed connection",
    description: "A documented splice or fixed internal feed-through.",
    swatch: "solid",
  },
  "conditional-contact": {
    id: "conditional-contact",
    label: "Possible switch state",
    description:
      "A connection possible in at least one valid switch state; it does not show what is energized now.",
    swatch: "dashed",
  },
  "load-boundary": {
    id: "load-boundary",
    label: "Load boundary",
    description: "The electrical trace stops at a documented load.",
    swatch: "double",
  },
  "isolation-boundary": {
    id: "isolation-boundary",
    label: "Isolation boundary",
    description: "The electrical trace stops at an isolation boundary.",
    swatch: "double",
  },
  "signal-boundary": {
    id: "signal-boundary",
    label: "Signal-only boundary",
    description: "This relationship does not carry traced circuit power.",
    swatch: "dotted",
  },
  "grounding-bonding": {
    id: "grounding-bonding",
    label: "Grounding or bonding",
    description: "Recorded for context, but excluded from supply tracing.",
    swatch: "dashed",
  },
  "wired-control": {
    id: "wired-control",
    label: "Wired control",
    description: "A control relationship separate from circuit continuity.",
    swatch: "dotted",
  },
  "wireless-control": {
    id: "wireless-control",
    label: "Wireless/app control",
    description: "A logical control relationship, not a physical wire.",
    swatch: "dotted",
  },
  "manual-assertion": {
    id: "manual-assertion",
    label: "Manual assertion",
    description: "User-recorded circuit membership kept separate from tracing.",
    swatch: "dashed",
  },
  unknown: {
    id: "unknown",
    label: "Unknown connection",
    description: "A relationship that has not yet been identified.",
    swatch: "gap",
  },
};

const issueLegend: Record<"gap" | "conflict", TopologyLegendItem> = {
  gap: {
    id: "issue-gap",
    label: "Unresolved gap",
    description: "The trace cannot currently continue through this point.",
    swatch: "gap",
  },
  conflict: {
    id: "issue-conflict",
    label: "Conflict",
    description: "Two recorded or derived facts disagree; both remain visible.",
    swatch: "double",
  },
};

export function legendItemsForModel(
  model: TopologyVisualModel,
): TopologyLegendItem[] {
  const items: TopologyLegendItem[] = [];
  const seen = new Set<string>();

  for (const edge of model.edges) {
    const item = relationshipLegend[edge.relationship];
    if (!seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }

  const hasGap =
    model.nodes.some((node) => node.state === "gap" || node.kind === "gap") ||
    model.edges.some((edge) => edge.state === "gap") ||
    model.issues?.some((issue) => issue.kind === "gap");
  const hasConflict =
    model.nodes.some((node) => node.state === "conflict") ||
    model.edges.some((edge) => edge.state === "conflict") ||
    model.issues?.some((issue) => issue.kind === "conflict");

  if (hasGap && !seen.has(issueLegend.gap.id)) items.push(issueLegend.gap);
  if (hasConflict && !seen.has(issueLegend.conflict.id)) {
    items.push(issueLegend.conflict);
  }

  return items;
}
