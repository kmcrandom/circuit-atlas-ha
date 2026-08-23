"use client";

import type { CSSProperties } from "react";
import { StatusBadge } from "@/features/forms";
import type { BreakerPanelModel, BreakerSummary } from "./types";
import shared from "@/features/forms/feature-ui.module.css";
import styles from "./circuits.module.css";

export type BreakerPanelProps = {
  panel: BreakerPanelModel;
  breakers: BreakerSummary[];
  selectedBreakerId?: string;
  onSelectBreaker: (breakerId: string) => void;
};

export function BreakerPanel({
  panel,
  breakers,
  selectedBreakerId,
  onSelectBreaker,
}: BreakerPanelProps) {
  const breakerById = new Map(breakers.map((breaker) => [breaker.id, breaker]));
  const positions = [...panel.positions].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    return panel.columns.indexOf(a.column) - panel.columns.indexOf(b.column);
  });

  return (
    <section className={`${shared.surface} ${styles.panel}`} aria-label={`${panel.name} panel layout`}>
      <header className={styles.panelTop}>
        <div className={styles.panelIdentity}>
          <p className={styles.panelCode}>{panel.permanentCode}</p>
          <h2 className={styles.panelTitle}>{panel.name}</h2>
          <p className={styles.panelMeta}>
            {panel.role === "subpanel" ? "Subpanel" : panel.role === "main" ? "Main panel" : "Panel"}
            {panel.voltageDescription ? ` · ${panel.voltageDescription}` : ""}
          </p>
        </div>
        <StatusBadge tone="info">{panel.positions.length} positions</StatusBadge>
      </header>

      <div
        className={styles.panelGrid}
        style={{ "--panel-columns": panel.columns.length } as CSSProperties}
      >
        {positions.map((position) => {
          const breaker = position.breakerId
            ? breakerById.get(position.breakerId)
            : undefined;
          const selected = breaker?.id === selectedBreakerId;
          return (
            <button
              className={`${styles.panelSlot} ${!breaker ? styles.panelSlotEmpty : ""} ${selected ? styles.panelSlotSelected : ""}`}
              key={position.id}
              type="button"
              disabled={!breaker}
              aria-pressed={selected}
              aria-label={
                breaker
                  ? `${position.label}: ${breaker.label}, ${breaker.amperage ?? "unknown"} amps${position.poleIndex ? `, pole ${position.poleIndex}` : ""}`
                  : `${position.label}: empty`
              }
              onClick={() => breaker && onSelectBreaker(breaker.id)}
            >
              <span className={styles.slotNumber}>
                {position.label.replace(/^.*?([0-9]+.*)$/, "$1")}
              </span>
              <span className={styles.slotBody}>
                <span className={styles.slotLabel}>{breaker?.label ?? "Open"}</span>
                <span className={styles.slotMeta}>
                  {breaker
                    ? `${breaker.amperage ?? "?"}A · ${breaker.poles}-pole${position.subposition ? ` · ${position.subposition}` : ""}`
                    : "No breaker recorded"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
