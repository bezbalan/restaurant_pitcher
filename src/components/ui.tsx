"use client";
import { AnimatePresence, motion } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { COUNTDOWN_VISIBLE_S } from "@/lib/logic";
import { distanceLabel, priceLabel, reviewsLabel, tintFor } from "@/lib/client";
import type { PublicParticipant, Restaurant } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("font-display text-[19px] tracking-tight text-ink", className)}>
      Bite <em className="text-tomato">Club</em>
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "dark" | "ghost" | "outline";
  size?: "lg" | "md" | "sm";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "lg", loading, className, children, disabled, ...rest }: BtnProps) {
  const base =
    "relative inline-flex select-none items-center justify-center gap-2 rounded-full font-medium transition-[transform,background-color,box-shadow,opacity] duration-150 active:scale-[0.97] disabled:opacity-45 disabled:active:scale-100";
  const sizes = { lg: "h-14 px-7 text-[17px]", md: "h-12 px-5 text-[15px]", sm: "h-9 px-4 text-[13px]" };
  const variants = {
    primary: "bg-tomato text-white shadow-[var(--shadow-button)] hover:bg-tomato-deep",
    dark: "bg-ink text-ivory hover:bg-ink-2",
    ghost: "text-ink-2 hover:bg-sand/60",
    outline: "border border-line bg-paper text-ink hover:border-ink-2/30",
  };
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...rest}>
      <span className={cx("inline-flex items-center gap-2", loading && "opacity-0")}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner light={variant === "primary" || variant === "dark"} />
        </span>
      )}
    </button>
  );
}

export function Spinner({ light, className }: { light?: boolean; className?: string }) {
  return (
    <span
      className={cx(
        "inline-block h-5 w-5 animate-spin rounded-full border-2",
        light ? "border-white/35 border-t-white" : "border-ink/15 border-t-ink",
        className,
      )}
      aria-label="Loading"
    />
  );
}

