import { Link, type LinkProps } from "@tanstack/react-router";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700 " +
  "disabled:pointer-events-none disabled:opacity-50";

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent-700 text-white hover:bg-accent-800 active:bg-accent-900",
  secondary:
    "border border-stone-300 bg-white text-stone-800 hover:border-stone-400 hover:bg-stone-100",
  ghost: "text-stone-700 hover:bg-stone-200/60 hover:text-stone-900",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3.5 text-base",
};

interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: Variant;
  size?: Size;
  /** When set, renders an internal router <Link> instead of a <button>. */
  to?: string;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  to,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const classes = `${base} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim();
  if (to) {
    // `to` comes from store/UI data, not the typed route tree, so cast it.
    return (
      <Link to={to as LinkProps["to"]} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}