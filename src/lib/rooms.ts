import "server-only";
import {
  COUNTDOWN_MS,
  MAX_PARTICIPANTS,
  ROUND_SECONDS,
  VOTE_GRACE_MS,
  SUPER_PREFIX,
  VETO_PREFIX,
  computeResults,
  isActive,
  isSpecialVote,
  midpoint,
  makeCode,
  makeId,
  resolveHost,
  shouldEndRound,
} from "./logic.ts";
import { DIET_KEYS } from "./diets.ts";
import { buildShortlist } from "./places.ts";
import { getStore, storeIsEphemeral } from "./store.ts";
import type { Cuisine, Filters, Participant, Room, Snapshot } from "./types.ts";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Round length; overridable for automated tests only. */
function roundSeconds() {
  const n = Number(process.env.DINNER_ROUND_SECONDS);
  return Number.isFinite(n) && n >= 5 && n <= 300 ? n : ROUND_SECONDS;
}

const CUISINES: Cuisine[] = ["Vegan", "Breakfast", "Brunch", "Japanese", "Korean", "Thai", "Italian", "Mexican", "Indian", "American", "Mediterranean", "Chinese", "Vietnamese", "Dessert", "Coffee"];

export function cleanName(raw: unknown): string {
  const name = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
  if (!name) throw new ApiError(400, "Please enter your first name.");
  return name;
}

export function cleanCode(raw: unknown): string {
  const code = String(raw ?? "").toLowerCase();
  if (!/^[a-z0-9]{4,12}$/.test(code)) throw new ApiError(404, "That table doesn't exist.");
  return code;
}

function cleanFilters(raw: unknown): Filters {
  const f = (raw ?? {}) as Partial<Filters>;
  const loc = (f.location ?? { mode: "neighborhood" }) as Filters["location"];
  const mode = ["current", "neighborhood", "address", "middle"].includes(loc.mode) ? loc.mode : "neighborhood";
  const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);
  return {
    location: {
      mode,
      neighborhood: typeof loc.neighborhood === "string" ? loc.neighborhood.slice(0, 60) : undefined,
      address: typeof loc.address === "string" ? loc.address.slice(0, 200) : undefined,
      lat: num(loc.lat),
      lng: num(loc.lng),
    },
    radius: ([2, 5, 10] as const).includes(f.radius as 2) ? (f.radius as 2 | 5 | 10) : null,
    cuisines: Array.isArray(f.cuisines) ? f.cuisines.filter((c): c is Cuisine => CUISINES.includes(c as Cuisine)) : [],
    budget: Array.isArray(f.budget) ? [...new Set(f.budget.filter((b) => [1, 2, 3, 4].includes(b)))] : [],
    openNow: !!f.openNow,
    highlyRated: !!f.highlyRated,
    casual: !!f.casual,
    dateNight: !!f.dateNight,
    outdoor: !!f.outdoor,
  };
}

async function loadRoom(code: string): Promise<Room> {
  const room = await getStore().getRoom(code);
  if (!room) throw new ApiError(404, "That table doesn't exist (or has expired).", "NOT_FOUND");
  return room;
}

async function requireParticipant(code: string, pid: unknown): Promise<Participant> {
  const ps = await getStore().listParticipants(code);
  const me = ps.find((p) => p.id === pid);
  if (!me) throw new ApiError(403, "You're not in this room yet.", "NOT_JOINED");
  return me;
}

async function requireHost(code: string, pid: unknown): Promise<Room> {
  const room = await loadRoom(code);
  await requireParticipant(code, pid);
  if (room.hostId !== pid) throw new ApiError(403, "Only the host can do that.", "NOT_HOST");
  return room;
}

// ---------------------------------------------------------------- actions

