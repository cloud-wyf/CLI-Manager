import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  zIndex?: number;
  confirmAutoFocus?: boolean;
  contentClassName?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  zIndex,
  confirmAutoFocus = false,
  contentClassName,
  onConfirm,
  onClose,
}: Props) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className={cn("max-w-[360px]", contentClassName)}
        showCloseButton={false}
        style={zIndex !== undefined ? { zIndex } : undefined}
        overlayStyle={zIndex !== undefined ? { zIndex } : undefined}
        onOpenAutoFocus={
          confirmAutoFocus
            ? (event) => {
                event.preventDefault();
                confirmButtonRef.current?.focus();
              }
            : undefined
        }
      >
        <DialogTitle>{title}</DialogTitle>
        {message && (
          <DialogDescription className="mt-2 mb-2">{message}</DialogDescription>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {cancelText}
          </Button>
          <Button
            ref={confirmButtonRef}
            variant={danger ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
