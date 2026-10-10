"use client";
import { AnimatePresence, motion } from "motion/react";
import type { Restaurant } from "@/lib/types";
import { Button, MetaRow, cx } from "./ui";

export function hoursChip(r: Restaurant): { text: string; warn: boolean } | null {
  if (r.closesAt) {
    const soon = r.minutesToClose != null && r.minutesToClose < 90;
    return { text: soon ? `Closes ${r.closesAt}` : `Open till ${r.closesAt}`, warn: soon };
  }
  if (r.openNow === true) return { text: "Open now", warn: false };
  if (r.openNow === false) return { text: "Closed now", warn: true };
  return null;
}

export function TagRow({ tags, max, light, oneLine }: { tags?: string[]; max?: number; light?: boolean; oneLine?: boolean }) {
  if (!tags?.length) return null;
  const shown = max ? tags.slice(0, max) : tags;
  return (
    <div className={cx("flex gap-1.5", oneLine ? "flex-nowrap overflow-hidden whitespace-nowrap" : "flex-wrap")}>
      {shown.map((t) => (
        <span
          key={t}
          className={cx(
            "rounded-full px-2.5 py-0.5 text-[12px]",
            light ? "bg-white/18 text-white backdrop-blur" : "bg-sand text-ink-2",
          )}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

/** Bottom sheet with everything people usually look up before choosing a place. */
export function DetailsSheet({ r, onClose, been }: { r: Restaurant | null; onClose: () => void; been?: string[] }) {
  return (
    <AnimatePresence>
      {r && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
          <motion.button
            aria-label="Close details"
            className="absolute inset-0 bg-ink/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label={`${r.name} details`}
            className="safe-bottom relative max-h-[88dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[28px] bg-paper px-5 pt-3 shadow-[var(--shadow-card)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
            <p className="text-[12px] font-medium tracking-[0.14em] text-muted uppercase">
              {r.cuisine}
              {r.neighborhood && ` · ${r.neighborhood}`}
            </p>
            <h2 className="mt-1 font-display text-[30px] leading-tight tracking-tight">{r.name}</h2>
            <MetaRow r={r} className="mt-2" />
            {been && been.length > 0 && <p className="mt-2 text-[14px] text-olive">✓ {been.join(", ")} {been.length === 1 ? "has" : "have"} been here</p>}

            {r.photos && r.photos.length > 1 && (
              <div className="no-scrollbar -mx-5 mt-4 flex snap-x gap-2 overflow-x-auto px-5">
                {r.photos.map((p, i) => (
                  <figure key={p.url} className="relative h-40 w-56 shrink-0 snap-start overflow-hidden rounded-2xl bg-sand">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`${r.name} photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                    {p.attribution && (
                      <figcaption className="absolute right-2 bottom-1 max-w-[90%] truncate text-[9px] text-white/80 drop-shadow">
                        {p.attribution.name}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            )}

            <Section title="Hours">
              {r.closesAt || r.hoursToday ? (
                <>
                  {hoursChip(r) && <p className={cx("text-[15px]", hoursChip(r)!.warn ? "text-tomato-deep" : "text-ink")}>{hoursChip(r)!.text}</p>}
                  {r.hoursToday && <p className="text-[14px] text-ink-2">Today — {r.hoursToday.replace(/^[^:]+:\s*/, "")}</p>}
                  {r.weekHours && (
                    <details className="mt-1 text-[13px] text-muted">
                      <summary className="cursor-pointer">All week</summary>
                      <ul className="mt-1 space-y-0.5">
                        {r.weekHours.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              ) : (
                <p className="text-[14px] text-muted">{r.source === "demo" ? "Hours aren't available in demo mode." : "Hours not listed on Google."}</p>
              )}
            </Section>

            {(r.aiSummary || r.description) && (
              <Section title="What it's like">
                <p className="text-[15px] leading-relaxed text-ink-2">{r.aiSummary ?? r.description}</p>
                {r.aiSummary && <p className="mt-1 text-[11px] text-muted">Summarized with Gemini · Google Maps</p>}
              </Section>
            )}

            {r.tags && r.tags.length > 0 && (
              <Section title="Good to know">
                <TagRow tags={r.tags} />
              </Section>
            )}

            {r.review && (
              <Section title="From a recent review">
                <blockquote className="rounded-2xl bg-sand/60 p-4 text-[15px] leading-relaxed text-ink">
                  “{r.review.text}”
                  <footer className="mt-2 text-[12px] text-muted">
                    {r.review.rating != null && <span className="text-tomato">{"★".repeat(Math.round(r.review.rating))} </span>}
                    {r.review.author}
                    {r.review.when && ` · ${r.review.when}`} · Google review
                  </footer>
                </blockquote>
              </Section>
            )}

            <Section title="Where">
              <p className="text-[15px] text-ink">{r.address ?? r.neighborhood ?? "Los Angeles"}</p>
              {r.phone && (
                <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="mt-1 block text-[15px] text-tomato-deep underline underline-offset-2">
                  {r.phone}
                </a>
              )}
            </Section>

            <div className="mt-6 mb-4 flex gap-2">
              <a href={r.mapsUrl} target="_blank" rel="noreferrer" className="flex-1">
                <Button size="md" variant="outline" className="w-full">
                  Google Maps
                </Button>
              </a>
              {r.website && (
                <a href={r.website} target="_blank" rel="noreferrer" className="flex-1">
                  <Button size="md" variant="outline" className="w-full">
                    Website
                  </Button>
                </a>
              )}
            </div>
            <Button size="md" variant="dark" className="mb-2 w-full" onClick={onClose}>
              Done
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-1.5 text-[12px] font-medium tracking-[0.14em] text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}
