"use client";

import {
  isSameTopologySelection,
  selectionForEdge,
  selectionForNode,
  type TopologySelection,
  type TopologySelectionHandler,
  type TopologyVisualNode,
  type TraceConfidence,
} from "./model";
import {
  confidenceLabels,
  entityKindLabels,
  relationshipLabels,
  stateLabels,
} from "./semantics";
import styles from "./wiring.module.css";

export interface TraceTableProps {
  model: import("./model").TopologyVisualModel;
  selected?: TopologySelection | null;
  onSelectionChange?: TopologySelectionHandler;
  className?: string;
}

function Confidence({ value }: { value?: TraceConfidence }) {
  if (!value) return <span className={styles.mutedValue}>Not recorded</span>;

  return (
    <span
      className={`${styles.tableConfidence} ${styles[`confidence_${value}`]}`}
    >
      {confidenceLabels[value]}
    </span>
  );
}

function ItemButton({
  node,
  selected,
  onSelect,
}: {
  node: TopologyVisualNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.traceItemButton} ${selected ? styles.traceItemButtonSelected : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span>{node.label}</span>
      <small>
        {entityKindLabels[node.kind]}
        {node.code ? ` · ${node.code}` : ""}
      </small>
    </button>
  );
}

export function TraceTable({
  model,
  selected,
  onSelectionChange,
  className,
}: TraceTableProps) {
  const nodesById = new Map(model.nodes.map((node) => [node.id, node]));
  const connectedNodeIds = new Set(
    model.edges.flatMap((edge) => [edge.source, edge.target]),
  );
  const isolatedNodes = model.nodes.filter(
    (node) => !connectedNodeIds.has(node.id),
  );

  return (
    <section
      className={`${styles.traceTableRegion} ${className ?? ""}`}
      aria-labelledby={`${model.id}-trace-table-heading`}
    >
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>Text view</span>
          <h2 id={`${model.id}-trace-table-heading`}>Trace connections</h2>
        </div>
        <span className={styles.itemCount}>
          {model.edges.length} {model.edges.length === 1 ? "connection" : "connections"}
        </span>
      </div>

      {model.edges.length > 0 ? (
        <div className={styles.tableScroller} tabIndex={0}>
          <table className={styles.traceTable}>
            <caption className={styles.visuallyHidden}>
              Text equivalent of every connection shown in the wiring diagram
            </caption>
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">Relationship</th>
                <th scope="col">To</th>
                <th scope="col">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {model.edges.map((edge) => {
                const source = nodesById.get(edge.source);
                const target = nodesById.get(edge.target);
                const edgeSelection = selectionForEdge(edge);
                const edgeSelected = isSameTopologySelection(
                  selected,
                  edgeSelection,
                );

                return (
                  <tr
                    key={edge.id}
                    className={edgeSelected ? styles.traceRowSelected : undefined}
                  >
                    <td>
                      {source ? (
                        <ItemButton
                          node={source}
                          selected={isSameTopologySelection(
                            selected,
                            source.selection,
                          )}
                          onSelect={() =>
                            onSelectionChange?.(selectionForNode(source), {
                              origin: "trace-table",
                            })
                          }
                        />
                      ) : (
                        <span className={styles.unknownReference}>
                          Unknown item ({edge.source})
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`${styles.relationshipButton} ${edgeSelected ? styles.relationshipButtonSelected : ""}`}
                        aria-pressed={edgeSelected}
                        onClick={() =>
                          onSelectionChange?.(edgeSelection, {
                            origin: "trace-table",
                          })
                        }
                      >
                        <strong>{edge.label}</strong>
                        <span>{relationshipLabels[edge.relationship]}</span>
                        {edge.possibleStateLabel ? (
                          <small>{edge.possibleStateLabel}</small>
                        ) : null}
                        {edge.state && edge.state !== "normal" ? (
                          <small>{stateLabels[edge.state]}</small>
                        ) : null}
                      </button>
                    </td>
                    <td>
                      {target ? (
                        <ItemButton
                          node={target}
                          selected={isSameTopologySelection(
                            selected,
                            target.selection,
                          )}
                          onSelect={() =>
                            onSelectionChange?.(selectionForNode(target), {
                              origin: "trace-table",
                            })
                          }
                        />
                      ) : (
                        <span className={styles.unknownReference}>
                          Unknown item ({edge.target})
                        </span>
                      )}
                    </td>
                    <td>
                      <Confidence value={edge.confidence} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.emptyInline}>No connections are recorded.</p>
      )}

      {isolatedNodes.length > 0 ? (
        <div className={styles.isolatedItems}>
          <h3>Items without a displayed connection</h3>
          <ul>
            {isolatedNodes.map((node) => (
              <li key={node.id}>
                <ItemButton
                  node={node}
                  selected={isSameTopologySelection(selected, node.selection)}
                  onSelect={() =>
                    onSelectionChange?.(selectionForNode(node), {
                      origin: "trace-table",
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {model.issues && model.issues.length > 0 ? (
        <section
          className={styles.issueList}
          aria-labelledby={`${model.id}-trace-issues-heading`}
        >
          <div className={styles.issueHeading}>
            <h3 id={`${model.id}-trace-issues-heading`}>Needs review</h3>
            <span>{model.issues.length}</span>
          </div>
          <ul>
            {model.issues.map((issue) => (
              <li key={issue.id} data-issue-kind={issue.kind}>
                <span className={styles.issueKind}>{issue.kind}</span>
                <div>
                  <strong>{issue.title}</strong>
                  <p>{issue.detail}</p>
                </div>
                {issue.selection ? (
                  <button
                    type="button"
                    onClick={() =>
                      onSelectionChange?.(issue.selection ?? null, {
                        origin: "issue-list",
                      })
                    }
                  >
                    Show item
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
