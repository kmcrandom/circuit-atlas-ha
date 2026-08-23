"use client";

import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  CaptureWizard,
  type CaptureDraft,
  type CaptureSaveState,
  type CaptureStep,
} from "@/features/capture";
import {
  apiMutation,
  navigateToAppPath,
  propertyApiPath,
  useApiResource,
  withRuntimeBasePath,
} from "@/lib/client";

import { RouteError, RouteFrame, RouteLoading } from "../../route-ui";

type CaptureRow = {
  id: string;
  propertyId: string;
  status: "in_progress" | "ready_for_review" | "completed" | "abandoned";
  currentStep: string | null;
  targetType: string | null;
  targetId: string | null;
  payloadJson: string;
  revision: number;
  updatedAt: string;
};

type CaptureResponse = { item: CaptureRow };
type FinishResponse = CaptureResponse & {
  materialization: { boxAssetId: string; status: "ready_for_review" | "completed" };
};
type FileResponse = { file: { id: string; downloadUrl: string; originalFileName: string } };
type RecoveryEnvelope = {
  version: 1;
  draft: CaptureDraft;
  step: CaptureStep;
  revision?: number;
  savedAt: string;
};

function emptyDraft(propertyId: string, targetId?: string | null): CaptureDraft {
  return {
    id: "new",
    propertyId,
    targetId: targetId ?? null,
    targetLabel: targetId ? "New box capture" : "New room-walk capture",
    box: {
      displayName: "",
      type: null,
      material: "unknown",
      gangCount: null,
      orientation: "unknown",
      depth: null,
    },
    photos: [],
    gangDevices: [],
    cables: [],
    conductors: [],
    notes: "",
    needsReview: true,
  };
}

function parseDraft(row: CaptureRow): CaptureDraft {
  let payload: Partial<CaptureDraft> = {};
  try {
    const parsed = JSON.parse(row.payloadJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Partial<CaptureDraft>;
    }
  } catch {
    // The authoritative row remains recoverable even if its payload is invalid.
  }
  const fallback = emptyDraft(row.propertyId, row.targetId);
  return {
    ...fallback,
    ...payload,
    id: row.id,
    propertyId: row.propertyId,
    targetId: row.targetId ?? payload.targetId ?? null,
    updatedAt: row.updatedAt,
    box: { ...fallback.box, ...payload.box },
    photos: Array.isArray(payload.photos) ? payload.photos : [],
    gangDevices: Array.isArray(payload.gangDevices) ? payload.gangDevices : [],
    cables: Array.isArray(payload.cables) ? payload.cables : [],
    conductors: Array.isArray(payload.conductors) ? payload.conductors : [],
  };
}

function captureStep(value: string | null | undefined): CaptureStep {
  return value === "gangs" || value === "cables" || value === "conductors" || value === "review"
    ? value
    : "photos";
}

function nextRequestId(label: string) {
  return `${label}:${crypto.randomUUID()}`;
}

function recoveryKey(propertyId: string, id: string) {
  return `circuit-atlas:capture:v1:${propertyId}:${id}`;
}

function readRecovery(propertyId: string, ids: string[]): RecoveryEnvelope | null {
  for (const id of ids) {
    try {
      const value = window.localStorage.getItem(recoveryKey(propertyId, id));
      if (!value) continue;
      const parsed = JSON.parse(value) as Partial<RecoveryEnvelope>;
      if (parsed.version === 1 && parsed.draft?.propertyId === propertyId && parsed.step) {
        return parsed as RecoveryEnvelope;
      }
    } catch {
      // A corrupt local recovery entry is ignored; the server remains canonical.
    }
  }
  return null;
}

function rowFromCreate(row: CaptureRow): { draft: CaptureDraft; revision: number } {
  return { draft: parseDraft(row), revision: row.revision };
}

