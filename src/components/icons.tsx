/**
 * Minimal stroke icon set (inline SVG, currentColor) — no icon dependency.
 * All icons are decorative: aria-hidden, strokeWidth 1.8 for a premium feel.
 */

interface IconProps {
  className?: string;
}

function base(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

/** Success marker (order confirmation) — a check inside a circle. */
export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.6 2.6L16 9.7" />
    </svg>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.2-3.4 4-5 7.5-5s6.3 1.6 7.5 5" />
    </svg>
  );
}

export function BagIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function ArrowIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function TagIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 11V4a1 1 0 0 1 1-1h7l10 10-8 8Z" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Stepper +/− and row removal (cart page) — same stroke language as the rest. */
export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6.5 7l.9 12a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7" />
      <path d="M10.5 11v6M13.5 11v6" />
    </svg>
  );
}

export function TshirtIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9.2 4.5 4.8 7.2 2 12l3 2 .8-1.2V19h12.4v-6.2L19 14l3-2-2.8-4.8-4.4-2.7a2.6 2.6 0 0 1-5.6 0Z" />
      <path d="M9.2 4.5a2.6 2.6 0 0 0 5.6 0" />
    </svg>
  );
}