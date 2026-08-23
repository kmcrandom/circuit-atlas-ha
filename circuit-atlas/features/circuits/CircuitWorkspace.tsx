"use client";

import { EmptyState } from "@/features/forms";
import { CircuitBoard } from "lucide-react";
import { BreakerDetail } from "./BreakerDetail";
import { BreakerList } from "./BreakerList";
import { BreakerPanel } from "./BreakerPanel";
import type { BreakerPanelModel, BreakerSummary, ConnectedAsset } from "./types";
import styles from "./circuits.module.css";

export type CircuitWorkspaceProps = {
  panels: BreakerPanelModel[];
  breakers: BreakerSummary[];
  connectedAssetsByBreaker: Record<string, ConnectedAsset[]>;
  selectedPanelId?: string;
  selectedBreakerId?: string;
  selectedAssetId?: string;
  onSelectPanel?: (panelId: string) => void;
  onSelectBreaker: (breakerId: string) => void;
  onSelectAsset: (assetId: string) => void;
  onEditBreaker?: (breakerId: string) => void;
  onShowOnMap?: (breakerId: string) => void;
  onTrace?: (breakerId: string) => void;
};

export function CircuitWorkspace({
  panels,
  breakers,
  connectedAssetsByBreaker,
  selectedPanelId,
  selectedBreakerId,
  selectedAssetId,
  onSelectBreaker,
  onSelectAsset,
  onEditBreaker,
  onShowOnMap,
  onTrace,
}: CircuitWorkspaceProps) {
  const selectedBreaker = breakers.find((breaker) => breaker.id === selectedBreakerId);
  const selectedPanel =
    panels.find((panel) => panel.id === selectedPanelId) ??
    panels.find((panel) => panel.id === selectedBreaker?.panelId) ??
    panels[0];

  return (
    <div className={styles.workspace}>
      <aside className={styles.workspaceRail}>
        {selectedPanel ? (
          <BreakerPanel
            panel={selectedPanel}
            breakers={breakers.filter((breaker) => breaker.panelId === selectedPanel.id)}
            selectedBreakerId={selectedBreakerId}
            onSelectBreaker={onSelectBreaker}
          />
        ) : null}
        <BreakerList
          breakers={breakers}
          selectedBreakerId={selectedBreakerId}
          onSelect={onSelectBreaker}
        />
      </aside>
      <main>
        {selectedBreaker ? (
          <BreakerDetail
            breaker={selectedBreaker}
            connectedAssets={connectedAssetsByBreaker[selectedBreaker.id] ?? []}
            selectedAssetId={selectedAssetId}
            onSelectAsset={onSelectAsset}
            onEditBreaker={onEditBreaker}
            onShowOnMap={onShowOnMap}
            onTrace={onTrace}
          />
        ) : (
          <EmptyState
            icon={<CircuitBoard size={21} />}
            title="Select a breaker"
            description="Choose a panel position or directory entry to see every known switch, receptacle, fixture, appliance, and traced connection."
          />
        )}
      </main>
    </div>
  );
}
