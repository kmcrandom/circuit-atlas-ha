"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useId,
} from "react";
import {
  clamp,
  clampNormalized,
  getBoxDiagramGeometry,
  getBoxLayoutWarnings,
  getDefaultEntryAngle,
  getEntryPoint,
  getGangRangeLabel,
  getMountRect,
  normalizeGangCount,
  normalizeRotation,
} from "./geometry";
import type {
  BoxCableEntry,
  BoxDiagramSelection,
  BoxLayoutChange,
  BoxMountedDevice,
  BoxPhysicalLayoutModel,
  BoxTextEquivalentMode,
  BoxViewOrientation,
} from "./types";
import { BOX_ENTRY_SIDES } from "./types";
import styles from "./box-physical-layout.module.css";

export interface BoxPhysicalLayoutProps {
  model: BoxPhysicalLayoutModel;
  selected?: BoxDiagramSelection | null;
  onSelect?: (selection: BoxDiagramSelection) => void;
  className?: string;
  textEquivalent?: BoxTextEquivalentMode;
}

export interface BoxPhysicalLayoutEditorProps extends BoxPhysicalLayoutProps {
  onChange: (nextModel: BoxPhysicalLayoutModel, change: BoxLayoutChange) => void;
  onRequestAddMount?: () => void;
  onRequestAddCableEntry?: () => void;
  onRequestRemove?: (selection: BoxDiagramSelection) => void;
}

interface BoxLayoutFigureProps extends BoxPhysicalLayoutProps {
  onElementKeyDown?: (
    event: ReactKeyboardEvent<SVGGElement>,
    selection: BoxDiagramSelection,
  ) => void;
}

const ORIENTATION_LABELS: Record<BoxViewOrientation, string> = {
  "wall-front": "Finished-room side, looking into box",
  "ceiling-from-below": "Viewed from below",
  custom: "Custom recorded orientation",
};

function selectionMatches(
  selected: BoxDiagramSelection | null | undefined,
  kind: BoxDiagramSelection["kind"],
  id: string,
): boolean {
  return selected?.kind === kind && selected.id === id;
}

function activateWithKeyboard(
  event: ReactKeyboardEvent<SVGGElement>,
  selection: BoxDiagramSelection,
  onSelect?: (selection: BoxDiagramSelection) => void,
): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect?.(selection);
  }
}

function truncateSvgLabel(label: string, maximum = 22): string {
  return label.length <= maximum ? label : `${label.slice(0, maximum - 1)}…`;
}

function DeviceFace({
  kind,
  centerX,
  centerY,
}: {
  kind: string;
  centerX: number;
  centerY: number;
}): ReactNode {
  const normalizedKind = kind.toLowerCase();

  if (normalizedKind.includes("receptacle") || normalizedKind.includes("outlet")) {
    return (
      <g aria-hidden="true">
        <circle className={styles.mountFace} cx={centerX} cy={centerY - 16} r="13" />
        <circle className={styles.mountFace} cx={centerX} cy={centerY + 16} r="13" />
        <line x1={centerX - 4} x2={centerX - 4} y1={centerY - 20} y2={centerY - 14} />
        <line x1={centerX + 4} x2={centerX + 4} y1={centerY - 20} y2={centerY - 14} />
        <line x1={centerX - 4} x2={centerX - 4} y1={centerY + 12} y2={centerY + 18} />
        <line x1={centerX + 4} x2={centerX + 4} y1={centerY + 12} y2={centerY + 18} />
      </g>
    );
  }

  if (normalizedKind.includes("dimmer")) {
    return (
      <g aria-hidden="true">
        <rect
          className={styles.mountFace}
          height="54"
          rx="9"
          width="28"
          x={centerX - 14}
          y={centerY - 27}
        />
        <circle cx={centerX} cy={centerY + 13} fill="#587168" r="4" />
      </g>
    );
  }

  return (
    <g aria-hidden="true">
      <rect
        className={styles.mountFace}
        height="58"
        rx="7"
        width="28"
        x={centerX - 14}
        y={centerY - 29}
      />
      <line
        stroke="#587168"
        strokeLinecap="round"
        strokeWidth="3"
        x1={centerX - 7}
        x2={centerX + 7}
        y1={centerY + 9}
        y2={centerY - 9}
      />
    </g>
  );
}

