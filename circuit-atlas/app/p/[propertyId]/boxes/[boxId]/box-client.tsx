"use client";

import { Camera, Cable, Plus } from "lucide-react";
import { AppLink } from "@/lib/client/runtime-path";
import { useState } from "react";

import { Dialog, Field, SafetyNotice } from "@/components/ui";
import {
  BoxPhysicalLayout,
  BoxTerminationEditor,
  type BoxDiagramSelection,
  type BoxTerminationAddKind,
  type BoxTerminationChange,
  type BoxPhysicalLayoutModel,
  type BoxTerminationModel,
  type BoxTerminationSelection,
} from "@/features/boxes";
import type { InventoryAsset } from "@/features/inventory";
import { useUrlSelection } from "@/features/selection";
import { apiDelete, apiMutation, propertyApiPath, useApiResource } from "@/lib/client";

import {
  RouteError,
  RouteFrame,
  RouteHeading,
  RouteLoading,
  secondaryButtonClass,
} from "../../route-ui";

type BoxResponse = {
  item: InventoryAsset;
  layout: BoxPhysicalLayoutModel;
  topology?: unknown;
  termination?: BoxTerminationModel;
};

type TerminationResponse = { termination: BoxTerminationModel };

const routeKindBySelection: Record<BoxTerminationSelection["kind"], string> = {
  terminal: "terminals",
  splice: "splices",
  "open-end": "open-endpoints",
  bond: "bond-points",
  conductor: "conductors",
  "conductor-end": "conductor-ends",
};

type AddDraft = {
  kind: BoxTerminationAddKind;
  owningAssetId?: string;
  terminalKey?: string;
  label?: string;
  connectorType?: string;
  endpointKind?: "capped" | "abandoned" | "unconnected" | "unknown";
  description?: string;
  conductorKind?: "cable-core" | "equipment-ground" | "pigtail" | "jumper" | "device-lead" | "standalone" | "unknown" | "custom";
  observedInsulationColor?: string;
  gauge?: string;
  conductorId?: string;
  designation?: "A" | "B";
  nodeId?: string;
};

function revisionFor(model: BoxTerminationModel, selection: BoxTerminationSelection): number | undefined {
  if (selection.kind === "terminal") return model.terminals.find((item) => item.id === selection.id)?.revision;
  if (selection.kind === "splice") return model.splices.find((item) => item.id === selection.id)?.revision;
  if (selection.kind === "open-end") return model.openEndpoints.find((item) => item.id === selection.id)?.revision;
  if (selection.kind === "bond") return model.bondPoints.find((item) => item.id === selection.id)?.revision;
  if (selection.kind === "conductor") return model.conductors.find((item) => item.id === selection.id)?.revision;
  return model.conductorEnds.find((item) => item.id === selection.id)?.revision;
}

function valuesForChange(model: BoxTerminationModel, change: BoxTerminationChange) {
  const collection = change.kind === "terminal" ? model.terminals
    : change.kind === "splice" ? model.splices
      : change.kind === "open-end" ? model.openEndpoints
        : change.kind === "bond" ? model.bondPoints
          : change.kind === "conductor" ? model.conductors
            : model.conductorEnds;
  const record = collection.find((item) => item.id === change.id) as unknown as Record<string, unknown> | undefined;
  return record ? { [change.field]: record[change.field] ?? null } : {};
}

function blankDraft(kind: BoxTerminationAddKind): AddDraft {
  return {
    kind,
    endpointKind: "unknown",
    conductorKind: "unknown",
    designation: "A",
  };
}

function diagramSelection(kind: string, id: string): BoxDiagramSelection | null {
  if (kind === "cable-entry") return { kind: "cable-entry", id };
  if (kind === "mount") return { kind: "mount", id };
  return null;
}

