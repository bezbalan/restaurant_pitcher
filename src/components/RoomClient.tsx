"use client";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRoom } from "@/lib/useRoom";
import Decided from "./Decided";
import { JoinCard, Lobby } from "./Lobby";
import Results from "./Results";
import Swipe from "./Swipe";
import { Button, DemoBadge, Logo, Screen, Spinner } from "./ui";
import Vibe from "./Vibe";

export default function RoomClient({ code }: { code: string }) {
  const room = useRoom(code);
  const { snap, fatal, offline } = room;

  if (fatal) {
    return (
      <Screen className="safe-top safe-bottom items-center justify-center text-center">
        <Logo className="mb-10" />
        <h1 className="font-display text-[34px] leading-tight">This table doesn&apos;t exist.</h1>
        <p className="mt-3 max-w-[300px] text-ink-2">The link may be mistyped, or the room has expired. Start a new one in two taps.</p>
        <Link href="/" className="mt-8 w-full">
          <Button className="w-full">Start a new table</Button>
        </Link>
      </Screen>
    );
  }

  if (!snap) {
    return (
      <Screen className="safe-top items-center justify-center">
        <Spinner />
      </Screen>
    );
  }

  const me = snap.me;
  const isHost = !!me && snap.hostId === me.id;
  const key = !me
    ? snap.state === "decided" || snap.state === "results"
      ? snap.state
      : "join"
    : snap.state === "swiping"
      ? `swiping-${snap.round}`
      : snap.state;

  let body: React.ReactNode;
  if (!me && snap.state === "decided") body = <Decided snap={snap} room={room} isHost={false} />;
  else if (!me && snap.state === "results") body = <Results snap={snap} room={room} isHost={false} />;
  else if (!me) body = <JoinCard snap={snap} room={room} />;
  else if (snap.state === "lobby") body = <Lobby snap={snap} room={room} isHost={isHost} />;
  else if (snap.state === "vibe") body = <Vibe snap={snap} room={room} isHost={isHost} />;
  else if (snap.state === "swiping") body = <Swipe key={snap.round} snap={snap} room={room} />;
  else if (snap.state === "results") body = <Results snap={snap} room={room} isHost={isHost} />;
  else body = <Decided snap={snap} room={room} isHost={isHost} />;

  return (
    <>
      <AnimatePresence>
        {offline && (
          <motion.div
            initial={{ y: -40 }}
            animate={{ y: 0 }}
            exit={{ y: -40 }}
            className="safe-top fixed inset-x-0 top-0 z-50 bg-ink pb-2 text-center text-[13px] text-ivory"
          >
            Connection lost. Reconnecting…
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export function RoomHeader({ code, demo, right }: { code: string; demo?: boolean; right?: React.ReactNode }) {
  return (
    <header className="flex h-12 items-center justify-between gap-3">
      <Link href="/" aria-label="Bite Club home">
        <Logo />
      </Link>
      <div className="flex items-center gap-2">
        {demo && <DemoBadge />}
        {right ?? <span className="rounded-full bg-sand px-2.5 py-1 font-mono text-[12px] tracking-wider text-ink-2">{code}</span>}
      </div>
    </header>
  );
}
