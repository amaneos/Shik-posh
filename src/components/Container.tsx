import type { ReactNode } from "react";

interface ContainerProps {
  className?: string;
  children: ReactNode;
}

/** Page-width wrapper — mobile-first padding, capped at a comfortable measure. */
export function Container({ className = "", children }: ContainerProps) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`.trim()}>
      {children}
    </div>
  );
}