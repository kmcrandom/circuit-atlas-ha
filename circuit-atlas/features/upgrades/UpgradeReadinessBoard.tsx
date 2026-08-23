"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Plus,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { EmptyState, SegmentedControl, StatusBadge } from "@/features/forms";
import shared from "@/features/forms/feature-ui.module.css";
import type { UpgradeStatus } from "@/features/inventory";
import type {
  ReadinessState,
  UpgradeBoardFilter,
  UpgradePlanItem,
  UpgradeRequirement,
} from "./types";
import styles from "./upgrades.module.css";

const statusLabels: Record<UpgradeStatus, string> = {
  keep: "Keep",
  investigate: "Investigate",
  candidate: "Candidate",
  planned: "Planned",
  purchased: "Purchased",
  installed: "Installed",
  verified: "Verified",
};

const statusOptions = Object.entries(statusLabels) as Array<[UpgradeStatus, string]>;

function readiness(item: UpgradePlanItem) {
  if (item.requirements.some((requirement) => requirement.state === "conflicting")) return "conflicting";
  if (item.requirements.some((requirement) => requirement.state === "missing")) return "missing";
  if (item.requirements.some((requirement) => requirement.state === "unknown")) return "unknown";
  return "known";
}

function itemMatchesFilter(item: UpgradePlanItem, filter: UpgradeBoardFilter) {
  if (filter === "all") return true;
  const state = readiness(item);
  if (filter === "ready") return state === "known" && Boolean(item.planned);
  if (filter === "needs-facts") return state !== "known";
  return ["planned", "purchased", "installed"].includes(item.status);
}

function productLabel(item: UpgradePlanItem, planned = false) {
  const product = planned ? item.planned : item.current;
  if (!product) return "Not selected";
  const model = [product.manufacturer, product.model].filter(Boolean).join(" ");
  const smart = product.smartState === "dumb" ? "Dumb" : product.smartState === "smart" ? "Smart" : product.smartState;
  return model || smart;
}

function RequirementIcon({ state }: { state: ReadinessState }) {
  if (state === "known") return <CheckCircle2 size={14} aria-hidden="true" />;
  if (state === "missing") return <AlertCircle size={14} aria-hidden="true" />;
  if (state === "conflicting") return <XCircle size={14} aria-hidden="true" />;
  return <CircleHelp size={14} aria-hidden="true" />;
}

function requirementClass(requirement: UpgradeRequirement) {
  if (requirement.state === "known") return styles.requirementKnown;
  if (requirement.state === "missing") return styles.requirementMissing;
  if (requirement.state === "conflicting") return styles.requirementConflict;
  return "";
}

export type UpgradeReadinessBoardProps = {
  items: UpgradePlanItem[];
  filter: UpgradeBoardFilter;
  selectedItemId?: string;
  onFilterChange: (filter: UpgradeBoardFilter) => void;
  onSelectItem: (itemId: string) => void;
  onStatusChange: (itemId: string, status: UpgradeStatus) => void;
  onAddCandidate?: () => void;
  onEditPlan?: (itemId: string) => void;
};