export async function createRoom(rawName: unknown) {
  const name = cleanName(rawName);
  if (storeIsEphemeral()) {
    throw new ApiError(
      503,
      "Almost there! This deployment needs Supabase so friends' phones can share a room. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see README, step 2).",
      "SETUP_NEEDED",
    );
  }
  const store = getStore();
  const now = Date.now();
  const pid = makeId();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    const room: Room = {
      code,
      hostId: pid,
      state: "lobby",
      round: 0,
      filters: null,
      restaurants: [],
      seenIds: [],
      roundParticipantIds: [],
      startsAt: null,
      endsAt: null,
      selectedId: null,
      dataSource: null,
      notice: null,
      createdAt: now,
      updatedAt: now,
    };
    if (await store.createRoom(room)) {
      await store.upsertParticipant({ id: pid, roomCode: code, name, joinedAt: now, lastSeen: now, finishedRound: 0, left: false });
      return { code, pid };
    }
  }
  throw new ApiError(500, "Couldn't create a room. Please try again.");
}

export async function joinRoom(code: string, rawName: unknown, rawPid: unknown) {
  const name = cleanName(rawName);
  const store = getStore();
  const room = await loadRoom(code);
  const ps = await store.listParticipants(code);
  const now = Date.now();
  const existing = typeof rawPid === "string" ? ps.find((p) => p.id === rawPid) : undefined;
  if (existing) {
    await store.patchParticipant(code, existing.id, { name, left: false, lastSeen: now });
    return { pid: existing.id };
  }
  if (room.state === "decided") throw new ApiError(409, "This group already picked a restaurant.", "DECIDED");
  if (ps.filter((p) => !p.left).length >= MAX_PARTICIPANTS) {
    throw new ApiError(409, `This table is full (${MAX_PARTICIPANTS} friends max).`, "FULL");
  }
  const pid = makeId();
  await store.upsertParticipant({ id: pid, roomCode: code, name, joinedAt: now, lastSeen: now, finishedRound: 0, left: false });
  if (room.state === "swiping" && !room.roundParticipantIds.includes(pid)) {
    await store.updateRoom(code, { roundParticipantIds: [...room.roundParticipantIds, pid] });
  }
  return { pid };
}

export async function leaveRoom(code: string, pid: unknown) {
  const me = await requireParticipant(code, pid);
  await getStore().patchParticipant(code, me.id, { left: true });
}

export async function openVibe(code: string, pid: unknown) {
  const room = await requireHost(code, pid);
  if (room.state === "swiping") throw new ApiError(409, "A round is in progress.");
  await getStore().updateRoom(code, { state: "vibe" }, { state: room.state });
}

export async function startRound(code: string, pid: unknown, rawFilters?: unknown) {
  const room = await requireHost(code, pid);
  if (room.state === "swiping") return; // double tap — already started
  const filters = rawFilters ? cleanFilters(rawFilters) : room.filters;
  if (!filters) throw new ApiError(400, "Set the vibe first.");
  if (filters.location.mode === "middle") {
    // Recompute every round from whoever is still here, so late sharers count.
    const locs = await sharedLocations(code);
    if (locs.size < 2) {
      await getStore().updateRoom(code, { filters, state: "vibe" });
      throw new ApiError(422, "Meet-in-the-middle needs at least 2 friends to share their location.", "NEED_LOCATIONS");
    }
    const mid = midpoint([...locs.values()])!;
    filters.location = { mode: "middle", lat: mid.lat, lng: mid.lng };
  }

  // Everyone's dietary needs shape the search (recomputed each round so late changes count).
  const [diets, people] = await Promise.all([dietsByParticipant(code), getStore().listParticipants(code)]);
  const here = new Set(people.filter((p) => !p.left).map((p) => p.id));
  filters.dietNeeds = [...new Set([...diets].filter(([id]) => here.has(id)).flatMap(([, d]) => d))];

  const shortlist = await buildShortlist(filters, room.seenIds);
  if (shortlist.restaurants.length === 0) {
    // Persist filters so the host doesn't lose their choices.
    await getStore().updateRoom(code, { filters, state: "vibe" });
    throw new ApiError(
      422,
      room.seenIds.length
        ? "You've seen every spot that matches. Try widening the radius or adding cuisines."
        : "No restaurants match those filters. Try a wider radius or fewer filters.",
      "NO_RESTAURANTS",
    );
  }

  const ps = await getStore().listParticipants(code);
  const now = Date.now();
  const startsAt = now + COUNTDOWN_MS;
  const ok = await getStore().updateRoom(
    code,
    {
      state: "swiping",
      round: room.round + 1,
      filters,
      restaurants: shortlist.restaurants,
      seenIds: [...new Set([...room.seenIds, ...shortlist.restaurants.map((r) => r.id)])],
      roundParticipantIds: ps.filter((p) => !p.left && (isActive(p, now) || p.id === pid)).map((p) => p.id),
      startsAt,
      endsAt: startsAt + roundSeconds() * 1000,
      selectedId: null,
      dataSource: shortlist.source,
      notice: shortlist.notice,
    },
    { round: room.round, state: room.state },
  );
  if (!ok) return; // someone else (another tab of the host) already started it
}

