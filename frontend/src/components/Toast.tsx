import { useEffect } from "react";
import { X } from "lucide-react";

export type ToastTone = "ok" | "error" | "info";

export type ToastMessage = {
  id: number;
  title: string;
  detail?: string;
  tone: ToastTone;
};

const TONE_STYLES: Record<ToastTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-950",
  error: "border-red-200 bg-red-50 text-red-950",
  info: "border-black/10 bg-white text-ink",
};

type Props = {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
  durationMs?: number;
};

export function ToastStack({ toasts, onDismiss, durationMs = 6000 }: Props) {
  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(100%-2rem,22rem)] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} durationMs={durationMs} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
  durationMs,
}: {
  toast: ToastMessage;
  onDismiss: (id: number) => void;
  durationMs: number;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), durationMs);
    return () => window.clearTimeout(timer);
  }, [toast.id, durationMs, onDismiss]);

  return (
    <div
      className={`pointer-events-auto border px-4 py-3 shadow-lg ${TONE_STYLES[toast.tone]}`}
      role="status"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.12em]">{toast.title}</p>
          {toast.detail && <p className="mt-1 text-sm leading-snug opacity-90">{toast.detail}</p>}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 opacity-50 transition-opacity hover:opacity-100"
          aria-label="Cerrar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
