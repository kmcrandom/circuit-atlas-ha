"use client";

import {
  Box,
  Cable,
  ChevronRight,
  CircuitBoard,
  Fan,
  Lightbulb,
  MapPin,
  PlugZap,
  ToggleLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { withRuntimeBasePath } from "@/lib/client/runtime-path";
import { StatusBadge } from "@/features/forms";
import type { InventoryAsset, InventoryAssetKind, SmartState } from "./types";
import styles from "./inventory.module.css";

const icons: Record<InventoryAssetKind, LucideIcon> = {
  panel: CircuitBoard,
  box: Box,
  switch: ToggleLeft,
  receptacle: PlugZap,
  fixture: Lightbulb,
  "light-source": Lightbulb,
  appliance: Fan,
  cable: Cable,
  junction: Box,
  other: Box,
};

const smartLabels: Record<SmartState, string> = {
  smart: "Smart",
  dumb: "Dumb",
  mixed: "Mixed",
  "not-applicable": "Not applicable",
  unknown: "Smart state unknown",
};

export function InventoryCard({
  asset,
  selected = false,
  onSelect,
}: {
  asset: InventoryAsset;
  selected?: boolean;
  onSelect: (assetId: string) => void;
}) {
  const Icon = icons[asset.kind];
  const needsReview =
    asset.issueCount || asset.verification === "unknown" || asset.verification === "conflicting";
  const smartTone =
    asset.smartState === "smart"
      ? "positive"
      : asset.smartState === "mixed"
        ? "info"
        : asset.smartState === "unknown"
          ? "warning"
          : "neutral";

  return (
    <button
      className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(asset.id)}
    >
      <span className={styles.cardTop}>
        <span className={styles.identity}>
          <span className={styles.kindIcon}>
            <Icon size={18} aria-hidden="true" />
          </span>
          <span>
            <span className={styles.assetName}>{asset.displayName}</span>
            <span className={styles.assetCode}>{asset.permanentCode}</span>
          </span>
        </span>
        {asset.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- private user-uploaded asset URL.
          <img className={styles.photo} src={withRuntimeBasePath(asset.photoUrl)} alt="" />
        ) : null}
      </span>

      <span className={styles.cardBody}>
        <span className={styles.location}>
          <MapPin size={14} aria-hidden="true" />
          <span>
            {asset.locationLabel || "Location not recorded"}
            {asset.gangPosition ? ` · ${asset.gangPosition}` : ""}
          </span>
        </span>
        <span className={styles.badgeRow}>
          <StatusBadge tone={smartTone}>{smartLabels[asset.smartState]}</StatusBadge>
          {asset.upgradeStatus ? (
            <StatusBadge tone="info">{asset.upgradeStatus.replace("-", " ")}</StatusBadge>
          ) : null}
          {needsReview ? <StatusBadge tone="warning">Needs review</StatusBadge> : null}
        </span>
        <span className={styles.breakerRow}>
          {asset.breakerReferences.length ? (
            asset.breakerReferences.slice(0, 3).map((breaker) => (
              <span className={styles.breakerPill} key={breaker.id}>
                {breaker.label}
              </span>
            ))
          ) : (
            <span className={styles.breakerPill}>Breaker unknown</span>
          )}
          {asset.breakerReferences.length > 3 ? (
            <span className={styles.breakerPill}>+{asset.breakerReferences.length - 3}</span>
          ) : null}
        </span>
      </span>

      <span className={styles.cardFooter}>
        <span>{asset.subtype || asset.kind.replace("-", " ")}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </span>
    </button>
  );
}
