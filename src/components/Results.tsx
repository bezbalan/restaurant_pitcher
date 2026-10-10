"use client";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { ClientError, haptic } from "@/lib/client";
import type { RankedResult, Snapshot } from "@/lib/types";
import type { useRoom } from "@/lib/useRoom";
import { RoomHeader } from "./RoomClient";
import { Button, MetaRow, RestaurantImage, Screen, cx } from "./ui";

type Room = ReturnType<typeof useRoom>;

export default function Results({ snap, room, isHost }: { snap: Snapshot; room: Room; isHost: boolean }) {
  const results = snap.results!;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const host = snap.participants.find((p) => p.isHost);
  const top = results.ranked.filter((r) => r.yes > 0).slice(0, 3);
  const rest = results.ranked.filter((r) => !top.includes(r));
  const noVotes = results.voters === 0;
  const noLikes = !noVotes && top.length === 0;
  const celebrate = results.hasMajority;

  useEffect(() => {
    if (celebrate) haptic("success");
  }, [celebrate]);

  async function run(action: string, payload: Record<string, unknown> = {}, tag = action) {
    setBusy(tag);
    setError(null);
    haptic("medium");
    try {
      await room.act(action, payload);
    } catch (e) {
      setError((e as ClientError).message);
    } finally {
      setBusy(null);
    }
  }

  const headline = noVotes ? (
    <>
      Nobody swiped <em className="text-tomato">in time.</em>
    </>
  ) : noLikes ? (
    <>
      Tough <em className="text-tomato">crowd.</em>
    </>
  ) : celebrate ? (
    <>
      We found your <em className="text-tomato">dinner!</em>
    </>
  ) : (
    <>
      Close <em className="text-tomato">call.</em>
    </>
  );
  const sub = noVotes
    ? "No votes came in this round. Run it back?"
    : noLikes
      ? "Nobody hearted anything. Let's try some fresh options."
      : celebrate
        ? `${results.voters} ${results.voters === 1 ? "friend" : "friends"} voted. Here's where you agree most.`
        : "No spot got a majority. Here's where you landed. A quick second round with fresh options might settle it.";

  return (
    <Screen className="safe-top safe-bottom">
      {celebrate && <Confetti />}
      <RoomHeader code={snap.code} demo={snap.dataSource === "demo"} />
      <div className="pt-5 pb-6">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[13px] font-medium tracking-[0.18em] text-muted uppercase">
          Round {snap.round} results
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 20 }}
          className="mt-1 font-display text-[40px] leading-[1.02] tracking-tight"
        >
          {headline}
        </motion.h1>
        <p className="mt-2 text-[15px] text-ink-2">{sub}</p>

        <div className="mt-6 space-y-4">
          {top.map((r, i) => (
            <ResultCard
              key={r.restaurant.id}
              r={r}
              voters={results.voters}
              big={i === 0}
              delay={0.15 + i * 0.12}
              isHost={isHost}
              hostName={host?.name}
              busy={busy === r.restaurant.id}
              onPick={() => run("select", { restaurantId: r.restaurant.id }, r.restaurant.id)}
            />
          ))}
        </div>

        {error && <p className="mt-4 rounded-2xl bg-tomato-soft px-4 py-3 text-center text-[14px] text-tomato-deep">{error}</p>}

        {/* Next round */}
        {(!celebrate || noLikes || noVotes) && (
          <div className="mt-6 rounded-[24px] bg-ink p-5 text-ivory">
            <p className="font-display text-[22px] leading-snug">Run a quick second round?</p>
            <p className="mt-1 text-[14px] text-ivory/65">Same vibe, all-new restaurants, another 60 seconds.</p>
            {isHost ? (
              <div className="mt-4 flex gap-2">
                <Button size="md" className="flex-1" loading={busy === "rematch"} onClick={() => run("rematch")}>
                  Fresh round
                </Button>
                <Button size="md" variant="ghost" className="bg-ivory/10 !text-ivory hover:bg-ivory/20" loading={busy === "vibe"} onClick={() => run("vibe")}>
                  Change vibe
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-ivory/60">{host?.name ?? "The host"} can start another round.</p>
            )}
          </div>
        )}

        {rest.length > 0 && !noVotes && (
          <div className="mt-6">
            <button onClick={() => setShowAll((s) => !s)} className="text-[14px] text-ink-2 underline underline-offset-4">
              {showAll ? "Hide the rest" : `See all ${results.ranked.length} results`}
            </button>
            {showAll && (
              <ul className="mt-3 divide-y divide-line rounded-2xl bg-paper px-4 shadow-[var(--shadow-soft)]">
                {rest.map((r) => (
                  <li key={r.restaurant.id} className="flex items-center justify-between gap-3 py-3 text-[14px]">
                    <span className="truncate text-ink">
                      <span className="mr-2 text-muted tabular-nums">#{r.rank}</span>
                      {r.restaurant.name}
                    </span>
                    <span className="shrink-0 text-muted">
                      ♥ {r.yes} of {r.votes} {r.votes === 1 ? "vote" : "votes"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {celebrate && isHost && (
          <div className="mt-6 text-center">
            <button onClick={() => run("rematch")} className="text-[14px] text-muted underline underline-offset-4" disabled={!!busy}>
              Not feeling these? Run a fresh round
            </button>
          </div>
        )}

        <p className="mt-8 text-center text-[12px] leading-relaxed text-muted">
          Ranked by number of hearts, then Google rating, then review count.
          <br />
          Match % is the share of votes received that were yes. Skipped cards don&apos;t count as a no.
        </p>
      </div>
    </Screen>
  );
}

function ResultCard({
  r,
  voters,
  big,
  delay,
  isHost,
  hostName,
  busy,
  onPick,
}: {
  r: RankedResult;
  voters: number;
  big: boolean;
  delay: number;
  isHost: boolean;
  hostName?: string;
  busy: boolean;
  onPick: () => void;
}) {
  const rest = r.restaurant;
  const everyoneVoted = r.votes === voters;
  const missing = voters - r.votes;
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 240, damping: 24 }}
      className="overflow-hidden rounded-[26px] bg-paper shadow-[var(--shadow-card)]"
    >
      <div className={cx("relative overflow-hidden bg-sand", big ? "h-56" : "h-32")}>
        <RestaurantImage r={rest} compact={!big} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <span className="absolute top-3 left-3 flex h-9 min-w-9 items-center justify-center rounded-full bg-paper px-2 font-display text-[17px] text-ink shadow">
          #{r.rank}
        </span>
        {r.matchPct != null && (
          <span className="absolute top-3 right-3 rounded-full bg-tomato px-3 py-1 text-[13px] font-semibold text-white shadow">
            {r.matchPct}% match
          </span>
        )}
        {rest.photoAttribution && <span className="absolute right-3 bottom-2 text-[10px] text-white/70">Photo: {rest.photoAttribution.name}</span>}
      </div>
      <div className="p-4">
        <h3 className={cx("font-display leading-tight tracking-tight", big ? "text-[28px]" : "text-[22px]")}>{rest.name}</h3>
        <p className="mt-0.5 text-[13px] text-muted">
          {rest.cuisine}
          {rest.neighborhood && ` · ${rest.neighborhood}`}
        </p>
        <div className="mt-2 flex items-center gap-2 text-[15px]">
          <span className="text-tomato">♥</span>
          <span className="font-medium text-ink">
            {everyoneVoted ? `${r.yes} of ${voters} ${voters === 1 ? "friend" : "friends"}` : `${r.yes} of ${r.votes} ${r.votes === 1 ? "vote" : "votes"}`}
          </span>
          {!everyoneVoted && missing > 0 && (
            <span className="text-[13px] text-muted">
              · {missing} didn&apos;t get to it
            </span>
          )}
        </div>
        <MetaRow r={rest} className="mt-1.5" />

        <div className="mt-4 flex flex-col gap-2">
          {isHost ? (
            <Button size="md" onClick={onPick} loading={busy}>
              Let&apos;s Go Here
            </Button>
          ) : (
            big && <p className="text-center text-[13px] text-muted">{hostName ?? "The host"} makes the final call.</p>
          )}
          <div className="flex gap-2">
            <a href={rest.mapsUrl} target="_blank" rel="noreferrer" className="flex-1">
              <Button size="sm" variant="outline" className="w-full">
                Google Maps
              </Button>
            </a>
            {rest.website && (
              <a href={rest.website} target="_blank" rel="noreferrer" className="flex-1">
                <Button size="sm" variant="outline" className="w-full">
                  Website
                </Button>
              </a>
            )}
            {rest.reservationUrl && (
              <a href={rest.reservationUrl} target="_blank" rel="noreferrer" className="flex-1">
                <Button size="sm" variant="outline" className="w-full">
                  Book a Table
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

const CONFETTI_COLORS = ["#c8553d", "#1e1a17", "#6b7559", "#e9b8a6", "#d9c7a7"];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.8 + Math.random() * 1.4,
        rotate: Math.random() * 720 - 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        w: 6 + Math.random() * 6,
        drift: Math.random() * 80 - 40,
      })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 block rounded-[2px]"
          style={{ left: `${p.left}%`, width: p.w, height: p.w * 0.45, background: p.color }}
          initial={{ y: -20, opacity: 1, rotate: 0, x: 0 }}
          animate={{ y: "105vh", opacity: [1, 1, 0], rotate: p.rotate, x: p.drift }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.2, 0.6, 0.4, 1] }}
        />
      ))}
    </div>
  );
}
