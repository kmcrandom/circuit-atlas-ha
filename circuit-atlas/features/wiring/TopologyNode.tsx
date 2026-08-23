import { memo } from "react";
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type {
  TopologyLayoutDirection,
} from "./layout";
import type { TopologyVisualNode } from "./model";
import { confidenceLabels, entityKindLabels, stateLabels } from "./semantics";
import styles from "./wiring.module.css";

export type TopologyNodeData = {
  item: TopologyVisualNode;
  selected: boolean;
  direction: TopologyLayoutDirection;
  onSelect: (node: TopologyVisualNode) => void;
  onToggleExpansion?: (node: TopologyVisualNode, expanded: boolean) => void;
} & Record<string, unknown>;

export type TopologyFlowNode = Node<TopologyNodeData, "topologyItem">;

function TopologyNodeComponent({ data }: NodeProps<TopologyFlowNode>) {
  const { item, selected, direction, onSelect, onToggleExpansion } = data;
  const targetPosition = direction === "RIGHT" ? Position.Left : Position.Top;
  const sourcePosition = direction === "RIGHT" ? Position.Right : Position.Bottom;
  const state = item.state ?? "normal";
  const kindLabel = entityKindLabels[item.kind];
  const description = [
    kindLabel,
    item.code,
    item.location,
    item.confidence ? confidenceLabels[item.confidence] : undefined,
    state !== "normal" ? stateLabels[state] : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <article
      className={`${styles.topologyNode} ${styles[`nodeState_${state}`]} ${selected ? styles.topologyNodeSelected : ""}`}
      data-kind={item.kind}
    >
      <Handle
        className={styles.nodeHandle}
        type="target"
        position={targetPosition}
        isConnectable={false}
      />
      <button
        type="button"
        className={`${styles.nodeSelectButton} nodrag nopan`}
        aria-label={`Select ${item.label}. ${description}`}
        aria-pressed={selected}
        onClick={() => onSelect(item)}
      >
        <span className={styles.nodeHeader}>
          <span className={styles.nodeKind}>{kindLabel}</span>
          {item.code ? <span className={styles.nodeCode}>{item.code}</span> : null}
        </span>
        <strong className={styles.nodeLabel}>{item.label}</strong>
        {item.location || item.description ? (
          <span className={styles.nodeDescription}>
            {item.location ?? item.description}
          </span>
        ) : null}
        <span className={styles.nodeBadges}>
          {item.isSource ? (
            <span className={styles.sourceBadge}>Source</span>
          ) : null}
          {item.confidence ? (
            <span
              className={`${styles.confidenceBadge} ${styles[`confidence_${item.confidence}`]}`}
            >
              {confidenceLabels[item.confidence]}
            </span>
          ) : null}
          {state !== "normal" ? (
            <span className={styles.stateBadge}>{stateLabels[state]}</span>
          ) : null}
        </span>
      </button>
      {item.expansion && item.expansion.hiddenNeighborCount > 0 ? (
        <button
          type="button"
          className={`${styles.expandButton} nodrag nopan`}
          aria-expanded={item.expansion.expanded}
          onClick={() =>
            onToggleExpansion?.(item, !item.expansion?.expanded)
          }
        >
          {item.expansion.expanded
            ? "Show less"
            : `Show ${item.expansion.hiddenNeighborCount} more`}
        </button>
      ) : null}
      <Handle
        className={styles.nodeHandle}
        type="source"
        position={sourcePosition}
        isConnectable={false}
      />
    </article>
  );
}

export const TopologyNode = memo(TopologyNodeComponent);
