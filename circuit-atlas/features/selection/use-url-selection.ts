"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { updateAppHistory } from "@/lib/client/runtime-path";

import {
  createSelectionHref,
  parseUrlSelection,
  withInspectorTab,
  type UrlSelection,
} from "./url-selection";

export interface UrlSelectionController {
  selection: UrlSelection | null;
  select: (selection: UrlSelection, options?: { replace?: boolean }) => void;
  clear: (options?: { replace?: boolean }) => void;
  setInspectorTab: (tab?: string, options?: { replace?: boolean }) => void;
  hrefFor: (selection: UrlSelection | null) => string;
}

export function useUrlSelection(): UrlSelectionController {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selection = useMemo(() => parseUrlSelection(searchParams), [searchParams]);

  const navigate = useCallback(
    (href: string, replace = false) => {
      updateAppHistory(href, replace);
    },
    [],
  );

  const hrefFor = useCallback(
    (nextSelection: UrlSelection | null) =>
      createSelectionHref(pathname, searchParams, nextSelection),
    [pathname, searchParams],
  );

  const select = useCallback(
    (nextSelection: UrlSelection, options?: { replace?: boolean }) => {
      navigate(hrefFor(nextSelection), options?.replace);
    },
    [hrefFor, navigate],
  );

  const clear = useCallback(
    (options?: { replace?: boolean }) => {
      navigate(hrefFor(null), options?.replace);
    },
    [hrefFor, navigate],
  );

  const setInspectorTab = useCallback(
    (tab?: string, options?: { replace?: boolean }) => {
      const next = withInspectorTab(searchParams, tab);
      const query = next.toString();
      navigate(query ? `${pathname}?${query}` : pathname, options?.replace ?? true);
    },
    [navigate, pathname, searchParams],
  );

  return { selection, select, clear, setInspectorTab, hrefFor };
}
