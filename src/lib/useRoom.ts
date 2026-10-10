"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClientError, api, clearRoomPid, getRoomPid, saveName, saveRoomPid } from "./client";
import type { Snapshot } from "./types";

/**
 * Keeps a room snapshot in sync with the server by polling (~1s while it matters).
 * The server is the source of truth; localStorage only remembers this device's participant id.
 */
export function useRoom(code: string) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [pid, setPid] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<ClientError | null>(null);
  const [offline, setOffline] = useState(false);
  const offsetRef = useRef(0); // serverNow - clientNow
  const pidRef = useRef<string | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const saved = getRoomPid(code);
    pidRef.current = saved;
    setPid(saved);
    setReady(true);
  }, [code]);

  const apply = useCallback((s: Snapshot, sentAt: number, seq: number, usedPid: string | null) => {
    if (seq < seqRef.current) return; // stale response
    seqRef.current = seq;
    const rtt = Date.now() - sentAt;
    offsetRef.current = s.serverNow + rtt / 2 - Date.now();
    // Our saved id no longer exists in the room (e.g. room was reset) — forget it.
    if (usedPid && usedPid === pidRef.current && !s.me) {
      clearRoomPid(code);
      pidRef.current = null;
      setPid(null);
    }
    setSnap(s);
    setOffline(false);
  }, [code]);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    const sentAt = Date.now();
    try {
      const usedPid = pidRef.current;
      const q = usedPid ? `?pid=${encodeURIComponent(usedPid)}` : "";
      const s = await api<Snapshot>(`/api/rooms/${code}${q}`);
      apply(s, sentAt, seq, usedPid);
    } catch (e) {
      const err = e as ClientError;
      if (err.status === 404) setFatal(err);
      else setOffline(true);
    }
  }, [code, apply]);

  // Polling loop
  const state = snap?.state;
  useEffect(() => {
    if (!ready || fatal) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const fast = state === undefined || state === "lobby" || state === "vibe" || state === "swiping";
    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === "visible") await refresh();
      if (alive) timer = setTimeout(tick, fast ? 1000 : 2500);
    };
    tick();
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onVis);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onVis);
    };
  }, [ready, fatal, state, refresh]);

  /** Perform an action; the server answers with a fresh snapshot. */
  const act = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      const seq = ++seqRef.current;
      const sentAt = Date.now();
      const usedPid = pidRef.current;
      const s = await api<Snapshot>(`/api/rooms/${code}`, { body: { action, pid: usedPid, ...payload } });
      apply(s, sentAt, seq, usedPid);
      return s;
    },
    [code, apply],
  );

  const join = useCallback(
    async (name: string) => {
      const res = await api<{ pid: string }>(`/api/rooms/${code}`, {
        body: { action: "join", name, pid: pidRef.current },
      });
      saveName(name);
      saveRoomPid(code, res.pid);
      pidRef.current = res.pid;
      setPid(res.pid);
      await refresh();
    },
    [code, refresh],
  );

  const leave = useCallback(async () => {
    try {
      await act("leave");
    } finally {
      clearRoomPid(code);
      pidRef.current = null;
      setPid(null);
    }
  }, [act, code]);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { snap, pid, ready, fatal, offline, act, join, leave, refresh, serverNow };
}

export function useNow(intervalMs = 250) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
}
