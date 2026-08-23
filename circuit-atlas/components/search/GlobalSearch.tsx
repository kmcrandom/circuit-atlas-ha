"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  Button,
  ComboBox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
} from "react-aria-components";
import {
  AppLink,
  navigateToAppPath,
} from "@/lib/client/runtime-path";

import { cx, focusRing } from "../ui/styles";

export interface GlobalSearchResult {
  id: string;
  label: string;
  kind: string;
  description?: string;
  permanentCode?: string;
  location?: string;
  href?: string;
  icon?: ReactNode;
}

export interface GlobalSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  results: readonly GlobalSearchResult[];
  onSelect?: (result: GlobalSearchResult) => void;
  label?: string;
  placeholder?: string;
  emptyLabel?: string;
  isLoading?: boolean;
  isDisabled?: boolean;
  enableShortcut?: boolean;
  className?: string;
}

function ResultContent({ result }: { result: GlobalSearchResult }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600"
      >
        {result.icon ?? <Search className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-slate-950">{result.label}</span>
          {result.permanentCode ? (
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold text-slate-600">
              {result.permanentCode}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
          <span className="shrink-0 font-semibold uppercase tracking-wide">{result.kind}</span>
          {result.description || result.location ? <span aria-hidden="true">·</span> : null}
          <span className="truncate">{result.description ?? result.location}</span>
        </span>
      </span>
    </>
  );
}

export function GlobalSearch({
  query,
  onQueryChange,
  results,
  onSelect,
  label = "Search records",
  placeholder = "Search IDs, rooms, breakers, products…",
  emptyLabel = "No records match this search",
  isLoading = false,
  isDisabled = false,
  enableShortcut = true,
  className,
}: GlobalSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enableShortcut) return;
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [enableShortcut]);

  const chooseResult = (result: GlobalSearchResult) => {
    onSelect?.(result);
    if (!onSelect && result.href) navigateToAppPath(result.href);
  };

  return (
    <ComboBox
      allowsEmptyCollection
      aria-label={label}
      className={cx("relative min-w-0", className)}
      defaultFilter={() => true}
      inputValue={query}
      isDisabled={isDisabled}
      menuTrigger="input"
      onInputChange={onQueryChange}
      onSelectionChange={(key) => {
        if (key === null) return;
        const selected = results.find((result) => result.id === String(key));
        if (selected) chooseResult(selected);
      }}
      selectedKey={null}
    >
      <Label className="sr-only">{label}</Label>
      <div className="flex min-w-0 items-center rounded-xl border border-slate-300 bg-white shadow-sm transition focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-200">
        <Search aria-hidden="true" className="ml-3.5 size-4 shrink-0 text-slate-500" />
        <Input
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 text-sm text-slate-950 outline-none placeholder:text-slate-500"
          placeholder={placeholder}
          ref={inputRef}
        />
        <span aria-live="polite" className="sr-only">
          {isLoading ? "Searching" : `${results.length} search results`}
        </span>
        {isLoading ? (
          <LoaderCircle aria-hidden="true" className="mr-3 size-4 animate-spin text-slate-500" />
        ) : query ? (
          <Button
            aria-label="Clear search"
            className={cx(
              "mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-950",
              focusRing,
            )}
            onPress={() => {
              onQueryChange("");
              inputRef.current?.focus();
            }}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        ) : enableShortcut ? (
          <kbd
            aria-hidden="true"
            className="mr-2 hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[0.65rem] font-semibold text-slate-500 sm:inline"
          >
            ⌘K
          </kbd>
        ) : null}
      </div>
      <Popover
        className="z-[65] w-[var(--trigger-width)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        offset={6}
      >
        <ListBox
          aria-label="Search results"
          className="max-h-[min(28rem,65dvh)] overflow-y-auto p-1 outline-none"
          items={[...results]}
          renderEmptyState={() => (
            <div className="px-5 py-8 text-center">
              <Search aria-hidden="true" className="mx-auto size-5 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-700">
                {query ? emptyLabel : "Start typing to search this property"}
              </p>
            </div>
          )}
        >
          {(result) => (
            <ListBoxItem
              className={({ isFocused, isSelected }) =>
                cx(
                  "flex min-h-14 cursor-default items-center gap-3 rounded-lg px-3 py-2 outline-none",
                  isFocused && "bg-orange-50",
                  isSelected && "ring-1 ring-inset ring-orange-200",
                )
              }
              id={result.id}
              textValue={[
                result.label,
                result.kind,
                result.permanentCode,
                result.description,
                result.location,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <ResultContent result={result} />
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

export interface GlobalSearchResultsProps {
  results: readonly GlobalSearchResult[];
  onSelect?: (result: GlobalSearchResult) => void;
  activeResultId?: string;
  emptyLabel?: string;
  className?: string;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLUListElement>) => void;
}

/** Reusable non-overlay result list for dedicated search and narrow layouts. */
export function GlobalSearchResults({
  results,
  onSelect,
  activeResultId,
  emptyLabel = "No matching records",
  className,
  onKeyDown,
}: GlobalSearchResultsProps) {
  if (results.length === 0) {
    return <p className={cx("px-4 py-8 text-center text-sm text-slate-600", className)}>{emptyLabel}</p>;
  }

  return (
    <ul aria-label="Search results" className={cx("grid gap-1", className)} onKeyDown={onKeyDown}>
      {results.map((result) => {
        const classes = cx(
          "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-orange-500",
          result.id === activeResultId && "bg-orange-50 ring-1 ring-inset ring-orange-200",
        );
        return (
          <li key={result.id}>
            {result.href ? (
              <AppLink
                aria-current={result.id === activeResultId ? "true" : undefined}
                className={classes}
                href={result.href}
                onClick={() => onSelect?.(result)}
              >
                <ResultContent result={result} />
              </AppLink>
            ) : (
              <button className={classes} onClick={() => onSelect?.(result)} type="button">
                <ResultContent result={result} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
