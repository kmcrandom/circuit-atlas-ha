"use client";

import { AlertTriangle, Camera, Cable, Image as ImageIcon, LoaderCircle, Sparkles } from "lucide-react";
import { AppLink } from "@/lib/client/runtime-path";
import type { ReactNode } from "react";

import { Inspector, SourceSummary, type SourceSummaryItem } from "@/components/inspector";
import { EmptyState, StatusBadge } from "@/components/ui";
import type { UrlSelection } from "@/features/selection";
import { propertyApiPath, useApiResource } from "@/lib/client";

import { toTraceRootKind } from "./selection-routing";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberText(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : text(value);
}

function itemFromResponse(value: unknown): JsonRecord {
  const outer = record(value) ?? {};
  return record(outer.item) ?? record(outer.asset) ?? record(outer.breaker) ?? outer;
}

function inspectorPath(propertyId: string, selection: UrlSelection): string {
  const id = encodeURIComponent(selection.id);
  switch (selection.kind) {
    case "breaker":
      return propertyApiPath(propertyId, `breakers/${id}`);
    case "panel":
      return propertyApiPath(propertyId, `assets/${id}`);
    case "circuit":
      return propertyApiPath(propertyId, `circuits/${id}`);
    case "cable":
      return propertyApiPath(propertyId, `assets/${id}`);
    case "conductor":
      return propertyApiPath(propertyId, `topology/conductors/${id}`);
    case "electrical_node":
      return propertyApiPath(propertyId, `topology/nodes/${id}`);
    case "node":
    case "terminal":
    case "splice":
    case "bond":
    case "open_end":
    case "open-end":
    case "unknown":
      return propertyApiPath(propertyId, `topology/nodes/${id}`);
    case "connection":
      return propertyApiPath(propertyId, `topology/connections/${id}`);
    case "control_group":
      return propertyApiPath(propertyId, `topology/control-groups/${id}`);
    case "mount":
      return propertyApiPath(propertyId, `topology/asset-mounts/${id}`);
    case "cable-entry":
      return propertyApiPath(propertyId, `topology/box-ports/${id}`);
    case "upgrade_item":
      return propertyApiPath(propertyId, `upgrades/${id}`);
    default:
      return propertyApiPath(propertyId, `assets/${id}`);
  }
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function FieldList({ fields }: { fields: Array<[string, ReactNode | undefined]> }) {
  const visible = fields.filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!visible.length) {
    return <p className="text-sm leading-6 text-slate-600">No additional details are recorded yet.</p>;
  }
  return (
    <dl className="grid gap-3">
      {visible.map(([label, value]) => (
        <div className="border-b border-slate-100 pb-3 last:border-0" key={label}>
          <dt className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function sourcesFrom(item: JsonRecord, response: JsonRecord): SourceSummaryItem[] {
  const power = record(response.power);
  const candidates =
    (Array.isArray(item.breakerReferences) && item.breakerReferences) ||
    (Array.isArray(item.sources) && item.sources) ||
    (Array.isArray(response.sources) && response.sources) ||
    (Array.isArray(response.breakers) && response.breakers) ||
    (Array.isArray(power?.breakers) && power.breakers) ||
    [];

  return candidates.flatMap((candidate, index) => {
    const source = record(candidate);
    if (!source) return [];
    const id = text(source.id) ?? text(source.breakerId) ?? `source-${index}`;
    const relationship = text(source.relationship) ?? text(source.provenance) ?? "unknown";
    const provenance =
      relationship === "traced" || relationship === "graph" || relationship === "derived"
        ? "derived"
        : relationship === "asserted"
          ? "asserted"
          : relationship === "both" || relationship === "asserted_and_derived"
            ? "asserted_and_derived"
            : relationship === "conflicting" || relationship === "conflict"
              ? "conflict"
              : "unknown";
    return [{
      id,
      label: text(source.label) ?? text(source.name) ?? text(source.breakerLabel) ?? "Recorded breaker",
      code: text(source.permanentCode) ?? text(source.code),
      details: text(source.panelName) ?? text(source.details),
      provenance,
    } satisfies SourceSummaryItem];
  });
}

function InspectorContent({
  propertyId,
  selection,
  onClose,
  onTabChange,
}: {
  propertyId: string;
  selection: UrlSelection;
  onClose: () => void;
  onTabChange: (tab?: string) => void;
}) {
  const resource = useApiResource<unknown>(inspectorPath(propertyId, selection));

  if (resource.status === "loading" && resource.data === undefined) {
    return (
      <section className="grid min-h-full place-items-center bg-white" aria-label="Loading record details">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-600" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Loading details…
        </span>
      </section>
    );
  }

  if (resource.status === "error" && resource.data === undefined) {
    return (
      <section className="grid min-h-full place-items-center bg-white p-5">
        <EmptyState
          action={
            <button
              className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
              onClick={resource.reload}
              type="button"
            >
              Try again
            </button>
          }
          compact
          description={resource.error.message}
          icon={<AlertTriangle className="size-5 text-rose-700" />}
          title="Details unavailable"
        />
      </section>
    );
  }

  const response = record(resource.data) ?? {};
  const item = itemFromResponse(resource.data);
  const installedProduct = record(item.installedProduct) ?? record(response.installedProduct);
  const location = record(item.location) ?? record(response.location);
  const power = record(response.power);
  const title =
    text(item.displayName) ?? text(item.name) ?? text(item.label) ?? humanize(selection.kind);
  const kind = text(item.kind) ?? text(item.assetKind) ?? selection.kind;
  const verification = text(item.verification) ?? text(item.verificationStatus);
  const smartState = text(item.smartState);
  const sources = sourcesFrom(item, response);
  const connections: unknown[] =
    (Array.isArray(response.connections) && response.connections) ||
    (Array.isArray(item.connections) && item.connections) ||
    (Array.isArray(response.resolution) && response.resolution) ||
    (Array.isArray(record(power?.resolution)?.memberships) ? record(power?.resolution)?.memberships as unknown[] : []) ||
    [];
  const attachments =
    (Array.isArray(response.attachments) && response.attachments) ||
    (Array.isArray(item.attachments) && item.attachments) ||
    [];
  const upgrade = record(response.upgrade) ?? record(item.upgrade);
  const selectedTab = ["overview", "power", "connections", "diagram", "product", "location", "evidence", "upgrade"].includes(selection.tab ?? "")
    ? selection.tab
    : "overview";
  const traceRootKind = toTraceRootKind(selection.kind);
  const hidesAdministrativeCode = ["upgrade_item", "structure", "level", "space", "wall_zone"].includes(selection.kind);

  return (
    <Inspector
      badges={
        <>
          {verification ? <StatusBadge label={humanize(verification)} tone={verification.includes("conflict") ? "danger" : "info"} /> : null}
          {smartState ? <StatusBadge label={humanize(smartState)} tone={smartState === "smart" ? "smart" : smartState === "dumb" ? "dumb" : "neutral"} /> : null}
          {resource.status === "loading" ? <StatusBadge label="Refreshing" tone="neutral" /> : null}
        </>
      }
      kind={humanize(kind)}
      onClose={onClose}
      onSelectedTabChange={(tab) => onTabChange(tab)}
      permanentCode={hidesAdministrativeCode ? undefined : text(item.permanentCode)}
      selectedTabId={selectedTab}
      tabs={[
        {
          id: "overview",
          label: "Overview",
          content: (
            <FieldList fields={[
              ["Display name", title],
              ["Upgrade goal", text(item.goal)],
              ["Type", text(item.subtype) ?? humanize(kind)],
              ["Locator", text(item.locatorLabel)],
              ["Location", text(item.locationLabel) ?? text(location?.label)],
              ["Box / gang", [text(item.boxLabel), text(item.gangPosition)].filter(Boolean).join(" · ") || undefined],
              ["Notes", text(item.notes)],
            ]} />
          ),
        },
        {
          id: "power",
          label: "Power & control",
          content: (
            <SourceSummary
              description="Sources may be traced from documented conductors, manually asserted, conflicting, or not yet known."
              sources={sources}
            />
          ),
        },
        {
          id: "connections",
          label: "Connections",
          content: connections.length ? (
            <ul className="grid gap-2">
              {connections.map((candidate, index) => {
                const connection = record(candidate) ?? {};
                return (
                  <li className="rounded-xl border border-slate-200 p-3 text-sm leading-6" key={text(connection.id) ?? index}>
                    <strong className="block text-slate-950">{text(connection.label) ?? text(connection.kind) ?? `Connection ${index + 1}`}</strong>
                    <span className="text-slate-600">{text(connection.description) ?? text(connection.detail) ?? "Connection details are recorded in the topology."}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState compact description="No conductor, terminal, splice, control, or assertion connections are documented for this record yet." icon={<Cable className="size-5" />} title="No connections recorded" />
          ),
        },
        {
          id: "diagram",
          label: "Diagram",
          content: (
            <EmptyState
              action={
                selection.kind === "box" ? (
                  <AppLink className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white" href={`/p/${encodeURIComponent(propertyId)}/boxes/${encodeURIComponent(selection.id)}?selectedKind=box&selectedId=${encodeURIComponent(selection.id)}`}>
                    Open box diagram
                  </AppLink>
                ) : traceRootKind ? (
                  <AppLink className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white" href={`/p/${encodeURIComponent(propertyId)}/wiring?rootKind=${encodeURIComponent(traceRootKind)}&rootId=${encodeURIComponent(selection.id)}`}>
                    Open wiring trace
                  </AppLink>
                ) : undefined
              }
              compact
              description={traceRootKind || selection.kind === "box" ? "Diagrams are generated from structured records. Images are supporting evidence, not electrical truth." : "This record is not itself an electrical trace starting point. Open a linked asset, circuit, breaker, cable, conductor, or node instead."}
              icon={<ImageIcon className="size-5" />}
              title={traceRootKind || selection.kind === "box" ? "Open the synchronized diagram" : "No trace starts from this record"}
            />
          ),
        },
        {
          id: "product",
          label: "Product",
          content: (
            <FieldList fields={[
              ["Manufacturer", text(installedProduct?.manufacturer)],
              ["Model", text(installedProduct?.model)],
              ["Protocol", text(installedProduct?.protocol)],
              ["Ecosystem", text(installedProduct?.ecosystem)],
              ["Firmware", text(installedProduct?.firmware)],
              ["Installation date", text(installedProduct?.installationDate)],
            ]} />
          ),
        },
        {
          id: "location",
          label: "Location",
          content: (
            <FieldList fields={[
              ["Location", text(item.locationLabel) ?? text(location?.label)],
              ["Structure", text(location?.structureName)],
              ["Level", text(location?.levelName)],
              ["Room / area", text(location?.spaceName)],
              ["Wall / zone", text(location?.wallZoneName)],
              ["Gang position", numberText(item.gangPosition)],
            ]} />
          ),
        },
        {
          id: "evidence",
          label: "Evidence / photos",
          content: attachments.length ? (
            <ul className="grid gap-3">
              {attachments.map((candidate, index) => {
                const attachment = record(candidate) ?? {};
                const href = text(attachment.downloadUrl) ?? text(attachment.contentPath);
                return (
                  <li className="rounded-xl border border-slate-200 p-3" key={text(attachment.id) ?? index}>
                    {href ? <AppLink className="text-sm font-semibold text-sky-800 underline" href={href}>{text(attachment.originalFileName) ?? text(attachment.name) ?? `Evidence ${index + 1}`}</AppLink> : <span className="text-sm font-semibold">{text(attachment.originalFileName) ?? `Evidence ${index + 1}`}</span>}
                    {text(attachment.altText) ? <p className="mt-1 text-xs leading-5 text-slate-600">{text(attachment.altText)}</p> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState compact description="No photos or documents are linked to this record. Add evidence during a room walk or from the record editor." icon={<Camera className="size-5" />} title="No evidence attached" />
          ),
        },
        {
          id: "upgrade",
          label: "Upgrade plan",
          content: upgrade ? (
            <FieldList fields={[
              ["Status", text(upgrade.status)],
              ["Priority", numberText(upgrade.priority)],
              ["Planned product", text(upgrade.plannedProductLabel)],
              ["Notes", text(upgrade.notes)],
            ]} />
          ) : (
            <EmptyState
              action={<AppLink className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white" href={`/p/${encodeURIComponent(propertyId)}/upgrades?selectedKind=${encodeURIComponent(selection.kind)}&selectedId=${encodeURIComponent(selection.id)}`}>Open upgrade plan</AppLink>}
              compact
              description="No current-vs-planned upgrade record is linked here yet."
              icon={<Sparkles className="size-5" />}
              title="No upgrade planned"
            />
          ),
        },
      ]}
      title={title}
    />
  );
}

export function RecordInspector({
  propertyId,
  selection,
  onClose,
  onTabChange,
}: {
  propertyId: string;
  selection: UrlSelection | null;
  onClose: () => void;
  onTabChange: (tab?: string) => void;
}) {
  if (!selection) return <Inspector onClose={undefined} />;
  return (
    <InspectorContent
      key={`${propertyId}:${selection.kind}:${selection.id}`}
      onClose={onClose}
      onTabChange={onTabChange}
      propertyId={propertyId}
      selection={selection}
    />
  );
}
