"use client";

import type { ReactNode } from "react";
import styles from "./box-termination-editor.module.css";
import {
  BOX_CONDUCTOR_FUNCTIONS,
  BOX_CONDUCTOR_KINDS,
  BOX_OPEN_ENDPOINT_KINDS,
  BOX_TERMINAL_ROLES,
  BOX_TERMINATION_CERTAINTIES,
  BOX_TERMINATION_METHODS,
  type BoxBondPointRecord,
  type BoxConductorEndRecord,
  type BoxConductorFunction,
  type BoxConductorKind,
  type BoxConductorRecord,
  type BoxOpenEndpointKind,
  type BoxOpenEndpointRecord,
  type BoxSpliceRecord,
  type BoxTerminalRecord,
  type BoxTerminalRole,
  type BoxTerminationAddKind,
  type BoxTerminationCertainty,
  type BoxTerminationChange,
  type BoxTerminationMethod,
  type BoxTerminationModel,
  type BoxTerminationSelection,
} from "./termination-types";

export interface BoxTerminationViewProps {
  model: BoxTerminationModel;
  selected?: BoxTerminationSelection | null;
  onSelect?: (selection: BoxTerminationSelection) => void;
  className?: string;
}

export interface BoxTerminationEditorProps extends BoxTerminationViewProps {
  onChange: (
    nextModel: BoxTerminationModel,
    change: BoxTerminationChange,
  ) => void;
  onRequestAdd?: (kind: BoxTerminationAddKind) => void;
  onRequestRemove?: (selection: BoxTerminationSelection) => void;
}

type ChangeField<Kind extends BoxTerminationChange["kind"]> = Extract<
  BoxTerminationChange,
  { kind: Kind }
>["field"];

interface NodeDescriptor {
  id: string;
  kind: "terminal" | "splice" | "open-end" | "bond";
  typeLabel: string;
  label: string;
  detail: string;
}

const EMPTY_VALUE = "Not recorded";

