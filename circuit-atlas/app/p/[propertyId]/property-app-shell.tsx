"use client";

import { Camera, Settings } from "lucide-react";
import { AppLink } from "@/lib/client/runtime-path";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  AppShell,
  createPrimaryNavigation,
  type PropertySelectorItem,
} from "@/components/app-shell";
import { GlobalSearch, type GlobalSearchResult } from "@/components/search";
import {
  createPropertyHref,
  useUrlSelection,
} from "@/features/selection";
import type { SelectionKind } from "@/features/selection/url-selection";
import {
  appendQuery,
  apiRequest,
  navigateToAppPath,
  propertyApiPath,
  useApiResource,
  withoutRuntimeBasePath,
} from "@/lib/client";

import { RecordInspector } from "./record-inspector";

type PropertySummary = PropertySelectorItem & {
  permanentCode?: string;
  address?: string | null;
};

type PropertiesResponse = { items: PropertySummary[] };
type SearchResponse = { items?: unknown[]; results?: unknown[] };

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function valueText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function selectionKind(value: string): SelectionKind | (string & {}) {
  const map: Record<string, SelectionKind> = {
    "light-source": "light_source",
    "electrical-node": "electrical_node",
    "control-group": "control_group",
    "upgrade-item": "upgrade_item",
  };
  return map[value] ?? value.replaceAll("-", "_");
}

function searchResult(value: unknown, index: number): GlobalSearchResult | null {
  const item = object(value);
  if (!item) return null;
  const id = valueText(item.id) ?? valueText(item.assetId);
  if (!id) return null;
  const kind = valueText(item.kind) ?? valueText(item.assetKind) ?? "record";
  return {
    id,
    label:
      valueText(item.label) ??
      valueText(item.displayName) ??
      valueText(item.name) ??
      valueText(item.permanentCode) ??
      `Record ${index + 1}`,
    kind,
    description: valueText(item.description) ?? valueText(item.subtype),
    permanentCode: valueText(item.permanentCode) ?? valueText(item.code),
    location: valueText(item.location) ?? valueText(item.locationLabel),
    href: valueText(item.href),
  };
}

function activeDestination(pathname: string, propertyId: string): string {
  const prefix = `/p/${encodeURIComponent(propertyId)}/`;
  const suffix = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "map";
  const first = suffix.split("/")[0] || "map";
  if (["map", "circuits", "inventory", "wiring", "upgrades", "settings"].includes(first)) {
    return first;
  }
  return "inventory";
}

function pageTitle(pathname: string): string {
  if (pathname.includes("/circuits")) return "Circuits";
  if (pathname.includes("/inventory")) return "Inventory";
  if (pathname.includes("/wiring")) return "Wiring";
  if (pathname.includes("/upgrades")) return "Upgrade Plan";
  if (pathname.includes("/boxes/")) return "Box Diagram";
  if (pathname.includes("/capture/")) return "Room-walk Capture";
  if (pathname.includes("/settings")) return "Property Settings";
  return "Map";
}

export function PropertyAppShell({
  propertyId,
  children,
}: {
  propertyId: string;
  children: ReactNode;
}) {
  const pathname = withoutRuntimeBasePath(usePathname());
  const selection = useUrlSelection();
  const properties = useApiResource<PropertiesResponse>("/api/properties");
  const [query, setQuery] = useState("");
  const [searchItems, setSearchItems] = useState<GlobalSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setSearchItems([]);
      setIsSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      void apiRequest<SearchResponse>(
        appendQuery(propertyApiPath(propertyId, "search"), { q: normalized }),
        { signal: controller.signal },
      )
        .then((body) => {
          const values = body.items ?? body.results ?? [];
          setSearchItems(values.flatMap((item, index) => searchResult(item, index) ?? []));
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchItems([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [propertyId, query]);

  const propertyItems = useMemo(() => {
    const loaded = properties.data?.items ?? [];
    if (loaded.some((property) => property.id === propertyId)) return loaded;
    return [{ id: propertyId, name: "Current property", description: "Loading property details…" }, ...loaded];
  }, [properties.data, propertyId]);

  const currentProperty = propertyItems.find((property) => property.id === propertyId);
  const navigation = createPrimaryNavigation(propertyId);
  const destination = activeDestination(pathname, propertyId);
  const activeNavigationId = destination === "settings" ? undefined : destination;
  const captureHref = `/p/${encodeURIComponent(propertyId)}/capture/new`;
  const settingsHref = `/p/${encodeURIComponent(propertyId)}/settings`;

  return (
    <AppShell
      activeNavigationItemId={activeNavigationId}
      activePropertyId={propertyId}
      announcement={currentProperty ? `${currentProperty.name} is active.` : undefined}
      inspector={
        <RecordInspector
          onClose={() => selection.clear({ replace: true })}
          onTabChange={(tab) => selection.setInspectorTab(tab)}
          propertyId={propertyId}
          selection={selection.selection}
        />
      }
      inspectorSheetTitle="Record details"
      isBusy={properties.status === "loading" || isSearching}
      isInspectorOpen={Boolean(selection.selection)}
      navigationItems={navigation}
      onCreateProperty={() => navigateToAppPath("/properties?new=1")}
      onInspectorOpenChange={(open) => {
        if (!open) selection.clear({ replace: true });
      }}
      onPropertyChange={(nextPropertyId) => {
        setQuery("");
        setSearchItems([]);
        navigateToAppPath(createPropertyHref(nextPropertyId, destination));
      }}
      pageHeader={
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.13em] text-orange-700">Property atlas</p>
          <p className="truncate text-sm font-semibold text-slate-950">{pageTitle(pathname)}</p>
        </div>
      }
      properties={propertyItems}
      search={
        <GlobalSearch
          isLoading={isSearching}
          onQueryChange={setQuery}
          onSelect={(result) => {
            const kind = selectionKind(result.kind);
            selection.select({ kind, id: result.id });
            setQuery("");
          }}
          query={query}
          results={searchItems}
        />
      }
      sidebarFooter={
        <div className="grid gap-1">
          <AppLink className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950" href={captureHref}>
            <Camera aria-hidden="true" className="size-4" /> Room walk
          </AppLink>
          <AppLink className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950" href={settingsHref}>
            <Settings aria-hidden="true" className="size-4" /> Settings
          </AppLink>
        </div>
      }
      utilityActions={
        <AppLink
          aria-label="Property settings"
          className="grid size-10 place-items-center rounded-xl border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-950"
          href={settingsHref}
        >
          <Settings aria-hidden="true" className="size-4" />
        </AppLink>
      }
    >
      {children}
    </AppShell>
  );
}
