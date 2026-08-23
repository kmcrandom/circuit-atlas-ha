"use client";

import { useId, useState } from "react";
import type {
  TopologySelection,
  TopologySelectionHandler,
  TopologyVisualNode,
  TopologyVisualModel,
} from "./model";
import { TopologyCanvas } from "./TopologyCanvas";
import { TraceSummary } from "./TraceSummary";
import { TraceTable } from "./TraceTable";
import styles from "./wiring.module.css";

export type WiringTraceViewMode = "diagram" | "table" | "both";

export interface WiringTraceViewProps {
  model: TopologyVisualModel;
  selected?: TopologySelection | null;
  onSelectionChange?: TopologySelectionHandler;
  onExpansionChange?: (node: TopologyVisualNode, expanded: boolean) => void;
  defaultMode?: WiringTraceViewMode;
  canvasHeight?: number | string;
  className?: string;
}

export function WiringTraceView({
  model,
  selected,
  onSelectionChange,
  onExpansionChange,
  defaultMode = "both",
  canvasHeight,
  className,
}: WiringTraceViewProps) {
  const selectionScope = `${model.propertyId}:${model.id}`;
  const [internalSelection, setInternalSelection] = useState<{
    scope: string;
    value: TopologySelection | null;
  }>({ scope: selectionScope, value: null });
  const [mode, setMode] = useState<WiringTraceViewMode>(defaultMode);
  const id = useId();
  const effectiveSelection =
    selected === undefined
      ? internalSelection.scope === selectionScope
        ? internalSelection.value
        : null
      : selected;

  const handleSelection: TopologySelectionHandler = (next, context) => {
    if (selected === undefined) {
      setInternalSelection({ scope: selectionScope, value: next });
    }
    onSelectionChange?.(next, context);
  };

  return (
    <section className={`${styles.wiringWorkspace} ${className ?? ""}`}>
      <TraceSummary model={model} />

      <div className={styles.viewToolbar}>
        <div>
          <span className={styles.eyebrow}>View trace</span>
          <strong>Diagram and text stay in sync</strong>
        </div>
        <div className={styles.segmentedControl} role="group" aria-label="Trace view">
          {(["diagram", "table", "both"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
            >
              {option === "table"
                ? "Text"
                : option === "both"
                  ? "Side by side"
                  : "Diagram"}
            </button>
          ))}
        </div>
      </div>

      <div
        id={`${id}-views`}
        className={`${styles.traceViews} ${mode === "both" ? styles.traceViewsBoth : ""}`}
      >
        {mode !== "table" ? (
          <TopologyCanvas
            model={model}
            selected={effectiveSelection}
            onSelectionChange={handleSelection}
            onExpansionChange={onExpansionChange}
            height={canvasHeight ?? (mode === "both" ? 680 : 560)}
            showLegend
          />
        ) : null}
        {mode !== "diagram" ? (
          <TraceTable
            model={model}
            selected={effectiveSelection}
            onSelectionChange={handleSelection}
          />
        ) : null}
      </div>
    </section>
  );
}
