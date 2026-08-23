export const SELECTION_QUERY_KEYS = {
  kind: "selectedKind",
  id: "selectedId",
  tab: "inspectorTab",
} as const;

export const PROPERTY_SCOPED_QUERY_KEYS = [
  SELECTION_QUERY_KEYS.kind,
  SELECTION_QUERY_KEYS.id,
  SELECTION_QUERY_KEYS.tab,
  "floor",
  "breaker",
  "circuit",
  "room",
  "assetType",
  "smartState",
  "upgradeStatus",
  "confidence",
] as const;

export type SelectionKind =
  | "property"
  | "panel"
  | "breaker"
  | "circuit"
  | "box"
  | "device"
  | "switch"
  | "receptacle"
  | "fixture"
  | "light_source"
  | "appliance"
  | "cable"
  | "conductor"
  | "electrical_node"
  | "control_group"
  | "upgrade_item";

export interface UrlSelection {
  kind: SelectionKind | (string & {});
  id: string;
  tab?: string;
}

export interface SearchParamsReader {
  get(name: string): string | null;
  toString(): string;
}

function isSafeKind(value: string): boolean {
  return /^[a-z][a-z0-9_-]{0,63}$/.test(value);
}

function isSafeIdentifier(value: string): boolean {
  return value.length > 0 && value.length <= 200 && !/[\u0000-\u001f]/.test(value);
}

function isSafeTab(value: string): boolean {
  return /^[a-z][a-z0-9_-]{0,63}$/.test(value);
}

function copySearchParams(searchParams?: SearchParamsReader | string): URLSearchParams {
  if (!searchParams) return new URLSearchParams();
  return new URLSearchParams(
    typeof searchParams === "string" ? searchParams.replace(/^\?/, "") : searchParams.toString(),
  );
}

export function parseUrlSelection(searchParams: SearchParamsReader): UrlSelection | null {
  const kind = searchParams.get(SELECTION_QUERY_KEYS.kind)?.trim() ?? "";
  const id = searchParams.get(SELECTION_QUERY_KEYS.id)?.trim() ?? "";
  const tabValue = searchParams.get(SELECTION_QUERY_KEYS.tab)?.trim() ?? "";

  if (!isSafeKind(kind) || !isSafeIdentifier(id)) return null;

  return {
    kind,
    id,
    ...(tabValue && isSafeTab(tabValue) ? { tab: tabValue } : {}),
  };
}

export function withUrlSelection(
  searchParams: SearchParamsReader | string | undefined,
  selection: UrlSelection,
): URLSearchParams {
  if (!isSafeKind(selection.kind) || !isSafeIdentifier(selection.id)) {
    throw new TypeError("Selection kind or identifier is invalid.");
  }
  if (selection.tab && !isSafeTab(selection.tab)) {
    throw new TypeError("Inspector tab identifier is invalid.");
  }

  const next = copySearchParams(searchParams);
  next.set(SELECTION_QUERY_KEYS.kind, selection.kind);
  next.set(SELECTION_QUERY_KEYS.id, selection.id);
  if (selection.tab) next.set(SELECTION_QUERY_KEYS.tab, selection.tab);
  else next.delete(SELECTION_QUERY_KEYS.tab);
  return next;
}

export function withoutUrlSelection(
  searchParams?: SearchParamsReader | string,
): URLSearchParams {
  const next = copySearchParams(searchParams);
  Object.values(SELECTION_QUERY_KEYS).forEach((key) => next.delete(key));
  return next;
}

export function withInspectorTab(
  searchParams: SearchParamsReader | string | undefined,
  tab?: string,
): URLSearchParams {
  const next = copySearchParams(searchParams);
  if (!tab) {
    next.delete(SELECTION_QUERY_KEYS.tab);
    return next;
  }
  if (!isSafeTab(tab)) throw new TypeError("Inspector tab identifier is invalid.");
  next.set(SELECTION_QUERY_KEYS.tab, tab);
  return next;
}

export function createSelectionHref(
  pathname: string,
  searchParams: SearchParamsReader | string | undefined,
  selection: UrlSelection | null,
): string {
  const next = selection
    ? withUrlSelection(searchParams, selection)
    : withoutUrlSelection(searchParams);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function createPropertyHref(
  propertyId: string,
  destination = "map",
  searchParams?: SearchParamsReader | string,
  preserveKeys: readonly string[] = [],
): string {
  if (!isSafeIdentifier(propertyId)) throw new TypeError("Property identifier is invalid.");
  if (!/^[a-z][a-z0-9/-]{0,127}$/.test(destination)) {
    throw new TypeError("Property destination is invalid.");
  }

  const source = copySearchParams(searchParams);
  const next = new URLSearchParams();
  preserveKeys.forEach((key) => {
    if (PROPERTY_SCOPED_QUERY_KEYS.includes(key as (typeof PROPERTY_SCOPED_QUERY_KEYS)[number])) {
      return;
    }
    source.getAll(key).forEach((value) => next.append(key, value));
  });
  const query = next.toString();
  const pathname = `/p/${encodeURIComponent(propertyId)}/${destination}`;
  return query ? `${pathname}?${query}` : pathname;
}

export function selectionsEqual(a: UrlSelection | null, b: UrlSelection | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.id === b.id && a.tab === b.tab;
}
