"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api, haptic } from "@/lib/client";
import type { Snapshot } from "@/lib/types";
import { useNow, type useRoom } from "@/lib/useRoom";
import { DietRow } from "./Details";
import { RoomHeader } from "./RoomClient";
import { AvatarStack, MetaRow, RestaurantImage, Screen, cx } from "./ui";

type Room = ReturnType<typeof useRoom>;

/** Tie-breaker: everyone taps one of the tied spots. Most taps wins. */
export default function FaceOff({ snap, room }: { snap: Snapshot; room: Room }) {
  useNow(200);
  const pid = room.pid!;
  const now = room.serverNow();
  const startsAt = snap.startsAt ?? 0;
  const endsAt = snap.endsAt ?? 0;
  const serverPick = Object.keys(snap.myVotes)[0] ?? null;
  const [pick, setPick] = useState<string | null>(null);
  const mine = pick ?? serverPick;
  const finished = useRef(false);

  const counting = now < startsAt;
  const over = now >= endsAt;
  const secsLeft = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const countdown = Math.max(0, Math.ceil((startsAt - now) / 1000));
  const inRound = snap.participants.filter((p) => p.inRound);
  const picked = inRound.filter((p) => p.progress > 0).length;

  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    const t = counting ? countdown : secsLeft <= 5 ? secsLeft : null;
    if (t != null && t > 0 && t !== lastTick.current) haptic("light");
    lastTick.current = t;
  }, [counting, countdown, secsLeft]);

  async function choose(id: string) {
    if (counting || over) return;
    haptic("medium");
    setPick(id);
    try {
      await api(`/api/rooms/${snap.code}`, { body: { action: "vote", pid, round: snap.round, restaurantId: id, liked: true } });
      if (!finished.current) {
        finished.current = true;
        await api(`/api/rooms/${snap.code}`, { body: { action: "finish", pid, round: snap.round } });
      }
    } catch {
      /* round may have just ended */
    }
  }

  return (
    <Screen className="safe-top safe-bottom">
      <RoomHeader
        code={snap.code}
        demo={snap.dataSource === "demo"}
        right={
          <span
            className={cx(
              "inline-flex h-8 min-w-[64px] items-center justify-center rounded-full px-3 font-medium tabular-nums",
              !counting && secsLeft <= 5 ? "bg-tomato text-white" : "bg-ink text-ivory",
            )}
          >
            0:{String(counting ? Math.round((endsAt - startsAt) / 1000) : secsLeft).padStart(2, "0")}
          </span>
        }
      />

      <div className="pt-4">
        <p className="text-[13px] font-medium tracking-[0.18em] text-tomato uppercase">⚡ Face-off</p>
        <h1 className="mt-1 font-display text-[34px] leading-[1.05] tracking-tight">
          Pick <em className="text-tomato">one.</em>
        </h1>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[14px] text-ink-2">
            {over ? "Time's up. Counting picks…" : mine ? "Locked in. Tap another to switch." : "It's a tie. Most taps wins."}
          </p>
          <span className="flex items-center gap-2 text-[13px] text-muted">
            {picked}/{inRound.length}
            <AvatarStack people={inRound.map((p) => ({ ...p, finished: p.progress > 0 }))} size={24} max={4} />
          </span>
        </div>
      </div>

      <div className="relative mt-5 flex-1 space-y-3 pb-4">
        {snap.restaurants.map((r, i) => {
          const chosen = mine === r.id;
          return (
            <motion.button
              key={r.id}
              type="button"
              initial={{ opacity: 0, x: i % 2 ? 40 : -40 }}
              animate={{ opacity: 1, x: 0, scale: chosen ? 1.02 : 1 }}
              transition={{ delay: i * 0.08, type: "spring", stiffness: 300, damping: 24 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => choose(r.id)}
              disabled={counting || over}
              className={cx(
                "flex w-full items-stretch overflow-hidden rounded-[22px] bg-paper text-left shadow-[var(--shadow-card)] ring-2 transition-[box-shadow]",
                chosen ? "ring-tomato" : "ring-transparent",
              )}
            >
              <span className="relative w-28 shrink-0 bg-sand">
                <RestaurantImage r={r} compact src={r.photos?.[0]?.url} />
                {chosen && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute inset-0 flex items-center justify-center bg-tomato/70 text-[30px] text-white"
                  >
                    ✓
                  </motion.span>
                )}
              </span>
              <span className="min-w-0 flex-1 p-4">
                <span className="block truncate font-display text-[22px] leading-tight">{r.name}</span>
                <span className="block truncate text-[13px] text-muted">
                  {r.cuisine}
                  {r.neighborhood && ` · ${r.neighborhood}`}
                </span>
                <MetaRow r={r} className="mt-1.5 text-[13px]" />
                {r.dietMatches?.length ? (
                  <span className="mt-1.5 block">
                    <DietRow r={r} oneLine />
                  </span>
                ) : null}
                <span className={cx("mt-2 block text-[13px] font-medium", chosen ? "text-tomato" : "text-ink-2")}>
                  {chosen ? "Your pick" : "Tap to pick"}
                </span>
              </span>
            </motion.button>
          );
        })}

        <AnimatePresence>
          {counting && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[28px] bg-ivory/85 backdrop-blur-md"
            >
              <p className="text-[13px] font-medium tracking-[0.2em] text-muted uppercase">Face-off in</p>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={countdown}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.6, opacity: 0 }}
                  className="my-2 font-display text-[110px] leading-none text-tomato italic"
                >
                  {countdown || "Go"}
                </motion.span>
              </AnimatePresence>
              <p className="max-w-[260px] text-center text-[15px] text-ink-2">
                {snap.restaurants.length} spots tied. One tap each, {Math.round((endsAt - startsAt) / 1000)} seconds.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Screen>
  );
}
