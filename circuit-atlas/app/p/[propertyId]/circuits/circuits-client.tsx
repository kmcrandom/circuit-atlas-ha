"use client";

import { CircuitBoard, Plus, Zap } from "lucide-react";
import { useState } from "react";

import { Dialog, EmptyState, Field } from "@/components/ui";
import {
  CircuitWorkspace,
  type BreakerPanelModel,
  type BreakerSummary,
  type ConnectedAsset,
} from "@/features/circuits";
import { useUrlSelection } from "@/features/selection";
import {
  apiMutation,
  navigateToAppPath,
  propertyApiPath,
  useApiResource,
} from "@/lib/client";

import {
  primaryButtonClass,
  RouteError,
  RouteFrame,
  RouteLoading,
  secondaryButtonClass,
} from "../route-ui";

type CircuitsResponse = {
  panels: BreakerPanelModel[];
  breakers: BreakerSummary[];
  connectedAssetsByBreaker: Record<string, ConnectedAsset[]>;
};

type PanelDraft = {
  displayName: string;
  role: "main" | "subpanel" | "other";
  columnCount: number;
  rowCount: number;
  voltageDescription: string;
};

type BreakerDraft = {
  panelId: string;
  label: string;
  ratingAmps: string;
  poleCount: number;
  kind: "standard" | "gfci" | "afci" | "dual_function" | "main" | "tandem" | "quad" | "other" | "unknown";
  hasAfci: boolean;
  hasGfci: boolean;
  positionIds: string[];
  notes: string;
};

type CircuitDraft = {
  name: string;
  nominalVoltage: string;
  purpose: string;
  notes: string;
  breakerPoleId: string;
};

type PoleOption = {
  id: string;
  breakerId: string;
  label: string;
  permanentCode?: string;
  poleIndex: number;
  phaseLeg?: string;
};

type CircuitSourcesResponse = { items: unknown[]; poleOptions: PoleOption[] };

const EMPTY_PANEL: PanelDraft = {
  displayName: "",
  role: "main",
  columnCount: 2,
  rowCount: 20,
  voltageDescription: "",
};

const EMPTY_CIRCUIT: CircuitDraft = {
  name: "",
  nominalVoltage: "120",
  purpose: "",
  notes: "",
  breakerPoleId: "",
};

function newBreaker(panelId = ""): BreakerDraft {
  return {
    panelId,
    label: "",
    ratingAmps: "15",
    poleCount: 1,
    kind: "standard",
    hasAfci: false,
    hasGfci: false,
    positionIds: [],
    notes: "",
  };
}

function requestId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

function PanelEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  draft: PanelDraft;
  onChange: (draft: PanelDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string;
}) {
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <Field label="Panel name" isRequired>
        <input
          className="min-h-11 rounded-xl border border-slate-300 px-3"
          onChange={(event) => onChange({ ...draft, displayName: event.target.value })}
          placeholder="e.g. Main panel"
          required
          value={draft.displayName}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role">
          <select className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, role: event.target.value as PanelDraft["role"] })} value={draft.role}>
            <option value="main">Main panel</option>
            <option value="subpanel">Subpanel</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="System / voltage notes">
          <input className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, voltageDescription: event.target.value })} placeholder="Optional" value={draft.voltageDescription} />
        </Field>
        <Field label="Columns" description="Typical residential panels use two.">
          <input className="min-h-11 rounded-xl border border-slate-300 px-3" max="4" min="1" onChange={(event) => onChange({ ...draft, columnCount: Number(event.target.value) })} type="number" value={draft.columnCount} />
        </Field>
        <Field label="Rows per column">
          <input className="min-h-11 rounded-xl border border-slate-300 px-3" max="100" min="1" onChange={(event) => onChange({ ...draft, rowCount: Number(event.target.value) })} type="number" value={draft.rowCount} />
        </Field>
      </div>
      {error ? <p className="text-sm font-medium text-rose-700" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button className={secondaryButtonClass} disabled={isSaving} onClick={onCancel} type="button">Cancel</button>
        <button className={primaryButtonClass} disabled={isSaving || !draft.displayName.trim()} type="submit">{isSaving ? "Creating…" : "Create panel"}</button>
      </div>
    </form>
  );
}