function words(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function terminalLabel(terminal: BoxTerminalRecord): string {
  const terminalName = terminal.manufacturerLabel || terminal.terminalKey;
  return `${terminal.assetLabel} — ${terminalName}`;
}

function getNodeDescriptors(model: BoxTerminationModel): NodeDescriptor[] {
  return [
    ...model.terminals.map((terminal) => ({
      id: terminal.id,
      kind: "terminal" as const,
      typeLabel: "Device terminal",
      label: terminalLabel(terminal),
      detail: [
        terminal.assetPermanentCode,
        words(terminal.semanticRole),
        terminal.terminalGroup,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    ...model.splices.map((splice) => ({
      id: splice.id,
      kind: "splice" as const,
      typeLabel: "Splice group",
      label: splice.label,
      detail: splice.connectorType || "Connector not recorded",
    })),
    ...model.openEndpoints.map((endpoint) => ({
      id: endpoint.id,
      kind: "open-end" as const,
      typeLabel: `${words(endpoint.endpointKind)} end`,
      label: endpoint.label || `${words(endpoint.endpointKind)} conductor end`,
      detail: endpoint.description || "No description recorded",
    })),
    ...model.bondPoints.map((bond) => ({
      id: bond.id,
      kind: "bond" as const,
      typeLabel: "Ground / bond point",
      label: bond.label,
      detail: [bond.ownerLabel, bond.description].filter(Boolean).join(" · ") || EMPTY_VALUE,
    })),
  ];
}

function selectionMatches(
  selected: BoxTerminationSelection | null | undefined,
  selection: BoxTerminationSelection,
): boolean {
  return selected?.kind === selection.kind && selected.id === selection.id;
}

function SelectEntityButton({
  selection,
  selected,
  onSelect,
  children,
  ariaLabel,
}: {
  selection: BoxTerminationSelection;
  selected?: BoxTerminationSelection | null;
  onSelect?: (selection: BoxTerminationSelection) => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  if (!onSelect) return <>{children}</>;
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={selectionMatches(selected, selection)}
      className={styles.selectButton}
      onClick={() => onSelect(selection)}
      type="button"
    >
      {children}
    </button>
  );
}

function NodeEndList({
  nodeId,
  model,
  selected,
  onSelect,
}: {
  nodeId: string;
  model: BoxTerminationModel;
  selected?: BoxTerminationSelection | null;
  onSelect?: (selection: BoxTerminationSelection) => void;
}) {
  const conductorById = new Map(
    model.conductors.map((conductor) => [conductor.id, conductor]),
  );
  const ends = model.conductorEnds.filter((end) => end.nodeId === nodeId);

  if (!ends.length) return <span className={styles.muted}>No conductor ends attached</span>;

  return (
    <ul className={styles.inlineList}>
      {ends.map((end) => {
        const conductor = conductorById.get(end.conductorId);
        return (
          <li key={end.id}>
            <SelectEntityButton
              ariaLabel={`Select end ${end.designation} of ${conductor?.permanentCode ?? "missing conductor"}`}
              onSelect={onSelect}
              selected={selected}
              selection={{ kind: "conductor-end", id: end.id }}
            >
              {conductor?.permanentCode ?? `Missing conductor ${end.conductorId}`} · end {end.designation}
            </SelectEntityButton>
          </li>
        );
      })}
    </ul>
  );
}

function ConductorEndsSummary({
  conductor,
  model,
  selected,
  onSelect,
}: {
  conductor: BoxConductorRecord;
  model: BoxTerminationModel;
  selected?: BoxTerminationSelection | null;
  onSelect?: (selection: BoxTerminationSelection) => void;
}) {
  const nodeById = new Map(
    getNodeDescriptors(model).map((node) => [node.id, node]),
  );
  const ends = model.conductorEnds
    .filter((end) => end.conductorId === conductor.id)
    .toSorted((left, right) => left.designation.localeCompare(right.designation));

  if (!ends.length) return <span className={styles.muted}>No ends recorded</span>;

  return (
    <ul className={styles.inlineList}>
      {ends.map((end) => {
        const node = end.nodeId ? nodeById.get(end.nodeId) : undefined;
        const destination = end.connectionState === "connected" ? (node?.label ?? (end.nodeId ? `Missing node ${end.nodeId}` : "Unassigned")) : words(end.connectionState);
        return (
          <li key={end.id}>
            <SelectEntityButton
              ariaLabel={`Select ${conductor.permanentCode} end ${end.designation}`}
              onSelect={onSelect}
              selected={selected}
              selection={{ kind: "conductor-end", id: end.id }}
            >
              {end.designation}: {destination}
            </SelectEntityButton>
            <span className={styles.muted}> · {words(end.terminationMethod)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function BoxTerminationView({
  model,
  selected,
  onSelect,
  className,
}: BoxTerminationViewProps) {
  const nodes = getNodeDescriptors(model);
  const incompleteEnds = model.conductorEnds.filter(
    (end) => !end.nodeId || !nodes.some((node) => node.id === end.nodeId),
  ).length;

  return (
    <section
      aria-label={`${model.label} structured terminations`}
      className={`${styles.root} ${className ?? ""}`}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Structured gang-box record</p>
          <h2>{model.label}</h2>
          <p>
            Connections shown here come from modeled terminals and conductor ends—not from a photo or
            hand-drawn line.
          </p>
        </div>
        <span className={styles.code}>{model.permanentCode}</span>
      </header>

      <dl aria-label="Termination record counts" className={styles.counts}>
        <div><dt>Conductors</dt><dd>{model.conductors.length}</dd></div>
        <div><dt>Terminals</dt><dd>{model.terminals.length}</dd></div>
        <div><dt>Splice groups</dt><dd>{model.splices.length}</dd></div>
        <div><dt>Open / capped</dt><dd>{model.openEndpoints.length}</dd></div>
        <div><dt>Ground / bonds</dt><dd>{model.bondPoints.length}</dd></div>
      </dl>

      {incompleteEnds ? (
        <p className={styles.notice} role="status">
          {incompleteEnds} conductor {incompleteEnds === 1 ? "end needs" : "ends need"} a recorded
          connection point.
        </p>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption>Connection points</caption>
          <thead>
            <tr>
              <th scope="col">Point</th>
              <th scope="col">Type</th>
              <th scope="col">Recorded detail</th>
              <th scope="col">Attached conductor ends</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => {
              const selection: BoxTerminationSelection = { kind: node.kind, id: node.id };
              return (
                <tr className={selectionMatches(selected, selection) ? styles.selectedRow : undefined} key={`${node.kind}:${node.id}`}>
                  <th scope="row">
                    <SelectEntityButton onSelect={onSelect} selected={selected} selection={selection}>
                      {node.label}
                    </SelectEntityButton>
                  </th>
                  <td><span className={styles.typePill}>{node.typeLabel}</span></td>
                  <td>{node.detail}</td>
                  <td><NodeEndList model={model} nodeId={node.id} onSelect={onSelect} selected={selected} /></td>
                </tr>
              );
            })}
            {!nodes.length ? (
              <tr><td className={styles.emptyCell} colSpan={4}>No connection points recorded.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption>Conductors and their ends</caption>
          <thead>
            <tr>
              <th scope="col">Conductor</th>
              <th scope="col">Kind</th>
              <th scope="col">Observed color</th>
              <th scope="col">Re-identification</th>
              <th scope="col">Assigned function</th>
              <th scope="col">Gauge</th>
              <th scope="col">Ends</th>
            </tr>
          </thead>
          <tbody>
            {model.conductors.map((conductor) => {
              const selection: BoxTerminationSelection = { kind: "conductor", id: conductor.id };
              return (
                <tr className={selectionMatches(selected, selection) ? styles.selectedRow : undefined} key={conductor.id}>
                  <th scope="row">
                    <SelectEntityButton onSelect={onSelect} selected={selected} selection={selection}>
                      {conductor.permanentCode}
                    </SelectEntityButton>
                    {conductor.cablePermanentCode ? <span className={styles.subline}>Cable {conductor.cablePermanentCode}</span> : null}
                  </th>
                  <td><span className={styles.typePill}>{words(conductor.kind)}</span></td>
                  <td>{conductor.observedInsulationColor || EMPTY_VALUE}</td>
                  <td>{conductor.reidentificationMarking || "None recorded"}</td>
                  <td>{conductor.assignedFunction ? words(conductor.assignedFunction) : "Unknown"}</td>
                  <td>{conductor.gauge || "Optional / unknown"}</td>
                  <td><ConductorEndsSummary conductor={conductor} model={model} onSelect={onSelect} selected={selected} /></td>
                </tr>
              );
            })}
            {!model.conductors.length ? (
              <tr><td className={styles.emptyCell} colSpan={7}>No conductors recorded.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EditSection({
  title,
  addKind,
  onRequestAdd,
  children,
}: {
  title: string;
  addKind: BoxTerminationAddKind;
  onRequestAdd?: (kind: BoxTerminationAddKind) => void;
  children: ReactNode;
}) {
  return (
    <section className={styles.editSection}>
      <header className={styles.editSectionHeader}>
        <h3>{title}</h3>
        {onRequestAdd ? (
          <button className={styles.secondaryButton} onClick={() => onRequestAdd(addKind)} type="button">
            Add {words(addKind)}
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function RemoveButton({
  label,
  selection,
  onRequestRemove,
}: {
  label: string;
  selection: BoxTerminationSelection;
  onRequestRemove?: (selection: BoxTerminationSelection) => void;
}) {
  if (!onRequestRemove) return null;
  return (
    <button
      aria-label={`Remove ${label}`}
      className={styles.removeButton}
      onClick={() => onRequestRemove(selection)}
      type="button"
    >
      Remove
    </button>
  );
}

function OptionList({ values }: { values: readonly string[] }) {
  return values.map((value) => <option key={value} value={value}>{words(value)}</option>);
}

function preserveUnlistedOption(value: string | null | undefined, values: readonly string[]) {
  if (!value || values.includes(value)) return null;
  return <option value={value}>{words(value)} (recorded)</option>;
}

function NodeOptions({ model, selectedNodeId }: { model: BoxTerminationModel; selectedNodeId?: string | null }) {
  const nodes = getNodeDescriptors(model);
  const selectedExists = !selectedNodeId || nodes.some((node) => node.id === selectedNodeId);
  const groups = [
    { label: "Device terminals", items: nodes.filter((node) => node.kind === "terminal") },
    { label: "Splice groups", items: nodes.filter((node) => node.kind === "splice") },
    { label: "Capped, open, or unknown ends", items: nodes.filter((node) => node.kind === "open-end") },
    { label: "Ground and bond points", items: nodes.filter((node) => node.kind === "bond") },
  ];

  return (
    <>
      <option value="">Unassigned / needs investigation</option>
      {!selectedExists && selectedNodeId ? <option value={selectedNodeId}>Missing node: {selectedNodeId}</option> : null}
      {groups.map((group) => group.items.length ? (
        <optgroup key={group.label} label={group.label}>
          {group.items.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
        </optgroup>
      ) : null)}
    </>
  );
}

function EditableTable({
  caption,
  headings,
  children,
  empty,
}: {
  caption: string;
  headings: readonly string[];
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.table} ${styles.editTable}`}>
        <caption className={styles.screenReader}>{caption}</caption>
        <thead><tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
        <tbody>
          {children}
          {empty ? <tr><td className={styles.emptyCell} colSpan={headings.length}>None recorded.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

export function BoxTerminationEditor({
  model,
  selected,
  onSelect,
  onChange,
  onRequestAdd,
  onRequestRemove,
  className,
}: BoxTerminationEditorProps) {
  const updateTerminal = <K extends ChangeField<"terminal">>(id: string, field: K, value: BoxTerminalRecord[K]) => {
    onChange(
      { ...model, terminals: model.terminals.map((item) => item.id === id ? { ...item, [field]: value } : item) },
      { kind: "terminal", id, field },
    );
  };

  const updateSplice = <K extends ChangeField<"splice">>(id: string, field: K, value: BoxSpliceRecord[K]) => {
    onChange(
      { ...model, splices: model.splices.map((item) => item.id === id ? { ...item, [field]: value } : item) },
      { kind: "splice", id, field },
    );
  };

  const updateOpenEndpoint = <K extends ChangeField<"open-end">>(id: string, field: K, value: BoxOpenEndpointRecord[K]) => {
    onChange(
      { ...model, openEndpoints: model.openEndpoints.map((item) => item.id === id ? { ...item, [field]: value } : item) },
      { kind: "open-end", id, field },
    );
  };

  const updateBond = <K extends ChangeField<"bond">>(id: string, field: K, value: BoxBondPointRecord[K]) => {
    onChange(
      { ...model, bondPoints: model.bondPoints.map((item) => item.id === id ? { ...item, [field]: value } : item) },
      { kind: "bond", id, field },
    );
  };

  const updateConductor = <K extends ChangeField<"conductor">>(id: string, field: K, value: BoxConductorRecord[K]) => {
    onChange(
      { ...model, conductors: model.conductors.map((item) => item.id === id ? { ...item, [field]: value } : item) },
      { kind: "conductor", id, field },
    );
  };

  const updateConductorEnd = <K extends ChangeField<"conductor-end">>(id: string, field: K, value: BoxConductorEndRecord[K]) => {
    onChange(
      { ...model, conductorEnds: model.conductorEnds.map((item) => item.id === id ? { ...item, [field]: value } : item) },
      { kind: "conductor-end", id, field },
    );
  };

  return (
    <div className={`${styles.editorRoot} ${className ?? ""}`}>
      <BoxTerminationView model={model} onSelect={onSelect} selected={selected} />

      <div aria-label={`Edit ${model.label} structured terminations`} className={styles.editor} role="group">
        <div className={styles.editorIntro}>
          <div>
            <p className={styles.eyebrow}>Edit structured records</p>
            <h2>Terminations and conductor details</h2>
          </div>
          <p>Use “unknown” when the observation is incomplete. Do not infer conductor function from insulation color.</p>
        </div>

        <EditSection addKind="terminal" onRequestAdd={onRequestAdd} title="Device terminals">
          <EditableTable caption="Edit device terminals" empty={!model.terminals.length} headings={["Terminal", "Key", "Manufacturer label", "Role", "Group", "Actions"]}>
            {model.terminals.map((terminal) => (
              <tr key={terminal.id}>
                <th scope="row">
                  <SelectEntityButton onSelect={onSelect} selected={selected} selection={{ kind: "terminal", id: terminal.id }}>
                    {terminal.assetLabel}
                  </SelectEntityButton>
                  <span className={styles.subline}>{terminal.assetPermanentCode || terminal.owningAssetId}</span>
                </th>
                <td><input aria-label={`${terminalLabel(terminal)} terminal key`} onChange={(event) => updateTerminal(terminal.id, "terminalKey", event.currentTarget.value)} value={terminal.terminalKey} /></td>
                <td><input aria-label={`${terminalLabel(terminal)} manufacturer terminal label`} onChange={(event) => updateTerminal(terminal.id, "manufacturerLabel", event.currentTarget.value || undefined)} value={terminal.manufacturerLabel ?? ""} /></td>
                <td><select aria-label={`${terminalLabel(terminal)} terminal role`} onChange={(event) => updateTerminal(terminal.id, "semanticRole", event.currentTarget.value as BoxTerminalRole)} value={terminal.semanticRole}><OptionList values={BOX_TERMINAL_ROLES} /></select></td>
                <td><input aria-label={`${terminalLabel(terminal)} terminal group`} onChange={(event) => updateTerminal(terminal.id, "terminalGroup", event.currentTarget.value || undefined)} value={terminal.terminalGroup ?? ""} /></td>
                <td><RemoveButton label={terminalLabel(terminal)} onRequestRemove={onRequestRemove} selection={{ kind: "terminal", id: terminal.id }} /></td>
              </tr>
            ))}
          </EditableTable>
        </EditSection>

        <EditSection addKind="splice" onRequestAdd={onRequestAdd} title="Splice groups">
          <EditableTable caption="Edit splice groups" empty={!model.splices.length} headings={["Splice", "Connector", "Attached ends", "Actions"]}>
            {model.splices.map((splice) => (
              <tr key={splice.id}>
                <th scope="row"><input aria-label={`${splice.label} splice label`} onChange={(event) => updateSplice(splice.id, "label", event.currentTarget.value)} value={splice.label} /></th>
                <td><input aria-label={`${splice.label} connector type`} onChange={(event) => updateSplice(splice.id, "connectorType", event.currentTarget.value || undefined)} value={splice.connectorType ?? ""} /></td>
                <td><NodeEndList model={model} nodeId={splice.id} onSelect={onSelect} selected={selected} /></td>
                <td><RemoveButton label={splice.label} onRequestRemove={onRequestRemove} selection={{ kind: "splice", id: splice.id }} /></td>
              </tr>
            ))}
          </EditableTable>
        </EditSection>

        <EditSection addKind="open-end" onRequestAdd={onRequestAdd} title="Capped, open, and unknown ends">
          <EditableTable caption="Edit capped, open, and unknown ends" empty={!model.openEndpoints.length} headings={["End", "Status", "Description", "Attached conductor", "Actions"]}>
            {model.openEndpoints.map((endpoint) => (
              <tr key={endpoint.id}>
                <th scope="row"><input aria-label={`${endpoint.label || endpoint.id} endpoint label`} onChange={(event) => updateOpenEndpoint(endpoint.id, "label", event.currentTarget.value || undefined)} value={endpoint.label ?? ""} /></th>
                <td><select aria-label={`${endpoint.label || endpoint.id} endpoint status`} onChange={(event) => updateOpenEndpoint(endpoint.id, "endpointKind", event.currentTarget.value as BoxOpenEndpointKind)} value={endpoint.endpointKind}><OptionList values={BOX_OPEN_ENDPOINT_KINDS} /></select></td>
                <td><input aria-label={`${endpoint.label || endpoint.id} endpoint description`} onChange={(event) => updateOpenEndpoint(endpoint.id, "description", event.currentTarget.value || undefined)} value={endpoint.description ?? ""} /></td>
                <td><NodeEndList model={model} nodeId={endpoint.id} onSelect={onSelect} selected={selected} /></td>
                <td><RemoveButton label={endpoint.label || endpoint.id} onRequestRemove={onRequestRemove} selection={{ kind: "open-end", id: endpoint.id }} /></td>
              </tr>
            ))}
          </EditableTable>
        </EditSection>

        <EditSection addKind="bond" onRequestAdd={onRequestAdd} title="Ground and bond points">
          <EditableTable caption="Edit ground and bond points" empty={!model.bondPoints.length} headings={["Point", "Owner", "Description", "Attached grounds", "Actions"]}>
            {model.bondPoints.map((bond) => (
              <tr key={bond.id}>
                <th scope="row"><input aria-label={`${bond.label} bond point label`} onChange={(event) => updateBond(bond.id, "label", event.currentTarget.value)} value={bond.label} /></th>
                <td>{bond.ownerLabel || "Not recorded"}</td>
                <td><input aria-label={`${bond.label} bond point description`} onChange={(event) => updateBond(bond.id, "description", event.currentTarget.value || undefined)} value={bond.description ?? ""} /></td>
                <td><NodeEndList model={model} nodeId={bond.id} onSelect={onSelect} selected={selected} /></td>
                <td><RemoveButton label={bond.label} onRequestRemove={onRequestRemove} selection={{ kind: "bond", id: bond.id }} /></td>
              </tr>
            ))}
          </EditableTable>
        </EditSection>

        <EditSection addKind="conductor" onRequestAdd={onRequestAdd} title="Conductors">
          <EditableTable caption="Edit conductors" empty={!model.conductors.length} headings={["Conductor", "Kind", "Observed color", "Re-identification", "Function", "Gauge (optional)", "Actions"]}>
            {model.conductors.map((conductor) => (
              <tr key={conductor.id}>
                <th scope="row">
                  <SelectEntityButton onSelect={onSelect} selected={selected} selection={{ kind: "conductor", id: conductor.id }}>{conductor.permanentCode}</SelectEntityButton>
                  {conductor.cablePermanentCode ? <span className={styles.subline}>Cable {conductor.cablePermanentCode}</span> : null}
                </th>
                <td><select aria-label={`${conductor.permanentCode} conductor kind`} onChange={(event) => updateConductor(conductor.id, "kind", event.currentTarget.value as BoxConductorKind)} value={conductor.kind}>{preserveUnlistedOption(conductor.kind, BOX_CONDUCTOR_KINDS)}<OptionList values={BOX_CONDUCTOR_KINDS} /></select></td>
                <td><input aria-label={`${conductor.permanentCode} observed insulation color`} onChange={(event) => updateConductor(conductor.id, "observedInsulationColor", event.currentTarget.value || undefined)} value={conductor.observedInsulationColor ?? ""} /></td>
                <td><input aria-label={`${conductor.permanentCode} re-identification marking`} onChange={(event) => updateConductor(conductor.id, "reidentificationMarking", event.currentTarget.value || undefined)} value={conductor.reidentificationMarking ?? ""} /></td>
                <td><select aria-label={`${conductor.permanentCode} assigned function`} onChange={(event) => updateConductor(conductor.id, "assignedFunction", (event.currentTarget.value || undefined) as BoxConductorFunction | undefined)} value={conductor.assignedFunction ?? ""}><option value="">Not assigned</option>{preserveUnlistedOption(conductor.assignedFunction, BOX_CONDUCTOR_FUNCTIONS)}<OptionList values={BOX_CONDUCTOR_FUNCTIONS} /></select></td>
                <td><input aria-label={`${conductor.permanentCode} gauge`} onChange={(event) => updateConductor(conductor.id, "gauge", event.currentTarget.value || null)} placeholder="Optional" value={conductor.gauge ?? ""} /></td>
                <td><RemoveButton label={conductor.permanentCode} onRequestRemove={onRequestRemove} selection={{ kind: "conductor", id: conductor.id }} /></td>
              </tr>
            ))}
          </EditableTable>
        </EditSection>

        <EditSection addKind="conductor-end" onRequestAdd={onRequestAdd} title="Conductor ends">
          <EditableTable caption="Edit conductor ends" empty={!model.conductorEnds.length} headings={["End", "Conductor", "Designation", "State", "Connection point", "Termination", "Confidence", "Actions"]}>
            {model.conductorEnds.map((end) => {
              const conductor = model.conductors.find((item) => item.id === end.conductorId);
              return (
                <tr key={end.id}>
                  <th scope="row"><SelectEntityButton onSelect={onSelect} selected={selected} selection={{ kind: "conductor-end", id: end.id }}>{conductor?.permanentCode ?? "Missing conductor"} · {end.designation}</SelectEntityButton></th>
                  <td>{conductor?.permanentCode ?? `Missing: ${end.conductorId}`}</td>
                  <td>{end.designation}</td>
                  <td><select aria-label={`${end.id} connection state`} onChange={(event) => updateConductorEnd(end.id, "connectionState", event.currentTarget.value as BoxConductorEndRecord["connectionState"])} value={end.connectionState}><option value="connected">Connected</option><option value="capped">Capped</option><option value="spare">Spare</option><option value="abandoned">Abandoned</option><option value="repurposed">Repurposed</option><option value="unknown">Unknown</option></select></td>
                  <td><select aria-label={`${end.id} connection point`} disabled={end.connectionState !== "connected"} onChange={(event) => updateConductorEnd(end.id, "nodeId", event.currentTarget.value || null)} value={end.nodeId ?? ""}><NodeOptions model={model} selectedNodeId={end.nodeId} /></select></td>
                  <td><select aria-label={`${end.id} termination method`} onChange={(event) => updateConductorEnd(end.id, "terminationMethod", event.currentTarget.value as BoxTerminationMethod)} value={end.terminationMethod}>{preserveUnlistedOption(end.terminationMethod, BOX_TERMINATION_METHODS)}<OptionList values={BOX_TERMINATION_METHODS} /></select></td>
                  <td><select aria-label={`${end.id} certainty`} onChange={(event) => updateConductorEnd(end.id, "certainty", event.currentTarget.value as BoxTerminationCertainty)} value={end.certainty ?? "unknown"}>{preserveUnlistedOption(end.certainty, BOX_TERMINATION_CERTAINTIES)}<OptionList values={BOX_TERMINATION_CERTAINTIES} /></select></td>
                  <td><RemoveButton label={`${conductor?.permanentCode ?? end.conductorId} end ${end.designation}`} onRequestRemove={onRequestRemove} selection={{ kind: "conductor-end", id: end.id }} /></td>
                </tr>
              );
            })}
          </EditableTable>
        </EditSection>
      </div>
    </div>
  );
}
