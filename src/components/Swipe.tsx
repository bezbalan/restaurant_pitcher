"use client";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, haptic } from "@/lib/client";
import { shuffledFor } from "@/lib/logic";
import type { Restaurant, Snapshot } from "@/lib/types";
import { useNow, type useRoom } from "@/lib/useRoom";
import { RoomHeader } from "./RoomClient";
import { AvatarStack, MetaRow, RestaurantImage, Screen, Spinner, cx } from "./ui";

type Room = ReturnType<typeof useRoom>;

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 600;

export default function Swipe({ snap, room }: { snap: Snapshot; room: Room }) {
  useNow(200);
  const pid = room.pid!;
  const now = room.serverNow();
  const startsAt = snap.startsAt ?? 0;
  const endsAt = snap.endsAt ?? 0;

  // Everyone gets the same restaurants; order is shuffled per person (stable across refreshes).
  const order = useMemo(
    () => shuffledFor(snap.restaurants, `${pid}:${snap.round}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap.restaurants.map((r) => r.id).join(","), pid, snap.round],
  );

  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [exitDir, setExitDir] = useState(1);
  const pending = useRef<Promise<unknown>[]>([]);
  const finishedSent = useRef(false);

  const voted = { ...snap.myVotes, ...local };
  const remaining = order.filter((r) => !(r.id in voted));
  const total = order.length;
  const done = total - remaining.length;

  const phase: "countdown" | "swiping" | "done" | "timeup" =
    now < startsAt ? "countdown" : remaining.length === 0 ? "done" : now >= endsAt ? "timeup" : "swiping";

  const sendVote = useCallback(
    (restaurantId: string, liked: boolean) => {
      const p = (async () => {
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            await api(`/api/rooms/${snap.code}`, { body: { action: "vote", pid, round: snap.round, restaurantId, liked } });
            return;
          } catch (e) {
            const status = (e as { status?: number }).status ?? 0;
            if (status >= 400 && status < 500) return; // round over / invalid — don't retry
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }
      })();
      pending.current.push(p);
    },
    [snap.code, snap.round, pid],
  );

  const decide = useCallback(
    (r: Restaurant, liked: boolean) => {
      if (phase !== "swiping") return;
      setExitDir(liked ? 1 : -1);
      setLocal((m) => ({ ...m, [r.id]: liked }));
      haptic(liked ? "medium" : "light");
      sendVote(r.id, liked);
    },
    [phase, sendVote],
  );

  // Tell the server once we're out of cards (after our votes have landed).
  useEffect(() => {
    if (remaining.length === 0 && total > 0 && !finishedSent.current) {
      finishedSent.current = true;
      Promise.allSettled(pending.current).then(() =>
        api(`/api/rooms/${snap.code}`, { body: { action: "finish", pid, round: snap.round } }).catch(() => {
          finishedSent.current = false;
        }),
      );
    }
  }, [remaining.length, total, snap.code, snap.round, pid]);

  // Keyboard support (desktop)
  const top = remaining[0];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!top) return;
      if (e.key === "ArrowRight") decide(top, true);
      if (e.key === "ArrowLeft") decide(top, false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [top, decide]);

  // Haptic tick for the countdown and the last seconds
  const secsLeft = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const countdown = Math.max(0, Math.ceil((startsAt - now) / 1000));
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    const t = phase === "countdown" ? countdown : phase === "swiping" && secsLeft <= 5 ? secsLeft : null;
    if (t != null && t !== lastTick.current && t > 0) haptic("light");
    lastTick.current = t;
  }, [phase, countdown, secsLeft]);

  const inRound = snap.participants.filter((p) => p.inRound);
  const stillChoosing = inRound.filter((p) => !p.finished).length;
  const demo = snap.dataSource === "demo";

  return (
    <Screen className="safe-top safe-bottom h-dvh overflow-hidden">
      <RoomHeader code={snap.code} demo={demo} right={<Timer phase={phase} secsLeft={phase === "countdown" ? Math.round((endsAt - startsAt) / 1000) : secsLeft} />} />

      {/* Progress */}
      <div className="mt-1 mb-3">
        <div className="h-1 overflow-hidden rounded-full bg-sand">
          <motion.div
            className={cx("h-full rounded-full", secsLeft <= 10 ? "bg-tomato" : "bg-ink")}
            animate={{ width: phase === "countdown" ? "100%" : `${Math.max(0, Math.min(100, ((endsAt - now) / (endsAt - startsAt)) * 100))}%` }}
            transition={{ ease: "linear", duration: 0.2 }}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-[13px] text-ink-2">
            {stillChoosing > 0 ? (
              <>
                <span className="font-medium text-ink">
                  {stillChoosing} of {inRound.length}
                </span>{" "}
                {inRound.length === 1 ? "friend is" : "friends are"} choosing…
              </>
            ) : (
              "Everyone's done!"
            )}
          </span>
          <AvatarStack people={inRound} size={26} />
        </div>
      </div>

      {snap.notice && <p className="mb-2 rounded-xl bg-sand px-3 py-2 text-center text-[12px] text-ink-2">{snap.notice}</p>}

      {/* Deck */}
      <div className="relative min-h-0 flex-1">
        {(phase === "done" || phase === "timeup") && (
          <DonePanel phase={phase} done={done} total={total} secsLeft={secsLeft} stillChoosing={stillChoosing} />
        )}
        <AnimatePresence custom={exitDir}>
          {phase !== "timeup" &&
            remaining
              .slice(0, 2)
              .reverse()
              .map((r) => (
                <SwipeCard key={r.id} r={r} isTop={r.id === top?.id} exitDir={exitDir} onDecide={(liked) => decide(r, liked)} disabled={phase !== "swiping"} />
              ))}
        </AnimatePresence>
        <AnimatePresence>{phase === "countdown" && <Countdown n={countdown} total={total} />}</AnimatePresence>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-7 pt-4 pb-1">
        <ActionButton kind="no" disabled={phase !== "swiping" || !top} onClick={() => top && decide(top, false)} />
        <span className="w-14 text-center text-[13px] text-muted tabular-nums">
          {Math.min(done + (phase === "swiping" ? 1 : 0), total)} / {total}
        </span>
        <ActionButton kind="yes" disabled={phase !== "swiping" || !top} onClick={() => top && decide(top, true)} />
      </div>
      {!demo && snap.restaurants.some((r) => r.source === "google") && (
        <p className="pt-1 text-center text-[10px] text-muted/80">Restaurant info &amp; photos from Google</p>
      )}
    </Screen>
  );
}

function Timer({ phase, secsLeft }: { phase: string; secsLeft: number }) {
  const urgent = phase === "swiping" && secsLeft <= 10;
  return (
    <motion.span
      animate={urgent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={urgent ? { duration: 1, repeat: Infinity } : {}}
      className={cx(
        "inline-flex h-8 min-w-[64px] items-center justify-center rounded-full px-3 font-medium tabular-nums",
        urgent ? "bg-tomato text-white" : "bg-ink text-ivory",
      )}
    >
      {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, "0")}
    </motion.span>
  );
}

function Countdown({ n, total }: { n: number; total: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-[28px] bg-ivory/85 backdrop-blur-md"
    >
      <p className="text-[13px] font-medium tracking-[0.2em] text-muted uppercase">Get ready</p>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={n}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.6, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="my-2 font-display text-[120px] leading-none text-tomato italic"
        >
          {n || "Go"}
        </motion.span>
      </AnimatePresence>
      <p className="max-w-[260px] text-center text-[15px] text-ink-2">
        {total} spots. 60 seconds. <span className="text-tomato">♥</span> the ones you&apos;d happily go to.
      </p>
    </motion.div>
  );
}

function DonePanel({ phase, done, total, secsLeft, stillChoosing }: { phase: "done" | "timeup"; done: number; total: number; secsLeft: number; stillChoosing: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: phase === "done" ? 0.15 : 0 }}
      className="absolute inset-0 flex flex-col items-center justify-center rounded-[28px] bg-paper px-8 text-center shadow-[var(--shadow-card)]"
    >
      {phase === "done" ? (
        <>
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-olive text-[28px] text-white"
          >
            ✓
          </motion.div>
          <h2 className="mt-5 font-display text-[30px] leading-tight">
            All {total} <em className="text-tomato">done.</em>
          </h2>
          <p className="mt-2 text-[15px] text-ink-2">
            {stillChoosing > 0
              ? `Waiting on ${stillChoosing} ${stillChoosing === 1 ? "friend" : "friends"}. Results in ${secsLeft}s or as soon as everyone finishes.`
              : "Tallying the votes…"}
          </p>
        </>
      ) : (
        <>
          <h2 className="font-display text-[30px] leading-tight">
            Time&apos;s <em className="text-tomato">up!</em>
          </h2>
          <p className="mt-2 text-[15px] text-ink-2">
            You swiped {done} of {total}. Only submitted votes count. Tallying…
          </p>
        </>
      )}
      <Spinner className="mt-6" />
    </motion.div>
  );
}

function ActionButton({ kind, onClick, disabled }: { kind: "yes" | "no"; onClick: () => void; disabled?: boolean }) {
  const yes = kind === "yes";
  return (
    <motion.button
      type="button"
      aria-label={yes ? "Yes" : "No"}
      whileTap={{ scale: 0.86 }}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex h-[68px] w-[68px] items-center justify-center rounded-full text-[28px] shadow-[var(--shadow-card)] transition-opacity disabled:opacity-40",
        yes ? "bg-tomato text-white" : "border border-line bg-paper text-ink",
      )}
    >
      {yes ? "♥" : "✕"}
    </motion.button>
  );
}

function SwipeCard({
  r,
  isTop,
  exitDir,
  onDecide,
  disabled,
}: {
  r: Restaurant;
  isTop: boolean;
  exitDir: number;
  onDecide: (liked: boolean) => void;
  disabled: boolean;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-14, 14]);
  const yesOpacity = useTransform(x, [25, SWIPE_DISTANCE], [0, 1]);
  const noOpacity = useTransform(x, [-SWIPE_DISTANCE, -25], [1, 0]);
  const crossed = useRef(false);

  function onDrag(_: unknown, info: PanInfo) {
    const past = Math.abs(info.offset.x) > SWIPE_DISTANCE;
    if (past !== crossed.current) {
      crossed.current = past;
      if (past) haptic("light");
    }
  }
  function onDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) onDecide(true);
    else if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) onDecide(false);
  }

  return (
    <motion.div
      className="absolute inset-0 touch-none will-change-transform"
      style={{ x, rotate, zIndex: isTop ? 2 : 1 }}
      drag={isTop && !disabled ? "x" : false}
      dragSnapToOrigin
      dragElastic={0.9}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      initial={{ scale: 0.94, y: 14, opacity: 0 }}
      animate={isTop ? { scale: 1, y: 0, opacity: 1 } : { scale: 0.95, y: 12, opacity: 1 }}
      custom={exitDir}
      variants={{
        exit: (dir: number) => ({
          x: dir * 520,
          rotate: dir * 22,
          opacity: 0,
          transition: { duration: 0.32, ease: [0.32, 0.72, 0, 1] },
        }),
      }}
      exit="exit"
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      whileDrag={{ cursor: "grabbing" }}
    >
      <article className="relative flex h-full flex-col overflow-hidden rounded-[28px] bg-paper shadow-[var(--shadow-card)] select-none">
        <div className="relative min-h-0 flex-1 overflow-hidden bg-sand">
          <RestaurantImage r={r} bare />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12px] font-medium tracking-wide text-white/85 uppercase">
              <span>{r.cuisine}</span>
              {r.neighborhood && (
                <>
                  <span className="text-white/40">·</span>
                  <span>{r.neighborhood}</span>
                </>
              )}
              {r.openNow === true && <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] backdrop-blur">Open now</span>}
            </div>
            <h2 className="font-display text-[34px] leading-[1.02] tracking-tight [text-wrap:balance]">{r.name}</h2>
          </div>
          {r.photoAttribution && (
            <span className="absolute top-3 right-4 max-w-[60%] truncate text-[10px] text-white/70 drop-shadow">
              Photo: {r.photoAttribution.name}
            </span>
          )}

          {/* Stamps */}
          <motion.span
            style={{ opacity: yesOpacity }}
            className="absolute top-6 left-5 -rotate-12 rounded-xl border-[3px] border-tomato bg-white/90 px-3 py-1 font-display text-[30px] font-semibold tracking-wide text-tomato"
          >
            YES ♥
          </motion.span>
          <motion.span
            style={{ opacity: noOpacity }}
            className="absolute top-6 right-5 rotate-12 rounded-xl border-[3px] border-ink bg-white/90 px-3 py-1 font-display text-[30px] font-semibold tracking-wide text-ink"
          >
            PASS
          </motion.span>
        </div>
        <div className="flex shrink-0 flex-col gap-2 px-5 pt-4 pb-5">
          <MetaRow r={r} />
          <p className="line-clamp-2 text-[15px] leading-snug text-ink-2">{r.description}</p>
        </div>
      </article>
    </motion.div>
  );
}