function BreakerEditor({
  draft,
  panels,
  onChange,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  draft: BreakerDraft;
  panels: BreakerPanelModel[];
  onChange: (draft: BreakerDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string;
}) {
  const selectedPanel = panels.find((panel) => panel.id === draft.panelId);
  const available = selectedPanel?.positions.filter(
    (position) => !position.breakerId || draft.positionIds.includes(position.id),
  ) ?? [];
  const togglePosition = (id: string, checked: boolean) => {
    const current = draft.positionIds.filter((positionId) => positionId !== id);
    onChange({
      ...draft,
      positionIds: checked ? [...current, id].slice(0, draft.poleCount) : current,
    });
  };

  return (
    <form className="grid gap-5" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Panel" isRequired>
          <select className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, panelId: event.target.value, positionIds: [] })} required value={draft.panelId}>
            <option value="">Choose a panel</option>
            {panels.map((panel) => <option key={panel.id} value={panel.id}>{panel.name} · {panel.permanentCode}</option>)}
          </select>
        </Field>
        <Field label="Directory label" isRequired>
          <input className="min-h-11 rounded-xl border border-slate-300 px-3" maxLength={120} onChange={(event) => onChange({ ...draft, label: event.target.value })} placeholder="What this breaker serves" required value={draft.label} />
        </Field>
        <Field label="Pole count">
          <select className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => { const poleCount = Number(event.target.value); onChange({ ...draft, poleCount, positionIds: draft.positionIds.slice(0, poleCount) }); }} value={draft.poleCount}>
            {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} pole{count === 1 ? "" : "s"}</option>)}
          </select>
        </Field>
        <Field label="Rating (amps)">
          <input className="min-h-11 rounded-xl border border-slate-300 px-3" min="1" onChange={(event) => onChange({ ...draft, ratingAmps: event.target.value })} type="number" value={draft.ratingAmps} />
        </Field>
        <Field label="Breaker type">
          <select className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, kind: event.target.value as BreakerDraft["kind"] })} value={draft.kind}>
            <option value="standard">Standard</option><option value="gfci">GFCI</option><option value="afci">AFCI</option><option value="dual_function">Dual function</option><option value="main">Main</option><option value="tandem">Tandem</option><option value="quad">Quad</option><option value="other">Other</option><option value="unknown">Unknown</option>
          </select>
        </Field>
        <Field label="Protection flags">
          <div className="flex min-h-11 flex-wrap items-center gap-4 rounded-xl border border-slate-200 px-3">
            <label className="flex items-center gap-2 text-sm"><input checked={draft.hasAfci} onChange={(event) => onChange({ ...draft, hasAfci: event.target.checked })} type="checkbox" /> AFCI</label>
            <label className="flex items-center gap-2 text-sm"><input checked={draft.hasGfci} onChange={(event) => onChange({ ...draft, hasGfci: event.target.checked })} type="checkbox" /> GFCI</label>
          </div>
        </Field>
      </div>
      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Panel positions · choose {draft.poleCount}</legend>
        {draft.panelId ? (
          <div className="mt-2 grid max-h-56 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
            {available.map((position) => (
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm" key={position.id}>
                <input checked={draft.positionIds.includes(position.id)} disabled={!draft.positionIds.includes(position.id) && draft.positionIds.length >= draft.poleCount} onChange={(event) => togglePosition(position.id, event.target.checked)} type="checkbox" /> {position.label}
              </label>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-slate-600">Choose a panel first.</p>}
      </fieldset>
      <Field label="Notes"><textarea className="min-h-20 rounded-xl border border-slate-300 p-3" maxLength={4000} onChange={(event) => onChange({ ...draft, notes: event.target.value })} value={draft.notes} /></Field>
      {error ? <p className="text-sm font-medium text-rose-700" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-2"><button className={secondaryButtonClass} disabled={isSaving} onClick={onCancel} type="button">Cancel</button><button className={primaryButtonClass} disabled={isSaving || !draft.panelId || !draft.label.trim() || draft.positionIds.length !== draft.poleCount} type="submit">{isSaving ? "Creating…" : "Create breaker"}</button></div>
    </form>
  );
}

function CircuitEditor({
  draft,
  poleOptions,
  onChange,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  draft: CircuitDraft;
  poleOptions: PoleOption[];
  onChange: (draft: CircuitDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string;
}) {
  return (
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      <Field label="Circuit name" isRequired><input className="min-h-11 rounded-xl border border-slate-300 px-3" maxLength={120} onChange={(event) => onChange({ ...draft, name: event.target.value })} required value={draft.name} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nominal voltage"><input className="min-h-11 rounded-xl border border-slate-300 px-3" min="1" onChange={(event) => onChange({ ...draft, nominalVoltage: event.target.value })} placeholder="Unknown" type="number" value={draft.nominalVoltage} /></Field>
        <Field label="Purpose"><input className="min-h-11 rounded-xl border border-slate-300 px-3" maxLength={240} onChange={(event) => onChange({ ...draft, purpose: event.target.value })} placeholder="Optional" value={draft.purpose} /></Field>
      </div>
      <Field label="Source breaker pole" description="Optional. Choose the exact pole rather than forcing one breaker per circuit.">
        <select className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => onChange({ ...draft, breakerPoleId: event.target.value })} value={draft.breakerPoleId}>
          <option value="">Source not recorded yet</option>
          {poleOptions.map((pole) => <option key={pole.id} value={pole.id}>{pole.label} · pole {pole.poleIndex}</option>)}
        </select>
      </Field>
      <Field label="Notes"><textarea className="min-h-20 rounded-xl border border-slate-300 p-3" maxLength={4000} onChange={(event) => onChange({ ...draft, notes: event.target.value })} value={draft.notes} /></Field>
      {error ? <p className="text-sm font-medium text-rose-700" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-2"><button className={secondaryButtonClass} disabled={isSaving} onClick={onCancel} type="button">Cancel</button><button className={primaryButtonClass} disabled={isSaving || !draft.name.trim()} type="submit">{isSaving ? "Creating…" : "Create circuit"}</button></div>
    </form>
  );
}

export function CircuitsClient({ propertyId }: { propertyId: string }) {
  const selection = useUrlSelection();
  const resource = useApiResource<CircuitsResponse>(propertyApiPath(propertyId, "circuits"));
  const sourcesResource = useApiResource<CircuitSourcesResponse>(propertyApiPath(propertyId, "circuit-sources"));
  const [panelDraft, setPanelDraft] = useState<PanelDraft | null>(null);
  const [breakerDraft, setBreakerDraft] = useState<BreakerDraft | null>(null);
  const [circuitDraft, setCircuitDraft] = useState<CircuitDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const data = resource.data;

  async function createPanel() {
    if (!panelDraft) return;
    setIsSaving(true);
    setError(undefined);
    try {
      await apiMutation(
        propertyApiPath(propertyId, "panels"),
        "POST",
        {
          displayName: panelDraft.displayName.trim(),
          role: panelDraft.role,
          columnCount: panelDraft.columnCount,
          rowCount: panelDraft.rowCount,
          notes: panelDraft.voltageDescription.trim() || null,
        },
      );
      setPanelDraft(null);
      resource.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The panel could not be created.");
    } finally {
      setIsSaving(false);
    }
  }

  async function createBreaker() {
    if (!breakerDraft) return;
    setIsSaving(true);
    setError(undefined);
    try {
      await apiMutation(propertyApiPath(propertyId, "breakers"), "POST", {
        panelId: breakerDraft.panelId,
        label: breakerDraft.label.trim(),
        ratingAmps: breakerDraft.ratingAmps ? Number(breakerDraft.ratingAmps) : null,
        poleCount: breakerDraft.poleCount,
        kind: breakerDraft.kind,
        hasAfci: breakerDraft.hasAfci,
        hasGfci: breakerDraft.hasGfci,
        notes: breakerDraft.notes.trim() || null,
        poles: breakerDraft.positionIds.map((panelPositionId, index) => ({ panelPositionId, poleIndex: index + 1, phaseLeg: "unknown" })),
      });
      setBreakerDraft(null);
      resource.reload();
      sourcesResource.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The breaker could not be created.");
    } finally {
      setIsSaving(false);
    }
  }

  async function createCircuit() {
    if (!circuitDraft) return;
    setIsSaving(true);
    setError(undefined);
    try {
      const response = await apiMutation<{ item: { id: string; permanentCode: string } }>(propertyApiPath(propertyId, "circuits"), "POST", {
        name: circuitDraft.name.trim(),
        nominalVoltage: circuitDraft.nominalVoltage ? Number(circuitDraft.nominalVoltage) : null,
        purpose: circuitDraft.purpose.trim() || null,
        notes: circuitDraft.notes.trim() || null,
      });
      if (circuitDraft.breakerPoleId) {
        try {
          await apiMutation(propertyApiPath(propertyId, "circuit-sources"), "POST", {
            requestId: requestId("circuit-source"),
            circuitId: response.item.id,
            breakerPoleId: circuitDraft.breakerPoleId,
            legRole: "line",
          });
        } catch (caught) {
          setCircuitDraft(null);
          resource.reload();
          sourcesResource.reload();
          selection.select({ kind: "circuit", id: response.item.id });
          setError(
            `The circuit was created, but its source pole was not linked. ${
              caught instanceof Error ? caught.message : "Open the circuit and add its source later."
            }`,
          );
          return;
        }
      }
      setCircuitDraft(null);
      resource.reload();
      sourcesResource.reload();
      selection.select({ kind: "circuit", id: response.item.id });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The circuit could not be created.");
    } finally {
      setIsSaving(false);
    }
  }

  if (resource.status === "loading" && !data) return <RouteFrame><RouteLoading label="Loading panels and circuits…" /></RouteFrame>;
  if (resource.status === "error" && !data) return <RouteFrame><RouteError error={resource.error} onRetry={resource.reload} /></RouteFrame>;

  const panels = data?.panels ?? [];
  const breakers = data?.breakers ?? [];
  const selectedBreakerId = selection.selection?.kind === "breaker" ? selection.selection.id : undefined;
  const selectedAssetId = selection.selection && selection.selection.kind !== "breaker" ? selection.selection.id : undefined;
  const connectedAssets = Object.values(data?.connectedAssetsByBreaker ?? {}).flat();

  return (
    <RouteFrame>
      {error && !panelDraft && !breakerDraft && !circuitDraft ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
          {error}
        </div>
      ) : null}
      {panels.length ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><h1 className="text-xl font-semibold text-slate-950">Panels, breakers, and circuits</h1><p className="mt-1 text-sm text-slate-600">Build the physical panel first, then source each logical circuit from an exact breaker pole.</p></div>
          <div className="flex flex-wrap gap-2">
            <button className={secondaryButtonClass} onClick={() => { setError(undefined); setPanelDraft({ ...EMPTY_PANEL }); }} type="button"><Plus className="size-4" /> Panel</button>
            <button className={secondaryButtonClass} onClick={() => { setError(undefined); setBreakerDraft(newBreaker(panels[0]?.id)); }} type="button"><Zap className="size-4" /> Breaker</button>
            <button className={primaryButtonClass} onClick={() => { setError(undefined); setCircuitDraft({ ...EMPTY_CIRCUIT }); }} type="button"><CircuitBoard className="size-4" /> Circuit</button>
          </div>
        </div>
      ) : null}
      {panels.length ? (
        <CircuitWorkspace
          breakers={breakers}
          connectedAssetsByBreaker={data?.connectedAssetsByBreaker ?? {}}
          onEditBreaker={(breakerId) => selection.select({ kind: "breaker", id: breakerId })}
          onSelectAsset={(assetId) => {
            const asset = connectedAssets.find((candidate) => candidate.id === assetId);
            const kind = asset?.kind === "light-source" ? "light_source" : asset?.kind ?? "device";
            selection.select({ kind, id: assetId });
          }}
          onSelectBreaker={(breakerId) => selection.select({ kind: "breaker", id: breakerId })}
          onShowOnMap={(breakerId) => {
            navigateToAppPath(`/p/${encodeURIComponent(propertyId)}/map?breaker=${encodeURIComponent(breakerId)}&selectedKind=breaker&selectedId=${encodeURIComponent(breakerId)}`);
          }}
          onTrace={(breakerId) => {
            navigateToAppPath(`/p/${encodeURIComponent(propertyId)}/wiring?rootKind=breaker&rootId=${encodeURIComponent(breakerId)}&selectedKind=breaker&selectedId=${encodeURIComponent(breakerId)}`);
          }}
          panels={panels}
          selectedAssetId={selectedAssetId}
          selectedBreakerId={selectedBreakerId}
        />
      ) : (
        <EmptyState
          action={
            <button className={primaryButtonClass} onClick={() => setPanelDraft({ ...EMPTY_PANEL })} type="button">
              <Plus aria-hidden="true" className="size-4" /> Add the first panel
            </button>
          }
          className="min-h-[28rem] bg-white"
          description="Create the physical panel first. Then add breaker assemblies and circuits without assuming anything about this house."
          icon={<CircuitBoard className="size-5" />}
          title="No electrical panels recorded"
        />
      )}

      <Dialog
        description="Reproduce the physical panel layout. Breaker labels and positions are added as property data afterward."
        isOpen={Boolean(panelDraft)}
        onOpenChange={(open) => {
          if (!open && !isSaving) setPanelDraft(null);
        }}
        title="Add electrical panel"
      >
        {panelDraft ? (
          <PanelEditor
            draft={panelDraft}
            error={error}
            isSaving={isSaving}
            onCancel={() => setPanelDraft(null)}
            onChange={setPanelDraft}
            onSave={() => void createPanel()}
          />
        ) : null}
      </Dialog>
      <Dialog description="Choose each occupied physical position. Multi-pole assemblies remain one selectable breaker." isOpen={Boolean(breakerDraft)} onOpenChange={(open) => { if (!open && !isSaving) setBreakerDraft(null); }} size="large" title="Add breaker assembly">
        {breakerDraft ? <BreakerEditor draft={breakerDraft} error={error} isSaving={isSaving} onCancel={() => setBreakerDraft(null)} onChange={setBreakerDraft} onSave={() => void createBreaker()} panels={panels} /> : null}
      </Dialog>
      <Dialog description="A circuit is a logical branch or feeder. Its source can be one exact breaker pole, several poles, or temporarily unknown." isOpen={Boolean(circuitDraft)} onOpenChange={(open) => { if (!open && !isSaving) setCircuitDraft(null); }} title="Add circuit">
        {circuitDraft ? <CircuitEditor draft={circuitDraft} error={error} isSaving={isSaving} onCancel={() => setCircuitDraft(null)} onChange={setCircuitDraft} onSave={() => void createCircuit()} poleOptions={sourcesResource.data?.poleOptions ?? []} /> : null}
      </Dialog>
    </RouteFrame>
  );
}
