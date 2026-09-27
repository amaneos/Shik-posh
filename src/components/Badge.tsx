import type { ComponentPropsWithoutRef } from "react";

type Variant = "neutral" | "accent" | "outline";

const variantClasses: Record<Variant, string> = {
  neutral: "bg-stone-200/70 text-stone-700",
  accent: "bg-accent-700/10 text-accent-800",
  outline: "border border-stone-300 bg-white text-stone-600",
};

interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  variant?: Variant;
}

export function Badge({ variant = "neutral", className = "", children, ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-medium ${variantClasses[variant]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </span>
  );
}