import assert from "node:assert/strict";
import { test } from "node:test";
import { computeResults, diversify, resolveHost, shouldEndRound, shuffledFor, VOTE_GRACE_MS } from "../src/lib/logic.ts";
import type { Participant, Restaurant, Room, Vote } from "../src/lib/types.ts";

function rest(id: string, rating: number | null = 4.5, reviewCount: number | null = 100, cuisine = "Sushi"): Restaurant {
  return {
    id, name: id, cuisine, rating, reviewCount, priceLevel: 2, priceText: null, lat: 0, lng: 0, distanceMi: 1,
    neighborhood: null, address: null, description: "", photoUrl: null, photoAttribution: null, openNow: null,
    website: null, mapsUrl: "", reservationUrl: null, source: "demo",
  };
}
function vote(p: string, r: string, liked: boolean, round = 1): Vote {
  return { roomCode: "x", round, participantId: p, restaurantId: r, liked, createdAt: 0 };
}
function person(id: string, over: Partial<Participant> = {}): Participant {
  return { id, roomCode: "x", name: id, joinedAt: 0, lastSeen: 1_000_000, finishedRound: 0, left: false, ...over };
}
function room(over: Partial<Room> = {}): Room {
  return {
    code: "x", hostId: "a", state: "swiping", round: 1, filters: null, restaurants: [], seenIds: [],
    roundParticipantIds: ["a", "b", "c", "d"], startsAt: 0, endsAt: 1_060_000, selectedId: null,
    dataSource: "demo", notice: null, createdAt: 0, updatedAt: 0, ...over,
  };
}

test("unanimous match ranks first with 100%", () => {
  const rs = [rest("kazunori", 4.6), rest("bavel", 4.7), rest("sugarfish", 4.8)];
  const votes = [
    ...["a", "b", "c", "d"].map((p) => vote(p, "kazunori", true)),
    vote("a", "bavel", true), vote("b", "bavel", true), vote("c", "bavel", true), vote("d", "bavel", false),
    vote("a", "sugarfish", true), vote("b", "sugarfish", false), vote("c", "sugarfish", true), vote("d", "sugarfish", true),
  ];
  const res = computeResults(rs, votes, 1);
  assert.equal(res.voters, 4);
  assert.equal(res.ranked[0].restaurant.id, "kazunori");
  assert.equal(res.ranked[0].yes, 4);
  assert.equal(res.ranked[0].matchPct, 100);
  assert.equal(res.hasMajority, true);
  // Bavel & Sugarfish tie at 3 yes → higher Google rating (Sugarfish 4.8) wins
  assert.deepEqual(res.ranked.slice(1).map((r) => r.restaurant.id), ["sugarfish", "bavel"]);
  assert.equal(res.ranked[1].matchPct, 75);
});

test("ties on yes and rating fall back to review count", () => {
  const rs = [rest("a1", 4.5, 50), rest("a2", 4.5, 900)];
  const res = computeResults(rs, [vote("a", "a1", true), vote("a", "a2", true)], 1);
  assert.deepEqual(res.ranked.map((r) => r.restaurant.id), ["a2", "a1"]);
});

test("missing votes are not counted as no", () => {
  const rs = [rest("r1")];
  // d never got to r1
  const votes = [vote("a", "r1", true), vote("b", "r1", true), vote("c", "r1", false), vote("d", "other", true)];
  const res = computeResults(rs, votes, 1);
  assert.equal(res.voters, 4);
  assert.equal(res.ranked[0].votes, 3);
  assert.equal(res.ranked[0].yes, 2);
  assert.equal(res.ranked[0].matchPct, 67);
});

test("no majority is detected", () => {
  const rs = [rest("r1"), rest("r2")];
  const votes = [vote("a", "r1", true), vote("b", "r1", false), vote("c", "r2", true), vote("d", "r2", false), vote("a", "r2", false), vote("b", "r2", false)];
  const res = computeResults(rs, votes, 1);
  assert.equal(res.hasMajority, false);
});

test("votes from other rounds are ignored", () => {
  const res = computeResults([rest("r1")], [vote("a", "r1", true, 1), vote("b", "r1", true, 2)], 2);
  assert.equal(res.voters, 1);
  assert.equal(res.ranked[0].yes, 1);
});

test("empty votes → no voters, no majority", () => {
  const res = computeResults([rest("r1")], [], 1);
  assert.equal(res.voters, 0);
  assert.equal(res.hasMajority, false);
  assert.equal(res.ranked[0].matchPct, null);
});

test("round ends when timer passes (with grace)", () => {
  const r = room();
  const ps = ["a", "b", "c", "d"].map((id) => person(id));
  assert.equal(shouldEndRound(r, ps, r.endsAt! + 100), false);
  assert.equal(shouldEndRound(r, ps, r.endsAt! + VOTE_GRACE_MS), true);
});

test("round ends early only when everyone finished", () => {
  const r = room();
  const now = 1_010_000;
  const ps = ["a", "b", "c"].map((id) => person(id, { finishedRound: 1 }));
  assert.equal(shouldEndRound(r, [...ps, person("d")], now), false);
  assert.equal(shouldEndRound(r, [...ps, person("d", { finishedRound: 1 })], now), true);
});

test("someone who left (or went inactive) doesn't block early finish", () => {
  const r = room();
  const now = 1_010_000;
  const ps = ["a", "b", "c"].map((id) => person(id, { finishedRound: 1, lastSeen: now }));
  assert.equal(shouldEndRound(r, [...ps, person("d", { left: true })], now), true);
  assert.equal(shouldEndRound(r, [...ps, person("d", { lastSeen: now - 60_000 })], now), true);
  // but nobody finishing never ends it early
  assert.equal(shouldEndRound(r, ["a", "b"].map((id) => person(id, { lastSeen: 0 })), now), false);
});

test("shuffle is deterministic per seed and keeps the same items", () => {
  const items = Array.from({ length: 12 }, (_, i) => i);
  const a = shuffledFor(items, "p1:1");
  assert.deepEqual(shuffledFor(items, "p1:1"), a);
  assert.deepEqual([...a].sort((x, y) => x - y), items);
  assert.notDeepEqual(shuffledFor(items, "p2:1"), a);
});

test("host hands off when host leaves", () => {
  const r = room({ hostId: "a" });
  const now = 2_000_000;
  const ps = [person("a", { left: true, joinedAt: 0 }), person("b", { joinedAt: 1, lastSeen: now }), person("c", { joinedAt: 2, lastSeen: now })];
  assert.equal(resolveHost(r, ps, now), "b");
  ps[0].left = false;
  ps[0].lastSeen = now;
  assert.equal(resolveHost(r, ps, now), "a");
});

test("diversify round-robins across groups", () => {
  const rs = [rest("s1", 4, 1, "Sushi"), rest("s2", 4, 1, "Sushi"), rest("s3", 4, 1, "Sushi"), rest("t1", 4, 1, "Thai")];
  assert.deepEqual(diversify(rs, 3).map((r) => r.id), ["s1", "t1", "s2"]);
});
