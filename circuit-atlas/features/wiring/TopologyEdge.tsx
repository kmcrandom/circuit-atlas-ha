import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { TopologyVisualEdge } from "./model";
import { confidenceLabels } from "./semantics";
import styles from "./wiring.module.css";

export type TopologyEdgeData = {
  item: TopologyVisualEdge;
  selected: boolean;
  onSelect: (edge: TopologyVisualEdge) => void;
} & Record<string, unknown>;

export type TopologyFlowEdge = Edge<TopologyEdgeData, "topologyConnection">;

function appearance(edge: TopologyVisualEdge): {
  stroke: string;
  dash?: string;
  width: number;
} {
  if (edge.state === "conflict") {
    return { stroke: "#b13d36", dash: "4 3", width: 3 };
  }
  if (edge.state === "gap" || edge.relationship === "unknown") {
    return { stroke: "#8b6f67", dash: "3 7", width: 2.5 };
  }
  if (
    edge.state === "boundary" ||
    edge.relationship === "load-boundary" ||
    edge.relationship === "isolation-boundary"
  ) {
    return { stroke: "#7a5547", dash: "2 3", width: 3 };
  }

  switch (edge.relationship) {
    case "conditional-contact":
    case "manual-assertion":
      return { stroke: "#b27617", dash: "8 6", width: 2.5 };
    case "wireless-control":
    case "wired-control":
    case "signal-boundary":
      return { stroke: "#735a9b", dash: "2 6", width: 2.5 };
    case "grounding-bonding":
      return { stroke: "#4d7c59", dash: "8 4", width: 2.5 };
    case "conductor":
      return { stroke: "#167366", width: 3 };
    default:
      return { stroke: "#52615d", width: 2.5 };
  }
}

function TopologyEdgeComponent(props: EdgeProps<TopologyFlowEdge>) {
  const {
    id,
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    markerEnd,
    data,
  } = props;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  if (!data) return null;

  const edgeAppearance = appearance(data.item);
  const detail = [
    data.item.label,
    data.item.possibleStateLabel,
    data.item.confidence ? confidenceLabels[data.item.confidence] : undefined,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={{
          stroke: edgeAppearance.stroke,
          strokeWidth: data.selected ? edgeAppearance.width + 1.5 : edgeAppearance.width,
          strokeDasharray: edgeAppearance.dash,
        }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`${styles.edgeLabel} ${data.selected ? styles.edgeLabelSelected : ""} nodrag nopan`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          aria-label={`Select connection: ${detail}`}
          aria-pressed={data.selected}
          onClick={() => data.onSelect(data.item)}
        >
          <span>{data.item.label}</span>
          {data.item.possibleStateLabel ? (
            <small>{data.item.possibleStateLabel}</small>
          ) : null}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

export const TopologyEdge = memo(TopologyEdgeComponent);
