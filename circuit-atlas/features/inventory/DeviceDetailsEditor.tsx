"use client";

import { Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { FormField } from "@/features/forms";
import shared from "@/features/forms/feature-ui.module.css";
import {
  DEVICE_DETAIL_DEFINITIONS,
  definitionForDeviceDetail,
  deviceDetailFormatWarning,
  suggestedDeviceDetails,
  type DeviceDetailKind,
  type InstalledDeviceDetail,
} from "@/lib/device-details";

type Props = {
  details: InstalledDeviceDetail[];
  manufacturer?: string | null;
  protocol?: string | null;
  label?: string;
  onChange: (details: InstalledDeviceDetail[]) => void;
};

function newDetail(kind: DeviceDetailKind): InstalledDeviceDetail {
  const definition = definitionForDeviceDetail(kind);
  return {
    kind,
    label: definition.label,
    value: "",
    sensitivity: definition.sensitivity,
    verification: "unknown",
  };
}

export function DeviceDetailsEditor({
  details,
  manufacturer,
  protocol,
  label = "Device identifiers & setup details",
  onChange,
}: Props) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string>();
  const suggestions = useMemo(
    () => suggestedDeviceDetails(manufacturer, protocol).filter((definition) => !details.some((detail) => detail.kind === definition.kind)),
    [details, manufacturer, protocol],
  );

  function patch(index: number, value: Partial<InstalledDeviceDetail>) {
    onChange(details.map((detail, detailIndex) => detailIndex === index ? { ...detail, ...value } : detail));
  }

  async function copyValue(key: string, value: string) {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    setCopied(key);
  }

  return (
    <section className="mt-5 grid gap-3" aria-label={label}>
      <div>
        <h3 className="text-sm font-semibold text-slate-950">{label}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">Store identifiers before the label or device becomes difficult to reach. Setup and onboarding secrets stay masked and out of search.</p>
      </div>

      {suggestions.length ? (
        <div className="flex flex-wrap gap-2" aria-label="Suggested details">
          {suggestions.map((definition) => (
            <button
              className={`${shared.button} ${shared.buttonSecondary}`}
              key={definition.kind}
              type="button"
              onClick={() => onChange([...details, newDetail(definition.kind)])}
            >
              <Plus aria-hidden="true" size={14} /> Add {definition.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3">
        {details.map((detail, index) => {
          const key = detail.id ?? `draft-${index}`;
          const isSecret = detail.sensitivity === "secret";
          const isRevealed = !isSecret || revealed.has(key);
          const warning = detail.warning ?? deviceDetailFormatWarning(detail.kind, detail.value);
          return (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={key}>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Detail type">
                  <select
                    className={shared.select}
                    value={detail.kind}
                    onChange={(event) => {
                      const kind = event.target.value as DeviceDetailKind;
                      const definition = definitionForDeviceDetail(kind);
                      patch(index, { kind, label: definition.label, sensitivity: definition.sensitivity });
                    }}
                  >
                    {DEVICE_DETAIL_DEFINITIONS.map((definition) => <option key={definition.kind} value={definition.kind}>{definition.label}</option>)}
                  </select>
                </FormField>
                <FormField label="Label">
                  <input className={shared.input} maxLength={120} required value={detail.label} onChange={(event) => patch(index, { label: event.target.value })} />
                </FormField>
                <FormField className="sm:col-span-2" description={warning ?? undefined} label="Exact value">
                  <div className="flex gap-2">
                    <input
                      aria-label={`${detail.label} exact value`}
                      autoComplete="off"
                      className={`${shared.input} min-w-0 flex-1`}
                      maxLength={2048}
                      required
                      type={isRevealed ? "text" : "password"}
                      value={detail.value}
                      onChange={(event) => patch(index, { value: event.target.value })}
                    />
                    {isSecret ? (
                      <button
                        aria-label={`${isRevealed ? "Hide" : "Reveal"} ${detail.label}`}
                        className={shared.iconButton}
                        type="button"
                        onClick={() => setRevealed((current) => {
                          const next = new Set(current);
                          if (next.has(key)) next.delete(key); else next.add(key);
                          return next;
                        })}
                      >
                        {isRevealed ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
                      </button>
                    ) : null}
                    <button
                      aria-label={`Copy ${detail.label}`}
                      className={shared.iconButton}
                      type="button"
                      onClick={() => void copyValue(key, detail.value)}
                    >
                      <Copy aria-hidden="true" size={16} />
                    </button>
                    <button
                      aria-label={`Remove ${detail.label}`}
                      className={shared.iconButton}
                      type="button"
                      onClick={() => onChange(details.filter((_, detailIndex) => detailIndex !== index))}
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  </div>
                  {copied === key ? <span className="mt-1 block text-xs text-emerald-700" role="status">Copied</span> : null}
                </FormField>
                <FormField label="Privacy">
                  <select className={shared.select} value={detail.sensitivity} onChange={(event) => patch(index, { sensitivity: event.target.value as InstalledDeviceDetail["sensitivity"] })}>
                    <option value="ordinary">Ordinary detail</option>
                    <option value="identifier">Device identifier</option>
                    <option value="secret">Secret setup credential</option>
                  </select>
                </FormField>
                <FormField label="Verification">
                  <select className={shared.select} value={detail.verification} onChange={(event) => patch(index, { verification: event.target.value as InstalledDeviceDetail["verification"] })}>
                    <option value="unknown">Unknown</option>
                    <option value="observed">Visually observed</option>
                    <option value="documentation-verified">Documentation verified</option>
                    <option value="test-verified">Test verified</option>
                    <option value="assumed">Assumed</option>
                    <option value="inferred">Inferred</option>
                    <option value="conflicting">Conflicting</option>
                  </select>
                </FormField>
                <FormField className="sm:col-span-2" label="Notes">
                  <input className={shared.input} maxLength={1000} value={detail.notes ?? ""} onChange={(event) => patch(index, { notes: event.target.value || null })} />
                </FormField>
              </div>
            </div>
          );
        })}
      </div>

      <button className={`${shared.button} ${shared.buttonSecondary} w-fit`} type="button" onClick={() => onChange([...details, newDetail("custom")])}>
        <Plus aria-hidden="true" size={14} /> Add custom detail
      </button>
    </section>
  );
}