function AddTerminationDialog({
  draft,
  model,
  isSaving,
  onChange,
  onClose,
  onAdd,
}: {
  draft?: AddDraft;
  model?: BoxTerminationModel;
  isSaving: boolean;
  onChange: (draft: AddDraft) => void;
  onClose: () => void;
  onAdd: () => void;
}) {
  const nodes = model ? [
    ...model.terminals.map((item) => ({ id: item.id, label: `${item.assetLabel} — ${item.manufacturerLabel || item.terminalKey}` })),
    ...model.splices.map((item) => ({ id: item.id, label: item.label })),
    ...model.openEndpoints.map((item) => ({ id: item.id, label: item.label || "Open / capped end" })),
    ...model.bondPoints.map((item) => ({ id: item.id, label: item.label })),
  ] : [];
  const mountedAssets = model
    ? Array.from(new Map(model.terminals.map((item) => [item.owningAssetId, { id: item.owningAssetId, label: item.assetLabel }])).values())
    : [];
  const valid = Boolean(draft && (
    (draft.kind === "terminal" && draft.owningAssetId && draft.terminalKey?.trim()) ||
    (draft.kind === "splice" && draft.label?.trim()) ||
    draft.kind === "open-end" ||
    (draft.kind === "bond" && draft.label?.trim()) ||
    draft.kind === "conductor" ||
    (draft.kind === "conductor-end" && draft.conductorId && draft.nodeId && draft.designation)
  ));

  return (
    <Dialog
      description="Unknown values are valid. Permanent identifiers and A/B end identity are assigned by Circuit Atlas."
      footer={
        <>
          <button className={secondaryButtonClass} disabled={isSaving} onClick={onClose} type="button">Cancel</button>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!valid || isSaving} onClick={onAdd} type="button">
            <Plus aria-hidden="true" className="size-4" /> {isSaving ? "Adding…" : "Add record"}
          </button>
        </>
      }
      isDismissable={!isSaving}
      isKeyboardDismissDisabled={isSaving}
      isOpen={Boolean(draft)}
      onOpenChange={(open) => !open && onClose()}
      title={draft ? `Add ${draft.kind.replaceAll("-", " ")}` : "Add termination record"}
    >
      {draft ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {draft.kind === "terminal" ? (
            <>
              <Field label="Mounted device" isRequired>
                <select className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, owningAssetId: event.currentTarget.value })} required value={draft.owningAssetId ?? ""}>
                  <option value="">Choose a mounted device</option>
                  {mountedAssets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="Terminal key" isRequired><input className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, terminalKey: event.currentTarget.value })} placeholder="LINE, LOAD, COM…" value={draft.terminalKey ?? ""} /></Field>
            </>
          ) : null}
          {draft.kind === "splice" || draft.kind === "bond" ? (
            <Field className="sm:col-span-2" label="Label" isRequired><input className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, label: event.currentTarget.value })} placeholder={draft.kind === "splice" ? "Always-hot splice" : "Metal box bond"} value={draft.label ?? ""} /></Field>
          ) : null}
          {draft.kind === "splice" ? (
            <Field className="sm:col-span-2" label="Connector type" description="Optional"><input className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, connectorType: event.currentTarget.value })} value={draft.connectorType ?? ""} /></Field>
          ) : null}
          {draft.kind === "open-end" ? (
            <>
              <Field label="Label" description="Optional"><input className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, label: event.currentTarget.value })} value={draft.label ?? ""} /></Field>
              <Field label="Status"><select className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, endpointKind: event.currentTarget.value as AddDraft["endpointKind"] })} value={draft.endpointKind}><option value="unknown">Unknown</option><option value="capped">Capped</option><option value="abandoned">Abandoned</option><option value="unconnected">Unconnected</option></select></Field>
            </>
          ) : null}
          {draft.kind === "open-end" || draft.kind === "bond" ? (
            <Field className="sm:col-span-2" label="Description" description="Optional"><textarea className="min-h-24 rounded-xl border border-slate-300 px-3 py-2" onChange={(event) => onChange({ ...draft, description: event.currentTarget.value })} value={draft.description ?? ""} /></Field>
          ) : null}
          {draft.kind === "conductor" ? (
            <>
              <Field label="Conductor kind"><select className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, conductorKind: event.currentTarget.value as AddDraft["conductorKind"] })} value={draft.conductorKind}><option value="unknown">Unknown</option><option value="cable-core">Cable core</option><option value="equipment-ground">Equipment ground</option><option value="pigtail">Pigtail</option><option value="jumper">Jumper</option><option value="device-lead">Device lead</option><option value="standalone">Standalone</option><option value="custom">Custom</option></select></Field>
              <Field label="Observed color" description="Observation only; never assigns function"><input className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, observedInsulationColor: event.currentTarget.value })} value={draft.observedInsulationColor ?? ""} /></Field>
              <Field label="Gauge" description="Optional"><input className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, gauge: event.currentTarget.value })} placeholder="12 AWG" value={draft.gauge ?? ""} /></Field>
            </>
          ) : null}
          {draft.kind === "conductor-end" ? (
            <>
              <Field label="Conductor" isRequired><select className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, conductorId: event.currentTarget.value })} value={draft.conductorId ?? ""}><option value="">Choose</option>{model?.conductors.map((item) => <option key={item.id} value={item.id}>{item.permanentCode}</option>)}</select></Field>
              <Field label="End" isRequired><select className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, designation: event.currentTarget.value as "A" | "B" })} value={draft.designation}><option value="A">A</option><option value="B">B</option></select></Field>
              <Field className="sm:col-span-2" label="Connection point" isRequired><select className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, nodeId: event.currentTarget.value })} value={draft.nodeId ?? ""}><option value="">Choose</option>{nodes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
            </>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

export function BoxClient({ propertyId, boxId }: { propertyId: string; boxId: string }) {
  const selection = useUrlSelection();
  const resource = useApiResource<BoxResponse>(propertyApiPath(propertyId, `boxes/${encodeURIComponent(boxId)}`));
  const [termination, setTermination] = useState<BoxTerminationModel>();
  const [pendingModel, setPendingModel] = useState<BoxTerminationModel>();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [addDraft, setAddDraft] = useState<AddDraft>();
  const [selectedTermination, setSelectedTermination] = useState<BoxTerminationSelection | null>(null);
  if (resource.status === "loading" && !resource.data) return <RouteFrame><RouteLoading label="Loading box diagram…" /></RouteFrame>;
  if (resource.status === "error" && !resource.data) return <RouteFrame><RouteError error={resource.error} onRetry={resource.reload} title="The box diagram could not be loaded" /></RouteFrame>;
  const data = resource.data;
  if (!data) return null;
  const selected = selection.selection ? diagramSelection(selection.selection.kind, selection.selection.id) : null;
  const model = pendingModel ?? termination ?? data.termination;

  async function changeTermination(nextModel: BoxTerminationModel, change: BoxTerminationChange) {
    if (!model || isSaving) return;
    const kind = routeKindBySelection[change.kind];
    const revision = revisionFor(model, { kind: change.kind, id: change.id });
    if (!revision) {
      setMessage("Reload this box before editing that record.");
      return;
    }
    setPendingModel(nextModel);
    setIsSaving(true);
    setMessage("Saving…");
    try {
      const response = await apiMutation<TerminationResponse>(
        propertyApiPath(propertyId, `boxes/${encodeURIComponent(boxId)}/terminations/${kind}/${encodeURIComponent(change.id)}`),
        "PATCH",
        { requestId: `box-termination:${crypto.randomUUID()}`, revision, values: valuesForChange(nextModel, change) },
      );
      setTermination(response.termination);
      setPendingModel(undefined);
      setMessage("Saved.");
    } catch (error) {
      setPendingModel(undefined);
      setMessage(error instanceof Error ? error.message : "The termination could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeTermination(next: BoxTerminationSelection) {
    if (!model || isSaving) return;
    const revision = revisionFor(model, next);
    if (!revision) {
      setMessage("Reload this box before removing that record.");
      return;
    }
    if (!window.confirm("Remove this structured termination record? Attached wiring must be moved first.")) return;
    setIsSaving(true);
    setMessage("Saving…");
    try {
      const response = await apiDelete<TerminationResponse>(
        propertyApiPath(propertyId, `boxes/${encodeURIComponent(boxId)}/terminations/${routeKindBySelection[next.kind]}/${encodeURIComponent(next.id)}`),
        { requestId: `box-termination-remove:${crypto.randomUUID()}`, revision },
      );
      setTermination(response.termination);
      setPendingModel(undefined);
      setSelectedTermination(null);
      setMessage("Removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The record could not be removed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function addTermination() {
    if (!addDraft || !model || isSaving) return;
    const input: Record<string, unknown> = {
      ...addDraft,
      kind: routeKindBySelection[addDraft.kind],
      requestId: `box-termination-add:${crypto.randomUUID()}`,
    };
    if (addDraft.kind === "conductor-end") {
      const conductor = model.conductors.find((item) => item.id === addDraft.conductorId);
      input.revision = conductor?.revision;
    }
    setIsSaving(true);
    setMessage("Saving…");
    try {
      const response = await apiMutation<TerminationResponse>(
        propertyApiPath(propertyId, `boxes/${encodeURIComponent(boxId)}/terminations`),
        "POST",
        input,
      );
      setTermination(response.termination);
      setPendingModel(undefined);
      setAddDraft(undefined);
      setMessage("Added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The record could not be added.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <RouteFrame>
      <RouteHeading
        actions={
          <>
            <AppLink className={secondaryButtonClass} href={`/p/${encodeURIComponent(propertyId)}/capture/new?targetId=${encodeURIComponent(boxId)}&targetKind=box`}>
              <Camera aria-hidden="true" className="size-4" /> Continue room walk
            </AppLink>
            <AppLink className={secondaryButtonClass} href={`/p/${encodeURIComponent(propertyId)}/wiring?rootKind=box&rootId=${encodeURIComponent(boxId)}`}>
              <Cable aria-hidden="true" className="size-4" /> Trace wiring
            </AppLink>
          </>
        }
        description={[data.item.locationLabel, data.item.locatorLabel].filter(Boolean).join(" · ") || "Location not recorded"}
        eyebrow={data.item.permanentCode}
        title={data.item.displayName}
      />
      <SafetyNotice className="mb-4" title="Standard diagram orientation">
        Wall boxes are viewed from the finished-room side looking in; gang positions run left to right. Cable entries show only how they enter this box, never the concealed route between boxes.
      </SafetyNotice>
      <BoxPhysicalLayout
        model={data.layout}
        onSelect={(next) => selection.select({ kind: next.kind, id: next.id }, { replace: true })}
        selected={selected}
      />
      {model ? (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="termination-heading">
          <header className="mb-4">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-orange-700">Conductor traceability</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950" id="termination-heading">Terminations inside this box</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Each A/B conductor end terminates independently at a terminal, splice, cap/open point, or bond. Changes save as you make them.</p>
          </header>
          {message ? <p aria-live="polite" className={`mb-4 rounded-xl border px-4 py-3 text-sm ${message.endsWith(".") && (message === "Saved." || message === "Added." || message === "Removed.") ? "border-emerald-200 bg-emerald-50 text-emerald-950" : message === "Saving…" ? "border-blue-200 bg-blue-50 text-blue-950" : "border-rose-200 bg-rose-50 text-rose-950"}`} role="status">{message}</p> : null}
          <BoxTerminationEditor
            model={model}
            onChange={(nextModel, change) => void changeTermination(nextModel, change)}
            onRequestAdd={(kind) => setAddDraft(blankDraft(kind))}
            onRequestRemove={(next) => void removeTermination(next)}
            onSelect={(next) => {
              setSelectedTermination(next);
              selection.select({ kind: next.kind.replaceAll("-", "_"), id: next.id }, { replace: true });
            }}
            selected={selectedTermination}
          />
        </section>
      ) : null}

      <AddTerminationDialog
        draft={addDraft}
        isSaving={isSaving}
        model={model}
        onAdd={() => void addTermination()}
        onChange={setAddDraft}
        onClose={() => !isSaving && setAddDraft(undefined)}
      />
    </RouteFrame>
  );
}