export async function castVote(
  code: string,
  pid: unknown,
  body: { round?: unknown; restaurantId?: unknown; liked?: unknown; special?: unknown },
) {
  const room = await loadRoom(code);
  const me = await requireParticipant(code, pid);
  const now = Date.now();
  if (room.state !== "swiping" || body.round !== room.round) throw new ApiError(409, "This round is over.", "ROUND_OVER");
  if (room.endsAt && now > room.endsAt + VOTE_GRACE_MS) throw new ApiError(409, "Time's up!", "ROUND_OVER");
  if (room.startsAt && now < room.startsAt - 500) throw new ApiError(409, "Hold on — the round hasn't started.", "NOT_STARTED");
  const rid = String(body.restaurantId ?? "");
  if (!room.restaurants.some((r) => r.id === rid)) throw new ApiError(400, "Unknown restaurant.");
  const special = body.special === "super" || body.special === "veto" ? body.special : null;
  const store = getStore();
  await store.upsertVote({
    roomCode: code,
    round: room.round,
    participantId: me.id,
    restaurantId: rid,
    liked: special === "super" ? true : special === "veto" ? false : !!body.liked,
    createdAt: now,
  });
  if (special) {
    // One super-like and one veto per person per round: replace any earlier one.
    const prefix = special === "super" ? SUPER_PREFIX : VETO_PREFIX;
    const mine = (await store.listVotes(code, room.round)).filter((v) => v.participantId === me.id && v.restaurantId.startsWith(prefix));
    for (const v of mine) await store.deleteVote(code, room.round, me.id, v.restaurantId);
    await store.upsertVote({ roomCode: code, round: room.round, participantId: me.id, restaurantId: prefix + rid, liked: true, createdAt: now });
  }
}

/** Undo my last swipe: forget the vote so the card comes back. */
export async function undoVote(code: string, pid: unknown, body: { round?: unknown; restaurantId?: unknown }) {
  const room = await loadRoom(code);
  const me = await requireParticipant(code, pid);
  if (room.state !== "swiping" || body.round !== room.round) throw new ApiError(409, "This round is over.", "ROUND_OVER");
  if (room.endsAt && Date.now() > room.endsAt) throw new ApiError(409, "Time's up!", "ROUND_OVER");
  const rid = String(body.restaurantId ?? "");
  await getStore().deleteVote(code, room.round, me.id, rid);
  await getStore().deleteVote(code, room.round, me.id, SUPER_PREFIX + rid);
  await getStore().deleteVote(code, room.round, me.id, VETO_PREFIX + rid);
  if (me.finishedRound >= room.round) await getStore().patchParticipant(code, me.id, { finishedRound: room.round - 1 });
}

/**
 * "I've been here." Stored as a vote in round 0 (real rounds start at 1), so it needs no extra table
 * and survives across rounds in the same room. Revealed to the group only with the results.
 */
export const BEEN_ROUND = 0;
export async function markBeen(code: string, pid: unknown, body: { restaurantId?: unknown; been?: unknown }) {
  const room = await loadRoom(code);
  const me = await requireParticipant(code, pid);
  const rid = String(body.restaurantId ?? "");
  if (!room.restaurants.some((r) => r.id === rid)) throw new ApiError(400, "Unknown restaurant.");
  if (body.been) {
    await getStore().upsertVote({ roomCode: code, round: BEEN_ROUND, participantId: me.id, restaurantId: rid, liked: true, createdAt: Date.now() });
  } else {
    await getStore().deleteVote(code, BEEN_ROUND, me.id, rid);
  }
}

