// Pure game logic — no I/O. Covered by tests/logic.test.ts.
import type { Participant, Restaurant, Results, Room, Vote } from "./types.ts";

export const ROUND_SECONDS = 60;
export const COUNTDOWN_MS = 3500;
/** Votes are still accepted this long after the timer, for in-flight requests */
export const VOTE_GRACE_MS = 2500;
/** A participant not seen for this long no longer blocks an early finish */
export const INACTIVE_MS = 25_000;
/** A host not seen for this long hands the host role to the next active friend */
export const HOST_HANDOFF_MS = 45_000;
export const MAX_PARTICIPANTS = 8;
export const DECK_MIN = 6;
export const DECK_MAX = 12;

export function isActive(p: Participant, now: number): boolean {
  return !p.left && now - p.lastSeen < INACTIVE_MS;
}

/** Deterministic PRNG (mulberry32) seeded from a string. */
function seeded(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same restaurants for everyone; order shuffled per participant, stable across refreshes. */
export function shuffledFor<T>(items: T[], seed: string): T[] {
  const rand = seeded(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Should the current swiping round end?
 * Ends when the timer (plus grace) has passed, or when every round participant has
 * finished — participants who've gone inactive don't block, but at least one must finish.
 */
export function shouldEndRound(room: Room, participants: Participant[], now: number): boolean {
  if (room.state !== "swiping" || room.endsAt == null) return false;
  if (now >= room.endsAt + VOTE_GRACE_MS) return true;
  const inRound = participants.filter((p) => room.roundParticipantIds.includes(p.id) && !p.left);
  if (inRound.length === 0) return false;
  const finished = inRound.filter((p) => p.finishedRound >= room.round);
  if (finished.length === 0) return false;
  return inRound.every((p) => p.finishedRound >= room.round || !isActive(p, now));
}

/**
 * Rank restaurants by group agreement.
 * Tie-breakers (transparent): 1. yes votes, 2. Google rating, 3. review count.
 * Match % = yes / votes actually received for that restaurant — a missing vote is not a "no".
 */
export function computeResults(restaurants: Restaurant[], votes: Vote[], round: number): Results {
  const roundVotes = votes.filter((v) => v.round === round);
  const voters = new Set(roundVotes.map((v) => v.participantId)).size;
  const byId = new Map<string, { yes: number; votes: number }>();
  for (const r of restaurants) byId.set(r.id, { yes: 0, votes: 0 });
  for (const v of roundVotes) {
    const t = byId.get(v.restaurantId);
    if (!t) continue;
    t.votes++;
    if (v.liked) t.yes++;
  }
  const ranked = restaurants
    .map((restaurant) => {
      const t = byId.get(restaurant.id)!;
      return {
        restaurant,
        yes: t.yes,
        votes: t.votes,
        matchPct: t.votes > 0 ? Math.round((t.yes / t.votes) * 100) : null,
        rank: 0,
      };
    })
    .sort(
      (a, b) =>
        b.yes - a.yes ||
        (b.restaurant.rating ?? -1) - (a.restaurant.rating ?? -1) ||
        (b.restaurant.reviewCount ?? -1) - (a.restaurant.reviewCount ?? -1) ||
        a.restaurant.name.localeCompare(b.restaurant.name),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const top = ranked[0];
  const hasMajority = !!top && voters > 0 && top.yes * 2 > voters;
  return { ranked, voters, hasMajority };
}

/** Pick the host: keep the current one unless they've left / been gone a while. */
export function resolveHost(room: Room, participants: Participant[], now: number): string {
  const host = participants.find((p) => p.id === room.hostId);
  if (host && !host.left && now - host.lastSeen < HOST_HANDOFF_MS) return room.hostId;
  const next = participants
    .filter((p) => isActive(p, now))
    .sort((a, b) => a.joinedAt - b.joinedAt)[0];
  return next ? next.id : room.hostId;
}

export function haversineMi(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Pick up to `max` restaurants, round-robin across cuisines so one cuisine doesn't swamp the deck. */
export function diversify(
  sorted: Restaurant[],
  max: number,
  groupOf: (r: Restaurant) => string = (r) => r.cuisine,
): Restaurant[] {
  const groups = new Map<string, Restaurant[]>();
  for (const r of sorted) {
    const key = groupOf(r);
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }
  const out: Restaurant[] = [];
  const queues = [...groups.values()];
  while (out.length < max && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next) out.push(next);
      if (out.length >= max) break;
    }
  }
  return out;
}

export function makeCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

export function makeId(): string {
  return crypto.randomUUID();
}
