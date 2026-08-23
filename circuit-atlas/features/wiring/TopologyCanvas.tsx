"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  fallbackTopologyLayout,
  layoutTopology,
  type TopologyLayout,
  type TopologyLayoutDirection,
} from "./layout";
import {
  isSameTopologySelection,
  selectionForEdge,
  selectionForNode,
  type TopologySelection,
  type TopologySelectionHandler,
  type TopologyVisualEdge,
  type TopologyVisualModel,
  type TopologyVisualNode,
} from "./model";
import {
  TopologyEdge,
  type TopologyFlowEdge,
} from "./TopologyEdge";
import {
  TopologyNode,
  type TopologyFlowNode,
} from "./TopologyNode";
import { TopologyLegend } from "./TopologyLegend";
import styles from "./wiring.module.css";

const nodeTypes: NodeTypes = { topologyItem: TopologyNode };
const edgeTypes: EdgeTypes = { topologyConnection: TopologyEdge };

export interface TopologyCanvasProps {
  model: TopologyVisualModel;
  selected?: TopologySelection | null;
  onSelectionChange?: TopologySelectionHandler;
  onExpansionChange?: (node: TopologyVisualNode, expanded: boolean) => void;
  direction?: TopologyLayoutDirection;
  height?: number | string;
  showLegend?: boolean;
  showMiniMap?: boolean;
  className?: string;
  ariaLabel?: string;
}

function nodeColor(node: TopologyFlowNode): string {
  switch (node.data.item.state) {
    case "conflict":
      return "#b13d36";
    case "gap":
      return "#9b776a";
    case "boundary":
      return "#85604e";
    case "possible":
      return "#b27617";
    default:
      return node.data.item.isSource ? "#167366" : "#84938e";
  }
}

interface SceneProps extends TopologyCanvasProps {
  direction: TopologyLayoutDirection;
}

function TopologyScene({
  model,
  selected,
  onSelectionChange,
  onExpansionChange,
  direction,
  showMiniMap,
  ariaLabel,
}: SceneProps) {
  const initialLayout = useMemo(
    () => fallbackTopologyLayout(model, { direction }),
    [model, direction],
  );
  const layoutKey = `${model.propertyId}:${model.id}:${model.revision ?? "current"}:${direction}`;
  const [resolvedLayout, setResolvedLayout] = useState<{
    key: string;
    value: TopologyLayout;
  } | null>(null);
  const layout =
    resolvedLayout?.key === layoutKey ? resolvedLayout.value : initialLayout;
  const isLayingOut = resolvedLayout?.key !== layoutKey;
  const reactFlow = useReactFlow<TopologyFlowNode, TopologyFlowEdge>();

  useEffect(() => {
    let active = true;

    void layoutTopology(model, { direction }).then((nextLayout) => {
      if (!active) return;
      setResolvedLayout({ key: layoutKey, value: nextLayout });
      window.requestAnimationFrame(() => {
        void reactFlow.fitView({ padding: 0.18, duration: 0 });
      });
    });

    return () => {
      active = false;
    };
  }, [direction, layoutKey, model, reactFlow]);

  const selectNode = useCallback(
    (node: TopologyVisualNode) => {
      onSelectionChange?.(selectionForNode(node), { origin: "canvas" });
    },
    [onSelectionChange],
  );
  const selectEdge = useCallback(
    (edge: TopologyVisualEdge) => {
      onSelectionChange?.(selectionForEdge(edge), { origin: "canvas" });
    },
    [onSelectionChange],
  );

  const nodes = useMemo<TopologyFlowNode[]>(
    () =>
      model.nodes.map((node) => ({
        id: node.id,
        type: "topologyItem",
        position: layout.positions.get(node.id) ?? { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        data: {
          item: node,
          direction,
          selected: isSameTopologySelection(selected, node.selection),
          onSelect: selectNode,
          onToggleExpansion: onExpansionChange,
        },
      })),
    [
      direction,
      layout.positions,
      model.nodes,
      onExpansionChange,
      selectNode,
      selected,
    ],
  );

  const edges = useMemo<TopologyFlowEdge[]>(
    () =>
      model.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "topologyConnection",
        focusable: false,
        selectable: false,
        markerEnd: edge.directed
          ? { type: MarkerType.ArrowClosed, width: 18, height: 18 }
          : undefined,
        data: {
          item: edge,
          selected: isSameTopologySelection(selected, selectionForEdge(edge)),
          onSelect: selectEdge,
        },
      })),
    [model.edges, selectEdge, selected],
  );

  return (
    <>
      <ReactFlow<TopologyFlowNode, TopologyFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        selectionOnDrag={false}
        minZoom={0.2}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        onPaneClick={() =>
          onSelectionChange?.(null, { origin: "canvas" })
        }
        aria-label={ariaLabel ?? `${model.title} wiring diagram`}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.2}
          color="#cbd4d0"
        />
        <Controls showInteractive={false} position="bottom-left" />
        {showMiniMap ? (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeColor={nodeColor}
            ariaLabel="Topology overview map"
          />
        ) : null}
      </ReactFlow>
      {isLayingOut ? (
        <span className={styles.layoutStatus} role="status">
          Arranging trace…
        </span>
      ) : null}
    </>
  );
}

export function TopologyCanvas({
  model,
  selected,
  onSelectionChange,
  onExpansionChange,
  direction = "RIGHT",
  height = 540,
  showLegend = true,
  showMiniMap = model.nodes.length > 24,
  className,
  ariaLabel,
}: TopologyCanvasProps) {
  if (model.nodes.length === 0) {
    return (
      <section
        className={`${styles.canvasEmpty} ${className ?? ""}`}
        style={{ minHeight: height }}
        aria-label={ariaLabel ?? `${model.title} wiring diagram`}
      >
        <strong>No wiring records in this trace</strong>
        <p>Add a connection or choose a different starting item.</p>
      </section>
    );
  }

  return (
    <section className={`${styles.canvasRegion} ${className ?? ""}`}>
      <div className={styles.canvasShell} style={{ height }}>
        <ReactFlowProvider>
          <TopologyScene
            model={model}
            selected={selected}
            onSelectionChange={onSelectionChange}
            onExpansionChange={onExpansionChange}
            direction={direction}
            showMiniMap={showMiniMap}
            ariaLabel={ariaLabel}
          />
        </ReactFlowProvider>
      </div>
      {showLegend ? <TopologyLegend model={model} /> : null}
    </section>
  );
}
