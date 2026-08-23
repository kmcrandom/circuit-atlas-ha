import type { InventoryAssetKind, SmartState, UpgradeStatus } from "@/features/inventory";

export type ReadinessState = "known" | "missing" | "conflicting" | "unknown";

export type UpgradeRequirement = {
  id: string;
  label: string;
  state: ReadinessState;
  observedValue?: string | null;
  detail?: string | null;
};

export type ProductSnapshot = {
  smartState: SmartState;
  manufacturer?: string | null;
  model?: string | null;
  protocol?: string | null;
  ecosystem?: string | null;
  productId?: string | null;
};

export type UpgradePlanItem = {
  id: string;
  assetId: string;
  upgradePermanentCode: string;
  permanentCode: string;
  goal: string;
  displayName: string;
  kind: InventoryAssetKind;
  locationLabel?: string | null;
  status: UpgradeStatus;
  current: ProductSnapshot;
  planned?: ProductSnapshot | null;
  requirements: UpgradeRequirement[];
  notes?: string | null;
};

export type UpgradeBoardFilter = "all" | "needs-facts" | "ready" | "in-progress";
