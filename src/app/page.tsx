"use client";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Logo, Screen } from "@/components/ui";
import { ClientError, api, getSavedName, haptic, momentWord, saveName, saveRoomPid } from "@/lib/client";

const FAN = [
  { word: "Sushi", where: "Santa Monica", tint: "#7a4a3a", rotate: -9, x: -58 },
  { word: "Brunch", where: "Venice", tint: "#5d6650", rotate: 7, x: 58 },
  { word: "Tacos", where: "Culver City", tint: "#8a5a3c", rotate: -1, x: 0 },
];

interface Status {
  restaurants: "google" | "demo";
  store: "supabase" | "memory";
  multiDeviceReady: boolean;
  storeError: string | null;
}

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState<"hero" | "name">("hero");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set after mount so the static page and the visitor's local time never disagree.
  const [when, setWhen] = useState("today");
  useEffect(() => setWhen(momentWord()), []);

  useEffect(() => {
    setName(getSavedName());
    api<Status>("/api/status").then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (step === "name") setTimeout(() => inputRef.current?.focus(), 250);
  }, [step]);

  async function create(e?: React.FormEvent) {
    e?.preventDefault();
    const n = name.trim();
    if (!n) return inputRef.current?.focus();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ code: string; pid: string }>("/api/rooms", { body: { name: n } });
      saveName(n);
      saveRoomPid(res.code, res.pid);
      haptic("medium");
      router.push(`/r/${res.code}`);
    } catch (err) {
      setError((err as ClientError).message);
      setBusy(false);
    }
  }

  return (
    <Screen className="safe-top safe-bottom">
      <header className="flex h-12 items-center justify-between">
        <Logo />
        <span className="text-[13px] text-muted">Los Angeles</span>
      </header>

      <section className="flex flex-1 flex-col justify-center py-6">
        {/* Fanned cards */}
        <div className="relative mx-auto mb-10 h-[212px] w-[150px]" aria-hidden>
          {FAN.map((c, i) => (
            <motion.div
              key={c.word}
              initial={{ opacity: 0, y: 30, rotate: 0, x: 0 }}
              animate={{ opacity: 1, y: 0, rotate: c.rotate, x: c.x }}
              transition={{ delay: 0.1 + i * 0.08, type: "spring", stiffness: 160, damping: 18 }}
              className="engraved absolute inset-0 flex flex-col items-center justify-center rounded-[22px] text-white shadow-[var(--shadow-card)]"
              style={{ backgroundColor: c.tint, zIndex: i }}
            >
              <div className="absolute inset-2.5 rounded-[16px] border border-white/15" />
              <span className="text-[9px] tracking-[0.28em] text-white/60 uppercase">{c.where}</span>
              <span className="mt-2 font-display text-[30px] italic">{c.word}</span>
            </motion.div>
          ))}
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: -8 }}
            transition={{ delay: 0.55, type: "spring", stiffness: 300, damping: 14 }}
            className="absolute -top-3 -right-10 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-paper text-[22px] text-tomato shadow-[var(--shadow-soft)]"
          >
            ♥
          </motion.div>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-center font-display text-[44px] leading-[1.02] font-[420] tracking-[-0.02em] text-ink"
        >
          Where are we
          <br />
          eating <em className="whitespace-nowrap text-tomato">{when}?</em>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mx-auto mt-4 max-w-[300px] text-center text-[16px] leading-relaxed text-ink-2"
        >
          Four friends. One link. A minute of swiping. One place everyone agrees on.
        </motion.p>
      </section>

      <div className="pb-2">
        <AnimatePresence mode="wait" initial={false}>
          {step === "hero" ? (
            <motion.div key="hero" exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }}>
              <Button className="w-full" onClick={() => (haptic(), setStep("name"))}>
                Let&apos;s Eat
              </Button>
              <p className="mt-4 text-center text-[13px] text-muted">No sign-up. No app. Just send the link.</p>
            </motion.div>
          ) : (
            <motion.form
              key="name"
              onSubmit={create}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="rounded-[28px] bg-paper p-5 shadow-[var(--shadow-card)]"
            >
              <label htmlFor="name" className="block text-[13px] font-medium tracking-wide text-muted uppercase">
                You&apos;re hosting. What&apos;s your first name?
              </label>
              <input
                id="name"
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                autoComplete="given-name"
                autoCapitalize="words"
                enterKeyHint="go"
                placeholder="Bez"
                className="mt-2 w-full border-b border-line bg-transparent pb-2 font-display text-[30px] text-ink outline-none placeholder:text-line focus:border-ink"
              />
              {error && <p className="mt-3 text-[14px] text-tomato-deep">{error}</p>}
              <Button type="submit" className="mt-5 w-full" loading={busy} disabled={!name.trim()}>
                Create our table
              </Button>
            </motion.form>
          )}
        </AnimatePresence>

        {status && (status.storeError || !status.multiDeviceReady) && (
          <p className="mt-4 rounded-2xl bg-tomato-soft px-4 py-3 text-center text-[13px] leading-snug text-tomato-deep">
            Setup needed: {status.storeError ?? "add Supabase so friends' phones can share a room (README, step 2)."}
          </p>
        )}
        {status && status.restaurants === "demo" && !status.storeError && status.multiDeviceReady && (
          <p className="mt-4 text-center text-[12px] leading-snug text-muted">
            Demo mode: real LA restaurants, no live ratings or photos yet.
          </p>
        )}
      </div>
    </Screen>
  );
}
