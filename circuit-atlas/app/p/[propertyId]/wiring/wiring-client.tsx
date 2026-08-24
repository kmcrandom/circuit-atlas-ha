"use client";

import { Cable, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { EmptyState, SafetyNotice } from "@/components/ui";
import {
  WiringTraceView,
  type TopologySelection,
  type TopologyVisualModel,
} from "@/features/wiring";
import { useUrlSelection } from "@/features/selection";
import { appendQuery, navigateToAppPath, propertyApiPath, useApiResource, withRuntimeBasePath } from "@/lib/client";

import { RouteError, RouteFrame, RouteLoading } from "../route-ui";
import { toTraceRootKind } from "../selection-routing";

type TraceResponse = {
  visualModel: TopologyVisualModel;
  validation?: {
    errors?: unknown[];
    warnings?: unknown[];
  };
};

type WiringConfiguration = { id: string; name: string; status: "draft" | "planned" | "current" | "historical"; summary: string | null; revision: number; connectionCount: number };

function WiringConfigurationBar({ propertyId, selectedId }: { propertyId: string; selectedId: string | null }) {
  const [items, setItems] = useState<WiringConfiguration[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeCount, setChangeCount] = useState<number | null>(null);
  useEffect(() => {
    fetch(withRuntimeBasePath(propertyApiPath(propertyId, "wiring-configurations")), { headers: { accept: "application/json" } })
      .then(async (response) => { if (!response.ok) throw new Error("Wiring configurations could not be loaded."); return response.json() as Promise<{ items: WiringConfiguration[] }>; })
      .then((body) => setItems(body.items))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Wiring configurations could not be loaded."));
  }, [propertyId]);
  const current = items.find((item) => item.status === "current");
  const selected = items.find((item) => item.id === selectedId) ?? current;
  useEffect(() => {
    if (!current || !selected || current.id === selected.id) { setChangeCount(null); return; }
    fetch(withRuntimeBasePath(appendQuery(propertyApiPath(propertyId, "wiring-configurations/compare"), { from: current.id, to: selected.id })), { headers: { accept: "application/json" } })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ totalChanges: number }>; })
      .then((body) => setChangeCount(body.totalChanges))
      .catch(() => setChangeCount(null));
  }, [current, propertyId, selected]);
  function choose(id: string) {
    const url = new URL(window.location.href);
    if (id === current?.id) url.searchParams.delete("configurationId"); else url.searchParams.set("configurationId", id);
    navigateToAppPath(`${url.pathname}${url.search}`, true);
  }
  async function clone() {
    if (!selected) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(withRuntimeBasePath(propertyApiPath(propertyId, `wiring-configurations/${selected.id}/clone`)), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: selected.status === "historical" ? `Reversion plan from ${selected.name}` : `Planned changes from ${selected.name}`, status: "planned" }) });
      const body = await response.json() as { item?: WiringConfiguration; error?: { message?: string } };
      if (!response.ok || !body.item) throw new Error(body.error?.message ?? "The wiring plan could not be created.");
      choose(body.item.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The wiring plan could not be created."); setBusy(false); }
  }
  async function activate() {
    if (!selected || selected.status !== "planned" || !current || !window.confirm("Make this plan the current wiring? The existing current wiring will remain available as history.")) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(withRuntimeBasePath(propertyApiPath(propertyId, `wiring-configurations/${selected.id}/activate`)), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: selected.revision, expectedCurrentConfigurationId: current.id }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The wiring plan could not be activated.");
      choose(selected.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The wiring plan could not be activated."); setBusy(false); }
  }
  return <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-64 gap-1 text-sm font-medium">Wiring record
        <select className="rounded-lg border border-slate-300 bg-white px-3 py-2" disabled={!items.length || busy} onChange={(event) => choose(event.target.value)} value={selected?.id ?? ""}>
          {!items.length ? <option value="">Loading…</option> : items.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.status}</option>)}
        </select>
      </label>
      {selected ? <button className="secondary-button" disabled={busy} onClick={() => void clone()} type="button">{selected.status === "historical" ? "Plan a reversion" : "Plan changes"}</button> : null}
      {selected?.status === "planned" ? <button className="primary-button" disabled={busy} onClick={() => void activate()} type="button">Make current</button> : null}
      {selected ? <span className="text-sm text-slate-500">{selected.connectionCount} conductor ends · {selected.status === "historical" ? "Read-only" : "Editable"}{changeCount !== null ? ` · ${changeCount} changes from current` : ""}</span> : null}
    </div>
    {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
  </div>;
}

export function WiringClient({ propertyId }: { propertyId: string }) {
  const query = useSearchParams();
  const selection = useUrlSelection();
  const rootId = query.get("rootId") ?? selection.selection?.id ?? null;
  const rootKind = toTraceRootKind(query.get("rootKind") ?? selection.selection?.kind ?? null);
  const configurationId = query.get("configurationId");
  const resource = useApiResource<TraceResponse>(
    rootKind && rootId
      ? appendQuery(propertyApiPath(propertyId, "topology/trace"), { rootKind, rootId, configurationId })
      : null,
  );

  if (!rootKind || !rootId) {
    return (
      <RouteFrame>
        <WiringConfigurationBar propertyId={propertyId} selectedId={configurationId} />
        <EmptyState
          className="min-h-[28rem] bg-white"
          description="Use global search, select a breaker in Circuits, or choose an inventory record. Then open its Diagram tab to follow the known path in either direction."
          icon={<Search className="size-5" />}
          title="Choose where to start tracing"
        />
      </RouteFrame>
    );
  }

  if (resource.status === "loading" && !resource.data) return <RouteFrame><RouteLoading label="Tracing documented wiring…" /></RouteFrame>;
  if (resource.status === "error" && !resource.data) return <RouteFrame><RouteError error={resource.error} onRetry={resource.reload} title="The wiring trace could not be built" /></RouteFrame>;

  const model = resource.data?.visualModel;
  if (!model || model.nodes.length === 0) {
    return (
      <RouteFrame>
        <WiringConfigurationBar propertyId={propertyId} selectedId={configurationId} />
        <EmptyState
          className="min-h-[28rem] bg-white"
          description="This record exists, but no conductor ends, terminals, splices, internal contacts, source nodes, or trace gaps connect to it yet. Unknown topology can be added during a room walk."
          icon={<Cable className="size-5" />}
          title="No traceable wiring recorded"
        />
      </RouteFrame>
    );
  }

  const diagramSelection: TopologySelection | null = selection.selection
    ? {
        entityId: selection.selection.id,
        entityKind: selection.selection.kind.replaceAll("_", "-") as TopologySelection["entityKind"],
      }
    : null;

  return (
    <RouteFrame>
      <WiringConfigurationBar propertyId={propertyId} selectedId={configurationId} />
      <SafetyNotice className="mb-4" title="A recorded trace is not proof of de-energization">
        The diagram shows documented and possible electrical relationships, including the union of valid switch states. Independently verify before working on equipment.
      </SafetyNotice>
      <WiringTraceView
        model={model}
        onSelectionChange={(next) => {
          if (!next) return selection.clear({ replace: true });
          selection.select({ kind: next.entityKind.replaceAll("-", "_"), id: next.entityId }, { replace: true });
        }}
        selected={diagramSelection}
      />
      {resource.status === "error" ? (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
          The last trace remains visible, but refresh failed: {resource.error.message}
        </div>
      ) : null}
    </RouteFrame>
  );
}
