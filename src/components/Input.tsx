import type { ComponentPropsWithoutRef, ReactNode } from "react";

interface InputProps extends ComponentPropsWithoutRef<"input"> {
  /** Optional leading icon (rendered on the inline-start side — right in RTL). */
  icon?: ReactNode;
}

export function Input({ className = "", icon, ...rest }: InputProps) {
  return (
    <div className="relative w-full">
      {icon ? (
        <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-stone-400">
          {icon}
        </span>
      ) : null}
      <input
        className={`h-11 w-full rounded-pill border border-stone-300 bg-white text-sm text-stone-900 outline-none transition-[border-color,box-shadow] placeholder:text-stone-400 focus:border-accent-600 focus:ring-2 focus:ring-accent-600/20 ${
          icon ? "ps-10" : "ps-4"
        } pe-4 ${className}`.trim()}
        {...rest}
      />
    </div>
  );
}