/**
 * Meet-in-the-middle: each friend's last shared location, stored as a row in round -1 with
 * restaurant_id "loc:<lat>,<lng>" (again, no schema change). Coordinates never leave the server.
 */
const LOCATION_ROUND = -1;
async function sharedLocations(code: string): Promise<Map<string, { lat: number; lng: number }>> {
  const [rows, ps] = await Promise.all([getStore().listVotes(code, LOCATION_ROUND), getStore().listParticipants(code)]);
  const here = new Set(ps.filter((p) => !p.left).map((p) => p.id));
  const out = new Map<string, { lat: number; lng: number }>();
  for (const v of rows) {
    const m = /^loc:(-?[\d.]+),(-?[\d.]+)$/.exec(v.restaurantId);
    if (m && here.has(v.participantId)) out.set(v.participantId, { lat: Number(m[1]), lng: Number(m[2]) });
  }
  return out;
}

export async function shareLocation(code: string, pid: unknown, body: { lat?: unknown; lng?: unknown }) {
  await loadRoom(code);
  const me = await requireParticipant(code, pid);
  const store = getStore();
  const old = (await store.listVotes(code, LOCATION_ROUND)).filter((v) => v.participantId === me.id);
  for (const v of old) await store.deleteVote(code, LOCATION_ROUND, me.id, v.restaurantId);
  if (body.lat == null) return; // stop sharing
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new ApiError(400, "That location doesn't look right.");
  }
  // ~100 m precision is plenty for picking a neighborhood, and kinder to privacy.
  await store.upsertVote({
    roomCode: code,
    round: LOCATION_ROUND,
    participantId: me.id,
    restaurantId: `loc:${lat.toFixed(3)},${lng.toFixed(3)}`,
    liked: true,
    createdAt: Date.now(),
  });
}

/** Dietary needs per friend: rows in round -2 with restaurant_id "diet:<key>". */
const DIET_ROUND = -2;
async function dietsByParticipant(code: string): Promise<Map<string, string[]>> {
  const rows = await getStore().listVotes(code, DIET_ROUND);
  const out = new Map<string, string[]>();
  for (const v of rows) {
    if (!v.restaurantId.startsWith("diet:")) continue;
    const list = out.get(v.participantId) ?? [];
    list.push(v.restaurantId.slice(5));
    out.set(v.participantId, list);
  }
  return out;
}

export async function setDiet(code: string, pid: unknown, body: { needs?: unknown }) {
  await loadRoom(code);
  const me = await requireParticipant(code, pid);
  const wanted = new Set(Array.isArray(body.needs) ? body.needs.filter((n): n is string => DIET_KEYS.includes(n as never)) : []);
  const store = getStore();
  const current = (await store.listVotes(code, DIET_ROUND)).filter((v) => v.participantId === me.id);
  for (const v of current) if (!wanted.has(v.restaurantId.slice(5))) await store.deleteVote(code, DIET_ROUND, me.id, v.restaurantId);
  const have = new Set(current.map((v) => v.restaurantId.slice(5)));
  for (const n of wanted) {
    if (!have.has(n)) await store.upsertVote({ roomCode: code, round: DIET_ROUND, participantId: me.id, restaurantId: `diet:${n}`, liked: true, createdAt: Date.now() });
  }
}

export async function finishSwiping(code: string, pid: unknown, round: unknown) {
  const room = await loadRoom(code);
  const me = await requireParticipant(code, pid);
  if (room.round !== round) return;
  await getStore().patchParticipant(code, me.id, { finishedRound: room.round, lastSeen: Date.now() });
}

export async function selectRestaurant(code: string, pid: unknown, restaurantId: unknown) {
  const room = await requireHost(code, pid);
  if (room.state !== "results" && room.state !== "decided") throw new ApiError(409, "Results aren't in yet.");
  const r = room.restaurants.find((x) => x.id === restaurantId);
  if (!r) throw new ApiError(400, "Unknown restaurant.");
  await getStore().updateRoom(code, { state: "decided", selectedId: r.id });
}

