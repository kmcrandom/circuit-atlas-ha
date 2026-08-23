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

export interface DialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  description?: ReactNode;
  footer?: ReactNode | ((close: () => void) => ReactNode);
  className?: string;
  size?: "small" | "medium" | "large";
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
  closeLabel?: string;
  role?: "dialog" | "alertdialog";
}

const sizeClasses = {
  small: "max-w-md",
  medium: "max-w-2xl",
  large: "max-w-4xl",
};

export function Dialog({
  isOpen,
  onOpenChange,
  title,
  children,
  description,
  footer,
  className,
  size = "medium",
  isDismissable = true,
  isKeyboardDismissDisabled = false,
  closeLabel = "Close dialog",
  role = "dialog",
}: DialogProps) {
  const close = () => onOpenChange(false);

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 grid min-h-dvh place-items-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-[2px]"
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={isKeyboardDismissDisabled}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <Modal
        className={cx(
          "w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-2xl",
          sizeClasses[size],
          className,
        )}
      >
        <AriaDialog className="outline-none" role={role}>
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <Heading slot="title" className="text-lg font-semibold tracking-tight text-slate-950">
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
          <div className="max-h-[min(70dvh,48rem)] overflow-y-auto px-5 py-5 sm:px-6">
            {typeof children === "function" ? children(close) : children}
          </div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
              {typeof footer === "function" ? footer(close) : footer}
            </div>
          ) : null}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
