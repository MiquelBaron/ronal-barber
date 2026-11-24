import type { ReactNode } from "react";

export const fieldLabelClass = "text-[10px] uppercase tracking-[0.16em] text-black/45";
export const fieldInputClass =
  "mt-2 w-full border-b border-black/25 bg-transparent py-3 placeholder:text-black/40";

export function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block min-w-0 ${className ?? ""}`}>
      <span className={fieldLabelClass}>{label}</span>
      {children}
    </label>
  );
}