export function CaptureClient({ propertyId, draftId }: { propertyId: string; draftId: string }) {
  const query = useSearchParams();
  const isNew = draftId === "new";
  const resource = useApiResource<CaptureResponse>(
    isNew ? null : propertyApiPath(propertyId, `capture-drafts/${encodeURIComponent(draftId)}`),
  );
  const [draft, setDraft] = useState<CaptureDraft>(() => emptyDraft(propertyId, query.get("targetId")));
  const [revision, setRevision] = useState<number>();
  const [step, setStep] = useState<CaptureStep>("photos");
  const [saveState, setSaveState] = useState<CaptureSaveState>("idle");
  const [loadError, setLoadError] = useState<Error>();
  const [completedMessage, setCompletedMessage] = useState<string>();
  const hydrated = useRef(false);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const latestDraft = useRef(draft);
  const latestRevision = useRef(revision);
  const latestStep = useRef(step);
  const authoritativeDraftId = useRef<string | undefined>(isNew ? undefined : draftId);
  const latestRecoveryKey = useRef(recoveryKey(propertyId, draftId));
  const targetType = useMemo(() => query.get("targetKind") ?? "box", [query]);

  useEffect(() => { latestDraft.current = draft; }, [draft]);
  useEffect(() => { latestRevision.current = revision; }, [revision]);
  useEffect(() => { latestStep.current = step; }, [step]);

  useEffect(() => {
    if (!resource.data?.item || hydrated.current) return;
    const serverDraft = parseDraft(resource.data.item);
    const local = readRecovery(propertyId, [resource.data.item.id, draftId]);
    const useLocal = local && Date.parse(local.savedAt) > Date.parse(resource.data.item.updatedAt);
    setDraft(useLocal ? { ...local.draft, id: resource.data.item.id } : serverDraft);
    setRevision(resource.data.item.revision);
    setStep(useLocal ? local.step : captureStep(resource.data.item.currentStep));
    hydrated.current = true;
  }, [draftId, propertyId, resource.data]);

  useEffect(() => {
    if (!isNew || hydrated.current) return;
    const local = readRecovery(propertyId, [draftId]);
    if (local) {
      setDraft(local.draft);
      setRevision(local.revision);
      setStep(local.step);
    }
    hydrated.current = true;
  }, [draftId, isNew, propertyId]);

  useEffect(() => {
    if (!hydrated.current || completedMessage) return;
    const timer = window.setTimeout(() => {
      const envelope: RecoveryEnvelope = {
        version: 1,
        draft,
        step,
        revision,
        savedAt: new Date().toISOString(),
      };
      try {
        window.localStorage.setItem(recoveryKey(propertyId, draft.id === "new" ? draftId : draft.id), JSON.stringify(envelope));
      } catch {
        // Server autosave still protects the capture when local storage is full.
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [completedMessage, draft, draftId, propertyId, revision, step]);

  const authoritativeSave = useCallback(async (
    nextDraft: CaptureDraft,
    options: { step: CaptureStep; requestId: string },
  ): Promise<{ draft: CaptureDraft; revision: number }> => {
    const currentRevision = latestRevision.current;
    if (!currentRevision || !authoritativeDraftId.current) {
      const response = await apiMutation<CaptureResponse>(
        propertyApiPath(propertyId, "capture-drafts"),
        "POST",
        {
          requestId: options.requestId,
          status: "in_progress",
          currentStep: options.step,
          targetType,
          targetId: nextDraft.targetId || null,
          payload: nextDraft,
        },
      );
      const saved = rowFromCreate(response.item);
      authoritativeDraftId.current = response.item.id;
      const oldKey = recoveryKey(propertyId, draftId);
      const newKey = recoveryKey(propertyId, response.item.id);
      latestRecoveryKey.current = newKey;
      try {
        const recovery = window.localStorage.getItem(oldKey);
        if (recovery && oldKey !== newKey) {
          window.localStorage.setItem(newKey, recovery);
          window.localStorage.removeItem(oldKey);
        }
      } catch {
        // A failed local key move does not affect the authoritative draft.
      }
      window.history.replaceState(null, "", `/p/${encodeURIComponent(propertyId)}/capture/${encodeURIComponent(response.item.id)}`);
      return saved;
    }
    const savedDraftId = authoritativeDraftId.current;
    const response = await apiMutation<CaptureResponse>(
      propertyApiPath(propertyId, `capture-drafts/${encodeURIComponent(savedDraftId)}`),
      "PATCH",
      {
        requestId: options.requestId,
        revision: currentRevision,
        status: "in_progress",
        currentStep: options.step,
        targetType,
        targetId: nextDraft.targetId || null,
        payload: { ...nextDraft, id: savedDraftId },
      },
    );
    return rowFromCreate(response.item);
  }, [draftId, propertyId, targetType]);

  const queueSave = useCallback((nextDraft: CaptureDraft, explicit = false): Promise<void> => {
    const idempotencyKey = nextRequestId(explicit ? "save-capture" : "autosave-capture");
    setSaveState("saving");
    setLoadError(undefined);
    const operation = async () => {
      try {
        const saved = await authoritativeSave(nextDraft, { step: latestStep.current, requestId: idempotencyKey });
        latestRevision.current = saved.revision;
        setRevision(saved.revision);
        if (latestDraft.current === nextDraft) {
          latestDraft.current = saved.draft;
          setDraft(saved.draft);
          setSaveState("saved");
        } else {
          if (latestDraft.current.id === "new") {
            const rebased = { ...latestDraft.current, id: saved.draft.id };
            latestDraft.current = rebased;
            setDraft(rebased);
          }
          setSaveState("idle");
        }
      } catch (caught) {
        const error = caught instanceof Error ? caught : new Error("The capture draft could not be saved.");
        setLoadError(error);
        setSaveState(error.message.toLowerCase().includes("changed") ? "conflict" : "retryable-error");
        throw error;
      }
    };
    const queued = saveChain.current.then(operation, operation);
    saveChain.current = queued.catch(() => undefined);
    return queued;
  }, [authoritativeSave]);

  useEffect(() => {
    if (!hydrated.current || completedMessage || saveState !== "idle") return;
    const timer = window.setTimeout(() => {
      if (latestDraft.current === draft) void queueSave(draft);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [completedMessage, draft, queueSave, saveState]);

  async function addPhotos(files: File[], category: "overview" | "close-up") {
    setSaveState("saving");
    setLoadError(undefined);
    try {
      await queueSave(latestDraft.current, true);
      const captureId = latestDraft.current.id;
      const uploaded: CaptureDraft["photos"] = [];
      for (const file of files) {
        const form = new FormData();
        form.set("file", file);
        form.set("ownerType", "capture_draft");
        form.set("ownerId", captureId);
        form.set("category", "evidence");
        form.set("altText", `${category === "overview" ? "Overview" : "Close-up"} capture: ${file.name}`);
        const response = await fetch(withRuntimeBasePath(propertyApiPath(propertyId, "files")), {
          method: "POST",
          headers: { accept: "application/json", "x-request-id": nextRequestId("capture-photo") },
          body: form,
        });
        const body = (await response.json()) as FileResponse | { error?: { message?: string } };
        if (!response.ok || !("file" in body)) {
          throw new Error("error" in body ? body.error?.message ?? "A photo could not be uploaded." : "A photo could not be uploaded.");
        }
        uploaded.push({
          id: body.file.id,
          url: body.file.downloadUrl,
          category,
          caption: null,
          uploadState: "ready",
        });
      }
      const nextDraft = { ...latestDraft.current, photos: [...latestDraft.current.photos, ...uploaded] };
      setDraft(nextDraft);
      latestDraft.current = nextDraft;
      await queueSave(nextDraft, true);
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error("The photos could not be added.");
      setLoadError(error);
      setSaveState("retryable-error");
    }
  }

  async function finish(nextDraft: CaptureDraft) {
    setSaveState("saving");
    setLoadError(undefined);
    try {
      await queueSave(nextDraft, true);
      const captureId = latestDraft.current.id;
      const currentRevision = latestRevision.current;
      if (!currentRevision || captureId === "new") throw new Error("The draft must be saved before it can be finished.");
      const response = await apiMutation<FinishResponse>(
        propertyApiPath(propertyId, `capture-drafts/${encodeURIComponent(captureId)}/finish`),
        "POST",
        { requestId: nextRequestId("finish-capture"), revision: currentRevision },
      );
      setRevision(response.item.revision);
      setDraft(parseDraft(response.item));
      setSaveState("saved");
      try {
        window.localStorage.removeItem(latestRecoveryKey.current);
        window.localStorage.removeItem(recoveryKey(propertyId, draftId));
      } catch {
        // A stale local recovery copy is ignored once the server draft is final.
      }
      setCompletedMessage(
        response.materialization.status === "ready_for_review"
          ? "Capture saved to the electrical inventory with review flags."
          : "Capture saved to the electrical inventory.",
      );
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error("The capture could not be finished.");
      setLoadError(error);
      setSaveState(error.message.toLowerCase().includes("changed") ? "conflict" : "retryable-error");
    }
  }

  if (!isNew && resource.status === "loading" && !resource.data) {
    return <RouteFrame><RouteLoading label="Resuming room-walk capture…" /></RouteFrame>;
  }
  if (!isNew && resource.status === "error" && !resource.data) {
    return <RouteFrame><RouteError error={resource.error} onRetry={resource.reload} title="The capture draft could not be opened" /></RouteFrame>;
  }

  if (completedMessage) {
    return (
      <RouteFrame>
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6" aria-live="polite">
          <h1 className="text-xl font-semibold text-emerald-950">Capture complete</h1>
          <p className="mt-2 text-sm text-emerald-900">{completedMessage}</p>
          <button className="mt-4 rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white" type="button" onClick={() => navigateToAppPath(`/p/${encodeURIComponent(propertyId)}/inventory`)}>
            View inventory
          </button>
        </section>
      </RouteFrame>
    );
  }

  return (
    <RouteFrame>
      {loadError ? <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" role="alert">{loadError.message}</div> : null}
      <CaptureWizard
        draft={draft}
        onAddPhotos={(files, category) => void addPhotos(files, category)}
        onCancel={() => navigateToAppPath(`/p/${encodeURIComponent(propertyId)}/inventory`)}
        onComplete={(next) => void finish(next)}
        onDraftChange={(next) => {
          latestDraft.current = next;
          setDraft(next);
          setSaveState("idle");
        }}
        onSaveDraft={(next) => void queueSave(next, true)}
        onStepChange={(next) => {
          latestStep.current = next;
          setStep(next);
          setSaveState("idle");
        }}
        saveState={saveState}
        step={step}
      />
    </RouteFrame>
  );
}
