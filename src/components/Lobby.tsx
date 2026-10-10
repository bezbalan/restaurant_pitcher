"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ClientError, getSavedName, haptic, shareLink } from "@/lib/client";
import type { Snapshot } from "@/lib/types";
import type { useRoom } from "@/lib/useRoom";
import { RoomHeader } from "./RoomClient";
import { Avatar, Button, Screen, cx } from "./ui";

type Room = ReturnType<typeof useRoom>;

function useRoomUrl(code: string) {
  const [url, setUrl] = useState(`/r/${code}`);
  useEffect(() => setUrl(`${window.location.origin}/r/${code}`), [code]);
  return url;
}

export function PeopleList({ snap, slots = 4 }: { snap: Snapshot; slots?: number }) {
  const people = snap.participants;
  const empty = Math.max(0, slots - people.length);
  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {people.map((p) => (
          <motion.li
            key={p.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="flex items-center gap-3 rounded-2xl bg-paper px-3 py-2.5 shadow-[var(--shadow-soft)]"
          >
            <Avatar name={p.name} size={38} dim={!p.active} />
            <span className="flex-1 text-[17px] text-ink">
              {p.name}
              {p.id === snap.me?.id && <span className="ml-1.5 text-muted">(you)</span>}
            </span>
            {p.isHost && <span className="text-[12px] tracking-wide text-muted uppercase">Host</span>}
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 500, damping: 18 }}
              className={cx(
                "flex h-6 w-6 items-center justify-center rounded-full text-[12px]",
                p.active ? "bg-olive text-white" : "bg-sand text-muted",
              )}
              title={p.active ? "Here" : "Away"}
            >
              {p.active ? "✓" : "…"}
            </motion.span>
          </motion.li>
        ))}
      </AnimatePresence>
      {Array.from({ length: empty }).map((_, i) => (
        <li
          key={`empty-${i}`}
          className="flex h-[58px] items-center gap-3 rounded-2xl border border-dashed border-line px-3 text-[15px] text-muted"
        >
          <span className="h-[38px] w-[38px] rounded-full border border-dashed border-line" />
          Waiting for a friend…
        </li>
      ))}
    </ul>
  );
}

