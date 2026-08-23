"use client";

import { AlertTriangle, MapPinned, Network, Pencil, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/features/forms";
import shared from "@/features/forms/feature-ui.module.css";
import { ConnectedAssetGroups } from "./ConnectedAssetGroups";
import type { BreakerSummary, ConnectedAsset, VerificationStatus } from "./types";
import styles from "./circuits.module.css";

const protectionLabels: Record<BreakerSummary["protection"], string> = {
  standard: "Standard",
  afci: "AFCI",
  gfci: "GFCI",
  "dual-function": "Dual function",
  other: "Other",
  unknown: "Unknown",
};

const verificationLabels: Record<VerificationStatus, string> = {
  unknown: "Unknown",
  assumed: "Assumed",
  inferred: "Inferred",
  observed: "Observed",
  "test-verified": "Test verified",
  "documentation-verified": "Documentation verified",
  conflicting: "Conflicting",
};

export type BreakerDetailProps = {
  breaker: BreakerSummary;
  connectedAssets: ConnectedAsset[];
  selectedAssetId?: string;
  onSelectAsset: (assetId: string) => void;
  onEditBreaker?: (breakerId: string) => void;
  onShowOnMap?: (breakerId: string) => void;
  onTrace?: (breakerId: string) => void;
};

export function BreakerDetail({
  breaker,
  connectedAssets,
  selectedAssetId,
  onSelectAsset,
  onEditBreaker,
  onShowOnMap,
  onTrace,
}: BreakerDetailProps) {
  const verificationTone =
    breaker.verification === "conflicting"
      ? "danger"
      : breaker.verification === "test-verified" ||
          breaker.verification === "documentation-verified"
        ? "positive"
        : breaker.verification === "unknown" || breaker.verification === "assumed"
          ? "warning"
          : "info";

  return (
    <article className={`${shared.surface} ${styles.detail}`}>
      <header className={styles.detailHead}>
        <div>
          <p className={styles.detailCode}>{breaker.permanentCode}</p>
          <div className={styles.detailTitleRow}>
            <h1 className={styles.detailTitle}>{breaker.label}</h1>
            <StatusBadge tone={verificationTone}>
              {verificationLabels[breaker.verification]}
            </StatusBadge>
            {breaker.issueCount ? (
              <StatusBadge tone="danger">
                <AlertTriangle size={12} aria-hidden="true" />
                {breaker.issueCount} {breaker.issueCount === 1 ? "issue" : "issues"}
              </StatusBadge>
            ) : null}
          </div>
          <p className={shared.subtle}>
            {breaker.panelName} · {breaker.positionLabels.join(", ")}
          </p>
        </div>
        <div className={shared.buttonRow}>
          {onShowOnMap ? (
            <button
              className={`${shared.button} ${shared.buttonSecondary}`}
              type="button"
              onClick={() => onShowOnMap(breaker.id)}
            >
              <MapPinned size={15} aria-hidden="true" /> Map
            </button>
          ) : null}
          {onTrace ? (
            <button
              className={`${shared.button} ${shared.buttonSecondary}`}
              type="button"
              onClick={() => onTrace(breaker.id)}
            >
              <Network size={15} aria-hidden="true" /> Trace
            </button>
          ) : null}
          {onEditBreaker ? (
            <button
              className={`${shared.button} ${shared.buttonPrimary}`}
              type="button"
              onClick={() => onEditBreaker(breaker.id)}
            >
              <Pencil size={15} aria-hidden="true" /> Edit
            </button>
          ) : null}
        </div>
      </header>

      <div className={styles.statGrid} aria-label="Breaker details">
        <div className={styles.stat}>
          <span className={styles.statLabel}>Rating</span>
          <span className={styles.statValue}>{breaker.amperage ?? "Unknown"}{breaker.amperage ? "A" : ""}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Poles</span>
          <span className={styles.statValue}>{breaker.poles}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Protection</span>
          <span className={styles.statValue}>{protectionLabels[breaker.protection]}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Recorded state</span>
          <span className={styles.statValue}>
            {breaker.recordedState === "recorded-on"
              ? "Recorded on"
              : breaker.recordedState === "recorded-off"
                ? "Recorded off"
                : "Unknown"}
          </span>
        </div>
      </div>

      <section className={shared.section} aria-labelledby={`${breaker.id}-circuits`}>
        <div className={shared.sectionHeader}>
          <div>
            <p className={shared.eyebrow}>Sources</p>
            <h2 className={shared.title} id={`${breaker.id}-circuits`}>Circuits</h2>
          </div>
          <ShieldCheck size={19} color="#367c5d" aria-hidden="true" />
        </div>
        <div className={styles.circuitChips}>
          {breaker.circuits.length ? (
            breaker.circuits.map((circuit) => (
              <div className={styles.circuitChip} key={circuit.id}>
                <strong>{circuit.name}</strong>
                <span>
                  {circuit.permanentCode}
                  {circuit.nominalVoltage ? ` · ${circuit.nominalVoltage}V` : ""}
                </span>
              </div>
            ))
          ) : (
            <StatusBadge tone="warning">No circuit source recorded</StatusBadge>
          )}
        </div>
      </section>

      <hr className={shared.divider} />

      <section className={shared.section} aria-labelledby={`${breaker.id}-connected`}>
        <div className={shared.sectionHeader}>
          <div>
            <p className={shared.eyebrow}>Reachability & assertions</p>
            <h2 className={shared.title} id={`${breaker.id}-connected`}>
              Connected records
            </h2>
            <p className={shared.subtle}>
              Traced and manually associated records stay distinct so conflicts remain visible.
            </p>
          </div>
          <StatusBadge tone="neutral">{connectedAssets.length} total</StatusBadge>
        </div>
        <ConnectedAssetGroups
          assets={connectedAssets}
          selectedAssetId={selectedAssetId}
          onSelectAsset={onSelectAsset}
        />
      </section>

      {breaker.notes ? (
        <section className={`${shared.surfaceInset} ${styles.panel}`} aria-label="Breaker notes">
          <p className={shared.eyebrow}>Notes</p>
          <p className={shared.subtle}>{breaker.notes}</p>
        </section>
      ) : null}
    </article>
  );
}