function BoxDiagramCanvas({
  model,
  selected,
  onSelect,
  onElementKeyDown,
}: BoxLayoutFigureProps) {
  const titleId = useId();
  const descriptionId = useId();
  const geometry = getBoxDiagramGeometry(model.gangCount);
  const gangCount = normalizeGangCount(model.gangCount);
  const orientationAngle = normalizeRotation(model.orientationDegrees);

  return (
    <div className={styles.svgWrap}>
      <svg
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className={styles.diagram}
        role="group"
        viewBox={`0 0 ${geometry.viewBoxWidth} ${geometry.viewBoxHeight}`}
      >
        <title id={titleId}>{model.label} physical box layout</title>
        <desc id={descriptionId}>
          {gangCount}-gang {model.boxType ?? "box"}. Gang positions run left to right. {" "}
          {ORIENTATION_LABELS[model.orientation]}. Interactive elements are also listed below.
        </desc>

        <g
          aria-hidden="true"
          transform={`translate(${geometry.boxX + 12} ${geometry.boxY - 27}) rotate(${orientationAngle})`}
        >
          <line className={styles.orientationLine} x1="0" x2="0" y1="14" y2="-8" />
          <path d="M -5 -2 L 0 -10 L 5 -2" fill="none" className={styles.orientationLine} />
        </g>
        <text
          aria-hidden="true"
          className={styles.orientationText}
          x={geometry.boxX + 24}
          y={geometry.boxY - 19}
        >
          {model.orientationLabel ?? (model.orientation === "ceiling-from-below" ? "ORIENTATION" : "CEILING")}
        </text>

        <rect
          className={styles.boxShell}
          height={geometry.boxHeight}
          rx="12"
          width={geometry.boxWidth}
          x={geometry.boxX}
          y={geometry.boxY}
        />
        <rect
          className={styles.boxInner}
          height={geometry.boxHeight - 16}
          rx="8"
          width={geometry.boxWidth - 16}
          x={geometry.boxX + 8}
          y={geometry.boxY + 8}
        />

        {Array.from({ length: gangCount }, (_, gangIndex) => {
          const centerX = geometry.boxX + geometry.gangWidth * (gangIndex + 0.5);
          return (
            <g aria-hidden="true" key={gangIndex}>
              {gangIndex > 0 ? (
                <line
                  className={styles.gangDivider}
                  x1={geometry.boxX + geometry.gangWidth * gangIndex}
                  x2={geometry.boxX + geometry.gangWidth * gangIndex}
                  y1={geometry.boxY + 13}
                  y2={geometry.boxY + geometry.boxHeight - 13}
                />
              ) : null}
              <text className={styles.gangLabel} x={centerX} y={geometry.boxY + 23}>
                G{gangIndex + 1}
              </text>
            </g>
          );
        })}

        {model.mounts.map((mount) => {
          const rect = getMountRect(mount, gangCount, geometry);
          const centerX = rect.x + rect.width / 2;
          const centerY = rect.y + rect.height / 2;
          const selection: BoxDiagramSelection = { kind: "mount", id: mount.id };
          const isSelected = selectionMatches(selected, "mount", mount.id);
          return (
            <g
              aria-label={`${mount.label}, ${mount.permanentCode}, ${getGangRangeLabel(mount)}, ${mount.kind}`}
              aria-pressed={isSelected}
              className={`${styles.interactive} ${isSelected ? styles.selected : ""}`}
              data-box-element="mount"
              data-element-id={mount.id}
              key={mount.id}
              onClick={() => onSelect?.(selection)}
              onKeyDown={(event) => {
                activateWithKeyboard(event, selection, onSelect);
                onElementKeyDown?.(event, selection);
              }}
              role="button"
              tabIndex={0}
              transform={`rotate(${normalizeRotation(mount.rotationDegrees)} ${centerX} ${centerY})`}
            >
              <rect
                className={styles.focusRing}
                height={rect.height + 8}
                rx="12"
                width={rect.width + 8}
                x={rect.x - 4}
                y={rect.y - 4}
              />
              <rect
                className={styles.mountBody}
                height={rect.height}
                rx="9"
                width={rect.width}
                x={rect.x}
                y={rect.y}
              />
              <DeviceFace centerX={centerX} centerY={centerY - 8} kind={mount.kind} />
              <text className={styles.mountLabel} x={centerX} y={rect.y + rect.height - 20}>
                {truncateSvgLabel(mount.label)}
              </text>
              <text className={styles.mountMeta} x={centerX} y={rect.y + rect.height - 8}>
                {mount.permanentCode}
              </text>
            </g>
          );
        })}

        {model.cableEntries.map((entry) => {
          const point = getEntryPoint(entry, geometry);
          const angle = entry.approachAngleDegrees ?? getDefaultEntryAngle(entry.side);
          const selection: BoxDiagramSelection = { kind: "cable-entry", id: entry.id };
          const isSelected = selectionMatches(selected, "cable-entry", entry.id);
          const cableNames = entry.cables.map((cable) => cable.permanentCode).join(", ");
          const portLabel = entry.knockoutLabel ?? `${entry.side} entry`;
          return (
            <g
              aria-label={`${portLabel}; ${entry.cables.length} cable${entry.cables.length === 1 ? "" : "s"}${cableNames ? `: ${cableNames}` : ""}; offset ${Math.round(clampNormalized(entry.offset) * 100)} percent`}
              aria-pressed={isSelected}
              className={`${styles.interactive} ${isSelected ? styles.selected : ""}`}
              data-box-element="cable-entry"
              data-element-id={entry.id}
              key={entry.id}
              onClick={() => onSelect?.(selection)}
              onKeyDown={(event) => {
                activateWithKeyboard(event, selection, onSelect);
                onElementKeyDown?.(event, selection);
              }}
              role="button"
              tabIndex={0}
              transform={`rotate(${angle} ${point.x} ${point.y})`}
            >
              <circle className={styles.focusRing} cx={point.x} cy={point.y} r="18" />
              {entry.side === "back" ? (
                <circle className={styles.backHalo} cx={point.x} cy={point.y} r="14" />
              ) : null}
              <line
                className={styles.entryLine}
                x1={point.x}
                x2={point.x + 23}
                y1={point.y}
                y2={point.y}
              />
              <circle className={styles.entryPort} cx={point.x} cy={point.y} r="10" />
              <text className={styles.entryCount} x={point.x} y={point.y + 3}>
                {entry.cables.length}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SelectionButton({
  selection,
  children,
  onSelect,
}: {
  selection: BoxDiagramSelection;
  children: ReactNode;
  onSelect?: (selection: BoxDiagramSelection) => void;
}) {
  if (!onSelect) return <>{children}</>;
  return (
    <button className={styles.selectButton} onClick={() => onSelect(selection)} type="button">
      {children}
    </button>
  );
}

function BoxTextEquivalent({
  model,
  onSelect,
  mode,
}: {
  model: BoxPhysicalLayoutModel;
  onSelect?: (selection: BoxDiagramSelection) => void;
  mode: BoxTextEquivalentMode;
}) {
  const gangCount = normalizeGangCount(model.gangCount);
  const className = `${styles.summary} ${mode === "screen-reader" ? styles.screenReader : ""}`;
  const dimensionParts = [model.width, model.height, model.depth].filter(Boolean);

  return (
    <section aria-label={`${model.label} layout details`} className={className}>
      <h3>Recorded physical layout</h3>
      <dl className={styles.facts}>
        <div>
          <dt>Box</dt>
          <dd>{model.permanentCode}</dd>
        </div>
        <div>
          <dt>Gangs</dt>
          <dd>{gangCount}</dd>
        </div>
        <div>
          <dt>View</dt>
          <dd>{ORIENTATION_LABELS[model.orientation]}</dd>
        </div>
        {model.material ? (
          <div>
            <dt>Material</dt>
            <dd>{model.material}</dd>
          </div>
        ) : null}
        {dimensionParts.length ? (
          <div>
            <dt>Dimensions</dt>
            <dd>{dimensionParts.join(" × ")}</dd>
          </div>
        ) : null}
      </dl>

      {model.mounts.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>Mounted devices</caption>
            <thead>
              <tr>
                <th scope="col">Device</th>
                <th scope="col">Position</th>
                <th scope="col">Kind</th>
                <th scope="col">Orientation</th>
              </tr>
            </thead>
            <tbody>
              {model.mounts.map((mount) => (
                <tr key={mount.id}>
                  <td>
                    <SelectionButton
                      onSelect={onSelect}
                      selection={{ kind: "mount", id: mount.id }}
                    >
                      {mount.label}
                    </SelectionButton>
                    <br />
                    <span className={styles.muted}>{mount.permanentCode}</span>
                  </td>
                  <td>{getGangRangeLabel(mount)}</td>
                  <td>{mount.kind}</td>
                  <td>{normalizeRotation(mount.rotationDegrees)}°</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.empty}>No mounted devices recorded.</p>
      )}

      {model.cableEntries.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>Cable entries</caption>
            <thead>
              <tr>
                <th scope="col">Entry</th>
                <th scope="col">Side and offset</th>
                <th scope="col">Cables</th>
                <th scope="col">Orientation</th>
              </tr>
            </thead>
            <tbody>
              {model.cableEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <SelectionButton
                      onSelect={onSelect}
                      selection={{ kind: "cable-entry", id: entry.id }}
                    >
                      {entry.knockoutLabel ?? `${entry.side} entry`}
                    </SelectionButton>
                  </td>
                  <td>
                    {entry.side}, {Math.round(clampNormalized(entry.offset) * 100)}%
                  </td>
                  <td>
                    {entry.cables.length
                      ? entry.cables.map((cable) => cable.permanentCode).join(", ")
                      : "No cable assigned"}
                  </td>
                  <td>{normalizeRotation(entry.approachAngleDegrees ?? getDefaultEntryAngle(entry.side))}°</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.empty}>No cable entries recorded.</p>
      )}
    </section>
  );
}

function BoxLayoutFigure(props: BoxLayoutFigureProps) {
  const { model, textEquivalent = "visible", className, onSelect } = props;

  return (
    <div className={`${styles.root} ${className ?? ""}`}>
      <figure className={styles.figure}>
        <header className={styles.figureHeader}>
          <div>
            <h2>{model.label}</h2>
            <p>{ORIENTATION_LABELS[model.orientation]}</p>
          </div>
          <span className={styles.code}>{model.permanentCode}</span>
        </header>
        <BoxDiagramCanvas {...props} />
        <figcaption className={styles.caption}>
          Gang numbers run left-to-right in this recorded view. Entry positions and angles describe only
          where a cable is observed at this box; they do not describe its concealed route.
        </figcaption>
      </figure>
      <BoxTextEquivalent model={model} mode={textEquivalent} onSelect={onSelect} />
    </div>
  );
}

export function BoxPhysicalLayout(props: BoxPhysicalLayoutProps) {
  return <BoxLayoutFigure {...props} />;
}

function numberFromInput(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function BoxPhysicalLayoutEditor({
  model,
  selected,
  onSelect,
  onChange,
  onRequestAddMount,
  onRequestAddCableEntry,
  onRequestRemove,
  className,
  textEquivalent = "visible",
}: BoxPhysicalLayoutEditorProps) {
  const gangCount = normalizeGangCount(model.gangCount);
  const warnings = getBoxLayoutWarnings(model);

  const updateModel = (
    nextModel: BoxPhysicalLayoutModel,
    change: BoxLayoutChange,
  ): void => onChange(nextModel, change);

  const updateGangCount = (nextCountValue: number): void => {
    const nextCount = normalizeGangCount(nextCountValue);
    const mounts = model.mounts.map((mount) => {
      const gangSpan = clamp(Math.round(mount.gangSpan), 1, nextCount);
      const gangStart = clamp(Math.round(mount.gangStart), 1, nextCount - gangSpan + 1);
      return { ...mount, gangStart, gangSpan };
    });
    updateModel(
      { ...model, gangCount: nextCount, mounts },
      { kind: "box", field: "gangCount", id: model.id },
    );
  };

  const updateMount = <K extends keyof Pick<
    BoxMountedDevice,
    "gangStart" | "gangSpan" | "verticalPosition" | "rotationDegrees"
  >>(
    id: string,
    field: K,
    value: BoxMountedDevice[K],
  ): void => {
    const mounts = model.mounts.map((mount) => {
      if (mount.id !== id) return mount;
      const nextMount = { ...mount, [field]: value };
      const gangSpan = clamp(Math.round(nextMount.gangSpan), 1, gangCount);
      const gangStart = clamp(Math.round(nextMount.gangStart), 1, gangCount - gangSpan + 1);
      return { ...nextMount, gangStart, gangSpan };
    });
    updateModel(
      { ...model, mounts },
      { kind: "mount", field, id },
    );
  };

  const updateEntry = <K extends keyof Pick<
    BoxCableEntry,
    "side" | "offset" | "approachAngleDegrees"
  >>(
    id: string,
    field: K,
    value: BoxCableEntry[K],
  ): void => {
    const cableEntries = model.cableEntries.map((entry) =>
      entry.id === id ? { ...entry, [field]: value } : entry,
    );
    updateModel(
      { ...model, cableEntries },
      { kind: "cable-entry", field, id },
    );
  };

  const handleElementKeyDown = (
    event: ReactKeyboardEvent<SVGGElement>,
    selection: BoxDiagramSelection,
  ): void => {
    const step = event.shiftKey ? 0.05 : 0.01;
    if (selection.kind === "cable-entry") {
      const entry = model.cableEntries.find((item) => item.id === selection.id);
      if (!entry || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const decreases = event.key === "ArrowLeft" || event.key === "ArrowUp";
      updateEntry(entry.id, "offset", clampNormalized(entry.offset + (decreases ? -step : step)));
      return;
    }

    const mount = model.mounts.find((item) => item.id === selection.id);
    if (!mount) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      updateMount(
        mount.id,
        "gangStart",
        mount.gangStart + (event.key === "ArrowLeft" ? -1 : 1),
      );
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      updateMount(
        mount.id,
        "verticalPosition",
        clampNormalized((mount.verticalPosition ?? 0.5) + (event.key === "ArrowUp" ? -step : step)),
      );
    }
  };

  return (
    <div className={`${styles.root} ${className ?? ""}`}>
      <BoxLayoutFigure
        model={model}
        onElementKeyDown={handleElementKeyDown}
        onSelect={onSelect}
        selected={selected}
        textEquivalent={textEquivalent}
      />

      {warnings.length ? (
        <ul aria-label="Layout warnings" className={styles.warnings}>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <section aria-label="Edit physical box layout" className={styles.editor}>
        <h3>Edit physical layout</h3>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            Gang count
            <input
              inputMode="numeric"
              min="1"
              onChange={(event) => updateGangCount(numberFromInput(event.currentTarget.value, gangCount))}
              step="1"
              type="number"
              value={gangCount}
            />
          </label>
          <label className={styles.field}>
            Viewing orientation
            <select
              onChange={(event) =>
                updateModel(
                  { ...model, orientation: event.currentTarget.value as BoxViewOrientation },
                  { kind: "box", field: "orientation", id: model.id },
                )
              }
              value={model.orientation}
            >
              <option value="wall-front">Wall — from finished-room side</option>
              <option value="ceiling-from-below">Ceiling — viewed from below</option>
              <option value="custom">Custom recorded orientation</option>
            </select>
          </label>
          <label className={styles.field}>
            Orientation marker (degrees)
            <input
              inputMode="decimal"
              max="360"
              min="-360"
              onChange={(event) =>
                updateModel(
                  {
                    ...model,
                    orientationDegrees: numberFromInput(
                      event.currentTarget.value,
                      model.orientationDegrees ?? 0,
                    ),
                  },
                  { kind: "box", field: "orientationDegrees", id: model.id },
                )
              }
              step="1"
              type="number"
              value={model.orientationDegrees ?? 0}
            />
          </label>
        </div>

        {model.mounts.map((mount) => (
          <article className={styles.editCard} key={mount.id}>
            <div className={styles.editCardHeader}>
              <h4>{mount.label}</h4>
              <span>{mount.permanentCode}</span>
            </div>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                Starting gang
                <input
                  aria-label={`${mount.label} starting gang`}
                  inputMode="numeric"
                  max={Math.max(1, gangCount - mount.gangSpan + 1)}
                  min="1"
                  onChange={(event) =>
                    updateMount(
                      mount.id,
                      "gangStart",
                      numberFromInput(event.currentTarget.value, mount.gangStart),
                    )
                  }
                  step="1"
                  type="number"
                  value={mount.gangStart}
                />
              </label>
              <label className={styles.field}>
                Gang span
                <input
                  aria-label={`${mount.label} gang span`}
                  inputMode="numeric"
                  max={gangCount}
                  min="1"
                  onChange={(event) =>
                    updateMount(
                      mount.id,
                      "gangSpan",
                      numberFromInput(event.currentTarget.value, mount.gangSpan),
                    )
                  }
                  step="1"
                  type="number"
                  value={mount.gangSpan}
                />
              </label>
              <label className={styles.field}>
                Vertical position (%)
                <input
                  aria-label={`${mount.label} vertical position percent`}
                  inputMode="decimal"
                  max="100"
                  min="0"
                  onChange={(event) =>
                    updateMount(
                      mount.id,
                      "verticalPosition",
                      clampNormalized(
                        numberFromInput(
                          event.currentTarget.value,
                          (mount.verticalPosition ?? 0.5) * 100,
                        ) / 100,
                      ),
                    )
                  }
                  step="1"
                  type="number"
                  value={Math.round((mount.verticalPosition ?? 0.5) * 100)}
                />
              </label>
              <label className={styles.field}>
                Device rotation (degrees)
                <input
                  aria-label={`${mount.label} rotation degrees`}
                  inputMode="decimal"
                  max="360"
                  min="-360"
                  onChange={(event) =>
                    updateMount(
                      mount.id,
                      "rotationDegrees",
                      numberFromInput(event.currentTarget.value, mount.rotationDegrees ?? 0),
                    )
                  }
                  step="1"
                  type="number"
                  value={mount.rotationDegrees ?? 0}
                />
              </label>
            </div>
            {onRequestRemove ? (
              <div className={styles.editorActions}>
                <button
                  className={styles.editorButton}
                  onClick={() => onRequestRemove({ kind: "mount", id: mount.id })}
                  type="button"
                >
                  Remove {mount.label}
                </button>
              </div>
            ) : null}
          </article>
        ))}

        {model.cableEntries.map((entry) => {
          const entryName = entry.knockoutLabel ?? `${entry.side} entry`;
          return (
            <article className={styles.editCard} key={entry.id}>
              <div className={styles.editCardHeader}>
                <h4>{entryName}</h4>
                <span>{entry.cables.map((cable) => cable.permanentCode).join(", ") || "Unassigned"}</span>
              </div>
              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  Entry side
                  <select
                    aria-label={`${entryName} side`}
                    onChange={(event) =>
                      updateEntry(entry.id, "side", event.currentTarget.value as BoxCableEntry["side"])
                    }
                    value={entry.side}
                  >
                    {BOX_ENTRY_SIDES.map((side) => (
                      <option key={side} value={side}>
                        {side[0].toUpperCase() + side.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Offset along side (%)
                  <input
                    aria-label={`${entryName} offset percent`}
                    inputMode="decimal"
                    max="100"
                    min="0"
                    onChange={(event) =>
                      updateEntry(
                        entry.id,
                        "offset",
                        clampNormalized(
                          numberFromInput(event.currentTarget.value, entry.offset * 100) / 100,
                        ),
                      )
                    }
                    step="1"
                    type="number"
                    value={Math.round(clampNormalized(entry.offset) * 100)}
                  />
                </label>
                <label className={styles.field}>
                  Approach angle (degrees)
                  <input
                    aria-label={`${entryName} approach angle degrees`}
                    inputMode="decimal"
                    max="360"
                    min="-360"
                    onChange={(event) =>
                      updateEntry(
                        entry.id,
                        "approachAngleDegrees",
                        numberFromInput(
                          event.currentTarget.value,
                          entry.approachAngleDegrees ?? getDefaultEntryAngle(entry.side),
                        ),
                      )
                    }
                    step="1"
                    type="number"
                    value={entry.approachAngleDegrees ?? getDefaultEntryAngle(entry.side)}
                  />
                </label>
              </div>
              {onRequestRemove ? (
                <div className={styles.editorActions}>
                  <button
                    className={styles.editorButton}
                    onClick={() => onRequestRemove({ kind: "cable-entry", id: entry.id })}
                    type="button"
                  >
                    Remove {entryName}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}

        {onRequestAddMount || onRequestAddCableEntry ? (
          <div className={styles.editorActions}>
            {onRequestAddMount ? (
              <button className={styles.editorButton} onClick={onRequestAddMount} type="button">
                Add mounted device
              </button>
            ) : null}
            {onRequestAddCableEntry ? (
              <button className={styles.editorButton} onClick={onRequestAddCableEntry} type="button">
                Add cable entry
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
