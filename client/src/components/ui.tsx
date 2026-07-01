import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
  interactive,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-slate-100 bg-white/80 backdrop-blur-sm p-6",
        "shadow-[var(--shadow-float)] transition-all duration-300 ease-out",
        interactive && "hover:shadow-[var(--shadow-lift)] hover:-translate-y-0.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "ghost" | "subtle" | "danger";

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold " +
    "transition-all duration-200 ease-out active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300";
  const variants: Record<ButtonVariant, string> = {
    primary:
      "text-white bg-violet-700 shadow-[0_6px_20px_-6px_rgba(109,40,217,0.6)] hover:bg-violet-600 hover:shadow-[0_10px_28px_-8px_rgba(109,40,217,0.7)] hover:-translate-y-0.5",
    ghost: "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
    subtle:
      "text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-100 hover:-translate-y-0.5",
    danger: "text-red-600 bg-red-50 hover:bg-red-100 border border-red-100",
  };
  return (
    <button className={cx(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900",
        "placeholder:text-slate-400 shadow-sm transition-all duration-200",
        "focus:outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100",
        className,
      )}
      {...props}
    />
  );
}

const toneStyles: Record<string, string> = {
  neutral: "bg-slate-100 text-slate-600",
  accent: "bg-violet-50 text-violet-700",
  warn: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-600",
  success: "bg-emerald-50 text-emerald-700",
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
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium tracking-tight",
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
          checked ? "bg-violet-600" : "bg-slate-200 group-hover:bg-slate-300",
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

export { cx };
