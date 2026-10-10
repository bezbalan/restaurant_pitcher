"use client";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ClientError, haptic } from "@/lib/client";
import { NEIGHBORHOODS } from "@/lib/neighborhoods";
import type { Cuisine, Filters, Radius, Snapshot } from "@/lib/types";
import type { useRoom } from "@/lib/useRoom";
import { PeopleList, WaitingDots } from "./Lobby";
import { RoomHeader } from "./RoomClient";
import { Button, Chip, Screen, Segmented, Toggle, cx } from "./ui";

type Room = ReturnType<typeof useRoom>;

const CUISINES: Cuisine[] = ["Japanese", "Korean", "Thai", "Italian", "Mexican", "Indian", "American", "Mediterranean", "Chinese", "Vietnamese"];
const BUDGETS = [
  { level: 1, sign: "$", label: "Under $20" },
  { level: 2, sign: "$$", label: "$20–40" },
  { level: 3, sign: "$$$", label: "$40–70" },
  { level: 4, sign: "$$$$", label: "$70+" },
];

const DEFAULT_FILTERS: Filters = {
  location: { mode: "neighborhood", neighborhood: "Culver City" },
  radius: 5,
  cuisines: [],
  budget: [],
  openNow: true,
  highlyRated: false,
  casual: false,
  dateNight: false,
  outdoor: false,
};

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[13px] font-medium tracking-[0.14em] text-muted uppercase">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function Vibe({ snap, room, isHost }: { snap: Snapshot; room: Room; isHost: boolean }) {
  if (!isHost) return <VibeWaiting snap={snap} room={room} />;
  return <VibeHost snap={snap} room={room} />;
}

function VibeWaiting({ snap }: { snap: Snapshot; room: Room }) {
  const host = snap.participants.find((p) => p.isHost);
  return (
    <Screen className="safe-top safe-bottom">
      <RoomHeader code={snap.code} />
      <div className="flex-1 pt-10">
        <WaitingDots label={`${host?.name ?? "The host"} is setting the vibe`} />
        <h1 className="mt-5 font-display text-[36px] leading-[1.05] tracking-tight">
          Get your thumbs <em className="text-tomato">ready.</em>
        </h1>
        <div className="mt-6 space-y-3 rounded-[24px] bg-paper p-5 text-[15px] leading-relaxed text-ink-2 shadow-[var(--shadow-soft)]">
          <p>
            <span className="font-medium text-ink">60 seconds.</span> Everyone sees the same 10–12 restaurants.
          </p>
          <p>
            <span className="text-tomato">♥ Swipe right</span> on places you&apos;d happily go.{" "}
            <span className="text-ink">✕ Swipe left</span> to pass.
          </p>
          <p>Nobody sees anyone else&apos;s votes, just the group&apos;s top picks at the end.</p>
        </div>
        <h2 className="mt-8 mb-3 text-[13px] font-medium tracking-[0.14em] text-muted uppercase">At the table</h2>
        <PeopleList snap={snap} slots={0} />
      </div>
    </Screen>
  );
}

