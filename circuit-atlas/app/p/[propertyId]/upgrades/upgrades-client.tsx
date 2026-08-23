"use client";

import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";

import { Dialog, EmptyState, Field } from "@/components/ui";
import type { InventoryAsset, UpgradeStatus } from "@/features/inventory";
import { useUrlSelection } from "@/features/selection";
import {
  UpgradeReadinessBoard,
  type UpgradeBoardFilter,
  type UpgradePlanItem,
} from "@/features/upgrades";
import { apiMutation, propertyApiPath, useApiResource } from "@/lib/client";

import {
  primaryButtonClass,
  RouteError,
  RouteFrame,
  RouteLoading,
  secondaryButtonClass,
} from "../route-ui";

type UpgradeItem = UpgradePlanItem & { revision?: number };
type UpgradesResponse = { items: UpgradeItem[]; revisionsById?: Record<string, number> };
type AssetsResponse = { items: InventoryAsset[] };
type UpgradeDraft = {
  id?: string;
  revision?: number;
  targetAssetId: string;
  status: UpgradeStatus;
  goal: string;
  notes: string;
};

const EMPTY_DRAFT: UpgradeDraft = {
  targetAssetId: "",
  status: "investigate",
  goal: "",
  notes: "",
};

function requestId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

export function UpgradesClient({ propertyId }: { propertyId: string }) {
  const selection = useUrlSelection();
  const resource = useApiResource<UpgradesResponse>(propertyApiPath(propertyId, "upgrades"));
  const assetsResource = useApiResource<AssetsResponse>(propertyApiPath(propertyId, "assets"));
  const [filter, setFilter] = useState<UpgradeBoardFilter>("all");
  const [draft, setDraft] = useState<UpgradeDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const data = resource.data;

  async function saveUpgrade() {
    if (!draft) return;
    setIsSaving(true);
    setError(undefined);
    try {
      if (draft.id && draft.revision) {
        await apiMutation(
          propertyApiPath(propertyId, `upgrades/${encodeURIComponent(draft.id)}`),
          "PATCH",
          {
            requestId: requestId("edit-upgrade"),
            revision: draft.revision,
            status: draft.status,
            goal: draft.goal.trim(),
            notes: draft.notes.trim() || null,
          },
        );
      } else {
        await apiMutation(propertyApiPath(propertyId, "upgrades"), "POST", {
          requestId: requestId("create-upgrade"),
          targetAssetId: draft.targetAssetId,
          status: draft.status,
          goal: draft.goal.trim(),
          notes: draft.notes.trim() || null,
        });
      }
      setDraft(null);
      resource.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The upgrade item could not be created.");
    } finally {
      setIsSaving(false);
    }
  }

  function editUpgrade(id: string) {
    const item = data?.items.find((candidate) => candidate.id === id);
    const revision = item?.revision ?? data?.revisionsById?.[id];
    if (!item || !revision) {
      setError("This upgrade item could not be loaded for editing. Refresh the plan and try again.");
      resource.reload();
      return;
    }
    setDraft({
      id,
      revision,
      targetAssetId: item.assetId,
      status: item.status,
      goal: item.goal,
      notes: item.notes ?? "",
    });
  }

  async function updateStatus(id: string, status: UpgradeStatus) {
    const item = data?.items.find((candidate) => candidate.id === id);
    let revision = item?.revision ?? data?.revisionsById?.[id];
    if (!revision) {
      try {
        const detail = await import("@/lib/client").then(({ apiRequest }) =>
          apiRequest<{ revision: number }>(propertyApiPath(propertyId, `upgrades/${encodeURIComponent(id)}`)),
        );
        revision = detail.revision;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The upgrade item could not be refreshed.");
        return;
      }
    }
    if (!revision) {
      setError("This upgrade item is missing its edit revision. Reload the plan and try again.");
      resource.reload();
      return;
    }
    setError(undefined);
    try {
      await apiMutation(propertyApiPath(propertyId, `upgrades/${encodeURIComponent(id)}`), "PATCH", {
        requestId: requestId("update-upgrade"),
        revision,
        status,
      });
      resource.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The status could not be updated.");
      resource.reload();
    }
  }

  if (resource.status === "loading" && !data) return <RouteFrame><RouteLoading label="Loading upgrade plan…" /></RouteFrame>;
  if (resource.status === "error" && !data) return <RouteFrame><RouteError error={resource.error} onRetry={resource.reload} /></RouteFrame>;
  const items = data?.items ?? [];
  const candidates = (assetsResource.data?.items ?? []).filter((asset) =>
    ["switch", "receptacle", "fixture", "light-source", "appliance", "box"].includes(asset.kind),
  );

  return (
    <RouteFrame>
      {error ? <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">{error}</div> : null}
      {items.length ? (
        <UpgradeReadinessBoard
          filter={filter}
          items={items}
          onAddCandidate={() => setDraft({ ...EMPTY_DRAFT, targetAssetId: selection.selection?.id ?? "" })}
          onEditPlan={editUpgrade}
          onFilterChange={setFilter}
          onSelectItem={(id) => selection.select({ kind: "upgrade_item", id })}
          onStatusChange={(id, status) => void updateStatus(id, status)}
          selectedItemId={selection.selection?.kind === "upgrade_item" ? selection.selection.id : undefined}
        />
      ) : (
        <EmptyState
          action={
            candidates.length ? (
              <button className={primaryButtonClass} onClick={() => setDraft({ ...EMPTY_DRAFT, targetAssetId: selection.selection?.id ?? "" })} type="button">
                <Plus className="size-4" /> Add a candidate
              </button>
            ) : undefined
          }
          className="min-h-[28rem] bg-white"
          description={candidates.length ? "Choose an installed switch, receptacle, fixture, bulb, appliance, or box. Planned products remain separate from current wiring." : "Add installed devices to Inventory first, then use this plan to compare current and proposed smart-home capability."}
          icon={<Sparkles className="size-5" />}
          title="No smart-upgrade items yet"
        />
      )}

      <Dialog
        description="This planning record does not modify installed products or as-built topology."
        isOpen={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open && !isSaving) setDraft(null);
        }}
        title={draft?.id ? "Edit upgrade plan" : "Add upgrade candidate"}
      >
        {draft ? (
          <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void saveUpgrade(); }}>
            <Field label="Installed record" isRequired>
              <select className="min-h-11 rounded-xl border border-slate-300 px-3 disabled:bg-slate-100" disabled={Boolean(draft.id)} onChange={(event) => setDraft({ ...draft, targetAssetId: event.target.value })} required value={draft.targetAssetId}>
                <option value="">Choose a record</option>
                {candidates.map((asset) => <option key={asset.id} value={asset.id}>{asset.displayName} · {asset.permanentCode}</option>)}
              </select>
            </Field>
            <Field label="Goal" isRequired>
              <input className="min-h-11 rounded-xl border border-slate-300 px-3" maxLength={500} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} placeholder="What should change or become possible?" required value={draft.goal} />
            </Field>
            <Field label="Starting status">
              <select className="min-h-11 rounded-xl border border-slate-300 px-3" onChange={(event) => setDraft({ ...draft, status: event.target.value as UpgradeStatus })} value={draft.status}>
                <option value="investigate">Investigate</option>
                <option value="candidate">Candidate</option>
                <option value="planned">Planned</option>
                <option value="keep">Keep</option>
              </select>
            </Field>
            <Field label="Notes">
              <textarea className="min-h-24 rounded-xl border border-slate-300 p-3" maxLength={4000} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} value={draft.notes} />
            </Field>
            <div className="flex justify-end gap-2">
              <button className={secondaryButtonClass} disabled={isSaving} onClick={() => setDraft(null)} type="button">Cancel</button>
              <button className={primaryButtonClass} disabled={isSaving || !draft.targetAssetId || !draft.goal.trim()} type="submit">{isSaving ? "Saving…" : draft.id ? "Save plan" : "Add candidate"}</button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </RouteFrame>
  );
}
