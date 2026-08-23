import type { TopologyVisualModel } from "./model";
import type { ElkNode } from "elkjs/lib/elk-api";

export type TopologyLayoutDirection = "RIGHT" | "DOWN";

export interface TopologyPosition {
  x: number;
  y: number;
}

export interface TopologyLayout {
  positions: ReadonlyMap<string, TopologyPosition>;
  width: number;
  height: number;
  engine: "elk" | "fallback";
}

export interface TopologyLayoutOptions {
  direction?: TopologyLayoutDirection;
  nodeWidth?: number;
  nodeHeight?: number;
  layerGap?: number;
  nodeGap?: number;
}

const defaults = {
  direction: "RIGHT" as const,
  nodeWidth: 220,
  nodeHeight: 116,
  layerGap: 96,
  nodeGap: 48,
};

/**
 * Deterministic, dependency-free layout used during SSR/tests and if ELK fails.
 * It assigns breadth-first layers but never changes or invents connections.
 */
export function fallbackTopologyLayout(
  model: TopologyVisualModel,
  options: TopologyLayoutOptions = {},
): TopologyLayout {
  const config = { ...defaults, ...options };
  const known = new Set(model.nodes.map((node) => node.id));
  const neighbors = new Map<string, string[]>();

  for (const node of model.nodes) neighbors.set(node.id, []);
  for (const edge of model.edges) {
    if (!known.has(edge.source) || !known.has(edge.target)) continue;
    neighbors.get(edge.source)?.push(edge.target);
    neighbors.get(edge.target)?.push(edge.source);
  }

  const rootCandidates = [
    model.nodes.filter((node) => node.isRoot).map((node) => node.id),
    [...model.sourceNodeIds],
    model.focusNodeId ? [model.focusNodeId] : [],
  ];
  const preferredRoots =
    rootCandidates.find((candidates) => candidates.some((id) => known.has(id))) ??
    [];
  const roots = preferredRoots
    .filter((id, index, ids) => known.has(id) && ids.indexOf(id) === index);
  if (roots.length === 0 && model.nodes[0]) roots.push(model.nodes[0].id);
  const depth = new Map<string, number>();
  const queue = roots.map((id) => ({ id, depth: 0 }));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || depth.has(current.id)) continue;
    depth.set(current.id, current.depth);

    for (const neighbor of neighbors.get(current.id) ?? []) {
      if (!depth.has(neighbor)) {
        queue.push({ id: neighbor, depth: current.depth + 1 });
      }
    }
  }

  let disconnectedDepth = Math.max(0, ...depth.values()) + 1;
  for (const node of model.nodes) {
    if (!depth.has(node.id)) {
      depth.set(node.id, disconnectedDepth);
      disconnectedDepth += 1;
    }
  }

  const layers = new Map<number, string[]>();
  for (const node of model.nodes) {
    const layer = depth.get(node.id) ?? 0;
    const entries = layers.get(layer) ?? [];
    entries.push(node.id);
    layers.set(layer, entries);
  }

  const positions = new Map<string, TopologyPosition>();
  let maxCrossAxis = 0;
  for (const [layer, ids] of [...layers.entries()].sort(([a], [b]) => a - b)) {
    ids.forEach((id, index) => {
      const layerAxis = layer * (config.nodeWidth + config.layerGap);
      const crossAxis = index * (config.nodeHeight + config.nodeGap);
      maxCrossAxis = Math.max(maxCrossAxis, crossAxis);
      positions.set(
        id,
        config.direction === "RIGHT"
          ? { x: layerAxis, y: crossAxis }
          : { x: crossAxis, y: layer * (config.nodeHeight + config.layerGap) },
      );
    });
  }

  const finalLayer = Math.max(0, ...depth.values());
  return {
    positions,
    width:
      config.direction === "RIGHT"
        ? finalLayer * (config.nodeWidth + config.layerGap) + config.nodeWidth
        : maxCrossAxis + config.nodeWidth,
    height:
      config.direction === "RIGHT"
        ? maxCrossAxis + config.nodeHeight
        : finalLayer * (config.nodeHeight + config.layerGap) + config.nodeHeight,
    engine: "fallback",
  };
}

/**
 * Browser-only ELK adapter. Dynamic import keeps the layout engine out of the
 * server module graph used by Next.js. A deterministic layout is
 * returned whenever ELK is unavailable.
 */
export async function layoutTopology(
  model: TopologyVisualModel,
  options: TopologyLayoutOptions = {},
): Promise<TopologyLayout> {
  const fallback = fallbackTopologyLayout(model, options);
  if (typeof window === "undefined" || model.nodes.length === 0) return fallback;

  const config = { ...defaults, ...options };

  try {
    const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
    const elk = new ELK();
    const elkGraph: ElkNode = {
      id: model.id,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": config.direction,
        "elk.spacing.nodeNode": String(config.nodeGap),
        "elk.layered.spacing.nodeNodeBetweenLayers": String(config.layerGap),
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.layered.cycleBreaking.strategy": "GREEDY",
      },
      children: model.nodes.map((node) => ({
        id: node.id,
        width: config.nodeWidth,
        height: config.nodeHeight,
      })),
      edges: model.edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    };
    const graph = await elk.layout(elkGraph);

    const positions = new Map<string, TopologyPosition>();
    for (const child of graph.children ?? []) {
      positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
    }

    if (positions.size !== model.nodes.length) return fallback;

    return {
      positions,
      width: graph.width ?? fallback.width,
      height: graph.height ?? fallback.height,
      engine: "elk",
    };
  } catch {
    return fallback;
  }
}