export async function reopenResults(code: string, pid: unknown) {
  const room = await requireHost(code, pid);
  if (room.state !== "decided") return;
  await getStore().updateRoom(code, { state: "results", selectedId: null }, { state: "decided" });
}

// ---------------------------------------------------------------- snapshot

export async function getSnapshot(code: string, pid: string | null): Promise<Snapshot> {
  const store = getStore();
  const room = await loadRoom(code);
  const participants = await store.listParticipants(code);
  const now = Date.now();

  // Heartbeat (throttled so we don't write on every poll)
  const me = pid ? participants.find((p) => p.id === pid) ?? null : null;
  if (me && (now - me.lastSeen > 4000 || me.left)) {
    me.lastSeen = now;
    me.left = false;
    await store.patchParticipant(code, me.id, { lastSeen: now, left: false });
  }

  // Host hand-off if the host has left
  const hostId = resolveHost(room, participants, now);
  if (hostId !== room.hostId) {
    await store.updateRoom(code, { hostId });
    room.hostId = hostId;
  }

  // Lazy round end: timer expired, or everyone's done
  if (shouldEndRound(room, participants, now)) {
    await store.updateRoom(code, { state: "results" }, { state: "swiping", round: room.round });
    const fresh = await store.getRoom(code);
    if (fresh) Object.assign(room, fresh);
  }

  const inPlay = room.state === "swiping" || room.state === "results" || room.state === "decided";
  const votes = inPlay && room.round > 0 ? await store.listVotes(code, room.round) : [];
  const progress = new Map<string, number>();
  for (const v of votes) if (!isSpecialVote(v.restaurantId)) progress.set(v.participantId, (progress.get(v.participantId) ?? 0) + 1);

  const myVotes: Record<string, boolean> = {};
  let mySuper: string | null = null;
  let myVeto: string | null = null;
  if (me) {
    for (const v of votes) {
      if (v.participantId !== me.id) continue;
      if (v.restaurantId.startsWith(SUPER_PREFIX)) mySuper = v.restaurantId.slice(SUPER_PREFIX.length);
      else if (v.restaurantId.startsWith(VETO_PREFIX)) myVeto = v.restaurantId.slice(VETO_PREFIX.length);
      else myVotes[v.restaurantId] = v.liked;
    }
  }
  const located = room.state === "lobby" || room.state === "vibe" ? await sharedLocations(code) : new Map();
  const diets = await dietsByParticipant(code);

  const beenVotes = inPlay ? await store.listVotes(code, BEEN_ROUND) : [];
  const myBeen = me ? beenVotes.filter((v) => v.participantId === me.id).map((v) => v.restaurantId) : [];
  const revealed = room.state === "results" || room.state === "decided";
  const been: Record<string, string[]> = {};
  if (revealed) {
    const nameOf = new Map(participants.map((p) => [p.id, p.name]));
    for (const v of beenVotes) {
      const n = nameOf.get(v.participantId);
      if (n) (been[v.restaurantId] ??= []).push(n);
    }
  }

  return {
    serverNow: now,
    code: room.code,
    state: room.state,
    round: room.round,
    hostId: room.hostId,
    filters: room.filters,
    participants: participants
      .filter((p) => !p.left)
      .map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.id === room.hostId,
        active: isActive(p, now),
        finished: room.state === "swiping" && p.finishedRound >= room.round && room.round > 0,
        progress: room.state === "swiping" ? progress.get(p.id) ?? 0 : 0,
        inRound: room.roundParticipantIds.includes(p.id),
        sharedLocation: located.has(p.id),
        diet: diets.get(p.id) ?? [],
      })),
    restaurants: inPlay ? room.restaurants : [],
    startsAt: room.startsAt,
    endsAt: room.endsAt,
    myVotes,
    mySuper,
    myVeto,
    myBeen,
    been,
    // Never expose individual votes — only aggregates, and only after the round.
    results: room.state === "results" || room.state === "decided" ? computeResults(room.restaurants, votes, room.round) : null,
    selectedId: room.selectedId,
    dataSource: room.dataSource,
    notice: room.notice,
    me: me ? { id: me.id, name: me.name } : null,
  };
}
