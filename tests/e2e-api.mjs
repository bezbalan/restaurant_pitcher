// End-to-end multiplayer scenarios against a running server.
// Usage: BASE=http://localhost:3100 node tests/e2e-api.mjs
// Run the server with DINNER_ROUND_SECONDS=8 so the timer scenario finishes quickly.
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;

async function call(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const snap = (code, pid) => call(`/api/rooms/${code}${pid ? `?pid=${pid}` : ""}`).then((r) => r.data);
const act = (code, pid, action, extra = {}) => call(`/api/rooms/${code}`, { action, pid, ...extra });

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n`, e);
    process.exit(1);
  }
}

async function waitFor(fn, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(300);
  }
  throw new Error("timed out waiting");
}

async function setupFour() {
  const host = await call("/api/rooms", { name: "Bez" });
  assert.equal(host.status, 200);
  const code = host.data.code;
  const pids = { Bez: host.data.pid };
  for (const name of ["Ana", "Cole", "Dev"]) {
    const r = await act(code, null, "join", { name });
    assert.equal(r.status, 200);
    pids[name] = r.data.pid;
  }
  return { code, pids };
}

const FILTERS = {
  location: { mode: "neighborhood", neighborhood: "Culver City" },
  radius: 10,
  cuisines: ["Japanese", "Mexican", "Thai"],
  budget: [],
  openNow: false,
  highlyRated: false,
  casual: false,
  dateNight: false,
  outdoor: false,
};

console.log(`Bite Club E2E against ${BASE}`);

await step("unknown room → 404", async () => {
  const r = await call("/api/rooms/zzzzzz");
  assert.equal(r.status, 404);
});

const { code, pids } = await setupFour();
const everyone = Object.values(pids);

await step("four friends join one room; host sees them all", async () => {
  const s = await snap(code, pids.Bez);
  assert.equal(s.participants.length, 4);
  assert.deepEqual(s.participants.map((p) => p.name), ["Bez", "Ana", "Cole", "Dev"]);
  assert.equal(s.hostId, pids.Bez);
  assert.equal(s.state, "lobby");
});

await step("rejoining with the same id (refresh) doesn't duplicate", async () => {
  const r = await act(code, pids.Ana, "join", { name: "Ana" });
  assert.equal(r.data.pid, pids.Ana);
  assert.equal((await snap(code)).participants.length, 4);
});

await step("only the host can start", async () => {
  const r = await act(code, pids.Ana, "vibe");
  assert.equal(r.status, 403);
  assert.equal((await act(code, pids.Bez, "vibe")).status, 200);
  const r2 = await act(code, pids.Cole, "start", { filters: FILTERS });
  assert.equal(r2.status, 403);
});

let restaurants;
await step("host starts round; everyone sees the same restaurants", async () => {
  const r = await act(code, pids.Bez, "start", { filters: FILTERS });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.state, "swiping");
  const sets = await Promise.all(everyone.map((p) => snap(code, p)));
  const ids = sets.map((s) => s.restaurants.map((x) => x.id).sort().join(","));
  assert.ok(new Set(ids).size === 1, "all identical");
  restaurants = sets[0].restaurants;
  assert.ok(restaurants.length >= 6 && restaurants.length <= 12, `deck size ${restaurants.length}`);
  console.log(`    (${restaurants.length} restaurants, source=${sets[0].dataSource})`);
});

await step("double-tap start doesn't create a second round", async () => {
  const r = await act(code, pids.Bez, "start", { filters: FILTERS });
  assert.equal(r.data.round, 1);
});

await step("votes are rejected during the 3-2-1 countdown", async () => {
  const early = await act(code, pids.Bez, "vote", { round: 1, restaurantId: restaurants[0].id, liked: true });
  assert.equal(early.status, 409);
  // Wait out the countdown so we vote during the live round.
  const s = await snap(code, pids.Bez);
  await sleep(Math.max(0, s.startsAt - s.serverNow) + 100);
});

const [unanimous, second, third] = restaurants.map((r) => r.id);
await step("each friend votes independently; votes sync", async () => {
  // Everyone loves #0. #1 gets 3 yes. #2 gets 3 yes. Dev only votes on the first 3 and doesn't finish.
  const plan = {
    Bez: (id) => true,
    Ana: (id) => id !== third,
    Cole: (id) => id !== second,
    Dev: (id) => true,
  };
  await Promise.all(
    Object.entries(pids).map(async ([name, pid]) => {
      const list = name === "Dev" ? [unanimous, second, third] : restaurants.map((r) => r.id);
      for (const id of list) {
        const r = await act(code, pid, "vote", { round: 1, restaurantId: id, liked: plan[name](id) || id === unanimous });
        assert.equal(r.status, 200, JSON.stringify(r.data));
      }
    }),
  );
  const s = await snap(code, pids.Ana);
  const ana = s.participants.find((p) => p.name === "Ana");
  assert.equal(ana.progress, restaurants.length);
  assert.equal(s.participants.find((p) => p.name === "Dev").progress, 3);
});

await step("individual votes are never exposed during the round", async () => {
  const s = await snap(code, pids.Ana);
  assert.equal(s.results, null);
  assert.equal(Object.keys(s.myVotes).length, restaurants.length); // only Ana's own
  const raw = JSON.stringify(s);
  assert.ok(!raw.includes('"liked"'), "no vote records in snapshot");
});

await step("browser refresh restores my votes", async () => {
  const s = await snap(code, pids.Dev);
  assert.equal(Object.keys(s.myVotes).length, 3);
  assert.equal(s.myVotes[unanimous], true);
});

await step("round waits for an active friend who hasn't finished", async () => {
  for (const n of ["Bez", "Ana", "Cole"]) await act(code, pids[n], "finish", { round: 1 });
  await snap(code, pids.Dev); // Dev is still here (heartbeat)
  const s = await snap(code, pids.Bez);
  assert.equal(s.state, "swiping");
  assert.equal(s.participants.filter((p) => p.finished).length, 3);
});

await step("someone leaves midway → round ends with only submitted votes", async () => {
  await act(code, pids.Dev, "leave");
  const s = await waitFor(async () => {
    const x = await snap(code, pids.Bez);
    return x.state === "results" ? x : null;
  });
  const top = s.results.ranked[0];
  assert.equal(top.restaurant.id, unanimous);
  assert.equal(top.yes, 4);
  assert.equal(top.matchPct, 100);
  assert.equal(s.results.voters, 4);
  assert.equal(s.results.hasMajority, true);
  // #2/#3 each have 3 yes of 4; tie broken by rating then reviews
  const [a, b] = s.results.ranked.slice(1, 3);
  assert.equal(a.yes, 3);
  assert.equal(b.yes, 3);
  assert.ok((a.restaurant.rating ?? -1) >= (b.restaurant.rating ?? -1));
  // Dev didn't vote on the 4th restaurant → its votes count is 3, not 4
  const fourth = s.results.ranked.find((r) => r.restaurant.id === restaurants[3].id);
  assert.equal(fourth.votes, 3);
});

await step("late votes after the round are rejected", async () => {
  const r = await act(code, pids.Ana, "vote", { round: 1, restaurantId: unanimous, liked: false });
  assert.equal(r.status, 409);
});

await step("only the host selects; everyone sees the decision", async () => {
  assert.equal((await act(code, pids.Ana, "select", { restaurantId: unanimous })).status, 403);
  assert.equal((await act(code, pids.Bez, "select", { restaurantId: unanimous })).status, 200);
  const s = await snap(code, pids.Cole);
  assert.equal(s.state, "decided");
  assert.equal(s.selectedId, unanimous);
  const outsider = await snap(code); // shareable results link, no participant id
  assert.equal(outsider.state, "decided");
  assert.equal(outsider.me, null);
});

await step("host can reopen and run a fresh round with brand-new restaurants", async () => {
  await act(code, pids.Bez, "reopen");
  const r = await act(code, pids.Bez, "rematch");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.round, 2);
  const overlap = r.data.restaurants.filter((x) => restaurants.some((y) => y.id === x.id));
  assert.equal(overlap.length, 0);
});

await step("timer expiry ends the round; partial voters count", async () => {
  const s0 = await snap(code, pids.Bez);
  await sleep(Math.max(0, s0.startsAt - s0.serverNow) + 100);
  const r2 = s0.restaurants;
  await act(code, pids.Bez, "vote", { round: 2, restaurantId: r2[0].id, liked: true });
  await act(code, pids.Ana, "vote", { round: 2, restaurantId: r2[0].id, liked: false });
  const s = await waitFor(async () => {
    const x = await snap(code, pids.Bez);
    return x.state === "results" ? x : null;
  }, 120_000);
  assert.ok(s.serverNow >= s.endsAt, "ended by timer");
  assert.equal(s.results.voters, 2);
  assert.equal(s.results.ranked[0].yes, 1);
  assert.equal(s.results.hasMajority, false); // 1 of 2 isn't a majority → suggest another round
});

await step("late joiner during swiping joins the round", async () => {
  const h = await call("/api/rooms", { name: "Host" });
  const c = h.data.code;
  await act(c, h.data.pid, "vibe");
  await act(c, h.data.pid, "start", { filters: FILTERS });
  const j = await act(c, null, "join", { name: "Late" });
  const s = await snap(c, j.data.pid);
  assert.equal(s.state, "swiping");
  assert.ok(s.participants.find((p) => p.name === "Late").inRound);
});

await step("host leaving hands host role to the next friend", async () => {
  const h = await call("/api/rooms", { name: "H" });
  const c = h.data.code;
  const g = await act(c, null, "join", { name: "G" });
  await act(c, h.data.pid, "leave");
  const s = await snap(c, g.data.pid);
  assert.equal(s.hostId, g.data.pid);
});

await step("no 8-friend cap: 12 friends can join one table", async () => {
  const h = await call("/api/rooms", { name: "H" });
  for (let i = 0; i < 11; i++) assert.equal((await act(h.data.code, null, "join", { name: `F${i}` })).status, 200);
  assert.equal((await snap(h.data.code)).participants.length, 12);
});

await step("undo brings a card back and un-finishes me", async () => {
  const h = await call("/api/rooms", { name: "U" });
  const c = h.data.code, p = h.data.pid;
  await act(c, p, "vibe");
  await act(c, p, "start", { filters: FILTERS });
  let s = await snap(c, p);
  await sleep(Math.max(0, s.startsAt - s.serverNow) + 100);
  const rid = s.restaurants[0].id;
  await act(c, p, "vote", { round: 1, restaurantId: rid, liked: true });
  assert.equal((await snap(c, p)).myVotes[rid], true);
  assert.equal((await act(c, p, "undo", { round: 1, restaurantId: rid })).status, 200);
  assert.equal(rid in (await snap(c, p)).myVotes, false);
});

await step("'been here' is private during the round, revealed with results", async () => {
  const h = await call("/api/rooms", { name: "Bea" });
  const c = h.data.code;
  const g = await act(c, null, "join", { name: "Gus" });
  await act(c, h.data.pid, "vibe");
  await act(c, h.data.pid, "start", { filters: FILTERS });
  let s = await snap(c, h.data.pid);
  const rid = s.restaurants[0].id;
  assert.equal((await act(c, h.data.pid, "been", { restaurantId: rid, been: true })).status, 200);
  assert.deepEqual((await snap(c, h.data.pid)).myBeen, [rid]);
  assert.deepEqual((await snap(c, g.data.pid)).been, {}, "not revealed mid-round");
  await sleep(Math.max(0, s.startsAt - s.serverNow) + 100);
  for (const pp of [h.data.pid, g.data.pid]) {
    await act(c, pp, "vote", { round: 1, restaurantId: rid, liked: true });
    await act(c, pp, "finish", { round: 1 });
  }
  s = await waitFor(async () => {
    const x = await snap(c, g.data.pid);
    return x.state === "results" ? x : null;
  });
  assert.deepEqual(s.been[rid], ["Bea"]);
  assert.equal(s.results.voters, 2, "been-marks never count as votes");
});

await step("super-like counts double, veto knocks a spot out, one of each per person", async () => {
  const h = await call("/api/rooms", { name: "Sam" });
  const c = h.data.code, a = h.data.pid;
  const b = (await act(c, null, "join", { name: "Vic" })).data.pid;
  await act(c, a, "vibe");
  await act(c, a, "start", { filters: FILTERS });
  let s = await snap(c, a);
  await sleep(Math.max(0, s.startsAt - s.serverNow) + 100);
  const [r0, r1, r2] = s.restaurants.map((x) => x.id);
  // Both like r0 and r1; Sam super-likes r1 → r1 ranks above r0. Vic vetoes r2 (which Sam liked).
  await act(c, a, "vote", { round: 1, restaurantId: r0, liked: true });
  await act(c, a, "vote", { round: 1, restaurantId: r1, special: "super" });
  await act(c, a, "vote", { round: 1, restaurantId: r2, liked: true });
  await act(c, b, "vote", { round: 1, restaurantId: r0, liked: true });
  await act(c, b, "vote", { round: 1, restaurantId: r1, liked: true });
  await act(c, b, "vote", { round: 1, restaurantId: r2, special: "veto" });
  // Trying a second super-like moves it rather than adding another
  await act(c, a, "vote", { round: 1, restaurantId: r0, special: "super" });
  await act(c, a, "vote", { round: 1, restaurantId: r1, special: "super" });
  s = await snap(c, a);
  assert.equal(s.mySuper, r1);
  assert.equal(Object.keys(s.myVotes).length, 3, "special rows aren't counted as extra cards");
  assert.equal(s.participants.find((p) => p.name === "Sam").progress, 3);
  for (const p of [a, b]) await act(c, p, "finish", { round: 1 });
  s = await waitFor(async () => {
    const x = await snap(c, a);
    return x.state === "results" ? x : null;
  });
  const ranked = s.results.ranked;
  assert.equal(ranked[0].restaurant.id, r1);
  assert.equal(ranked[0].supers, 1);
  assert.equal(ranked[1].restaurant.id, r0);
  assert.equal(ranked.find((x) => x.restaurant.id === r2).vetoed, true);
  assert.equal(ranked.at(-1).restaurant.id, r2, "vetoed spot sinks to the bottom");
});

await step("meet in the middle: needs 2 sharers, searches around their midpoint, hides coordinates", async () => {
  const h = await call("/api/rooms", { name: "Mia" });
  const c = h.data.code, a = h.data.pid;
  const b = (await act(c, null, "join", { name: "Leo" })).data.pid;
  await act(c, a, "vibe");
  const MID = { ...FILTERS, location: { mode: "middle" }, radius: null, cuisines: [] };
  // Santa Monica + Silver Lake
  await act(c, a, "location", { lat: 34.0195, lng: -118.4912 });
  let r = await act(c, a, "start", { filters: MID });
  assert.equal(r.status, 422);
  assert.equal(r.data.code, "NEED_LOCATIONS");
  await act(c, b, "location", { lat: 34.0869, lng: -118.2702 });
  const s0 = await snap(c, b);
  assert.equal(s0.participants.filter((p) => p.sharedLocation).length, 2);
  assert.ok(!JSON.stringify(s0).includes("118.49"), "no raw coordinates in snapshots");
  r = await act(c, a, "start", { filters: MID });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const loc = r.data.filters.location;
  assert.equal(loc.mode, "middle");
  assert.ok(Math.abs(loc.lat - 34.0532) < 0.01 && Math.abs(loc.lng - -118.3807) < 0.01, `midpoint ${loc.lat},${loc.lng}`);
});

await step("dietary needs: each friend sets their own; shown to the table; invalid keys ignored", async () => {
  const h = await call("/api/rooms", { name: "Dee" });
  const c = h.data.code;
  const g = await act(c, null, "join", { name: "Pat" });
  assert.equal((await act(c, g.data.pid, "diet", { needs: ["vegan", "no_pork", "bogus"] })).status, 200);
  let s = await snap(c, h.data.pid);
  assert.deepEqual(s.participants.find((p) => p.name === "Pat").diet.sort(), ["no_pork", "vegan"]);
  await act(c, g.data.pid, "diet", { needs: ["vegan"] });
  s = await snap(c, h.data.pid);
  assert.deepEqual(s.participants.find((p) => p.name === "Pat").diet, ["vegan"]);
  await act(c, h.data.pid, "vibe");
  const r = await act(c, h.data.pid, "start", { filters: { ...FILTERS, cuisines: ["Vegan"] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.filters.dietNeeds, ["vegan"]);
  if (r.data.dataSource === "demo") {
    assert.ok(r.data.restaurants.some((x) => x.dietMatches?.some((m) => m.key === "vegan")), "vegan spots flagged");
  }
});

if (process.env.EXPECT_GOOGLE) {
  await step("Google details: photos, hours, tags, summary, review; closing-soon places dropped", async () => {
    const h = await call("/api/rooms", { name: "G" });
    const c = h.data.code;
    await act(c, h.data.pid, "vibe");
    const r = await act(c, h.data.pid, "start", { filters: { ...FILTERS, openNow: true, cuisines: [] } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.dataSource, "google");
    const rs = r.data.restaurants;
    assert.ok(rs.length >= 6);
    assert.ok(rs.every((x) => x.minutesToClose == null || x.minutesToClose >= 90), "no place closing within 90 min");
    const x = rs[0];
    assert.ok(x.photos.length >= 2 && x.photos[0].url.startsWith("/api/photo?ref="));
    assert.ok(x.closesAt && /AM|PM/.test(x.closesAt));
    assert.ok(x.tags.includes("Cocktails"));
    assert.ok(x.aiSummary);
    assert.ok(x.review && x.review.author === "Test Reviewer");
    assert.ok(x.phone);
    const photo = await fetch(BASE + x.photos[1].url, { redirect: "manual" });
    assert.equal(photo.status, 302);
  });

  await step("Google + diets: search adds 'vegan-friendly'; listed vs review-mentioned badges", async () => {
    const h = await call("/api/rooms", { name: "V" });
    const c = h.data.code;
    await act(c, h.data.pid, "diet", { needs: ["vegan"] });
    await act(c, h.data.pid, "vibe");
    const r = await act(c, h.data.pid, "start", { filters: { ...FILTERS, cuisines: ["Thai"] } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const calls = await (await fetch("http://localhost:3005/calls")).json();
    assert.ok(calls.queries.some((q) => q.startsWith("vegan-friendly")), JSON.stringify(calls.queries.slice(-3)));
    const by = Object.fromEntries(r.data.restaurants.map((x) => [x.id, x]));
    assert.equal(by.fake_2?.dietMatches?.[0]?.strength, "listed");
    assert.equal(by.fake_4?.dietMatches?.[0]?.strength, "mentioned");
  });
}

await step("impossible filters → friendly empty state, filters kept", async () => {
  const h = await call("/api/rooms", { name: "H" });
  const c = h.data.code;
  await act(c, h.data.pid, "vibe");
  // Exhaust the pool by repeated rounds, then expect NO_RESTAURANTS
  let last;
  for (let i = 0; i < 12; i++) {
    last = await act(c, h.data.pid, i === 0 ? "start" : "rematch", i === 0 ? { filters: { ...FILTERS, cuisines: ["Vietnamese"] } } : {});
    if (last.status !== 200) break;
    // end the round quickly
    await act(c, h.data.pid, "finish", { round: last.data.round });
    const s = await snap(c, h.data.pid);
    await sleep(Math.max(0, s.startsAt - s.serverNow) + 50);
    await act(c, h.data.pid, "vote", { round: s.round, restaurantId: s.restaurants[0].id, liked: true });
    await act(c, h.data.pid, "finish", { round: s.round });
    await waitFor(async () => (await snap(c, h.data.pid)).state === "results");
  }
  assert.equal(last.status, 422);
  assert.equal(last.data.code, "NO_RESTAURANTS");
});

console.log(`\n${passed} scenarios passed.`);