export function UpgradeReadinessBoard({
  items,
  filter,
  selectedItemId,
  onFilterChange,
  onSelectItem,
  onStatusChange,
  onAddCandidate,
  onEditPlan,
}: UpgradeReadinessBoardProps) {
  const visible = items.filter((item) => itemMatchesFilter(item, filter));
  const columns = [
    { id: "considering", label: "Considering", statuses: ["keep", "investigate", "candidate"] as UpgradeStatus[] },
    { id: "planned", label: "Planned & purchased", statuses: ["planned", "purchased"] as UpgradeStatus[] },
    { id: "completed", label: "Installed & verified", statuses: ["installed", "verified"] as UpgradeStatus[] },
  ];
  const factsNeeded = items.filter((item) => readiness(item) !== "known").length;
  const planned = items.filter((item) => item.planned).length;
  const smartNow = items.filter((item) => item.current.smartState === "smart").length;

  return (
    <section className={styles.board} aria-label="Smart upgrade readiness board">
      <header className={`${shared.surface} ${styles.boardHeader}`}>
        <div className={styles.headerTop}>
          <div>
            <p className={shared.eyebrow}>Current vs planned</p>
            <h1 className={shared.title}>Smart upgrade plan</h1>
            <p className={shared.subtle}>Document facts and product ideas without changing the installed wiring record.</p>
          </div>
          {onAddCandidate ? (
            <button className={`${shared.button} ${shared.buttonPrimary}`} type="button" onClick={onAddCandidate}>
              <Plus size={15} aria-hidden="true" /> Add candidate
            </button>
          ) : null}
        </div>
        <div className={styles.metrics}>
          <div className={styles.metric}><span className={styles.metricValue}>{items.length}</span><span className={styles.metricLabel}>Tracked items</span></div>
          <div className={styles.metric}><span className={styles.metricValue}>{smartNow}</span><span className={styles.metricLabel}>Smart now</span></div>
          <div className={styles.metric}><span className={styles.metricValue}>{planned}</span><span className={styles.metricLabel}>Products planned</span></div>
          <div className={styles.metric}><span className={styles.metricValue}>{factsNeeded}</span><span className={styles.metricLabel}>Need facts</span></div>
        </div>
        <SegmentedControl
          label="Filter upgrade items"
          value={filter}
          onChange={onFilterChange}
          options={[
            { value: "all", label: "All" },
            { value: "needs-facts", label: "Needs facts" },
            { value: "ready", label: "Ready to plan" },
            { value: "in-progress", label: "In progress" },
          ]}
        />
        <div className={styles.disclaimer}>
          <ShieldAlert size={16} aria-hidden="true" />
          <span>Readiness summarizes documented facts only. It does not guarantee electrical suitability, compatibility, or code compliance.</span>
        </div>
      </header>

      {visible.length ? (
        <div className={styles.columns}>
          {columns.map((column) => {
            const columnItems = visible.filter((item) => column.statuses.includes(item.status));
            return (
              <section className={styles.column} key={column.id} aria-labelledby={`${column.id}-title`}>
                <header className={styles.columnHead}>
                  <h2 className={styles.columnTitle} id={`${column.id}-title`}>{column.label}</h2>
                  <StatusBadge tone="neutral">{columnItems.length}</StatusBadge>
                </header>
                <div className={styles.cards}>
                  {columnItems.length ? columnItems.map((item) => {
                    const state = readiness(item);
                    const shownRequirements = item.requirements.filter((requirement) => requirement.state !== "known").slice(0, 4);
                    return (
                      <article className={`${styles.card} ${item.id === selectedItemId ? styles.cardSelected : ""}`} key={item.id}>
                        <div className={styles.cardHead}>
                          <button className={styles.identityButton} type="button" onClick={() => onSelectItem(item.id)}>
                            <span className={styles.itemName}>{item.displayName}</span>
                            <span className={styles.itemMeta}>{item.locationLabel || "Location unknown"} · {item.permanentCode}</span>
                          </button>
                          <StatusBadge tone={state === "known" ? "positive" : state === "conflicting" ? "danger" : "warning"}>
                            {state === "known" ? "Facts ready" : state === "conflicting" ? "Conflict" : "Needs facts"}
                          </StatusBadge>
                        </div>
                        <p className={styles.goal}>{item.goal}</p>
                        <div className={styles.comparison} aria-label="Current and planned product">
                          <div className={styles.stateBox}>
                            <span className={styles.stateLabel}>Current</span>
                            <span className={styles.stateValue}>{productLabel(item)}</span>
                          </div>
                          <ArrowRight className={styles.arrow} size={15} aria-hidden="true" />
                          <div className={styles.stateBox}>
                            <span className={styles.stateLabel}>Planned</span>
                            <span className={styles.stateValue}>{productLabel(item, true)}</span>
                          </div>
                        </div>
                        {shownRequirements.length ? (
                          <ul className={styles.requirements} aria-label="Open readiness facts">
                            {shownRequirements.map((requirement) => (
                              <li className={`${styles.requirement} ${requirementClass(requirement)}`} key={requirement.id}>
                                <RequirementIcon state={requirement.state} />
                                <span>{requirement.label}{requirement.observedValue ? ` · ${requirement.observedValue}` : ""}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={`${styles.requirement} ${styles.requirementKnown}`}><CheckCircle2 size={14} aria-hidden="true" /> Documented requirements are known</p>
                        )}
                        <footer className={styles.cardFooter}>
                          <select
                            className={`${shared.select} ${styles.statusSelect}`}
                            value={item.status}
                            aria-label={`Upgrade status for ${item.displayName}`}
                            onChange={(event) => onStatusChange(item.id, event.target.value as UpgradeStatus)}
                          >
                            {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          {onEditPlan ? (
                            <button className={`${shared.button} ${shared.buttonQuiet}`} type="button" onClick={() => onEditPlan(item.id)}>Edit plan</button>
                          ) : null}
                        </footer>
                      </article>
                    );
                  }) : <p className={styles.emptyColumn}>No items in this stage.</p>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<CircleHelp size={20} />}
          title="No upgrade items match"
          description="Choose another readiness filter or add a switch, receptacle, fixture, bulb, or appliance candidate."
        />
      )}
    </section>
  );
}