function VibeHost({ snap, room }: { snap: Snapshot; room: Room }) {
  const [f, setF] = useState<Filters>(() => snap.filters ?? DEFAULT_FILTERS);
  const [more, setMore] = useState(() => !!(snap.filters && (snap.filters.casual || snap.filters.dateNight || snap.filters.outdoor || snap.filters.highlyRated)));
  const [geo, setGeo] = useState<"idle" | "locating" | "ok" | "denied">(
    snap.filters?.location.mode === "current" && snap.filters.location.lat ? "ok" : "idle",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((p) => ({ ...p, [k]: v }));

  function locateMe() {
    set("location", { mode: "current" });
    if (!("geolocation" in navigator)) {
      setGeo("denied");
      return;
    }
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setF((p) => ({ ...p, location: { mode: "current", lat: pos.coords.latitude, lng: pos.coords.longitude } }));
        setGeo("ok");
      },
      () => setGeo("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  function toggleCuisine(c: Cuisine) {
    haptic();
    set("cuisines", f.cuisines.includes(c) ? f.cuisines.filter((x) => x !== c) : [...f.cuisines, c]);
  }
  function toggleBudget(b: number) {
    haptic();
    set("budget", f.budget.includes(b) ? f.budget.filter((x) => x !== b) : [...f.budget, b].sort());
  }

  const locationReady =
    (f.location.mode === "neighborhood" && !!f.location.neighborhood) ||
    (f.location.mode === "address" && !!f.location.address?.trim()) ||
    (f.location.mode === "current" && geo === "ok");

  const placeLabel =
    f.location.mode === "neighborhood"
      ? f.location.neighborhood
      : f.location.mode === "address"
        ? f.location.address?.trim() || "your address"
        : "you";

  async function start() {
    setBusy(true);
    setError(null);
    haptic("medium");
    try {
      await room.act("start", { filters: f });
    } catch (e) {
      setError((e as ClientError).message);
      setBusy(false);
    }
  }

  return (
    <Screen className="safe-top">
      <RoomHeader code={snap.code} right={<span className="text-[13px] text-muted">{snap.participants.length} at the table</span>} />
      <div className="pt-4 pb-40">
        <h1 className="font-display text-[34px] leading-[1.05] tracking-tight">
          Set the <em className="text-tomato">vibe.</em>
        </h1>
        <p className="mt-2 text-[15px] text-ink-2">You pick for the group. Keep it loose. More options means better matches.</p>

        <Section title="Where">
          <Segmented
            value={f.location.mode}
            onChange={(m) => {
              haptic();
              if (m === "current") locateMe();
              else if (m === "neighborhood") set("location", { mode: "neighborhood", neighborhood: f.location.neighborhood ?? "Culver City" });
              else set("location", { mode: "address", address: f.location.address ?? "" });
            }}
            options={[
              { value: "neighborhood", label: "Neighborhood" },
              { value: "current", label: "Near me" },
              { value: "address", label: "Address" },
            ]}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={f.location.mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {f.location.mode === "neighborhood" && (
                <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
                  {NEIGHBORHOODS.map((n) => (
                    <Chip
                      key={n.name}
                      active={f.location.neighborhood === n.name}
                      onClick={() => (haptic(), set("location", { mode: "neighborhood", neighborhood: n.name, lat: n.lat, lng: n.lng }))}
                    >
                      {n.name}
                    </Chip>
                  ))}
                </div>
              )}
              {f.location.mode === "address" && (
                <input
                  value={f.location.address ?? ""}
                  onChange={(e) => set("location", { mode: "address", address: e.target.value })}
                  placeholder="e.g. 9500 Culver Blvd, Culver City"
                  autoComplete="street-address"
                  className="mt-3 h-12 w-full rounded-2xl border border-line bg-paper px-4 text-ink outline-none placeholder:text-muted/70 focus:border-ink"
                />
              )}
              {f.location.mode === "current" && (
                <p className={cx("mt-3 text-[14px]", geo === "denied" ? "text-tomato-deep" : "text-ink-2")}>
                  {geo === "locating" && "Finding you…"}
                  {geo === "ok" && "✓ Using your current location"}
                  {geo === "denied" && (
                    <>
                      Couldn&apos;t get your location.{" "}
                      <button className="underline" onClick={locateMe}>
                        Try again
                      </button>{" "}
                      or pick a neighborhood.
                    </>
                  )}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="mt-4">
            <Segmented<Radius>
              value={f.radius}
              onChange={(r) => (haptic(), set("radius", r))}
              options={[
                { value: 2, label: "2 mi" },
                { value: 5, label: "5 mi" },
                { value: 10, label: "10 mi" },
                { value: null, label: "All LA" },
              ]}
            />
          </div>
        </Section>

        <Section
          title="Craving"
          aside={<span className="text-[13px] text-muted">{f.cuisines.length ? `${f.cuisines.length} picked` : "Anything goes"}</span>}
        >
          <div className="flex flex-wrap gap-2">
            {CUISINES.map((c) => (
              <Chip key={c} active={f.cuisines.includes(c)} onClick={() => toggleCuisine(c)}>
                {c}
              </Chip>
            ))}
            <Chip active={f.cuisines.length === 0} onClick={() => (haptic(), set("cuisines", []))}>
              Anything
            </Chip>
          </div>
        </Section>

        <Section title="Budget per person" aside={<span className="text-[13px] text-muted">{f.budget.length ? "" : "Any budget"}</span>}>
          <div className="grid grid-cols-4 gap-2">
            {BUDGETS.map((b) => {
              const active = f.budget.includes(b.level);
              return (
                <motion.button
                  key={b.level}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => toggleBudget(b.level)}
                  aria-pressed={active}
                  className={cx(
                    "flex h-[68px] flex-col items-center justify-center rounded-2xl border transition-colors",
                    active ? "border-ink bg-ink text-ivory" : "border-line bg-paper text-ink",
                  )}
                >
                  <span className="font-display text-[19px]">{b.sign}</span>
                  <span className={cx("text-[11px]", active ? "text-ivory/70" : "text-muted")}>{b.label}</span>
                </motion.button>
              );
            })}
          </div>
        </Section>

        <section className="mt-6">
          <Toggle on={f.openNow} onChange={(v) => set("openNow", v)} label="Open now" />
          <AnimatePresence initial={false}>
            {more && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <Toggle on={f.highlyRated} onChange={(v) => set("highlyRated", v)} label="Highly rated" hint="4.4★ and up on Google" />
                <Toggle on={f.casual} onChange={(v) => set("casual", v)} label="Casual" />
                <Toggle on={f.dateNight} onChange={(v) => set("dateNight", v)} label="Date-night atmosphere" />
                <Toggle on={f.outdoor} onChange={(v) => set("outdoor", v)} label="Outdoor seating" />
              </motion.div>
            )}
          </AnimatePresence>
          <button onClick={() => setMore((m) => !m)} className="mt-1 py-2 text-[14px] text-ink-2 underline underline-offset-4">
            {more ? "Fewer options" : "More options"}
          </button>
        </section>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-ivory via-ivory/95 to-transparent pt-8">
        <div className="mx-auto max-w-[480px] px-5">
          {error && <p className="mb-3 rounded-2xl bg-tomato-soft px-4 py-3 text-center text-[14px] text-tomato-deep">{error}</p>}
          <Button className="w-full" onClick={start} loading={busy} disabled={!locationReady}>
            Start the 60 seconds
          </Button>
          <p className="mt-2 text-center text-[13px] text-muted">
            {busy ? `Finding great spots near ${placeLabel}…` : `Everyone gets the same 10–12 spots near ${placeLabel}.`}
          </p>
        </div>
      </div>
    </Screen>
  );
}
