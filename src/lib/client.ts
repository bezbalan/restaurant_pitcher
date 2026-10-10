"use client";
import type { Restaurant } from "./types";

export class ClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? (init?.body ? "POST" : "GET"),
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: init?.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ClientError("You seem to be offline. Reconnecting…", 0, "OFFLINE");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ClientError(data.error ?? "Something went wrong.", res.status, data.code);
  return data as T;
}

// ---------------------------------------------------------------- identity (per device)

const NAME_KEY = "dinnerclub:name";
const roomKey = (code: string) => `dinnerclub:room:${code}`;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. — the server is the source of truth anyway */
  }
}

export function getSavedName(): string {
  return safeGet(NAME_KEY) ?? "";
}
export function saveName(name: string) {
  safeSet(NAME_KEY, name);
}
export function getRoomPid(code: string): string | null {
  return safeGet(roomKey(code));
}
export function saveRoomPid(code: string, pid: string) {
  safeSet(roomKey(code), pid);
}
export function clearRoomPid(code: string) {
  try {
    localStorage.removeItem(roomKey(code));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- haptics

let switchEl: HTMLLabelElement | null = null;

/** Light haptic tap. Uses the Vibration API where supported, and the iOS 18+ switch trick on iPhone. */
export function haptic(kind: "light" | "medium" | "success" = "light") {
  try {
    // Browsers block vibration until the user has interacted with the page.
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(kind === "success" ? [12, 60, 18] : kind === "medium" ? 18 : 8);
      return;
    }
    // iOS Safari: toggling a native <input switch> produces a system haptic.
    if (!switchEl) {
      const label = document.createElement("label");
      label.ariaHidden = "true";
      label.style.display = "none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      label.appendChild(input);
      document.body.appendChild(label);
      switchEl = label;
    }
    switchEl.click();
  } catch {
    /* no haptics available */
  }
}

// ---------------------------------------------------------------- formatting

export function priceLabel(r: Restaurant): string {
  if (r.priceLevel) return "$".repeat(r.priceLevel);
  if (r.priceText) return r.priceText;
  return "Price unavailable";
}

export function distanceLabel(r: Restaurant): string | null {
  if (r.distanceMi == null) return null;
  const approx = r.source === "demo" ? "~" : "";
  if (r.distanceMi < 0.2) return `${approx}nearby`;
  return `${approx}${r.distanceMi < 10 ? r.distanceMi.toFixed(1) : Math.round(r.distanceMi)} mi`;
}

export function reviewsLabel(n: number | null): string {
  if (n == null) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function directionsUrl(r: Restaurant): string {
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  if (r.source === "google") {
    u.searchParams.set("destination", r.name + (r.address ? `, ${r.address}` : ""));
    u.searchParams.set("destination_place_id", r.id);
  } else {
    u.searchParams.set("destination", `${r.name}, ${r.neighborhood ?? ""}, Los Angeles, CA`);
  }
  return u.toString();
}

const TINTS = ["#7a4a3a", "#5d6650", "#8a5a3c", "#4f5a63", "#6e4f5c", "#7b6a45", "#5a4a42", "#3f5550"];
export function tintFor(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export async function shareLink(url: string, title: string, text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return "shared";
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return "failed";
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
