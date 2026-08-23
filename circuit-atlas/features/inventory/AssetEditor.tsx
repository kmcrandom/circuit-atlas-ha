"use client";

import { Lightbulb, Plus, Save, Trash2, X } from "lucide-react";
import { FormField, StatusBadge } from "@/features/forms";
import shared from "@/features/forms/feature-ui.module.css";
import type {
  BreakerReference,
  InventoryAssetDraft,
  InventoryAssetKind,
  LightSourceDetails,
  LocationOption,
  SmartState,
} from "./types";
import styles from "./inventory.module.css";
import { DeviceDetailsEditor } from "./DeviceDetailsEditor";

const kinds: Array<{ value: InventoryAssetKind; label: string }> = [
  { value: "switch", label: "Switch / controller" },
  { value: "receptacle", label: "Receptacle" },
  { value: "fixture", label: "Light / fixture" },
  { value: "light-source", label: "Light source" },
  { value: "appliance", label: "Appliance" },
  { value: "box", label: "Box" },
  { value: "cable", label: "Cable" },
  { value: "panel", label: "Panel" },
  { value: "junction", label: "Junction" },
  { value: "other", label: "Other" },
];

const smartStates: Array<{ value: SmartState; label: string }> = [
  { value: "unknown", label: "Unknown / not recorded" },
  { value: "dumb", label: "Dumb / conventional" },
  { value: "smart", label: "Smart" },
  { value: "mixed", label: "Mixed" },
  { value: "not-applicable", label: "Not applicable" },
];

function newLightSource(index: number): LightSourceDetails {
  return {
    id: `draft-light-${Date.now()}-${index}`,
    holderLabel: `Lamp holder ${index + 1}`,
    sourceType: "unknown",
    smartState: "unknown",
    dimmable: null,
  };
}

export type AssetEditorProps = {
  draft: InventoryAssetDraft;
  locationOptions: LocationOption[];
  boxOptions?: LocationOption[];
  breakerOptions: BreakerReference[];
  allowedKinds?: InventoryAssetKind[];
  onChange: (draft: InventoryAssetDraft) => void;
  onSave: (draft: InventoryAssetDraft) => void;
  onCancel: () => void;
  onArchive?: () => void;
  isSaving?: boolean;
  isLoadingDeviceDetails?: boolean;
  deviceDetailsError?: string;
  error?: string;
};

