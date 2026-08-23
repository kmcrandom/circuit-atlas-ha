import {
  AlertTriangle,
  Check,
  CircleHelp,
  Eye,
  FileCheck2,
  GitCompareArrows,
  Lightbulb,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "./styles";

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "smart"
  | "dumb";

export type VerificationStatus =
  | "unknown"
  | "assumed"
  | "inferred"
  | "visually_observed"
  | "test_verified"
  | "documentation_verified"
  | "conflicting";

const toneClasses: Record<StatusTone, string> = {
  neutral: "border-slate-300 bg-slate-100 text-slate-700",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  danger: "border-rose-300 bg-rose-50 text-rose-800",
  smart: "border-violet-300 bg-violet-50 text-violet-800",
  dumb: "border-slate-300 bg-white text-slate-700",
};

const verificationPresentation: Record<
  VerificationStatus,
  { label: string; tone: StatusTone; icon: LucideIcon }
> = {
  unknown: { label: "Unknown", tone: "neutral", icon: CircleHelp },
  assumed: { label: "Assumed", tone: "warning", icon: CircleHelp },
  inferred: { label: "Inferred", tone: "info", icon: Lightbulb },
  visually_observed: { label: "Visually observed", tone: "info", icon: Eye },
  test_verified: { label: "Test verified", tone: "success", icon: Check },
  documentation_verified: {
    label: "Documentation verified",
    tone: "success",
    icon: FileCheck2,
  },
  conflicting: { label: "Conflicting", tone: "danger", icon: GitCompareArrows },
};

export interface StatusBadgeProps {
  label: ReactNode;
  tone?: StatusTone;
  icon?: ReactNode;
  className?: string;
}

/** Status is always communicated with text and, by default, an icon—not color alone. */
export function StatusBadge({
  label,
  tone = "neutral",
  icon,
  className,
}: StatusBadgeProps) {
  const fallbackIcon =
    tone === "danger" || tone === "warning" ? (
      <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
    ) : tone === "success" ? (
      <Check aria-hidden="true" className="size-3.5 shrink-0" />
    ) : tone === "smart" ? (
      <Sparkles aria-hidden="true" className="size-3.5 shrink-0" />
    ) : (
      <span aria-hidden="true" className="text-[0.7rem] leading-none">
        ●
      </span>
    );

  return (
    <span
      className={cx(
        "inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold leading-4",
        toneClasses[tone],
        className,
      )}
    >
      {icon ?? fallbackIcon}
      <span className="truncate">{label}</span>
    </span>
  );
}

export function VerificationBadge({
  status,
  className,
}: {
  status: VerificationStatus;
  className?: string;
}) {
  const presentation = verificationPresentation[status];
  const Icon = presentation.icon;
  return (
    <StatusBadge
      className={className}
      icon={<Icon aria-hidden="true" className="size-3.5 shrink-0" />}
      label={presentation.label}
      tone={presentation.tone}
    />
  );
}
