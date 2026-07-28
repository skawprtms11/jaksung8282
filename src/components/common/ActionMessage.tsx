"use client";

import type { ActionResult } from "@/lib/utils/form";
import { cn } from "@/lib/utils/cn";

export function ActionMessage({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) {
    return null;
  }
  const fieldErrors = !state.ok && state.fieldErrors ? Object.values(state.fieldErrors).flat() : [];
  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm font-semibold",
        state.ok
          ? "border-emerald-200 bg-emerald-50/86 text-emerald-700"
          : "border-rose-200 bg-rose-50/86 text-rose-700"
      )}
    >
      <p>{state.message}</p>
      {fieldErrors.length > 0 ? (
        <ul className="mt-1 list-disc pl-4">
          {fieldErrors.map((error, index) => (
            <li key={`${error}-${index}`}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
