"use client";

import type { CSSProperties, ChangeEvent } from "react";
import { useState } from "react";
import { withRuntimeBasePath } from "@/lib/client/runtime-path";
import {
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { EmptyState, FormField, ProgressSteps, StatusBadge } from "@/features/forms";
import shared from "@/features/forms/feature-ui.module.css";
import type {
  CaptureCable,
  CaptureConductor,
  CaptureConductorEnd,
  CaptureDraft,
  CaptureGangDevice,
  CaptureReviewIssue,
  CaptureSaveState,
  CaptureStep,
} from "./types";
import styles from "./capture.module.css";

export const CAPTURE_STEPS = [
  { id: "photos", label: "Photos" },
  { id: "gangs", label: "Gangs" },
  { id: "cables", label: "Cables" },
  { id: "conductors", label: "Conductors" },
  { id: "review", label: "Review" },
] as const;

function nextDraftId(prefix: string, count: number) {
  return `${prefix}-draft-${Date.now()}-${count + 1}`;
}

export function reviewCaptureDraft(draft: CaptureDraft): CaptureReviewIssue[] {
  const issues: CaptureReviewIssue[] = [];
  if (!draft.photos.length) issues.push({ id: "photos-none", label: "No evidence photos recorded.", step: "photos", severity: "info" });
  if (draft.box.gangCount == null) issues.push({ id: "gang-count", label: "Gang count is unknown.", step: "gangs", severity: "warning" });
  if (!draft.gangDevices.length) issues.push({ id: "gang-devices", label: "No mounted devices recorded.", step: "gangs", severity: "info" });
  if (!draft.cables.length) issues.push({ id: "cables-none", label: "No entering cables recorded.", step: "cables", severity: "info" });
  for (const cable of draft.cables) {
    if (cable.gauge == null) issues.push({ id: `${cable.id}-gauge`, label: `${cable.permanentCode || "A cable"} has unknown gauge; this is allowed.`, step: "cables", severity: "info" });
    if (cable.entrySide === "unknown") issues.push({ id: `${cable.id}-entry`, label: `${cable.permanentCode || "A cable"} has an unknown box entry side.`, step: "cables", severity: "warning" });
  }
  for (const conductor of draft.conductors) {
    for (const end of conductor.ends) {
      if (end.terminationType === "unknown") issues.push({ id: `${conductor.id}-${end.designation}-termination`, label: `${conductor.permanentCode || "A conductor"} end ${end.designation.toUpperCase()} has an unresolved endpoint.`, step: "conductors", severity: "warning" });
    }
  }
  return issues;
}

function saveStateLabel(state: CaptureSaveState) {
  if (state === "saving") return "Saving…";
  if (state === "saved") return "Draft saved";
  if (state === "retryable-error") return "Save needs retry";
  if (state === "conflict") return "Newer draft found";
  return "Not saved yet";
}

export type CaptureWizardProps = {
  draft: CaptureDraft;
  step?: CaptureStep;
  saveState?: CaptureSaveState;
  onDraftChange: (draft: CaptureDraft) => void;
  onStepChange?: (step: CaptureStep) => void;
  onSaveDraft: (draft: CaptureDraft) => void;
  onComplete: (draft: CaptureDraft) => void;
  onAddPhotos?: (files: File[], category: "overview" | "close-up") => void;
  onCancel?: () => void;
};

export function CaptureWizard({
  draft,
  step,
  saveState = "idle",
  onDraftChange,
  onStepChange,
  onSaveDraft,
  onComplete,
  onAddPhotos,
  onCancel,
}: CaptureWizardProps) {
  const [internalStep, setInternalStep] = useState<CaptureStep>("photos");
  const activeStep = step ?? internalStep;
  const activeIndex = CAPTURE_STEPS.findIndex((item) => item.id === activeStep);
  const setStep = (value: CaptureStep) => {
    if (onStepChange) onStepChange(value);
    else setInternalStep(value);
  };
  const patch = (value: Partial<CaptureDraft>) => onDraftChange({ ...draft, ...value });
  const patchBox = (value: Partial<CaptureDraft["box"]>) => patch({ box: { ...draft.box, ...value } });
  const issues = reviewCaptureDraft(draft);
  const photoChange = (category: "overview" | "close-up") => (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length) onAddPhotos?.(files, category);
    event.target.value = "";
  };

  return (
    <section className={`${shared.surface} ${styles.wizard}`} aria-label="Room walk capture">
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <p className={shared.eyebrow}>Room-walk capture</p>
            <h1 className={shared.title}>{draft.targetLabel}</h1>
            <p className={shared.subtle}>{draft.locationLabel || "Location not recorded"} · Resume anytime</p>
          </div>
          <div className={styles.draftMeta}>
            <StatusBadge tone={saveState === "saved" ? "positive" : saveState === "conflict" ? "danger" : saveState === "retryable-error" ? "warning" : "neutral"}>{saveStateLabel(saveState)}</StatusBadge>
            {draft.updatedAt ? <span className={shared.hint}>Updated {draft.updatedAt}</span> : null}
          </div>
        </div>
        <ProgressSteps steps={CAPTURE_STEPS} current={activeStep} onSelect={setStep} />
        <div className={styles.safety} role="note">
          <ShieldAlert size={18} aria-hidden="true" />
          <span><strong>Work safely around electrical equipment.</strong> De-energize the circuit and independently verify before opening or inspecting a box. A recorded breaker state is not proof that equipment is safe. Use a qualified electrician when appropriate.</span>
        </div>
      </header>

      <hr className={shared.divider} />
      {activeStep === "photos" ? <PhotosStep draft={draft} patch={patch} onPhotoChange={photoChange} enabled={Boolean(onAddPhotos)} /> : null}
      {activeStep === "gangs" ? <GangsStep draft={draft} patch={patch} patchBox={patchBox} /> : null}
      {activeStep === "cables" ? <CablesStep draft={draft} patch={patch} /> : null}
      {activeStep === "conductors" ? <ConductorsStep draft={draft} patch={patch} /> : null}
      {activeStep === "review" ? <ReviewStep draft={draft} patch={patch} issues={issues} onGoToStep={setStep} /> : null}

      <footer className={styles.footer}>
        <div>
          {onCancel ? <button className={`${shared.button} ${shared.buttonQuiet}`} type="button" onClick={onCancel}>Exit capture</button> : null}
        </div>
        <div className={styles.footerRight}>
          <button className={`${shared.button} ${shared.buttonSecondary}`} type="button" disabled={activeIndex === 0} onClick={() => setStep(CAPTURE_STEPS[Math.max(0, activeIndex - 1)].id)}>
            <ChevronLeft size={15} aria-hidden="true" /> Back
          </button>
          <button className={`${shared.button} ${shared.buttonSecondary}`} type="button" disabled={saveState === "saving"} onClick={() => onSaveDraft(draft)}>
            <Save size={15} aria-hidden="true" /> Save draft
          </button>
          {activeStep === "review" ? (
            <button className={`${shared.button} ${shared.buttonPrimary}`} type="button" onClick={() => onComplete({ ...draft, needsReview: draft.needsReview || issues.length > 0 })}>
              Finish {issues.length ? "with review flags" : "capture"}
            </button>
          ) : (
            <button className={`${shared.button} ${shared.buttonPrimary}`} type="button" onClick={() => setStep(CAPTURE_STEPS[Math.min(CAPTURE_STEPS.length - 1, activeIndex + 1)].id)}>
              Continue <ChevronRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}

function PhotosStep({ draft, patch, onPhotoChange, enabled }: { draft: CaptureDraft; patch: (value: Partial<CaptureDraft>) => void; onPhotoChange: (category: "overview" | "close-up") => (event: ChangeEvent<HTMLInputElement>) => void; enabled: boolean }) {
  return (
    <section className={styles.step} aria-labelledby="capture-photos">
      <div className={styles.stepHead}><div><h2 className={styles.stepTitle} id="capture-photos">Photograph what you can see</h2><p className={styles.stepCopy}>Capture context first, then labels and conductor terminations. Photos support observations; structured records remain the source of truth.</p></div><StatusBadge tone="neutral">{draft.photos.length} photos</StatusBadge></div>
      <div className={styles.photoActions}>
        {(["overview", "close-up"] as const).map((category) => (
          <label className={styles.photoButton} key={category} aria-disabled={!enabled}>
            <input className={styles.photoInput} type="file" accept="image/*" capture="environment" multiple disabled={!enabled} onChange={onPhotoChange(category)} />
            <span><Camera size={22} aria-hidden="true" /><strong>{category === "overview" ? "Add overview photos" : "Add close-up photos"}</strong><span>{category === "overview" ? "Room, wall, cover, orientation" : "Labels, terminals, markings"}</span></span>
          </label>
        ))}
      </div>
      {draft.photos.length ? <div className={styles.photoGrid}>{draft.photos.map((photo) => (
        <div className={styles.photoCard} key={photo.id}>
          {/* eslint-disable-next-line @next/next/no-img-element -- private capture draft URL. */}
          <img src={withRuntimeBasePath(photo.url)} alt={photo.caption || `${photo.category} capture`} />
          <button className={`${shared.iconButton} ${styles.photoRemove}`} type="button" aria-label="Remove photo" onClick={() => patch({ photos: draft.photos.filter((item) => item.id !== photo.id) })}><Trash2 size={14} /></button>
          <div className={styles.photoCardMeta}><StatusBadge tone={photo.uploadState === "failed" ? "danger" : photo.uploadState === "uploading" ? "info" : "neutral"}>{photo.category}</StatusBadge><input className={shared.input} aria-label="Photo caption" value={photo.caption ?? ""} placeholder="Optional caption" onChange={(event) => patch({ photos: draft.photos.map((item) => item.id === photo.id ? { ...item, caption: event.target.value || null } : item) })} /></div>
        </div>
      ))}</div> : <EmptyState icon={<Camera size={20} />} title="No photos yet" description="Photos are recommended evidence, but they are not required to save an incomplete capture." />}
    </section>
  );
}

function GangsStep({ draft, patch, patchBox }: { draft: CaptureDraft; patch: (value: Partial<CaptureDraft>) => void; patchBox: (value: Partial<CaptureDraft["box"]>) => void }) {
  const updateDevice = (id: string, value: Partial<CaptureGangDevice>) => patch({ gangDevices: draft.gangDevices.map((item) => item.id === id ? { ...item, ...value } : item) });
  return (
    <section className={styles.step} aria-labelledby="capture-gangs">
      <div className={styles.stepHead}><div><h2 className={styles.stepTitle} id="capture-gangs">Lay out the box and gangs</h2><p className={styles.stepCopy}>Gang positions run left to right while facing the finished wall. Unknown box details can stay unknown.</p></div><button className={`${shared.button} ${shared.buttonSecondary}`} type="button" onClick={() => patch({ gangDevices: [...draft.gangDevices, { id: nextDraftId("device", draft.gangDevices.length), displayName: `Device ${draft.gangDevices.length + 1}`, kind: "unknown", gangIndex: null, gangSpan: 1, rotation: null, smartState: "unknown" }] })}><Plus size={15} /> Add device</button></div>
      <div className={shared.formGrid}>
        <FormField label="Box display name"><input className={shared.input} value={draft.box.displayName} onChange={(event) => patchBox({ displayName: event.target.value })} /></FormField>
        <FormField label="Gang count"><input className={shared.input} type="number" min="1" value={draft.box.gangCount ?? ""} placeholder="Unknown" onChange={(event) => patchBox({ gangCount: event.target.value ? Number(event.target.value) : null })} /></FormField>
        <FormField label="Box type"><input className={shared.input} value={draft.box.type ?? ""} placeholder="Unknown" onChange={(event) => patchBox({ type: event.target.value || null })} /></FormField>
        <FormField label="Material"><select className={shared.select} value={draft.box.material} onChange={(event) => patchBox({ material: event.target.value as CaptureDraft["box"]["material"] })}><option value="unknown">Unknown</option><option value="plastic">Plastic</option><option value="metal">Metal</option><option value="other">Other</option></select></FormField>
        <FormField label="View orientation"><select className={shared.select} value={draft.box.orientation} onChange={(event) => patchBox({ orientation: event.target.value as CaptureDraft["box"]["orientation"] })}><option value="unknown">Unknown</option><option value="wall-finished-side">Wall · from finished-room side</option><option value="ceiling-from-below">Ceiling · from below</option><option value="other">Other</option></select></FormField>
        <FormField label="Depth / dimensions"><input className={shared.input} value={draft.box.depth ?? ""} placeholder="Optional / unknown" onChange={(event) => patchBox({ depth: event.target.value || null })} /></FormField>
      </div>
      <div className={styles.collection}>{draft.gangDevices.map((device, index) => (
        <article className={styles.recordCard} key={device.id}>
          <header className={styles.recordHead}><h3 className={styles.recordTitle}>Mounted device {index + 1}</h3><button className={shared.iconButton} type="button" aria-label={`Remove ${device.displayName}`} onClick={() => patch({ gangDevices: draft.gangDevices.filter((item) => item.id !== device.id) })}><Trash2 size={15} /></button></header>
          <div className={shared.formGrid}>
            <FormField label="Name"><input className={shared.input} value={device.displayName} onChange={(event) => updateDevice(device.id, { displayName: event.target.value })} /></FormField>
            <FormField label="Kind"><select className={shared.select} value={device.kind} onChange={(event) => updateDevice(device.id, { kind: event.target.value as CaptureGangDevice["kind"] })}><option value="unknown">Unknown</option><option value="switch">Switch / controller</option><option value="receptacle">Receptacle</option><option value="other">Other</option></select></FormField>
            <FormField label="Gang position"><input className={shared.input} type="number" min="1" value={device.gangIndex ?? ""} placeholder="Unknown" onChange={(event) => updateDevice(device.id, { gangIndex: event.target.value ? Number(event.target.value) : null })} /></FormField>
            <FormField label="Gang span"><input className={shared.input} type="number" min="1" value={device.gangSpan ?? ""} placeholder="Unknown" onChange={(event) => updateDevice(device.id, { gangSpan: event.target.value ? Number(event.target.value) : null })} /></FormField>
            <FormField label="Current capability"><select className={shared.select} value={device.smartState} onChange={(event) => updateDevice(device.id, { smartState: event.target.value as CaptureGangDevice["smartState"] })}><option value="unknown">Unknown</option><option value="dumb">Dumb / conventional</option><option value="smart">Smart</option><option value="smart-companion">Smart companion / aux</option><option value="wireless-remote">Wireless remote</option></select></FormField>
            <FormField label="Configuration"><input className={shared.input} value={device.configuration ?? ""} placeholder="Single-pole, multi-way endpoint…" onChange={(event) => updateDevice(device.id, { configuration: event.target.value || null })} /></FormField>
          </div>
        </article>
      ))}</div>
    </section>
  );
}

function CablesStep({ draft, patch }: { draft: CaptureDraft; patch: (value: Partial<CaptureDraft>) => void }) {
  const updateCable = (id: string, value: Partial<CaptureCable>) => patch({ cables: draft.cables.map((item) => item.id === id ? { ...item, ...value } : item) });
  const gangCount = Math.max(1, draft.box.gangCount ?? 1);
  return (
    <section className={styles.step} aria-labelledby="capture-cables">
      <div className={styles.stepHead}><div><h2 className={styles.stepTitle} id="capture-cables">Record cable entries</h2><p className={styles.stepCopy}>Record where each cable enters this box. Gauge is optional, and the concealed route between endpoints is intentionally not recorded.</p></div><button className={`${shared.button} ${shared.buttonSecondary}`} type="button" onClick={() => patch({ cables: [...draft.cables, { id: nextDraftId("cable", draft.cables.length), wiringMethod: "unknown", insulatedConductorCount: null, equipmentGroundCount: null, gauge: null, endDesignation: "unknown", entrySide: "unknown", entryOffset: null, certainty: "unknown" }] })}><Plus size={15} /> Add cable</button></div>
      <div className={styles.entryPreview} aria-label="Gang box cable-entry preview" style={{ "--gang-count": gangCount } as CSSProperties}>
        {Array.from({ length: gangCount }, (_, index) => <div className={styles.gangCell} key={index}>Gang {index + 1}</div>)}
        {draft.cables.map((cable, index) => cable.entrySide !== "unknown" ? <span key={cable.id} className={`${styles.cableMarker} ${styles[`marker${cable.entrySide[0].toUpperCase()}${cable.entrySide.slice(1)}` as keyof typeof styles]}`} style={cable.entrySide === "top" || cable.entrySide === "bottom" ? { left: `${Math.max(8, Math.min(92, cable.entryOffset ?? 50))}%` } : cable.entrySide === "left" || cable.entrySide === "right" ? { top: `${Math.max(8, Math.min(92, cable.entryOffset ?? 50))}%` } : undefined}>C{index + 1}</span> : null)}
      </div>
      <div className={styles.collection}>{draft.cables.map((cable, index) => (
        <article className={styles.recordCard} key={cable.id}>
          <header className={styles.recordHead}><h3 className={styles.recordTitle}>{cable.permanentCode || `Cable ${index + 1}`}</h3><button className={shared.iconButton} type="button" aria-label={`Remove cable ${index + 1}`} onClick={() => patch({ cables: draft.cables.filter((item) => item.id !== cable.id), conductors: draft.conductors.filter((item) => item.cableId !== cable.id) })}><Trash2 size={15} /></button></header>
          <div className={shared.formGrid}>
            <FormField label="Wiring method"><select className={shared.select} value={cable.wiringMethod} onChange={(event) => updateCable(cable.id, { wiringMethod: event.target.value as CaptureCable["wiringMethod"] })}><option value="unknown">Unknown</option><option value="nm-b">NM-B</option><option value="uf-b">UF-B</option><option value="mc">MC</option><option value="conduit">Conductors in conduit</option><option value="custom">Other / custom</option></select></FormField>
            <FormField label="Jacket marking"><input className={shared.input} value={cable.rawJacketMarking ?? ""} placeholder="Unknown / unreadable" onChange={(event) => updateCable(cable.id, { rawJacketMarking: event.target.value || null })} /></FormField>
            <FormField label="Insulated conductors"><input className={shared.input} type="number" min="0" value={cable.insulatedConductorCount ?? ""} placeholder="Unknown" onChange={(event) => updateCable(cable.id, { insulatedConductorCount: event.target.value ? Number(event.target.value) : null })} /></FormField>
            <FormField label="Equipment grounds"><input className={shared.input} type="number" min="0" value={cable.equipmentGroundCount ?? ""} placeholder="Unknown" onChange={(event) => updateCable(cable.id, { equipmentGroundCount: event.target.value ? Number(event.target.value) : null })} /></FormField>
            <FormField label="Wire gauge" description="Optional; leave unknown if not directly observed."><input className={shared.input} value={cable.gauge ?? ""} placeholder="Unknown / optional" onChange={(event) => updateCable(cable.id, { gauge: event.target.value || null })} /></FormField>
            <FormField label="Cable end in this box"><select className={shared.select} value={cable.endDesignation} onChange={(event) => updateCable(cable.id, { endDesignation: event.target.value as CaptureCable["endDesignation"] })}><option value="unknown">Unknown</option><option value="a">End A</option><option value="b">End B</option></select></FormField>
            <FormField label="Entry side"><select className={shared.select} value={cable.entrySide} onChange={(event) => updateCable(cable.id, { entrySide: event.target.value as CaptureCable["entrySide"] })}><option value="unknown">Unknown</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option><option value="back">Back</option></select></FormField>
            <FormField label="Entry offset (%)"><input className={shared.input} type="number" min="0" max="100" value={cable.entryOffset ?? ""} placeholder="Unknown" onChange={(event) => updateCable(cable.id, { entryOffset: event.target.value ? Number(event.target.value) : null })} /></FormField>
            <FormField label="Known other endpoint"><input className={shared.input} value={cable.otherEndpointLabel ?? ""} placeholder="Unknown endpoint" onChange={(event) => updateCable(cable.id, { otherEndpointLabel: event.target.value || null })} /></FormField>
            <FormField label="Certainty"><select className={shared.select} value={cable.certainty} onChange={(event) => updateCable(cable.id, { certainty: event.target.value as CaptureCable["certainty"] })}><option value="unknown">Unknown</option><option value="assumed">Assumed</option><option value="inferred">Inferred</option><option value="observed">Visually observed</option><option value="test-verified">Test verified</option></select></FormField>
          </div>
        </article>
      ))}</div>
      {!draft.cables.length ? <EmptyState icon={<CircleHelp size={20} />} title="No cables recorded" description="Save this step as unknown, or add each cable that visibly enters the box." /> : null}
    </section>
  );
}

function ConductorsStep({ draft, patch }: { draft: CaptureDraft; patch: (value: Partial<CaptureDraft>) => void }) {
  const update = (id: string, value: Partial<CaptureConductor>) => patch({ conductors: draft.conductors.map((item) => item.id === id ? { ...item, ...value } : item) });
  const updateEnd = (conductorId: string, endId: string, value: Partial<CaptureConductorEnd>) => patch({
    conductors: draft.conductors.map((item) => item.id === conductorId ? {
      ...item,
      ends: item.ends.map((end) => end.id === endId ? { ...end, ...value } : end) as CaptureConductor["ends"],
    } : item),
  });
  const addConductor = () => {
    const id = nextDraftId("conductor", draft.conductors.length);
    const ends: CaptureConductor["ends"] = [
      { id: `${id}-end-a`, designation: "a", terminationType: "unknown", certainty: "unknown" },
      { id: `${id}-end-b`, designation: "b", terminationType: "unknown", certainty: "unknown" },
    ];
    patch({ conductors: [...draft.conductors, { id, cableId: draft.cables[0]?.id ?? null, kind: "unknown", ends }] });
  };
  return (
    <section className={styles.step} aria-labelledby="capture-conductors">
      <div className={styles.stepHead}><div><h2 className={styles.stepTitle} id="capture-conductors">Trace individual conductors</h2><p className={styles.stepCopy}>Identify ends A and B separately. A role, color, gauge, destination, or termination can remain unknown; insulation color does not assign function.</p></div><button className={`${shared.button} ${shared.buttonSecondary}`} type="button" onClick={addConductor}><Plus size={15} /> Add conductor</button></div>
      <div className={styles.collection}>{draft.conductors.map((conductor, index) => (
        <article className={styles.recordCard} key={conductor.id}>
          <header className={styles.recordHead}><h3 className={styles.recordTitle}>{conductor.permanentCode || `Conductor ${index + 1}`}</h3><button className={shared.iconButton} type="button" aria-label={`Remove conductor ${index + 1}`} onClick={() => patch({ conductors: draft.conductors.filter((item) => item.id !== conductor.id) })}><Trash2 size={15} /></button></header>
          <div className={shared.formGrid}>
            <FormField label="Parent cable"><select className={shared.select} value={conductor.cableId ?? ""} onChange={(event) => update(conductor.id, { cableId: event.target.value || null })}><option value="">No cable / unknown</option>{draft.cables.map((cable, cableIndex) => <option key={cable.id} value={cable.id}>{cable.permanentCode || `Cable ${cableIndex + 1}`}</option>)}</select></FormField>
            <FormField label="Conductor kind"><select className={shared.select} value={conductor.kind} onChange={(event) => update(conductor.id, { kind: event.target.value as CaptureConductor["kind"] })}><option value="unknown">Unknown</option><option value="cable-core">Cable core</option><option value="equipment-ground">Equipment ground</option><option value="pigtail">Pigtail</option><option value="jumper">Jumper</option><option value="device-lead">Device lead</option><option value="standalone">Standalone / raceway</option></select></FormField>
            <FormField label="Observed insulation color"><input className={shared.input} value={conductor.observedColor ?? ""} placeholder="Unknown" onChange={(event) => update(conductor.id, { observedColor: event.target.value || null })} /></FormField>
            <FormField label="Re-identification marking"><input className={shared.input} value={conductor.reidentification ?? ""} placeholder="None observed / unknown" onChange={(event) => update(conductor.id, { reidentification: event.target.value || null })} /></FormField>
            <FormField label="Gauge" description="Optional; can override cable gauge when observed."><input className={shared.input} value={conductor.gauge ?? ""} placeholder="Unknown / optional" onChange={(event) => update(conductor.id, { gauge: event.target.value || null })} /></FormField>
            <FormField label="Observed or assigned role"><input className={shared.input} value={conductor.role ?? ""} placeholder="Line, load, traveler, neutral… or unknown" onChange={(event) => update(conductor.id, { role: event.target.value || null })} /></FormField>
          </div>
          <div className={styles.endsGrid}>
            {conductor.ends.map((end) => (
              <fieldset className={styles.endCard} key={end.id}>
                <legend className={styles.endTitle}>End {end.designation.toUpperCase()}</legend>
                <div className={shared.formGrid}>
                  <FormField label={`End ${end.designation.toUpperCase()} termination`}><select className={shared.select} value={end.terminationType} onChange={(event) => updateEnd(conductor.id, end.id, { terminationType: event.target.value as CaptureConductorEnd["terminationType"] })}><option value="unknown">Unknown / unresolved</option><option value="terminal">Device terminal</option><option value="splice">Splice / connector</option><option value="cap-open">Capped or open end</option><option value="bond">Bond / ground point</option></select></FormField>
                  <FormField label={`End ${end.designation.toUpperCase()} terminal / splice label`}><input className={shared.input} value={end.terminationLabel ?? ""} placeholder="Unknown" onChange={(event) => updateEnd(conductor.id, end.id, { terminationLabel: event.target.value || null })} /></FormField>
                  <FormField label={`End ${end.designation.toUpperCase()} known destination`}><input className={shared.input} value={end.destinationLabel ?? ""} placeholder="Load, switch, fixture, box… or unknown" onChange={(event) => updateEnd(conductor.id, end.id, { destinationLabel: event.target.value || null })} /></FormField>
                  <FormField label={`End ${end.designation.toUpperCase()} certainty`}><select className={shared.select} value={end.certainty} onChange={(event) => updateEnd(conductor.id, end.id, { certainty: event.target.value as CaptureConductorEnd["certainty"] })}><option value="unknown">Unknown</option><option value="assumed">Assumed</option><option value="inferred">Inferred</option><option value="observed">Visually observed</option><option value="test-verified">Test verified</option></select></FormField>
                </div>
              </fieldset>
            ))}
          </div>
        </article>
      ))}</div>
      {!draft.conductors.length ? <EmptyState icon={<CircleHelp size={20} />} title="No conductors recorded" description="You can finish with this topology unknown, or add each visible cable core, ground, pigtail, jumper, and device lead." /> : null}
    </section>
  );
}

function ReviewStep({ draft, patch, issues, onGoToStep }: { draft: CaptureDraft; patch: (value: Partial<CaptureDraft>) => void; issues: CaptureReviewIssue[]; onGoToStep: (step: CaptureStep) => void }) {
  return (
    <section className={styles.step} aria-labelledby="capture-review">
      <div className={styles.stepHead}><div><h2 className={styles.stepTitle} id="capture-review">Review and save what is known</h2><p className={styles.stepCopy}>Incomplete work is valid. Finishing with open items marks this capture for review instead of discarding observations.</p></div><StatusBadge tone={issues.length ? "warning" : "positive"}>{issues.length ? `${issues.length} open items` : "Ready"}</StatusBadge></div>
      <div className={styles.summaryGrid}>
        <div className={styles.summaryStat}><strong>{draft.photos.length}</strong><span>Photos</span></div>
        <div className={styles.summaryStat}><strong>{draft.gangDevices.length}</strong><span>Devices</span></div>
        <div className={styles.summaryStat}><strong>{draft.cables.length}</strong><span>Cables</span></div>
        <div className={styles.summaryStat}><strong>{draft.conductors.length}</strong><span>Conductors</span></div>
      </div>
      {issues.length ? <ul className={styles.reviewList}>{issues.map((issue) => <li className={styles.reviewItem} key={issue.id}><AlertTriangle size={14} aria-hidden="true" /><button className={styles.reviewButton} type="button" onClick={() => onGoToStep(issue.step)}>{issue.label} <strong>Review {issue.step}</strong></button></li>)}</ul> : null}
      <FormField label="Capture notes" description="Record uncertainties, labels to revisit, or questions for an electrician."><textarea className={shared.textarea} value={draft.notes} placeholder="Optional notes" onChange={(event) => patch({ notes: event.target.value })} /></FormField>
      <label className={shared.checkRow}><input type="checkbox" checked={draft.needsReview} onChange={(event) => patch({ needsReview: event.target.checked })} /><span>Keep this capture marked as needing review, even after the listed facts are filled in.</span></label>
      <div className={shared.callout}><CircleHelp size={16} aria-hidden="true" /><span><strong>Unknown does not mean incorrect.</strong> It preserves the boundary between what was observed, inferred, assumed, and not yet established.</span></div>
    </section>
  );
}
