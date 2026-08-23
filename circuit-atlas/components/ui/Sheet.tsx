"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import {
  Button,
  Dialog as AriaDialog,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";

import { cx, focusRing } from "./styles";

export interface SheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  description?: ReactNode;
  footer?: ReactNode | ((close: () => void) => ReactNode);
  placement?: "left" | "right" | "bottom";
  className?: string;
  isDismissable?: boolean;
  closeLabel?: string;
}

const overlayPlacement = {
  left: "items-stretch justify-start",
  right: "items-stretch justify-end",
  bottom: "items-end justify-stretch",
};

const panelPlacement = {
  left: "h-dvh w-[min(92vw,28rem)] border-r",
  right: "h-dvh w-[min(92vw,28rem)] border-l",
  bottom: "max-h-[88dvh] w-full rounded-t-3xl border-t",
};

export function Sheet({
  isOpen,
  onOpenChange,
  title,
  children,
  description,
  footer,
  placement = "right",
  className,
  isDismissable = true,
  closeLabel = "Close panel",
}: SheetProps) {
  const close = () => onOpenChange(false);

  return (
    <ModalOverlay
      className={cx(
        "fixed inset-0 z-50 flex min-h-dvh bg-slate-950/45 backdrop-blur-[2px]",
        overlayPlacement[placement],
      )}
      isDismissable={isDismissable}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <Modal
        className={cx(
          "flex min-h-0 flex-col border-slate-200 bg-white text-slate-950 shadow-2xl outline-none",
          panelPlacement[placement],
          className,
        )}
      >
        <AriaDialog className="flex min-h-0 flex-1 flex-col outline-none">
          {placement === "bottom" ? (
            <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-slate-300" />
          ) : null}
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <Heading slot="title" className="text-lg font-semibold tracking-tight">
                {title}
              </Heading>
              {description ? (
                <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
              ) : null}
            </div>
            <Button
              aria-label={closeLabel}
              className={cx(
                "grid size-10 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                focusRing,
              )}
              onPress={close}
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {typeof children === "function" ? children(close) : children}
          </div>
          {footer ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              {typeof footer === "function" ? footer(close) : footer}
            </div>
          ) : null}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
