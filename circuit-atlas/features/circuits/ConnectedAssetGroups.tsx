"use client";

import {
  AlertTriangle,
  Box,
  Cable,
  ChevronRight,
  CircuitBoard,
  Fan,
  Lightbulb,
  PlugZap,
  ToggleLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState, StatusBadge } from "@/features/forms";
import type {
  ConnectedAsset,
  ConnectedAssetKind,
  ConnectionRelationship,
  RelationshipSource,
  VerificationStatus,
} from "./types";
import styles from "./circuits.module.css";

const kindLabels: Record<ConnectedAssetKind, string> = {
  switch: "Switches & controllers",
  receptacle: "Receptacles",
  fixture: "Fixtures",
  "light-source": "Light sources",
  appliance: "Appliances",
  box: "Boxes",
  cable: "Cables",
  panel: "Panels",
  other: "Other",
};

const kindIcons: Record<ConnectedAssetKind, LucideIcon> = {
  switch: ToggleLeft,
  receptacle: PlugZap,
  fixture: Lightbulb,
  "light-source": Lightbulb,
  appliance: Fan,
  box: Box,
  cable: Cable,
  panel: CircuitBoard,
  other: Box,
};

const relationshipLabels: Record<ConnectionRelationship, string> = {
  "directly-supplied": "Direct supply",
  "switched-load": "Switched load",
  controller: "Controller",
  "downstream-protected": "Downstream protected",
  "contained-device": "Contained device",
  "manually-associated": "Manual association",
  unresolved: "Relationship unresolved",
};

const sourceLabels: Record<RelationshipSource, string> = {
  graph: "Traced",
  assertion: "Asserted",
  both: "Traced + asserted",
  conflict: "Conflict",
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

export type ConnectedAssetGroup = {
  location: string;
  kinds: Array<{ kind: ConnectedAssetKind; assets: ConnectedAsset[] }>;
  count: number;
};

export function groupConnectedAssets(assets: ConnectedAsset[]): ConnectedAssetGroup[] {
  const locations = new Map<string, Map<ConnectedAssetKind, ConnectedAsset[]>>();

  for (const asset of assets) {
    const location = asset.locationLabel?.trim() || "Location not recorded";
    const kinds = locations.get(location) ?? new Map<ConnectedAssetKind, ConnectedAsset[]>();
    const values = kinds.get(asset.kind) ?? [];
    values.push(asset);
    kinds.set(asset.kind, values);
    locations.set(location, kinds);
  }

  return [...locations.entries()]
    .sort(([a], [b]) => {
      if (a === "Location not recorded") return 1;
      if (b === "Location not recorded") return -1;
      return a.localeCompare(b);
    })
    .map(([location, kinds]) => ({
      location,
      kinds: [...kinds.entries()]
        .sort(([a], [b]) => kindLabels[a].localeCompare(kindLabels[b]))
        .map(([kind, values]) => ({
          kind,
          assets: [...values].sort((a, b) => a.name.localeCompare(b.name)),
        })),
      count: [...kinds.values()].reduce((sum, values) => sum + values.length, 0),
    }));
}

function verificationTone(status: VerificationStatus) {
  if (status === "conflicting") return "danger" as const;
  if (status === "test-verified" || status === "documentation-verified") return "positive" as const;
  if (status === "unknown" || status === "assumed") return "warning" as const;
  return "info" as const;
}

export function ConnectedAssetGroups({
  assets,
  selectedAssetId,
  onSelectAsset,
}: {
  assets: ConnectedAsset[];
  selectedAssetId?: string;
  onSelectAsset: (assetId: string) => void;
}) {
  if (!assets.length) {
    return (
      <EmptyState
        icon={<Cable size={20} />}
        title="No connected records yet"
        description="Add an explicit circuit association or trace conductors to populate this breaker."
      />
    );
  }

  const groups = groupConnectedAssets(assets);

  return (
    <div className={styles.groupList}>
      {groups.map((group) => (
        <section className={styles.locationGroup} key={group.location}>
          <h3 className={styles.locationTitle}>
            <span>{group.location}</span>
            <span className={styles.locationCount}>{group.count} records</span>
          </h3>
          {group.kinds.map(({ kind, assets: kindAssets }) => {
            const Icon = kindIcons[kind];
            return (
              <div className={styles.kindGroup} key={kind}>
                <h4 className={styles.kindTitle}>{kindLabels[kind]}</h4>
                <ul className={styles.assetList}>
                  {kindAssets.map((asset) => (
                    <li key={asset.id}>
                      <button
                        className={`${styles.assetCard} ${asset.id === selectedAssetId ? styles.assetCardSelected : ""}`}
                        type="button"
                        aria-pressed={asset.id === selectedAssetId}
                        onClick={() => onSelectAsset(asset.id)}
                      >
                        <span className={styles.assetIcon}>
                          <Icon size={17} aria-hidden="true" />
                        </span>
                        <span>
                          <span className={styles.assetName}>{asset.name}</span>
                          <span className={styles.assetMeta}>
                            <span>{asset.permanentCode}</span>
                            <span>{relationshipLabels[asset.relationship]}</span>
                            <span>{sourceLabels[asset.source]}</span>
                          </span>
                          <span className={styles.assetMeta}>
                            <StatusBadge tone={verificationTone(asset.verification)}>
                              {verificationLabels[asset.verification]}
                            </StatusBadge>
                            {asset.traceHasGap ? (
                              <StatusBadge tone="warning">Trace gap</StatusBadge>
                            ) : null}
                          </span>
                        </span>
                        {asset.source === "conflict" || asset.conflictMessage ? (
                          <AlertTriangle size={16} color="#963f33" aria-label="Conflict" />
                        ) : (
                          <ChevronRight size={16} aria-hidden="true" />
                        )}
                        {asset.conflictMessage ? (
                          <p className={styles.assetConflict}>{asset.conflictMessage}</p>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
