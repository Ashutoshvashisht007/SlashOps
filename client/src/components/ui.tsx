import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
  interactive,
  emphasis,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  /** Stronger dark-teal border for section-header cards. */
  emphasis?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-lg bg-white p-6 shadow-[var(--shadow-card)] transition-all duration-200 ease-out",
        emphasis ? "border-2 border-brand" : "border border-slate-300/80",
        interactive && "hover:border-slate-400 hover:shadow-[var(--shadow-raised)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "outline" | "ghost" | "danger";

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold " +
    "transition-all duration-150 ease-out active:translate-y-px disabled:opacity-50 disabled:pointer-events-none " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1";
  const variants: Record<ButtonVariant, string> = {
    // Solid dark teal — the single strongest action on a screen (e.g. sign in).
    primary: "text-white bg-brand hover:bg-brand-deep shadow-sm",
    // Outlined teal on white — the mock's standard action style.
    outline:
      "text-accent bg-white border-2 border-accent hover:bg-accent-soft",
    ghost: "text-slate-600 hover:text-ink hover:bg-slate-200/60",
    danger: "text-red-700 bg-white border-2 border-red-300 hover:bg-red-50",
  };
  return (
    <button className={cx(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-ink",
        "placeholder:text-slate-400 transition-all duration-150",
        "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25",
        className,
      )}
      {...props}
    />
  );
}

const toneStyles: Record<string, string> = {
  neutral: "bg-slate-200/70 text-slate-600 border border-slate-300/60",
  accent: "bg-accent-soft text-accent border border-accent/25",
  warn: "bg-amber-50 text-amber-800 border border-amber-200",
  danger: "bg-red-50 text-red-700 border border-red-200",
  success: "bg-emerald-50 text-emerald-800 border border-emerald-200",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof toneStyles;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneStyles[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2.5"
    >
      <span
        className={cx(
          "relative h-6 w-11 rounded-full transition-colors duration-200",
          checked ? "bg-accent" : "bg-slate-300 group-hover:bg-slate-400",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked && "translate-x-5",
          )}
        />
      </span>
      {label && <span className="text-sm font-medium text-slate-600">{label}</span>}
    </button>
  );
}

/** Caps-title empty state with an icon medallion, like the reference design. */
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="relative mb-5 grid h-20 w-20 place-items-center rounded-full bg-slate-200/70 text-4xl">
        {icon}
        <span className="absolute -top-1 -right-1 grid h-7 w-7 place-items-center rounded-lg bg-brand text-xs font-bold text-white">
          0
        </span>
      </div>
      <h3 className="text-lg font-extrabold uppercase tracking-wide text-ink">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

/** Decorative dashed skeleton row used under empty states (non-interactive). */
export function SkeletonTile({ label }: { label: string }) {
  return (
    <div
      aria-hidden
      className="flex items-center gap-3 rounded-lg border-2 border-dashed border-slate-300/80 bg-slate-50/50 px-4 py-3.5"
    >
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-200/80 text-slate-400">
        ⌗
      </div>
      <span className="flex-1 truncate text-sm font-medium text-slate-400">{label}</span>
      <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-medium text-slate-400">
        Inactive
      </span>
    </div>
  );
}

export { cx };