export function AssetEditor({
  draft,
  locationOptions,
  boxOptions = [],
  breakerOptions,
  allowedKinds,
  onChange,
  onSave,
  onCancel,
  onArchive,
  isSaving = false,
  isLoadingDeviceDetails = false,
  deviceDetailsError,
  error,
}: AssetEditorProps) {
  const availableKinds = allowedKinds
    ? kinds.filter((kind) => allowedKinds.includes(kind.value))
    : kinds;
  const patch = <K extends keyof InventoryAssetDraft>(key: K, value: InventoryAssetDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const patchProduct = (value: Partial<InventoryAssetDraft["installedProduct"]>) =>
    patch("installedProduct", { ...draft.installedProduct, ...value });
  const updateLightSource = (id: string, value: Partial<LightSourceDetails>) =>
    patch(
      "lightSources",
      draft.lightSources.map((source) => (source.id === id ? { ...source, ...value } : source)),
    );
  const showLightSources = draft.kind === "fixture";
  const showSmartProduct = ["switch", "receptacle", "fixture", "light-source", "appliance"].includes(draft.kind);

  return (
    <form
      className={`${shared.surface} ${styles.editor}`}
      aria-label={draft.id ? `Edit ${draft.displayName}` : "Add inventory record"}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <header className={styles.editorHeader}>
        <div>
          <p className={shared.eyebrow}>{draft.id ? "Edit record" : "New record"}</p>
          <h1 className={shared.title}>{draft.displayName || "Untitled record"}</h1>
          <p className={shared.subtle}>
            Unknown values are valid. Save what you observed and return when more is known.
          </p>
        </div>
        {draft.permanentCode ? (
          <div className={styles.codeBox}>
            <strong>{draft.permanentCode}</strong>
            <span>Permanent identity · cannot be renamed</span>
          </div>
        ) : (
          <StatusBadge tone="info">Code assigned on save</StatusBadge>
        )}
      </header>

      <section className={styles.editorSection} aria-labelledby="asset-basics">
        <div>
          <h2 className={styles.sectionTitle} id="asset-basics">Identity & location</h2>
          <p className={styles.sectionDescription}>Display labels can change without changing the record identity.</p>
        </div>
        <div className={shared.formGrid}>
          <FormField label="Display name" required>
            <input
              className={shared.input}
              value={draft.displayName}
              placeholder="Describe this item"
              required
              onChange={(event) => patch("displayName", event.target.value)}
            />
          </FormField>
          <FormField label="Record type" required>
            <select
              className={shared.select}
              disabled={Boolean(draft.id)}
              value={draft.kind}
              onChange={(event) => patch("kind", event.target.value as InventoryAssetKind)}
            >
              {availableKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
            </select>
          </FormField>
          <FormField label="Subtype" description="Optional freeform detail, such as paddle dimmer or ceiling fan.">
            <input
              className={shared.input}
              value={draft.subtype ?? ""}
              placeholder="Unknown / not recorded"
              onChange={(event) => patch("subtype", event.target.value || null)}
            />
          </FormField>
          <FormField label="Location">
            <select
              className={shared.select}
              value={draft.locationId ?? ""}
              onChange={(event) => patch("locationId", event.target.value || null)}
            >
              <option value="">Unknown / not recorded</option>
              {locationOptions.map((location) => (
                <option key={location.id} value={location.id}>{location.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Locator label" description="Editable location shorthand; not part of permanent identity.">
            <input
              className={shared.input}
              value={draft.locatorLabel ?? ""}
              placeholder="Optional locator"
              onChange={(event) => patch("locatorLabel", event.target.value || null)}
            />
          </FormField>
          <FormField label="Gang box">
            <select
              className={shared.select}
              value={draft.boxId ?? ""}
              onChange={(event) => patch("boxId", event.target.value || null)}
            >
              <option value="">Unknown / not mounted in a box</option>
              {boxOptions.map((box) => <option key={box.id} value={box.id}>{box.label}</option>)}
            </select>
          </FormField>
          {draft.boxId ? (
            <FormField label="Gang position" description="Numbered left to right from the finished-room side.">
              <input
                className={shared.input}
                value={draft.gangPosition ?? ""}
                placeholder="Unknown"
                onChange={(event) => patch("gangPosition", event.target.value || null)}
              />
            </FormField>
          ) : null}
        </div>
      </section>

      <hr className={shared.divider} />

      <section className={styles.editorSection} aria-labelledby="asset-behavior">
        <div>
          <h2 className={styles.sectionTitle} id="asset-behavior">Behavior & verification</h2>
          <p className={styles.sectionDescription}>Current installed capability stays separate from any planned replacement.</p>
        </div>
        <div className={shared.formGrid}>
          <FormField label="Current smart state">
            <select
              className={shared.select}
              value={draft.smartState}
              onChange={(event) => patch("smartState", event.target.value as SmartState)}
            >
              {smartStates.map((state) => <option key={state.value} value={state.value}>{state.label}</option>)}
            </select>
          </FormField>
          <FormField label="Operational state">
            <select
              className={shared.select}
              value={draft.operationalStatus}
              onChange={(event) => patch("operationalStatus", event.target.value as InventoryAssetDraft["operationalStatus"])}
            >
              <option value="unknown">Unknown / not recorded</option>
              <option value="working">Working</option>
              <option value="intermittent">Intermittent</option>
              <option value="not-working">Not working</option>
            </select>
          </FormField>
          <FormField label="Verification">
            <select
              className={shared.select}
              value={draft.verification}
              onChange={(event) => patch("verification", event.target.value as InventoryAssetDraft["verification"])}
            >
              <option value="unknown">Unknown</option>
              <option value="assumed">Assumed</option>
              <option value="inferred">Inferred</option>
              <option value="observed">Visually observed</option>
              <option value="test-verified">Test verified</option>
              <option value="documentation-verified">Documentation verified</option>
              <option value="conflicting">Conflicting</option>
            </select>
          </FormField>
          {draft.kind === "switch" ? (
            <FormField label="Switch configuration">
              <select
                className={shared.select}
                value={draft.switchConfiguration ?? "unknown"}
                onChange={(event) => patch("switchConfiguration", event.target.value as InventoryAssetDraft["switchConfiguration"])}
              >
                <option value="unknown">Unknown / not recorded</option>
                <option value="single-pole">Single-pole</option>
                <option value="multi-way-endpoint">Multi-way endpoint</option>
                <option value="multi-way-intermediate">Multi-way intermediate / crossover</option>
                <option value="dimmer">Dimmer</option>
                <option value="relay">Relay</option>
                <option value="sensor">Sensor</option>
                <option value="timer">Timer</option>
                <option value="scene-controller">Scene controller</option>
                <option value="custom">Custom</option>
              </select>
            </FormField>
          ) : null}
          {draft.kind === "receptacle" ? (
            <FormField label="Receptacle configuration">
              <select
                className={shared.select}
                value={draft.receptacleConfiguration ?? "unknown"}
                onChange={(event) => patch("receptacleConfiguration", event.target.value as InventoryAssetDraft["receptacleConfiguration"])}
              >
                <option value="unknown">Unknown / not recorded</option>
                <option value="duplex">Duplex</option>
                <option value="split">Split</option>
                <option value="switched-half">Half switched</option>
                <option value="gfci">GFCI</option>
                <option value="usb">USB</option>
                <option value="custom">Custom</option>
              </select>
            </FormField>
          ) : null}
        </div>
      </section>

      <section className={styles.editorSection} aria-labelledby="asset-circuits">
        <div>
          <h2 className={styles.sectionTitle} id="asset-circuits">Known circuit associations</h2>
          <p className={styles.sectionDescription}>Select any explicitly observed sources. Conductor traces remain separate.</p>
        </div>
        <div className={styles.checkboxGrid}>
          {breakerOptions.length ? breakerOptions.map((breaker) => (
            <label className={styles.choiceCard} key={breaker.id}>
              <input
                type="checkbox"
                checked={draft.breakerIds.includes(breaker.id)}
                onChange={(event) =>
                  patch(
                    "breakerIds",
                    event.target.checked
                      ? [...draft.breakerIds, breaker.id]
                      : draft.breakerIds.filter((id) => id !== breaker.id),
                  )
                }
              />
              <span>{breaker.label} · {breaker.permanentCode}</span>
            </label>
          )) : <StatusBadge tone="warning">No circuits available</StatusBadge>}
        </div>
      </section>

      {showSmartProduct ? (
        <>
          <hr className={shared.divider} />
          <section className={styles.editorSection} aria-labelledby="asset-product">
            <div>
              <h2 className={styles.sectionTitle} id="asset-product">Installed product</h2>
              <p className={styles.sectionDescription}>Leave any manufacturer detail unknown until it can be read or documented.</p>
            </div>
            {isLoadingDeviceDetails ? <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status">Loading private setup details…</p> : null}
            {deviceDetailsError ? <p className={shared.errorText} role="alert">Private setup details were not loaded: {deviceDetailsError}. Other edits will preserve existing hidden details.</p> : null}
            <div className={shared.formGrid}>
              <FormField label="Manufacturer">
                <input className={shared.input} value={draft.installedProduct.manufacturer ?? ""} placeholder="Unknown" onChange={(event) => patchProduct({ manufacturer: event.target.value || null })} />
              </FormField>
              <FormField label="Model">
                <input className={shared.input} value={draft.installedProduct.model ?? ""} placeholder="Unknown" onChange={(event) => patchProduct({ model: event.target.value || null })} />
              </FormField>
              <FormField label="Serial number">
                <input className={shared.input} value={draft.installedProduct.serialNumber ?? ""} placeholder="Unknown" onChange={(event) => patchProduct({ serialNumber: event.target.value || null })} />
              </FormField>
              <FormField label="Hardware revision">
                <input className={shared.input} value={draft.installedProduct.hardwareRevision ?? ""} placeholder="Unknown" onChange={(event) => patchProduct({ hardwareRevision: event.target.value || null })} />
              </FormField>
              <FormField label="Protocol">
                <input className={shared.input} value={draft.installedProduct.protocol ?? ""} placeholder="Wi-Fi, Zigbee, Matter, Z-Wave…" onChange={(event) => patchProduct({ protocol: event.target.value || null })} />
              </FormField>
              <FormField label="Ecosystem / integration">
                <input className={shared.input} value={draft.installedProduct.ecosystem ?? ""} placeholder="Optional" onChange={(event) => patchProduct({ ecosystem: event.target.value || null })} />
              </FormField>
              <FormField label="Required hub">
                <input className={shared.input} value={draft.installedProduct.hub ?? ""} placeholder="None, unknown, or hub name" onChange={(event) => patchProduct({ hub: event.target.value || null })} />
              </FormField>
              <FormField label="Firmware">
                <input className={shared.input} value={draft.installedProduct.firmware ?? ""} placeholder="Unknown" onChange={(event) => patchProduct({ firmware: event.target.value || null })} />
              </FormField>
            </div>
            <DeviceDetailsEditor
              details={draft.installedProduct.deviceDetails ?? []}
              manufacturer={draft.installedProduct.manufacturer}
              protocol={draft.installedProduct.protocol}
              onChange={(deviceDetails) => patchProduct({ deviceDetails })}
            />
          </section>
        </>
      ) : null}

      {showLightSources ? (
        <>
          <hr className={shared.divider} />
          <section className={styles.editorSection} aria-labelledby="asset-lights">
            <div className={styles.editorSectionHead}>
              <div>
                <h2 className={styles.sectionTitle} id="asset-lights">Lamp holders & light engines</h2>
                <p className={styles.sectionDescription}>Each holder records its own bulb or integrated source, including mixed types.</p>
              </div>
              <button
                className={`${shared.button} ${shared.buttonSecondary}`}
                type="button"
                onClick={() => patch("lightSources", [...draft.lightSources, newLightSource(draft.lightSources.length)])}
              >
                <Plus size={15} aria-hidden="true" /> Add light source
              </button>
            </div>
            <div className={styles.lightSources}>
              {draft.lightSources.length ? draft.lightSources.map((source, index) => (
                <div className={styles.lightSourceCard} key={source.id}>
                  <div className={styles.lightSourceHead}>
                    <h3 className={styles.lightSourceTitle}><Lightbulb size={15} aria-hidden="true" /> Source {index + 1}</h3>
                    <button
                      className={shared.iconButton}
                      type="button"
                      aria-label={`Remove ${source.holderLabel}`}
                      onClick={() => patch("lightSources", draft.lightSources.filter((item) => item.id !== source.id))}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <div className={shared.formGrid}>
                    <FormField label="Holder label">
                      <input className={shared.input} value={source.holderLabel} onChange={(event) => updateLightSource(source.id, { holderLabel: event.target.value })} />
                    </FormField>
                    <FormField label="Source type">
                      <select className={shared.select} value={source.sourceType} onChange={(event) => updateLightSource(source.id, { sourceType: event.target.value as LightSourceDetails["sourceType"] })}>
                        <option value="unknown">Unknown</option>
                        <option value="replaceable">Replaceable bulb</option>
                        <option value="integrated">Integrated light engine</option>
                      </select>
                    </FormField>
                    <FormField label="Smart state">
                      <select className={shared.select} value={source.smartState} onChange={(event) => updateLightSource(source.id, { smartState: event.target.value as SmartState })}>
                        {smartStates.map((state) => <option key={state.value} value={state.value}>{state.label}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Base / socket">
                      <input className={shared.input} value={source.baseType ?? ""} placeholder="Unknown" onChange={(event) => updateLightSource(source.id, { baseType: event.target.value || null })} />
                    </FormField>
                    <FormField label="Wattage">
                      <input className={shared.input} type="number" min="0" step="0.1" value={source.wattage ?? ""} placeholder="Unknown" onChange={(event) => updateLightSource(source.id, { wattage: event.target.value ? Number(event.target.value) : null })} />
                    </FormField>
                    <FormField label="Lumens">
                      <input className={shared.input} type="number" min="0" value={source.lumens ?? ""} placeholder="Unknown" onChange={(event) => updateLightSource(source.id, { lumens: event.target.value ? Number(event.target.value) : null })} />
                    </FormField>
                    <FormField label="Color / temperature">
                      <input className={shared.input} value={source.colorTemperature ?? ""} placeholder="Unknown" onChange={(event) => updateLightSource(source.id, { colorTemperature: event.target.value || null })} />
                    </FormField>
                    <FormField label="Protocol">
                      <input className={shared.input} value={source.protocol ?? ""} placeholder="Not applicable or unknown" onChange={(event) => updateLightSource(source.id, { protocol: event.target.value || null })} />
                    </FormField>
                    <FormField label="Manufacturer">
                      <input className={shared.input} value={source.manufacturer ?? ""} placeholder="Unknown" onChange={(event) => updateLightSource(source.id, { manufacturer: event.target.value || null })} />
                    </FormField>
                    <FormField label="Model">
                      <input className={shared.input} value={source.model ?? ""} placeholder="Unknown" onChange={(event) => updateLightSource(source.id, { model: event.target.value || null })} />
                    </FormField>
                    <FormField label="Serial number">
                      <input className={shared.input} value={source.serialNumber ?? ""} placeholder="Unknown" onChange={(event) => updateLightSource(source.id, { serialNumber: event.target.value || null })} />
                    </FormField>
                    <FormField label="Hardware revision">
                      <input className={shared.input} value={source.hardwareRevision ?? ""} placeholder="Unknown" onChange={(event) => updateLightSource(source.id, { hardwareRevision: event.target.value || null })} />
                    </FormField>
                    <FormField label="Firmware">
                      <input className={shared.input} value={source.firmware ?? ""} placeholder="Unknown" onChange={(event) => updateLightSource(source.id, { firmware: event.target.value || null })} />
                    </FormField>
                  </div>
                  <DeviceDetailsEditor
                    details={source.deviceDetails ?? []}
                    label={`${source.holderLabel} identifiers & setup details`}
                    manufacturer={source.manufacturer}
                    protocol={source.protocol}
                    onChange={(deviceDetails) => updateLightSource(source.id, { deviceDetails })}
                  />
                </div>
              )) : (
                <StatusBadge tone="warning">No lamp holders or integrated engines recorded</StatusBadge>
              )}
            </div>
          </section>
        </>
      ) : null}

      <hr className={shared.divider} />
      <section className={styles.editorSection} aria-labelledby="asset-notes">
        <h2 className={styles.sectionTitle} id="asset-notes">Notes</h2>
        <FormField label="Observation notes" className={shared.fullWidth}>
          <textarea
            className={shared.textarea}
            value={draft.notes}
            placeholder="Record labels, behavior, evidence, unknowns, or follow-up questions."
            onChange={(event) => patch("notes", event.target.value)}
          />
        </FormField>
      </section>

      {error ? <p className={shared.errorText} role="alert">{error}</p> : null}
      <footer className={styles.stickyActions}>
        <span className={styles.saveHint}>Unknown and incomplete records can be saved for review.</span>
        <div className={shared.buttonRow}>
          {draft.id && onArchive ? (
            <button className={`${shared.button} ${shared.buttonSecondary}`} type="button" onClick={onArchive} disabled={isSaving}>
              <Trash2 size={15} aria-hidden="true" /> Archive record
            </button>
          ) : null}
          <button className={`${shared.button} ${shared.buttonSecondary}`} type="button" onClick={onCancel} disabled={isSaving}>
            <X size={15} aria-hidden="true" /> Cancel
          </button>
          <button className={`${shared.button} ${shared.buttonPrimary}`} type="submit" disabled={isSaving || !draft.displayName.trim()}>
            <Save size={15} aria-hidden="true" /> {isSaving ? "Saving…" : "Save record"}
          </button>
        </div>
      </footer>
    </form>
  );
}