function ShareCard({ code, host }: { code: string; host: string }) {
  const url = useRoomUrl(code);
  const [copied, setCopied] = useState(false);
  const text = `${host} started a Dinner Club. Tap to help pick where we eat tonight 🍽️`;
  async function share() {
    haptic();
    const res = await shareLink(url, "Dinner Club", text);
    if (res === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      haptic();
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }
  const msg = encodeURIComponent(`${text} ${url}`);
  return (
    <div className="rounded-[24px] bg-ink p-5 text-ivory shadow-[var(--shadow-card)]">
      <p className="text-[12px] tracking-[0.2em] text-ivory/50 uppercase">Your invite link</p>
      <button onClick={copy} className="mt-2 block w-full truncate text-left font-display text-[20px] text-ivory">
        {url.replace(/^https?:\/\//, "")}
      </button>
      <div className="mt-4 flex gap-2">
        <Button size="md" className="flex-1" onClick={share}>
          {copied ? "Link copied ✓" : "Share invite"}
        </Button>
        <Button size="md" variant="ghost" className="bg-ivory/10 !text-ivory hover:bg-ivory/20" onClick={copy}>
          Copy
        </Button>
      </div>
      <div className="mt-3 flex justify-center gap-5 text-[13px] text-ivory/60">
        <a href={`sms:&body=${msg}`} className="hover:text-ivory">
          iMessage
        </a>
        <a href={`https://wa.me/?text=${msg}`} target="_blank" rel="noreferrer" className="hover:text-ivory">
          WhatsApp
        </a>
      </div>
    </div>
  );
}

export function Lobby({ snap, room, isHost }: { snap: Snapshot; room: Room; isHost: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = snap.participants.find((p) => p.isHost);
  const count = snap.participants.length;
  const others = count - 1;

  async function go() {
    setBusy(true);
    setError(null);
    haptic("medium");
    try {
      await room.act("vibe");
    } catch (e) {
      setError((e as ClientError).message);
      setBusy(false);
    }
  }

  return (
    <Screen className="safe-top safe-bottom">
      <RoomHeader code={snap.code} />
      <div className="flex-1 pt-6">
        {isHost ? (
          <>
            <h1 className="font-display text-[34px] leading-[1.05] tracking-tight">
              Your table <em className="text-tomato">is set.</em>
            </h1>
            <p className="mt-2 text-[16px] text-ink-2">Send the link. Friends join with just a first name.</p>
            <div className="mt-6">
              <ShareCard code={snap.code} host={host?.name ?? "A friend"} />
            </div>
          </>
        ) : (
          <>
            <h1 className="font-display text-[34px] leading-[1.05] tracking-tight">
              You&apos;re in, <em className="text-tomato">{snap.me?.name}.</em>
            </h1>
            <p className="mt-2 text-[16px] text-ink-2">
              {host?.name ?? "The host"} will start once everyone&apos;s here. Keep this screen open.
            </p>
          </>
        )}

        <div className="mt-8 mb-3 flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium tracking-[0.14em] text-muted uppercase">At the table</h2>
          <span className="text-[13px] text-muted">{count} here · invite as many as you like</span>
        </div>
        <PeopleList snap={snap} />
      </div>

      <div className="sticky bottom-0 bg-gradient-to-t from-ivory via-ivory to-transparent pt-6">
        {error && <p className="mb-3 text-center text-[14px] text-tomato-deep">{error}</p>}
        {isHost ? (
          <>
            <Button className="w-full" onClick={go} loading={busy} disabled={others < 1}>
              Find Our Dinner
            </Button>
            {others < 1 ? (
              <p className="mt-3 text-center text-[13px] text-muted">
                Waiting for at least one friend ·{" "}
                <button onClick={go} className="underline underline-offset-2 hover:text-ink">
                  start solo to try it
                </button>
              </p>
            ) : (
              <p className="mt-3 text-center text-[13px] text-muted">
                {count} {count === 1 ? "person" : "people"} ready. Late friends can still jump in.
              </p>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between py-2">
            <WaitingDots label={`Waiting for ${host?.name ?? "the host"}`} />
            <button onClick={() => room.leave()} className="text-[13px] text-muted underline underline-offset-2">
              Leave
            </button>
          </div>
        )}
      </div>
    </Screen>
  );
}

export function WaitingDots({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] text-ink-2">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-tomato"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

export function JoinCard({ snap, room }: { snap: Snapshot; room: Room }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const host = snap.participants.find((p) => p.isHost);

  useEffect(() => setName(getSavedName()), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return inputRef.current?.focus();
    setBusy(true);
    setError(null);
    try {
      await room.join(name.trim());
      haptic("medium");
    } catch (err) {
      setError((err as ClientError).message);
      setBusy(false);
    }
  }

  const status =
    snap.state === "swiping"
      ? "Swiping has started — jump in, there's still time!"
      : snap.state === "vibe"
        ? `${host?.name ?? "The host"} is setting the vibe.`
        : `${snap.participants.length} at the table so far.`;

  return (
    <Screen className="safe-top safe-bottom">
      <RoomHeader code={snap.code} />
      <div className="flex flex-1 flex-col justify-center py-8">
        <div className="mb-6 flex justify-center -space-x-3">
          {snap.participants.slice(0, 6).map((p, i) => (
            <motion.span key={p.id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.06 }}>
              <Avatar name={p.name} size={52} />
            </motion.span>
          ))}
        </div>
        <h1 className="text-center font-display text-[38px] leading-[1.05] tracking-tight">
          {host?.name ?? "Your friends"} invited you
          <br />
          to <em className="text-tomato">dinner.</em>
        </h1>
        <p className="mt-3 text-center text-[15px] text-ink-2">{status}</p>
      </div>
      <form onSubmit={submit} className="rounded-[28px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <label htmlFor="join-name" className="block text-[13px] font-medium tracking-wide text-muted uppercase">
          Your first name
        </label>
        <input
          id="join-name"
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="go"
          placeholder="Alex"
          className="mt-2 w-full border-b border-line bg-transparent pb-2 font-display text-[30px] text-ink outline-none placeholder:text-line focus:border-ink"
        />
        {error && <p className="mt-3 text-[14px] text-tomato-deep">{error}</p>}
        <Button type="submit" className="mt-5 w-full" loading={busy} disabled={!name.trim()}>
          Join the table
        </Button>
        <p className="mt-3 text-center text-[12px] text-muted">No sign-up, no email. Just a name.</p>
      </form>
    </Screen>
  );
}
