"use client";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { directionsUrl, haptic, momentWord, shareLink } from "@/lib/client";
import type { Snapshot } from "@/lib/types";
import type { useRoom } from "@/lib/useRoom";
import { TagRow, hoursChip } from "./Details";
import { RoomHeader } from "./RoomClient";
import { Button, MetaRow, RestaurantImage, Screen } from "./ui";

type Room = ReturnType<typeof useRoom>;

export default function Decided({ snap, room, isHost }: { snap: Snapshot; room: Room; isHost: boolean }) {
  const r = snap.restaurants.find((x) => x.id === snap.selectedId);
  const result = snap.results?.ranked.find((x) => x.restaurant.id === snap.selectedId);
  const [shared, setShared] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => haptic("success"), []);

  if (!r) return null;

  async function share() {
    const url = window.location.href;
    const res = await shareLink(url, `It's decided: ${r!.name}`, `We're eating at ${r!.name} ${momentWord()} 🍽️`);
    if (res === "copied") setShared("Link copied ✓");
    setTimeout(() => setShared(null), 2000);
  }

  return (
    <Screen className="safe-top safe-bottom">
      <RoomHeader code={snap.code} demo={r.source === "demo"} />
      <div className="flex flex-1 flex-col pt-5">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[13px] font-medium tracking-[0.18em] text-muted uppercase">
          It&apos;s decided!
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className="mt-1 font-display text-[42px] leading-[1.0] tracking-tight [text-wrap:balance]"
        >
          We&apos;re going to <em className="text-tomato">{r.name}.</em>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, scale: 0.96, rotate: -1.5 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 20 }}
          className="mt-6 overflow-hidden rounded-[28px] bg-paper shadow-[var(--shadow-card)]"
        >
          <div className="relative h-64 bg-sand">
            <RestaurantImage r={r} src={r.photos?.[0]?.url} />
            {r.photoAttribution && <span className="absolute right-3 bottom-2 text-[10px] text-white/80 drop-shadow">Photo: {r.photoAttribution.name}</span>}
          </div>
          <div className="p-5">
            <p className="text-[13px] text-muted">
              {r.cuisine}
              {r.neighborhood && ` · ${r.neighborhood}`}
            </p>
            <MetaRow r={r} className="mt-1" />
            {r.address && <p className="mt-2 text-[15px] text-ink">{r.address}</p>}
            {hoursChip(r) && <p className="mt-1 text-[14px] text-ink-2">{hoursChip(r)!.text}</p>}
            {r.phone && (
              <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="mt-1 block text-[14px] text-tomato-deep underline underline-offset-2">
                Call {r.phone}
              </a>
            )}
            {r.tags && r.tags.length > 0 && (
              <div className="mt-3">
                <TagRow tags={r.tags} max={4} />
              </div>
            )}
            {snap.been[r.id]?.length ? (
              <p className="mt-2 text-[13px] text-olive">✓ {snap.been[r.id].join(", ")} {snap.been[r.id].length === 1 ? "has" : "have"} been here</p>
            ) : null}
            {result && (
              <p className="mt-2 text-[14px] text-ink-2">
                <span className="text-tomato">♥</span> {result.yes} of {result.votes} {result.votes === 1 ? "vote" : "votes"}
              </p>
            )}
          </div>
        </motion.div>

        <div className="mt-6 space-y-2">
          <a href={directionsUrl(r)} target="_blank" rel="noreferrer" className="block">
            <Button className="w-full">Get directions</Button>
          </a>
          <div className="flex gap-2">
            <Button variant="outline" size="md" className="flex-1" onClick={share}>
              {shared ?? "Share results"}
            </Button>
            {r.website ? (
              <a href={r.website} target="_blank" rel="noreferrer" className="flex-1">
                <Button variant="outline" size="md" className="w-full">
                  Website
                </Button>
              </a>
            ) : (
              <a href={r.mapsUrl} target="_blank" rel="noreferrer" className="flex-1">
                <Button variant="outline" size="md" className="w-full">
                  Google Maps
                </Button>
              </a>
            )}
          </div>
          {r.reservationUrl && (
            <a href={r.reservationUrl} target="_blank" rel="noreferrer" className="block">
              <Button variant="dark" size="md" className="w-full">
                Book a Table
              </Button>
            </a>
          )}
        </div>

        <div className="mt-auto flex items-center justify-center gap-5 pt-8 text-[13px] text-muted">
          {isHost && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await room.act("reopen").catch(() => {});
                setBusy(false);
              }}
              className="underline underline-offset-4"
            >
              Change our pick
            </button>
          )}
          <Link href="/" className="underline underline-offset-4">
            Start a new table
          </Link>
        </div>
      </div>
    </Screen>
  );
}
