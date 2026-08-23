"use client";

import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Download,
  FileImage,
  FileJson,
  FileUp,
  Home,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Map as MapIcon,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { AppLink } from "@/lib/client/runtime-path";
import {
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { EmptyState, Field, StatusBadge } from "@/components/ui";
import {
  apiMutation,
  apiRequest,
  navigateToAppPath,
  propertyApiPath,
  useApiResource,
} from "@/lib/client";

import {
  RouteError,
  RouteFrame,
  RouteHeading,
  RouteLoading,
  primaryButtonClass,
  secondaryButtonClass,
} from "../route-ui";

type StructureRecord = {
  id: string;
  code: string;
  name: string;
  kind: string;
  notes?: string | null;
  sortOrder: number;
  revision: number;
};

type LevelRecord = {
  id: string;
  structureId: string;
  code: string;
  name: string;
  elevationOrder: number;
  notes?: string | null;
  revision: number;
};

type SpaceRecord = {
  id: string;
  levelId: string;
  parentSpaceId?: string | null;
  code: string;
  name: string;
  kind: string;
  notes?: string | null;
  sortOrder: number;
  revision: number;
};

type WallZoneRecord = {
  id: string;
  spaceId: string;
  code: string;
  name: string;
  orientation?: string | null;
  sortOrder: number;
  revision: number;
};

type LocationsResponse = {
  structures: StructureRecord[];
  levels: LevelRecord[];
  spaces: SpaceRecord[];
  wallZones: WallZoneRecord[];
};

type PropertyRecord = {
  id: string;
  permanentCode: string;
  name: string;
  address?: string | null;
  revision: number;
};

type PropertyResponse = { property: PropertyRecord };

type FloorPlanAttachment = {
  id: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  widthPixels?: number | null;
  heightPixels?: number | null;
  pageCount?: number | null;
  altText?: string | null;
  revision: number;
  contentPath: string;
  downloadUrl: string;
};

type FloorPlanRecord = {
  id: string;
  propertyId: string;
  levelId: string;
  name: string;
  pageNumber?: number | null;
  unitsPerPlanUnit?: number | null;
  calibrationUnit?: string | null;
  orientationDegrees: number;
  revision: number;
  backgroundAttachment: FloorPlanAttachment | null;
};

type FloorPlansResponse = { items: FloorPlanRecord[] };

type ImportMode = "merge" | "add";

type ImportValidationIssue = {
  code: string;
  path?: Array<string | number>;
  message: string;
};

type ImportPreviewOutcome = {
  entityKind: string;
  entityType: string;
  id: string;
  action: "create" | "update" | "unchanged" | "conflict";
  reason: string;
};

type ImportPreview = {
  mode: ImportMode;
  canApply: boolean;
  incomingPropertyId: string | null;
  targetPropertyId: string | null;
  validationIssues: ImportValidationIssue[];
  outcomes: ImportPreviewOutcome[];
  summary: {
    create: number;
    update: number;
    unchanged: number;
    conflict: number;
    preservedExisting: number;
  };
  confirmationToken: string | null;
  constraints: Array<{
    code: string;
    message: string;
    entityId?: string;
  }>;
};

type ImportPreviewResponse = {
  preview: ImportPreview;
};

type ApplyImportResponse = {
  import: {
    mode: ImportMode;
    propertyId: string;
    summary: ImportPreview["summary"];
  };
};

type Notice = { tone: "success" | "warning" | "danger"; message: string };
type BusyAction =
  | "structure"
  | "level"
  | "space"
  | "floor-plan"
  | "import-preview"
  | "import-apply"
  | `background:${string}`
  | null;

type HierarchyNode = {
  structure: StructureRecord;
  levels: Array<{
    level: LevelRecord;
    spaces: SpaceRecord[];
    floorPlans: FloorPlanRecord[];
  }>;
};

const textInputClass =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 shadow-sm outline-none placeholder:text-slate-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";
const selectClass = `${textInputClass} pr-9`;
const cardClass = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";
const MAX_BACKGROUND_BYTES = 25 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 100 * 1024 * 1024;
const BACKGROUND_MIME_TYPES = new Set([
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const BACKGROUND_ACCEPT =
  "application/pdf,image/heic,image/heif,image/jpeg,image/png,image/webp,.heic,.heif,.jpg,.jpeg,.png,.webp,.pdf";

function requestId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function inferredMimeType(file: File): string | null {
  const declared = file.type.trim().toLocaleLowerCase();
  if (BACKGROUND_MIME_TYPES.has(declared)) {
    return declared === "image/jpg" ? "image/jpeg" : declared;
  }
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (["jpg", "jpeg", "jpe"].includes(extension ?? "")) return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  return null;
}

export function validateFloorPlanBackground(file: File): string | null {
  if (file.size <= 0) return "Choose a file that contains data.";
  if (file.size > MAX_BACKGROUND_BYTES) {
    return "Floor-plan backgrounds must be 25 MB or smaller.";
  }
  if (!inferredMimeType(file)) {
    return "Choose a PDF, PNG, JPEG, WebP, HEIC, or HEIF file.";
  }
  return null;
}

function uploadFile(file: File): File {
  const mimeType = inferredMimeType(file);
  if (!mimeType || file.type === mimeType) return file;
  return new File([file], file.name, {
    type: mimeType,
    lastModified: file.lastModified,
  });
}

export function buildLocationHierarchy(
  locations: LocationsResponse,
  floorPlans: FloorPlanRecord[],
): HierarchyNode[] {
  return [...locations.structures]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((structure) => ({
      structure,
      levels: locations.levels
        .filter((level) => level.structureId === structure.id)
        .sort(
          (a, b) =>
            a.elevationOrder - b.elevationOrder || a.name.localeCompare(b.name),
        )
        .map((level) => ({
          level,
          spaces: locations.spaces
            .filter((space) => space.levelId === level.id)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
          floorPlans: floorPlans
            .filter((plan) => plan.levelId === level.id)
            .sort((a, b) => a.name.localeCompare(b.name)),
        })),
    }));
}

function FormNotice({ notice }: { notice?: Notice }) {
  if (!notice) return null;
  const classes = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-300 bg-amber-50 text-amber-950",
    danger: "border-rose-300 bg-rose-50 text-rose-950",
  }[notice.tone];
  const Icon = notice.tone === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${classes}`} role={notice.tone === "danger" ? "alert" : "status"}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{notice.message}</span>
    </div>
  );
}

function PropertyDetailsCard({ property }: { property: PropertyRecord }) {
  const [name, setName] = useState(property.name);
  const [address, setAddress] = useState(property.address ?? "");
  const [revision, setRevision] = useState(property.revision);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await apiMutation<PropertyResponse>(
        `/api/properties/${encodeURIComponent(property.id)}`,
        "PATCH",
        { requestId: requestId("property-update"), revision, name: name.trim(), address: address.trim() || null },
      );
      setRevision(response.property.revision);
      setName(response.property.name);
      setAddress(response.property.address ?? "");
      setNotice({ tone: "success", message: "Property details saved." });
    } catch (error) {
      setNotice({ tone: "danger", message: messageOf(error, "The property details could not be saved.") });
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!window.confirm(`Archive ${name}? Its records and permanent identity will be preserved.`)) return;
    setBusy(true);
    setNotice(undefined);
    try {
      await apiMutation<PropertyResponse>(
        `/api/properties/${encodeURIComponent(property.id)}`,
        "PATCH",
        { requestId: requestId("property-archive"), revision, lifecycleState: "archived" },
      );
      navigateToAppPath("/properties");
    } catch (error) {
      setNotice({ tone: "danger", message: messageOf(error, "The property could not be archived.") });
      setBusy(false);
    }
  }

  return (
    <form className={`${cardClass} grid gap-4`} onSubmit={(event) => void save(event)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-700">Property identity</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Name and private address</h2>
        </div>
        <StatusBadge label={`${property.permanentCode} · permanent`} tone="neutral" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field isRequired label="Property name">
          {(props) => <input {...props} className={textInputClass} maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} />}
        </Field>
        <Field description="Optional; stored privately." label="Address">
          {(props) => <input {...props} autoComplete="street-address" className={textInputClass} maxLength={240} onChange={(event) => setAddress(event.target.value)} value={address} />}
        </Field>
      </div>
      <FormNotice notice={notice} />
      <div className="flex flex-wrap justify-between gap-3">
        <button className={secondaryButtonClass} disabled={busy} onClick={() => void archive()} type="button"><Trash2 aria-hidden="true" className="size-4" /> Archive property</button>
        <button className={primaryButtonClass} disabled={busy || !name.trim()} type="submit"><Save aria-hidden="true" className="size-4" /> {busy ? "Saving…" : "Save details"}</button>
      </div>
    </form>
  );
}

function SubmitButton({
  busy,
  children,
  disabled = false,
}: {
  busy: boolean;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-55`}
      disabled={disabled || busy}
      type="submit"
    >
      {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}
      {busy ? "Saving…" : children}
    </button>
  );
}

function StructureForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (input: {
    code: string;
    name: string;
    kind: string;
    notes: string | null;
  }) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("building");
  const [notes, setNotes] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onCreate({ code: code.trim(), name: name.trim(), kind, notes: notes.trim() || null })) {
      setCode("");
      setName("");
      setKind("building");
      setNotes("");
    }
  }

  return (
    <form className="grid content-start gap-4" onSubmit={(event) => void submit(event)}>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-700">Step 1</p>
        <h3 className="mt-1 text-base font-semibold text-slate-950">Add a structure</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">A house, detached building, addition, or other independently named structure.</p>
      </div>
      <Field isRequired label="Structure name">
        {(props) => <input {...props} autoComplete="off" className={textInputClass} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Name this structure" required value={name} />}
      </Field>
      <Field description="A stable shorthand unique within this property." isRequired label="Structure code">
        {(props) => <input {...props} autoCapitalize="characters" autoComplete="off" className={textInputClass} maxLength={40} onChange={(event) => setCode(event.target.value)} placeholder="Enter a code" required value={code} />}
      </Field>
      <Field label="Structure type">
        {(props) => (
          <select {...props} className={selectClass} onChange={(event) => setKind(event.target.value)} value={kind}>
            <option value="building">Building</option>
            <option value="addition">Addition</option>
            <option value="detached-building">Detached building</option>
            <option value="outdoor">Outdoor area</option>
            <option value="other">Other</option>
          </select>
        )}
      </Field>
      <Field label="Notes">
        {(props) => <textarea {...props} className={`${textInputClass} min-h-24 resize-y`} maxLength={4000} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" value={notes} />}
      </Field>
      <SubmitButton busy={busy}>Create structure</SubmitButton>
    </form>
  );
}

function LevelForm({
  structures,
  busy,
  onCreate,
}: {
  structures: StructureRecord[];
  busy: boolean;
  onCreate: (input: {
    structureId: string;
    code: string;
    name: string;
    elevationOrder: number;
    notes: string | null;
  }) => Promise<boolean>;
}) {
  const [structureId, setStructureId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [elevationOrder, setElevationOrder] = useState("0");
  const [notes, setNotes] = useState("");
  const selectedStructureId = structures.some((item) => item.id === structureId)
    ? structureId
    : structures[0]?.id ?? "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStructureId) return;
    if (
      await onCreate({
        structureId: selectedStructureId,
        code: code.trim(),
        name: name.trim(),
        elevationOrder: Number.parseInt(elevationOrder, 10) || 0,
        notes: notes.trim() || null,
      })
    ) {
      setCode("");
      setName("");
      setElevationOrder("0");
      setNotes("");
    }
  }

  return (
    <form className="grid content-start gap-4" onSubmit={(event) => void submit(event)}>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-700">Step 2</p>
        <h3 className="mt-1 text-base font-semibold text-slate-950">Add a level</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">Levels belong to one structure and provide the anchor for rooms and floor plans.</p>
      </div>
      {!structures.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-600">Create a structure before adding a level.</div>
      ) : (
        <>
          <Field isRequired label="Structure">
            {(props) => (
              <select {...props} className={selectClass} onChange={(event) => setStructureId(event.target.value)} value={selectedStructureId}>
                {structures.map((structure) => <option key={structure.id} value={structure.id}>{structure.name} · {structure.code}</option>)}
              </select>
            )}
          </Field>
          <Field isRequired label="Level name">
            {(props) => <input {...props} autoComplete="off" className={textInputClass} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Name this level" required value={name} />}
          </Field>
          <Field description="Unique within the selected structure." isRequired label="Level code">
            {(props) => <input {...props} autoCapitalize="characters" autoComplete="off" className={textInputClass} maxLength={40} onChange={(event) => setCode(event.target.value)} placeholder="Enter a code" required value={code} />}
          </Field>
          <Field description="Lower numbers sort below higher numbers." label="Elevation order">
            {(props) => <input {...props} className={textInputClass} inputMode="numeric" onChange={(event) => setElevationOrder(event.target.value)} step="1" type="number" value={elevationOrder} />}
          </Field>
          <Field label="Notes">
            {(props) => <textarea {...props} className={`${textInputClass} min-h-24 resize-y`} maxLength={4000} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" value={notes} />}
          </Field>
        </>
      )}
      <SubmitButton busy={busy} disabled={!structures.length}>Create level</SubmitButton>
    </form>
  );
}

function SpaceForm({
  levels,
  structures,
  spaces,
  busy,
  onCreate,
}: {
  levels: LevelRecord[];
  structures: StructureRecord[];
  spaces: SpaceRecord[];
  busy: boolean;
  onCreate: (input: {
    levelId: string;
    parentSpaceId: string | null;
    code: string;
    name: string;
    kind: string;
    notes: string | null;
  }) => Promise<boolean>;
}) {
  const [levelId, setLevelId] = useState("");
  const [parentSpaceId, setParentSpaceId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("room");
  const [notes, setNotes] = useState("");
  const selectedLevelId = levels.some((item) => item.id === levelId)
    ? levelId
    : levels[0]?.id ?? "";
  const structureById = new Map(structures.map((item) => [item.id, item]));
  const parentOptions = spaces.filter((space) => space.levelId === selectedLevelId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLevelId) return;
    const selectedParent = parentOptions.some((space) => space.id === parentSpaceId)
      ? parentSpaceId
      : null;
    if (
      await onCreate({
        levelId: selectedLevelId,
        parentSpaceId: selectedParent,
        code: code.trim(),
        name: name.trim(),
        kind,
        notes: notes.trim() || null,
      })
    ) {
      setCode("");
      setName("");
      setParentSpaceId("");
      setKind("room");
      setNotes("");
    }
  }

  return (
    <form className="grid content-start gap-4" onSubmit={(event) => void submit(event)}>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-700">Step 3</p>
        <h3 className="mt-1 text-base font-semibold text-slate-950">Add a room or space</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">Spaces can be rooms, halls, closets, outdoor areas, or nested areas.</p>
      </div>
      {!levels.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-600">Create a level before adding rooms or spaces.</div>
      ) : (
        <>
          <Field isRequired label="Level">
            {(props) => (
              <select {...props} className={selectClass} onChange={(event) => { setLevelId(event.target.value); setParentSpaceId(""); }} value={selectedLevelId}>
                {levels.map((level) => {
                  const structure = structureById.get(level.structureId);
                  return <option key={level.id} value={level.id}>{structure ? `${structure.name} · ` : ""}{level.name}</option>;
                })}
              </select>
            )}
          </Field>
          <Field isRequired label="Name">
            {(props) => <input {...props} autoComplete="off" className={textInputClass} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Name this room or area" required value={name} />}
          </Field>
          <Field description="Unique within the selected level." isRequired label="Space code">
            {(props) => <input {...props} autoCapitalize="characters" autoComplete="off" className={textInputClass} maxLength={40} onChange={(event) => setCode(event.target.value)} placeholder="Enter a code" required value={code} />}
          </Field>
          <Field label="Space type">
            {(props) => (
              <select {...props} className={selectClass} onChange={(event) => setKind(event.target.value)} value={kind}>
                <option value="room">Room</option>
                <option value="hall">Hall</option>
                <option value="closet">Closet</option>
                <option value="stair">Stair</option>
                <option value="utility">Utility area</option>
                <option value="outdoor">Outdoor area</option>
                <option value="other">Other</option>
              </select>
            )}
          </Field>
          <Field description="Optional; use this for a closet or other area inside a room." label="Parent space">
            {(props) => (
              <select {...props} className={selectClass} onChange={(event) => setParentSpaceId(event.target.value)} value={parentSpaceId}>
                <option value="">No parent space</option>
                {parentOptions.map((space) => <option key={space.id} value={space.id}>{space.name} · {space.code}</option>)}
              </select>
            )}
          </Field>
          <Field label="Notes">
            {(props) => <textarea {...props} className={`${textInputClass} min-h-24 resize-y`} maxLength={4000} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" value={notes} />}
          </Field>
        </>
      )}
      <SubmitButton busy={busy} disabled={!levels.length}>Create room or space</SubmitButton>
    </form>
  );
}

function FloorPlanForm({
  levels,
  structures,
  busy,
  onCreate,
}: {
  levels: LevelRecord[];
  structures: StructureRecord[];
  busy: boolean;
  onCreate: (input: {
    levelId: string;
    name: string;
    pageNumber: number | null;
    file: File | null;
    altText: string | null;
  }) => Promise<boolean>;
}) {
  const [levelId, setLevelId] = useState("");
  const [name, setName] = useState("");
  const [pageNumber, setPageNumber] = useState("1");
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [fileError, setFileError] = useState<string>();
  const selectedLevelId = levels.some((item) => item.id === levelId)
    ? levelId
    : levels[0]?.id ?? "";
  const structureById = new Map(structures.map((item) => [item.id, item]));

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    const error = selected ? validateFloorPlanBackground(selected) : undefined;
    setFile(error ? null : selected);
    setFileError(error ?? undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedLevelId || fileError) return;
    const saved = await onCreate({
      levelId: selectedLevelId,
      name: name.trim(),
      pageNumber: pageNumber ? Math.max(1, Number.parseInt(pageNumber, 10) || 1) : null,
      file,
      altText: altText.trim() || null,
    });
    if (saved) {
      setName("");
      setPageNumber("1");
      setFile(null);
      setAltText("");
      setFileError(undefined);
      form.reset();
    }
  }

  return (
    <form className={`${cardClass} grid gap-4`} onSubmit={(event) => void submit(event)}>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-700">New floor plan</p>
        <h3 className="mt-1 text-base font-semibold text-slate-950">Create a level view</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">The plan record can be saved before a background is available. Its private background can be added or replaced later.</p>
      </div>
      {!levels.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-600">Create a structure and level first.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field isRequired label="Level">
            {(props) => (
              <select {...props} className={selectClass} onChange={(event) => setLevelId(event.target.value)} value={selectedLevelId}>
                {levels.map((level) => {
                  const structure = structureById.get(level.structureId);
                  return <option key={level.id} value={level.id}>{structure ? `${structure.name} · ` : ""}{level.name}</option>;
                })}
              </select>
            )}
          </Field>
          <Field isRequired label="Plan name">
            {(props) => <input {...props} autoComplete="off" className={textInputClass} maxLength={160} onChange={(event) => setName(event.target.value)} placeholder="Name this floor-plan view" required value={name} />}
          </Field>
          <Field description="Used when the background is a multi-page PDF." label="PDF page">
            {(props) => <input {...props} className={textInputClass} inputMode="numeric" min="1" onChange={(event) => setPageNumber(event.target.value)} step="1" type="number" value={pageNumber} />}
          </Field>
          <Field description="Optional. PDF, PNG, JPEG, WebP, HEIC, or HEIF; maximum 25 MB." error={fileError} label="Private background">
            {(props) => <input {...props} accept={BACKGROUND_ACCEPT} className={`${textInputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-800`} onChange={chooseFile} type="file" />}
          </Field>
          <Field className="sm:col-span-2" description="Describe the drawing for someone who cannot see it." label="Background description">
            {(props) => <input {...props} className={textInputClass} maxLength={1000} onChange={(event) => setAltText(event.target.value)} placeholder="Optional accessible description" value={altText} />}
          </Field>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-slate-500">Background files remain behind the property’s private file route.</p>
        <SubmitButton busy={busy} disabled={!levels.length || Boolean(fileError)}>Create floor plan</SubmitButton>
      </div>
    </form>
  );
}

function HierarchyList({
  hierarchy,
  wallZones,
}: {
  hierarchy: HierarchyNode[];
  wallZones: WallZoneRecord[];
}) {
  const spaceById = new Map(
    hierarchy.flatMap((node) => node.levels.flatMap(({ spaces }) => spaces)).map((space) => [space.id, space]),
  );
  const zonesBySpace = new Map<string, WallZoneRecord[]>();
  wallZones.forEach((zone) => {
    const current = zonesBySpace.get(zone.spaceId) ?? [];
    current.push(zone);
    zonesBySpace.set(zone.spaceId, current);
  });

  if (!hierarchy.length) {
    return (
      <EmptyState
        className="bg-slate-50"
        description="Use the setup forms to create the first structure. No rooms or house-specific names are preloaded."
        icon={<Building2 className="size-5" />}
        title="No locations recorded"
      />
    );
  }

  return (
    <div className="grid gap-3">
      {hierarchy.map(({ structure, levels }) => (
        <article className="rounded-2xl border border-slate-200 bg-white shadow-sm" key={structure.id}>
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700"><Building2 aria-hidden="true" className="size-5" /></span>
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-950">{structure.name}</h3>
                <p className="mt-0.5 text-xs text-slate-500"><span className="font-mono">{structure.code}</span> · {structure.kind.replaceAll("-", " ")}</p>
              </div>
            </div>
            <StatusBadge label={`${levels.length} ${levels.length === 1 ? "level" : "levels"}`} tone="neutral" />
          </header>
          {levels.length ? (
            <div className="grid gap-0 divide-y divide-slate-200">
              {levels.map(({ level, spaces, floorPlans }) => (
                <section className="grid gap-3 px-4 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:px-5" key={level.id}>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><Layers3 aria-hidden="true" className="size-4 text-slate-500" /> {level.name}</div>
                    <p className="mt-1 text-xs text-slate-500"><span className="font-mono">{level.code}</span> · elevation {level.elevationOrder}</p>
                    {floorPlans.length ? <p className="mt-2 text-xs font-medium text-emerald-700">{floorPlans.length} floor-plan {floorPlans.length === 1 ? "view" : "views"}</p> : null}
                  </div>
                  {spaces.length ? (
                    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {spaces.map((space) => {
                        const parent = space.parentSpaceId ? spaceById.get(space.parentSpaceId) : undefined;
                        const zones = zonesBySpace.get(space.id) ?? [];
                        return (
                          <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" key={space.id}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{space.name}</p>
                                <p className="mt-0.5 text-[0.7rem] text-slate-500"><span className="font-mono">{space.code}</span> · {space.kind.replaceAll("-", " ")}</p>
                              </div>
                              <Home aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                            </div>
                            {parent ? <p className="mt-1 text-[0.7rem] text-slate-500">Inside {parent.name}</p> : null}
                            {zones.length ? <p className="mt-1 text-[0.7rem] text-slate-500">{zones.length} wall/zone {zones.length === 1 ? "label" : "labels"}</p> : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">No rooms or spaces on this level yet.</p>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <p className="px-5 py-5 text-sm text-slate-500">No levels recorded for this structure.</p>
          )}
        </article>
      ))}
    </div>
  );
}

function FloorPlanList({
  floorPlans,
  levels,
  structures,
  propertyId,
  busyAction,
  onUpload,
}: {
  floorPlans: FloorPlanRecord[];
  levels: LevelRecord[];
  structures: StructureRecord[];
  propertyId: string;
  busyAction: BusyAction;
  onUpload: (plan: FloorPlanRecord, file: File) => Promise<void>;
}) {
  const levelById = new Map(levels.map((level) => [level.id, level]));
  const structureById = new Map(structures.map((structure) => [structure.id, structure]));

  if (!floorPlans.length) {
    return (
      <EmptyState
        className="bg-slate-50"
        description="Choose a level in the form above. A background can be uploaded now or added later."
        icon={<MapIcon className="size-5" />}
        title="No floor plans recorded"
      />
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {floorPlans.map((plan) => {
        const level = levelById.get(plan.levelId);
        const structure = level ? structureById.get(level.structureId) : undefined;
        const attachment = plan.backgroundAttachment;
        const busy = busyAction === `background:${plan.id}`;
        return (
          <article className="grid content-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" key={plan.id}>
            <div>
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><FileImage aria-hidden="true" className="size-5" /></span>
                <StatusBadge label={attachment ? "Background ready" : "Background needed"} tone={attachment ? "success" : "warning"} />
              </div>
              <h3 className="mt-3 font-semibold text-slate-950">{plan.name}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">{[structure?.name, level?.name].filter(Boolean).join(" · ") || "Level unavailable"}{plan.pageNumber ? ` · PDF page ${plan.pageNumber}` : ""}</p>
              {attachment ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="truncate text-xs font-semibold text-slate-800">{attachment.originalFileName}</p>
                  <p className="mt-1 text-[0.7rem] text-slate-500">{attachment.mimeType} · {(attachment.byteSize / (1024 * 1024)).toFixed(1)} MB</p>
                  <AppLink className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900" href={attachment.downloadUrl} target="_blank" rel="noreferrer">Open private background <ChevronRight aria-hidden="true" className="size-3" /></AppLink>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
              <label className={`${secondaryButtonClass} cursor-pointer ${busy ? "pointer-events-none opacity-55" : ""}`}>
                {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <ImagePlus aria-hidden="true" className="size-4" />}
                {busy ? "Uploading…" : attachment ? "Replace background" : "Add background"}
                <input
                  accept={BACKGROUND_ACCEPT}
                  className="sr-only"
                  disabled={busy}
                  key={plan.revision}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void onUpload(plan, file);
                  }}
                  type="file"
                />
              </label>
              {attachment ? <AppLink className={secondaryButtonClass} href={`/p/${encodeURIComponent(propertyId)}/map`}><MapIcon aria-hidden="true" className="size-4" /> Open map</AppLink> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DataPortability({
  propertyId,
  busyAction,
  onBusyActionChange,
}: {
  propertyId: string;
  busyAction: BusyAction;
  onBusyActionChange: (action: BusyAction) => void;
}) {
  const [mode, setMode] = useState<ImportMode>("merge");
  const [manifest, setManifest] = useState<unknown>();
  const [fileName, setFileName] = useState<string>();
  const [previewResponse, setPreviewResponse] = useState<ImportPreviewResponse>();
  const [notice, setNotice] = useState<Notice>();
  const preview = previewResponse?.preview;

  async function readManifest(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setManifest(undefined);
    setFileName(undefined);
    setPreviewResponse(undefined);
    setNotice(undefined);
    if (!file) return;
    if (file.size > MAX_MANIFEST_BYTES) {
      setNotice({ tone: "danger", message: "Choose a manifest JSON file that is 100 MB or smaller." });
      event.target.value = "";
      return;
    }
    try {
      const value: unknown = JSON.parse(await file.text());
      setManifest(value);
      setFileName(file.name);
      setNotice({ tone: "success", message: `${file.name} is ready for a server-side preview.` });
    } catch {
      setNotice({ tone: "danger", message: "This file is not valid JSON." });
      event.target.value = "";
    }
  }

  async function previewImport() {
    if (manifest === undefined) return;
    onBusyActionChange("import-preview");
    setNotice(undefined);
    setPreviewResponse(undefined);
    try {
      const response = await apiMutation<ImportPreviewResponse, { mode: ImportMode; manifest: unknown }>(
        propertyApiPath(propertyId, "import"),
        "POST",
        { mode, manifest },
      );
      setPreviewResponse(response);
      setNotice({
        tone: response.preview.canApply ? "success" : "warning",
        message: response.preview.canApply
          ? "Preview complete. Review the counts before applying the import."
          : "Preview complete. Resolve the reported validation issues or conflicts before importing.",
      });
    } catch (error) {
      setNotice({ tone: "danger", message: messageOf(error, "The import preview could not be created.") });
    } finally {
      onBusyActionChange(null);
    }
  }

  async function applyImport() {
    if (manifest === undefined || !preview?.confirmationToken || !preview.canApply) return;
    onBusyActionChange("import-apply");
    setNotice(undefined);
    try {
      const response = await apiMutation<
        ApplyImportResponse,
        { mode: ImportMode; manifest: unknown; confirmationToken: string }
      >(propertyApiPath(propertyId, "import"), "POST", {
        mode,
        manifest,
        confirmationToken: preview.confirmationToken,
      });
      setNotice({ tone: "success", message: "The confirmed import was applied. Existing records not included in the file were preserved." });
      setPreviewResponse(undefined);
      setManifest(undefined);
      setFileName(undefined);
      if (response.import.mode === "add") {
        navigateToAppPath(
          `/p/${encodeURIComponent(response.import.propertyId)}/settings`,
        );
      } else {
        window.location.reload();
      }
    } catch (error) {
      setNotice({ tone: "danger", message: messageOf(error, "The confirmed import could not be applied.") });
    } finally {
      onBusyActionChange(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <article className={`${cardClass} grid content-between gap-5`}>
          <div>
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Download aria-hidden="true" className="size-5" /></span>
            <h3 className="mt-3 text-base font-semibold text-slate-950">Export this property</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">Download a versioned, self-contained JSON manifest. The backup preserves private files and smart-device commissioning details.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AppLink className={primaryButtonClass} download href={`${propertyApiPath(propertyId, "export")}?includeFiles=true`}><Download aria-hidden="true" className="size-4" /> Complete backup</AppLink>
            <AppLink className={secondaryButtonClass} download href={`${propertyApiPath(propertyId, "export")}?includeFiles=false`}><FileJson aria-hidden="true" className="size-4" /> Records only</AppLink>
          </div>
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950"><strong>Sensitive backup:</strong> Both exports can contain setup codes, pairing codes, and onboarding credentials. Store the downloaded file privately. A records-only export preserves file metadata but cannot restore missing private file contents.</p>
        </article>

        <article className={`${cardClass} grid gap-4`}>
          <div>
            <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><FileUp aria-hidden="true" className="size-5" /></span>
            <h3 className="mt-3 text-base font-semibold text-slate-950">Preview an import</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">Every manifest is validated and previewed before a supported change can be applied. Complete backups can restore their private files.</p>
          </div>
          <Field label="Import behavior">
            {(props) => (
              <select
                {...props}
                className={selectClass}
                onChange={(event) => {
                  setMode(event.target.value as ImportMode);
                  setPreviewResponse(undefined);
                }}
                value={mode}
              >
                <option value="merge">Merge matching property</option>
                <option value="add">Add as an independent property</option>
              </select>
            )}
          </Field>
          <Field description="Only a Circuit Atlas property manifest is accepted." label="Manifest JSON">
            {(props) => <input {...props} accept="application/json,.json" className={`${textInputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-800`} onChange={(event) => void readManifest(event)} type="file" />}
          </Field>
          {fileName ? <p className="flex items-center gap-2 text-xs font-medium text-slate-600"><FileJson aria-hidden="true" className="size-4" /> {fileName}</p> : null}
          <button className={`${secondaryButtonClass} disabled:cursor-not-allowed disabled:opacity-55`} disabled={manifest === undefined || busyAction === "import-preview" || busyAction === "import-apply"} onClick={() => void previewImport()} type="button">
            {busyAction === "import-preview" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <FileJson aria-hidden="true" className="size-4" />}
            {busyAction === "import-preview" ? "Validating…" : "Preview import"}
          </button>
          <FormNotice notice={notice} />
        </article>
      </div>

      {preview ? (
        <article className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-700">Server preview</p>
              <h3 className="mt-1 text-base font-semibold text-slate-950">Proposed import changes</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">The preview never mutates property data. Applying requires the short-lived confirmation returned for this exact manifest.</p>
            </div>
            <StatusBadge label={preview.canApply ? "Can apply" : "Preview only"} tone={preview.canApply ? "success" : "warning"} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {([
              ["Create", preview.summary.create],
              ["Update", preview.summary.update],
              ["Unchanged", preview.summary.unchanged],
              ["Conflicts", preview.summary.conflict],
              ["Preserved", preview.summary.preservedExisting],
            ] as const).map(([label, value]) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3" key={label}><strong className="block text-lg font-semibold text-slate-950">{value}</strong><span className="text-xs text-slate-500">{label}</span></div>
            ))}
          </div>
          {preview.validationIssues.length ? (
            <ul className="mt-4 grid gap-2" aria-label="Manifest validation issues">
              {preview.validationIssues.map((issue, index) => <li className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900" key={`${issue.code}:${index}`}><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{issue.message}{issue.path?.length ? <span className="mt-0.5 block font-mono text-[0.7rem] opacity-75">{issue.path.join(".")}</span> : null}</span></li>)}
            </ul>
          ) : null}
          {preview.constraints.length ? (
            <ul className="mt-4 grid gap-2" aria-label="Import limitations">
              {preview.constraints.map((constraint, index) => <li className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950" key={`${constraint.code}:${constraint.entityId ?? index}`}><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{constraint.message}{constraint.entityId ? <span className="mt-0.5 block font-mono text-[0.7rem] opacity-75">{constraint.entityId}</span> : null}</span></li>)}
            </ul>
          ) : null}
          {preview.summary.conflict ? (
            <details className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
              <summary className="cursor-pointer font-semibold">Review conflicting records</summary>
              <ul className="mt-2 grid gap-1.5">
                {preview.outcomes.filter((outcome) => outcome.action === "conflict").slice(0, 25).map((outcome) => <li className="font-mono text-xs" key={`${outcome.entityKind}:${outcome.id}`}>{outcome.entityType} · {outcome.id} · {outcome.reason.replaceAll("_", " ")}</li>)}
              </ul>
            </details>
          ) : null}
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <button className={secondaryButtonClass} onClick={() => setPreviewResponse(undefined)} type="button"><RotateCcw aria-hidden="true" className="size-4" /> Clear preview</button>
            <button className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-55`} disabled={!preview.canApply || !preview.confirmationToken || busyAction === "import-apply"} onClick={() => void applyImport()} type="button">
              {busyAction === "import-apply" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Upload aria-hidden="true" className="size-4" />}
              {busyAction === "import-apply" ? "Applying…" : "Apply confirmed import"}
            </button>
          </div>
        </article>
      ) : null}
    </div>
  );
}

export function SettingsClient({ propertyId }: { propertyId: string }) {
  const propertyResource = useApiResource<PropertyResponse>(
    `/api/properties/${encodeURIComponent(propertyId)}`,
  );
  const locationsResource = useApiResource<LocationsResponse>(
    propertyApiPath(propertyId, "locations"),
  );
  const floorPlansResource = useApiResource<FloorPlansResponse>(
    propertyApiPath(propertyId, "floor-plans"),
  );
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [locationNotice, setLocationNotice] = useState<Notice>();
  const [floorPlanNotice, setFloorPlanNotice] = useState<Notice>();
  const locations = locationsResource.data;
  const floorPlans = useMemo(
    () => floorPlansResource.data?.items ?? [],
    [floorPlansResource.data],
  );
  const hierarchy = useMemo(
    () => (locations ? buildLocationHierarchy(locations, floorPlans) : []),
    [floorPlans, locations],
  );

  function reloadAll() {
    propertyResource.reload();
    locationsResource.reload();
    floorPlansResource.reload();
  }

  async function createLocation(
    kind: "structures" | "levels" | "spaces",
    input: Record<string, unknown>,
    successMessage: string,
  ): Promise<boolean> {
    const action = kind === "structures" ? "structure" : kind === "levels" ? "level" : "space";
    setBusyAction(action);
    setLocationNotice(undefined);
    try {
      await apiMutation<{ item: unknown }, Record<string, unknown>>(
        propertyApiPath(propertyId, `locations/${kind}`),
        "POST",
        { requestId: requestId(`create-${kind}`), ...input },
      );
      setLocationNotice({ tone: "success", message: successMessage });
      locationsResource.reload();
      return true;
    } catch (error) {
      setLocationNotice({ tone: "danger", message: messageOf(error, "The location could not be created.") });
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function uploadBackground(
    plan: FloorPlanRecord,
    file: File,
    altText?: string | null,
  ): Promise<boolean> {
    const validationError = validateFloorPlanBackground(file);
    if (validationError) {
      setFloorPlanNotice({ tone: "danger", message: validationError });
      return false;
    }
    setBusyAction(`background:${plan.id}`);
    setFloorPlanNotice(undefined);
    try {
      const form = new FormData();
      form.set("file", uploadFile(file));
      form.set("revision", String(plan.revision));
      form.set("altText", altText?.trim() || `${plan.name} floor-plan background`);
      await apiRequest<{ floorPlan: FloorPlanRecord }>(
        propertyApiPath(propertyId, `floor-plans/${encodeURIComponent(plan.id)}/background`),
        {
          method: "POST",
          headers: { "x-request-id": requestId("floor-plan-background") },
          body: form,
        },
      );
      setFloorPlanNotice({ tone: "success", message: `${file.name} is now the private background for ${plan.name}.` });
      floorPlansResource.reload();
      return true;
    } catch (error) {
      setFloorPlanNotice({ tone: "danger", message: messageOf(error, "The floor-plan background could not be uploaded.") });
      floorPlansResource.reload();
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function createFloorPlan(input: {
    levelId: string;
    name: string;
    pageNumber: number | null;
    file: File | null;
    altText: string | null;
  }): Promise<boolean> {
    setBusyAction("floor-plan");
    setFloorPlanNotice(undefined);
    try {
      const response = await apiMutation<
        { floorPlan: FloorPlanRecord },
        { levelId: string; name: string; pageNumber: number | null }
      >(propertyApiPath(propertyId, "floor-plans"), "POST", {
        levelId: input.levelId,
        name: input.name,
        pageNumber: input.pageNumber,
      });
      floorPlansResource.reload();
      if (input.file) {
        setBusyAction(`background:${response.floorPlan.id}`);
        const uploaded = await uploadBackground(response.floorPlan, input.file, input.altText);
        if (!uploaded) {
          setFloorPlanNotice((current) => ({
            tone: "warning",
            message: `The ${input.name} plan record was created, but its background was not attached. ${current?.message ?? "Try the upload again from the plan card."}`,
          }));
          return true;
        }
      } else {
        setFloorPlanNotice({ tone: "success", message: `${input.name} was created. Add its private background whenever it is available.` });
      }
      return true;
    } catch (error) {
      setFloorPlanNotice({ tone: "danger", message: messageOf(error, "The floor-plan record could not be created.") });
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  if (
    (locationsResource.status === "loading" && !locations) ||
    (floorPlansResource.status === "loading" && !floorPlansResource.data) ||
    (propertyResource.status === "loading" && !propertyResource.data)
  ) {
    return <RouteFrame><RouteLoading label="Loading property setup…" /></RouteFrame>;
  }
  if (locationsResource.status === "error" && !locations) {
    return <RouteFrame><RouteError error={locationsResource.error} onRetry={locationsResource.reload} title="Locations could not be loaded" /></RouteFrame>;
  }
  if (floorPlansResource.status === "error" && !floorPlansResource.data) {
    return <RouteFrame><RouteError error={floorPlansResource.error} onRetry={floorPlansResource.reload} title="Floor plans could not be loaded" /></RouteFrame>;
  }
  if (propertyResource.status === "error" && !propertyResource.data) {
    return <RouteFrame><RouteError error={propertyResource.error} onRetry={propertyResource.reload} title="Property details could not be loaded" /></RouteFrame>;
  }
  if (!locations) return null;

  return (
    <RouteFrame className="grid gap-5 pb-16">
      <RouteHeading
        actions={
          <>
            <button className={secondaryButtonClass} onClick={reloadAll} type="button"><RefreshCw aria-hidden="true" className="size-4" /> Refresh</button>
            <AppLink className={primaryButtonClass} href={`/p/${encodeURIComponent(propertyId)}/map`}><MapIcon aria-hidden="true" className="size-4" /> Open map</AppLink>
          </>
        }
        description="Define this property’s reusable spatial hierarchy, then attach private floor-plan backgrounds. Every name and code below is stored as property data—not application code."
        eyebrow="Property setup"
        title="Locations, levels, and floor plans"
      />

      {(locationsResource.status === "error" || floorPlansResource.status === "error") ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">Showing the last loaded setup data. A refresh request failed.</div>
      ) : null}

      <nav aria-label="Settings sections" className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <a className={secondaryButtonClass} href="#property"><Home aria-hidden="true" className="size-4" /> Property</a>
        <a className={secondaryButtonClass} href="#locations"><Building2 aria-hidden="true" className="size-4" /> Locations</a>
        <a className={secondaryButtonClass} href="#floor-plans"><MapIcon aria-hidden="true" className="size-4" /> Floor plans</a>
        <a className={secondaryButtonClass} href="#data-portability"><FileJson aria-hidden="true" className="size-4" /> Export & import</a>
      </nav>

      {propertyResource.data?.property ? (
        <section aria-label="Property details" className="scroll-mt-24" id="property">
          <PropertyDetailsCard key={`${propertyResource.data.property.id}:${propertyResource.data.property.revision}`} property={propertyResource.data.property} />
        </section>
      ) : null}

      <section aria-labelledby="locations-title" className="scroll-mt-24 grid gap-4" id="locations">
        <div className={cardClass}>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-700">Spatial hierarchy</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950" id="locations-title">Set up locations</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Create records in order. Codes are user-controlled stable shorthands; display names can be changed later without changing internal identity.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {([
              ["Structures", locations.structures.length],
              ["Levels", locations.levels.length],
              ["Rooms & spaces", locations.spaces.length],
              ["Wall/zone labels", locations.wallZones.length],
            ] as const).map(([label, value]) => <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3" key={label}><strong className="block text-lg font-semibold text-slate-950">{value}</strong><span className="text-xs text-slate-500">{label}</span></div>)}
          </div>
        </div>

        <FormNotice notice={locationNotice} />
        <div className="grid gap-3 lg:grid-cols-3">
          <div className={cardClass}><StructureForm busy={busyAction === "structure"} onCreate={(input) => createLocation("structures", input, `${input.name} was created.`)} /></div>
          <div className={cardClass}><LevelForm busy={busyAction === "level"} onCreate={(input) => createLocation("levels", input, `${input.name} was created.`)} structures={locations.structures} /></div>
          <div className={cardClass}><SpaceForm busy={busyAction === "space"} levels={locations.levels} onCreate={(input) => createLocation("spaces", input, `${input.name} was created.`)} spaces={locations.spaces} structures={locations.structures} /></div>
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-lg font-semibold tracking-tight text-slate-950">Current hierarchy</h2><p className="mt-1 text-sm text-slate-600">Plans and wall/zone counts are shown with the level or room they belong to.</p></div>
            <StatusBadge label={`${locations.spaces.length} documented spaces`} tone="info" />
          </div>
          <HierarchyList hierarchy={hierarchy} wallZones={locations.wallZones} />
        </div>
      </section>

      <section aria-labelledby="floor-plans-title" className="scroll-mt-24 grid gap-4 border-t border-slate-200 pt-5" id="floor-plans">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-700">Private spatial backgrounds</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950" id="floor-plans-title">Floor plans</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Plans answer where a record is. They never claim to show the concealed physical route of a cable.</p>
        </div>
        <FormNotice notice={floorPlanNotice} />
        <FloorPlanForm busy={busyAction === "floor-plan" || Boolean(busyAction?.startsWith("background:"))} levels={locations.levels} onCreate={createFloorPlan} structures={locations.structures} />
        <FloorPlanList busyAction={busyAction} floorPlans={floorPlans} levels={locations.levels} onUpload={async (plan, file) => { await uploadBackground(plan, file); }} propertyId={propertyId} structures={locations.structures} />
      </section>

      <section aria-labelledby="portability-title" className="scroll-mt-24 grid gap-4 border-t border-slate-200 pt-5" id="data-portability">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-700">Data portability</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950" id="portability-title">Export and import</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Carry one property’s structured records between Circuit Atlas installations without putting house-specific information into the application.</p>
        </div>
        <DataPortability busyAction={busyAction} onBusyActionChange={setBusyAction} propertyId={propertyId} />
      </section>
    </RouteFrame>
  );
}
