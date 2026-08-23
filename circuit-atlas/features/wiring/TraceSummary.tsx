import type { TopologyVisualModel } from "./model";
import styles from "./wiring.module.css";

export interface TraceSummaryContent {
  heading: string;
  statements: string[];
  caution: string;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function summarizeTopology(
  model: TopologyVisualModel,
): TraceSummaryContent {
  const nodesById = new Map(model.nodes.map((node) => [node.id, node]));
  const focus = model.focusNodeId
    ? nodesById.get(model.focusNodeId)
    : undefined;
  const sourceLabels = model.sourceNodeIds
    .map((id) => nodesById.get(id)?.label)
    .filter((label): label is string => Boolean(label));
  const gapCount =
    model.issues?.filter((issue) => issue.kind === "gap").length ?? 0;
  const conflictCount =
    model.issues?.filter((issue) => issue.kind === "conflict").length ?? 0;
  const conditionalCount = model.edges.filter(
    (edge) => edge.relationship === "conditional-contact",
  ).length;
  const boundaryCount = model.edges.filter(
    (edge) =>
      edge.state === "boundary" ||
      edge.relationship === "load-boundary" ||
      edge.relationship === "isolation-boundary" ||
      edge.relationship === "signal-boundary",
  ).length;

  const statements: string[] = [];
  if (model.narrative?.overview) statements.push(model.narrative.overview);

  statements.push(
    `${focus ? `Starting at ${focus.label}, this trace` : "This trace"} contains ${plural(model.nodes.length, "item")} and ${plural(model.edges.length, "documented connection")}.`,
  );

  if (sourceLabels.length === 0) {
    statements.push("No source breaker is identified in this trace.");
  } else if (sourceLabels.length === 1) {
    statements.push(`The identified source is ${sourceLabels[0]}.`);
  } else {
    statements.push(
      `The identified sources are ${sourceLabels.join(", ")}. Multiple sources remain visible rather than being reduced to one.`,
    );
  }

  if (conditionalCount > 0) {
    statements.push(
      `${plural(conditionalCount, "possible switch-state connection")} ${conditionalCount === 1 ? "is" : "are"} included. These show connectivity possible across valid switch states, not what is energized now.`,
    );
  }

  if (boundaryCount > 0) {
    statements.push(
      `The trace stops at ${plural(boundaryCount, "documented boundary", "documented boundaries")} rather than continuing through a load, isolation point, or signal-only relationship.`,
    );
  }

  if (gapCount > 0 || conflictCount > 0) {
    statements.push(
      `Review ${plural(gapCount, "unresolved gap")} and ${plural(conflictCount, "conflict")} shown below; uncertain information has not been treated as confirmed.`,
    );
  }

  statements.push(...(model.narrative?.statements ?? []));

  return {
    heading: focus ? `Trace from ${focus.label}` : model.title,
    statements,
    caution:
      "This is a documentation trace. It does not show whether conductors are energized or whether equipment is safe to work on.",
  };
}

export interface TraceSummaryProps {
  model: TopologyVisualModel;
  className?: string;
}

export function TraceSummary({ model, className }: TraceSummaryProps) {
  const summary = summarizeTopology(model);

  return (
    <section
      className={`${styles.traceSummary} ${className ?? ""}`}
      aria-labelledby={`${model.id}-trace-summary-heading`}
    >
      <div>
        <span className={styles.eyebrow}>Trace summary</span>
        <h2 id={`${model.id}-trace-summary-heading`}>{summary.heading}</h2>
      </div>
      <div className={styles.summaryStatements}>
        {summary.statements.map((statement, index) => (
          <p key={`${index}-${statement}`}>{statement}</p>
        ))}
      </div>
      <p className={styles.safetyNote}>{summary.caution}</p>
    </section>
  );
}
