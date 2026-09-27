import type { ComponentPropsWithoutRef, ReactNode } from "react";

interface CardProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
}

/** Soft white surface with hairline border and a resting shadow. */
export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-card border border-stone-200/80 bg-white shadow-soft ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}