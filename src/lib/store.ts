// Server-only persistence. Supabase (Postgres via PostgREST) when configured, otherwise
// process memory. The service-role key is only ever read on the server.
import "server-only";
import type { Participant, Room, RoomState, Vote } from "./types.ts";

export interface Store {
  kind: "supabase" | "memory";
  createRoom(room: Room): Promise<boolean>;
  getRoom(code: string): Promise<Room | null>;
  /** Returns false if `where` didn't match (someone else changed the room first). */
  updateRoom(code: string, patch: Partial<Room>, where?: { state?: RoomState; round?: number }): Promise<boolean>;
  listParticipants(code: string): Promise<Participant[]>;
  upsertParticipant(p: Participant): Promise<void>;
  patchParticipant(code: string, id: string, patch: Partial<Participant>): Promise<void>;
  upsertVote(v: Vote): Promise<void>;
  deleteVote(code: string, round: number, participantId: string, restaurantId: string): Promise<void>;
  listVotes(code: string, round: number): Promise<Vote[]>;
  /** null when healthy, otherwise a human-readable setup problem */
  health(): Promise<string | null>;
}

// ---------------------------------------------------------------- memory

interface MemDB {
  rooms: Map<string, Room>;
  participants: Map<string, Participant[]>;
  votes: Map<string, Vote[]>;
}

const g = globalThis as unknown as { __dinnerClubDB?: MemDB };

function memoryStore(): Store {
  const db: MemDB = (g.__dinnerClubDB ??= { rooms: new Map(), participants: new Map(), votes: new Map() });
  const clone = <T>(x: T): T => structuredClone(x);
  // Drop rooms older than 24h so a long-running dev server doesn't grow forever.
  const sweep = () => {
    const cutoff = Date.now() - 24 * 3600_000;
    for (const [code, r] of db.rooms) {
      if (r.updatedAt < cutoff) {
        db.rooms.delete(code);
        db.participants.delete(code);
        db.votes.delete(code);
      }
    }
  };
  return {
    kind: "memory",
    async createRoom(room) {
      sweep();
      if (db.rooms.has(room.code)) return false;
      db.rooms.set(room.code, clone(room));
      db.participants.set(room.code, []);
      db.votes.set(room.code, []);
      return true;
    },
    async getRoom(code) {
      const r = db.rooms.get(code);
      return r ? clone(r) : null;
    },
    async updateRoom(code, patch, where) {
      const r = db.rooms.get(code);
      if (!r) return false;
      if (where?.state !== undefined && r.state !== where.state) return false;
      if (where?.round !== undefined && r.round !== where.round) return false;
      Object.assign(r, clone(patch), { updatedAt: Date.now() });
      return true;
    },
    async listParticipants(code) {
      return clone(db.participants.get(code) ?? []);
    },
    async upsertParticipant(p) {
      const list = db.participants.get(p.roomCode) ?? [];
      const i = list.findIndex((x) => x.id === p.id);
      if (i >= 0) list[i] = clone(p);
      else list.push(clone(p));
      db.participants.set(p.roomCode, list);
    },
    async patchParticipant(code, id, patch) {
      const p = db.participants.get(code)?.find((x) => x.id === id);
      if (p) Object.assign(p, clone(patch));
    },
    async upsertVote(v) {
      const list = db.votes.get(v.roomCode) ?? [];
      const i = list.findIndex(
        (x) => x.round === v.round && x.participantId === v.participantId && x.restaurantId === v.restaurantId,
      );
      if (i >= 0) list[i] = clone(v);
      else list.push(clone(v));
      db.votes.set(v.roomCode, list);
    },
    async deleteVote(code, round, participantId, restaurantId) {
      const list = db.votes.get(code) ?? [];
      db.votes.set(
        code,
        list.filter((x) => !(x.round === round && x.participantId === participantId && x.restaurantId === restaurantId)),
      );
    },
    async listVotes(code, round) {
      return clone((db.votes.get(code) ?? []).filter((v) => v.round === round));
    },
    async health() {
      return null;
    },
  };
}

// ---------------------------------------------------------------- supabase

const ROOM_COLS: Record<keyof Room, string> = {
  code: "code",
  hostId: "host_id",
  state: "state",
  round: "round",
  filters: "filters",
  restaurants: "restaurants",
  seenIds: "seen_ids",
  roundParticipantIds: "round_participant_ids",
  startsAt: "starts_at",
  endsAt: "ends_at",
  selectedId: "selected_id",
  dataSource: "data_source",
  notice: "notice",
  createdAt: "created_at",
  updatedAt: "updated_at",
};
const PART_COLS: Record<keyof Participant, string> = {
  id: "id",
  roomCode: "room_code",
  name: "name",
  joinedAt: "joined_at",
  lastSeen: "last_seen",
  finishedRound: "finished_round",
  left: "left_room",
};
const VOTE_COLS: Record<keyof Vote, string> = {
  roomCode: "room_code",
  round: "round",
  participantId: "participant_id",
  restaurantId: "restaurant_id",
  liked: "liked",
  createdAt: "created_at",
};

