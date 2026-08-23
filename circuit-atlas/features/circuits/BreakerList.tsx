"use client";

import { ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/features/forms";
import shared from "@/features/forms/feature-ui.module.css";
import type { BreakerSummary } from "./types";
import styles from "./circuits.module.css";

export type BreakerListProps = {
  breakers: BreakerSummary[];
  selectedBreakerId?: string;
  onSelect: (breakerId: string) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
};

export function BreakerList({
  breakers,
  selectedBreakerId,
  onSelect,
  query,
  onQueryChange,
}: BreakerListProps) {
  const [internalQuery, setInternalQuery] = useState("");
  const activeQuery = query ?? internalQuery;
  const setQuery = onQueryChange ?? setInternalQuery;
  const filtered = useMemo(() => {
    const needle = activeQuery.trim().toLocaleLowerCase();
    if (!needle) return breakers;
    return breakers.filter((breaker) =>
      [
        breaker.label,
        breaker.permanentCode,
        breaker.panelName,
        breaker.positionLabels.join(" "),
        ...breaker.circuits.flatMap((circuit) => [circuit.name, circuit.permanentCode]),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [activeQuery, breakers]);

  return (
    <section className={`${shared.surface} ${styles.listSurface}`} aria-label="Breakers">
      <header className={styles.listHeader}>
        <p className={shared.eyebrow}>Circuit directory</p>
        <h2 className={shared.title}>Breakers</h2>
        <div className={styles.searchWrap}>
          <Search className={styles.searchIcon} size={16} aria-hidden="true" />
          <input
            className={`${shared.input} ${styles.searchInput}`}
            type="search"
            value={activeQuery}
            placeholder="Search label, code, or position"
            aria-label="Search breakers"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </header>

      {filtered.length ? (
        <ul className={styles.breakerList}>
          {filtered.map((breaker) => {
            const selected = breaker.id === selectedBreakerId;
            return (
              <li key={breaker.id}>
                <button
                  className={`${styles.breakerButton} ${selected ? styles.breakerButtonSelected : ""}`}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(breaker.id)}
                >
                  <span>
                    <span className={styles.breakerName}>{breaker.label}</span>
                    <span className={styles.breakerMeta}>
                      <span>{breaker.positionLabels.join(", ")}</span>
                      <span>{breaker.amperage ?? "?"}A</span>
                      <span>{breaker.connectedCount ?? 0} connected</span>
                    </span>
                  </span>
                  <span className={styles.breakerTrailing}>
                    {breaker.issueCount ? (
                      <span className={styles.issueDot} aria-label={`${breaker.issueCount} issues`}>
                        {breaker.issueCount}
                      </span>
                    ) : null}
                    <ChevronRight size={16} aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={styles.listHeader}>
          <EmptyState
            icon={<Search size={20} />}
            title="No breakers found"
            description="Try another label, panel position, circuit name, or permanent code."
          />
        </div>
      )}
    </section>
  );
}