export function Chip({
  active,
  onClick,
  children,
  className,
  accent,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  /** Green "dietary" styling, used to highlight Vegan */
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "shrink-0 rounded-full border transition-colors duration-150",
        small ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-[15px]",
        accent
          ? active
            ? "border-olive bg-olive text-white"
            : "border-olive/50 bg-olive/8 text-olive hover:border-olive"
          : active
            ? "border-ink bg-ink text-ivory"
            : "border-line bg-paper text-ink-2 hover:border-ink-2/40",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

export function Segmented<T extends string | number | null>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-full border border-line bg-sand/50 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={cx(
              "relative h-9 flex-1 rounded-full text-[14px] transition-colors",
              active ? "text-ink" : "text-muted hover:text-ink-2",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${options.map((x) => x.label).join()}`}
                className="absolute inset-0 rounded-full bg-paper shadow-[var(--shadow-soft)]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-4 py-3 text-left"
      role="switch"
      aria-checked={on}
    >
      <span>
        <span className="block text-[15px] text-ink">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
      <span className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-tomato" : "bg-line")}>
        <motion.span
          className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow"
          animate={{ left: on ? 22 : 2 }}
          transition={{ type: "spring", stiffness: 600, damping: 35 }}
        />
      </span>
    </button>
  );
}

export function Avatar({ name, size = 40, done, dim }: { name: string; size?: number; done?: boolean; dim?: boolean }) {
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <span
        className={cx(
          "flex h-full w-full items-center justify-center rounded-full font-display text-white ring-2 ring-ivory transition-opacity",
          dim && "opacity-40",
        )}
        style={{ background: tintFor(name), fontSize: size * 0.42 }}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      {done && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -right-0.5 -bottom-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-olive text-[10px] text-white ring-2 ring-ivory"
        >
          ✓
        </motion.span>
      )}
    </span>
  );
}

export function AvatarStack({ people, size = 32, max = 5 }: { people: PublicParticipant[]; size?: number; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} size={size} done={p.finished} dim={!p.active} />
      ))}
      {extra > 0 && (
        <span
          className="flex items-center justify-center rounded-full bg-sand text-[11px] font-medium text-ink-2 ring-2 ring-ivory"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

/** Restaurant photo, or an editorial typographic plate when no real photo exists. */
export function RestaurantImage({
  r,
  className,
  compact,
  bare,
  src,
}: {
  r: Restaurant;
  className?: string;
  compact?: boolean;
  bare?: boolean;
  src?: string;
}) {
  if (src || r.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src ?? r.photoUrl!}
        alt={r.name}
        draggable={false}
        className={cx("h-full w-full object-cover", className)}
        loading="eager"
      />
    );
  }
  return (
    <div
      className={cx("engraved relative flex h-full w-full flex-col items-center justify-center overflow-hidden text-center", className)}
      style={{ backgroundColor: tintFor(r.cuisine + r.name) }}
    >
      <div className="absolute inset-3 rounded-[18px] border border-white/15" />
      {bare ? (
        <>
          <span className="font-display text-[120px] leading-none text-white/12 italic">{r.name.slice(0, 1)}</span>
          <span className="absolute top-7 left-0 w-full text-[10px] tracking-[0.24em] text-white/45 uppercase">Demo · no photo</span>
        </>
      ) : (
        <>
          {!compact && <span className="mb-3 text-[11px] tracking-[0.3em] text-white/60 uppercase">{r.neighborhood}</span>}
          <span className={cx("px-6 font-display leading-[1.05] text-white/95 italic", compact ? "text-[30px]" : "text-[44px]")}>{r.cuisine}</span>
          {!compact && <span className="mt-4 text-[11px] tracking-[0.2em] text-white/50 uppercase">No photo in demo mode</span>}
        </>
      )}
    </div>
  );
}

export function MetaRow({ r, className }: { r: Restaurant; className?: string }) {
  const dist = distanceLabel(r);
  return (
    <div className={cx("flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-2", className)}>
      {r.rating != null ? (
        <span className="inline-flex items-center gap-1">
          <span className="text-tomato">★</span>
          <span className="font-medium text-ink">{r.rating.toFixed(1)}</span>
          {r.reviewCount != null && <span className="text-muted">({reviewsLabel(r.reviewCount)})</span>}
        </span>
      ) : (
        <span className="text-muted">{r.source === "demo" ? "No rating (demo)" : "No rating yet"}</span>
      )}
      <Dot />
      <span className={r.priceLevel || r.priceText ? "font-medium text-ink" : "text-muted"}>{priceLabel(r)}</span>
      {dist && (
        <>
          <Dot />
          <span>{dist}</span>
        </>
      )}
    </div>
  );
}

export function Dot() {
  return <span className="text-line">•</span>;
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border border-tomato/30 bg-tomato-soft px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-tomato-deep uppercase",
        className,
      )}
    >
      Demo data
    </span>
  );
}

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx("mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5", className)}>{children}</main>;
}

/**
 * The big 3-2-1. While there's more than 3 seconds left (phones get the start signal a little
 * late, so there's a buffer) it shows a gentle "Ready?" instead, so everyone sees a full 3-2-1.
 */
export function CountdownNumber({ seconds }: { seconds: number }) {
  const showNumber = seconds <= COUNTDOWN_VISIBLE_S;
  const key = showNumber ? `n${seconds}` : "ready";
  return (
    <div className="my-2 flex h-[128px] items-center justify-center">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={key}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={showNumber ? { scale: 1, opacity: 1 } : { scale: [1, 1.06, 1], opacity: 1 }}
          exit={{ scale: 1.6, opacity: 0 }}
          transition={showNumber ? { type: "spring", stiffness: 400, damping: 20 } : { duration: 1.2, repeat: Infinity }}
          className={cx("font-display leading-none text-tomato italic", showNumber ? "text-[120px]" : "text-[64px]")}
        >
          {showNumber ? seconds || "Go" : "Ready?"}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
