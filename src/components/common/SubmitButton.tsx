"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function SubmitButton({
  children,
  variant = "primary",
  disabledReason
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  disabledReason?: string;
}) {
  const { pending } = useFormStatus();
  const variants = {
    primary: "tool-button-primary",
    secondary: "",
    danger: "tool-button-danger"
  };
  return (
    <button
      type="submit"
      disabled={pending || Boolean(disabledReason)}
      title={disabledReason}
      className={cn(
        "focus-ring tool-button disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant]
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