function toRow<T extends object>(obj: Partial<T>, cols: Record<keyof T, string>) {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const col = cols[k as keyof T];
    if (col && v !== undefined) row[col] = v;
  }
  return row;
}

function fromRow<T>(row: Record<string, unknown>, cols: Record<keyof T, string>): T {
  const obj: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(cols) as [string, string][]) {
    let v = row[col];
    // bigint columns come back as numbers from PostgREST; normalize null-ish
    if (v === undefined) v = null;
    obj[k] = v;
  }
  return obj as T;
}

function supabaseStore(url: string, key: string): Store {
  const base = url.replace(/\/$/, "") + "/rest/v1";
  async function req(path: string, init: RequestInit & { prefer?: string } = {}) {
    const res = await fetch(base + path, {
      ...init,
      headers: {
        apikey: key,
        // Legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys go in apikey only.
        ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
        "Content-Type": "application/json",
        ...(init.prefer ? { Prefer: init.prefer } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Supabase ${res.status} ${path.split("?")[0]}: ${text.slice(0, 300)}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  const enc = encodeURIComponent;
  return {
    kind: "supabase",
    async createRoom(room) {
      try {
        await req("/dc_rooms", { method: "POST", body: JSON.stringify(toRow(room, ROOM_COLS)), prefer: "return=minimal" });
        return true;
      } catch (e) {
        if ((e as { status?: number }).status === 409) return false;
        throw e;
      }
    },
    async getRoom(code) {
      const rows = await req(`/dc_rooms?code=eq.${enc(code)}&select=*`);
      return rows?.[0] ? fromRow<Room>(rows[0], ROOM_COLS) : null;
    },
    async updateRoom(code, patch, where) {
      let q = `/dc_rooms?code=eq.${enc(code)}`;
      if (where?.state !== undefined) q += `&state=eq.${enc(where.state)}`;
      if (where?.round !== undefined) q += `&round=eq.${where.round}`;
      const rows = await req(q, {
        method: "PATCH",
        body: JSON.stringify(toRow({ ...patch, updatedAt: Date.now() }, ROOM_COLS)),
        prefer: "return=representation",
      });
      return Array.isArray(rows) && rows.length > 0;
    },
    async listParticipants(code) {
      const rows = await req(`/dc_participants?room_code=eq.${enc(code)}&select=*&order=joined_at.asc`);
      return (rows ?? []).map((r: Record<string, unknown>) => fromRow<Participant>(r, PART_COLS));
    },
    async upsertParticipant(p) {
      await req("/dc_participants?on_conflict=room_code,id", {
        method: "POST",
        body: JSON.stringify(toRow(p, PART_COLS)),
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    },
    async patchParticipant(code, id, patch) {
      await req(`/dc_participants?room_code=eq.${enc(code)}&id=eq.${enc(id)}`, {
        method: "PATCH",
        body: JSON.stringify(toRow(patch, PART_COLS)),
        prefer: "return=minimal",
      });
    },
    async upsertVote(v) {
      await req("/dc_votes?on_conflict=room_code,round,participant_id,restaurant_id", {
        method: "POST",
        body: JSON.stringify(toRow(v, VOTE_COLS)),
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    },
    async deleteVote(code, round, participantId, restaurantId) {
      await req(
        `/dc_votes?room_code=eq.${enc(code)}&round=eq.${round}&participant_id=eq.${enc(participantId)}&restaurant_id=eq.${enc(restaurantId)}`,
        { method: "DELETE", prefer: "return=minimal" },
      );
    },
    async listVotes(code, round) {
      const rows = await req(`/dc_votes?room_code=eq.${enc(code)}&round=eq.${round}&select=*`);
      return (rows ?? []).map((r: Record<string, unknown>) => fromRow<Vote>(r, VOTE_COLS));
    },
    async health() {
      try {
        await req("/dc_rooms?select=code&limit=1");
        await req("/dc_votes?select=round&limit=1");
        return null;
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 404 || /does not exist|schema cache/i.test(String(e)))
          return "Supabase is connected, but the tables are missing. Run supabase/schema.sql in the Supabase SQL Editor.";
        if (status === 401 || status === 403) return "Supabase rejected the key. Check SUPABASE_SERVICE_ROLE_KEY (use the service_role / secret key).";
        return "Can't reach Supabase. Check SUPABASE_URL.";
      }
    },
  };
}

// ---------------------------------------------------------------- pick

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? supabaseStore(url, key) : memoryStore();
  return cached;
}

/** True when rooms can't be shared across serverless instances (memory store on Vercel etc.). */
export function storeIsEphemeral(): boolean {
  return getStore().kind === "memory" && !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}
