"use client";

import { Cable, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { EmptyState, SafetyNotice } from "@/components/ui";
import {
  WiringTraceView,
  type TopologySelection,
  type TopologyVisualModel,
} from "@/features/wiring";
import { useUrlSelection } from "@/features/selection";
import { appendQuery, propertyApiPath, useApiResource } from "@/lib/client";

import { RouteError, RouteFrame, RouteLoading } from "../route-ui";
import { toTraceRootKind } from "../selection-routing";

type TraceResponse = {
  visualModel: TopologyVisualModel;
  validation?: {
    errors?: unknown[];
    warnings?: unknown[];
  };
};

export function WiringClient({ propertyId }: { propertyId: string }) {
  const query = useSearchParams();
  const selection = useUrlSelection();
  const rootId = query.get("rootId") ?? selection.selection?.id ?? null;
  const rootKind = toTraceRootKind(query.get("rootKind") ?? selection.selection?.kind ?? null);
  const resource = useApiResource<TraceResponse>(
    rootKind && rootId
      ? appendQuery(propertyApiPath(propertyId, "topology/trace"), { rootKind, rootId })
      : null,
  );

  if (!rootKind || !rootId) {
    return (
      <RouteFrame>
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
