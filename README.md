# Dinner Club 🍽️

**Four friends. One link. Sixty seconds of swiping. One restaurant everyone agrees on.**

A mobile-first web app for picking where to eat in Los Angeles. The host opens a table, friends join from a link (no sign-up), the host sets the vibe, everyone swipes the same 10–12 restaurants for 60 seconds, and the group's top matches are revealed.

Open → Join → Filter → Swipe → Match → Go Eat.

---

## Get it running for your friends (≈15 minutes, free)

You need three free accounts: **GitHub** (you already have this, since the code lives there), **Supabase** (the shared database that lets four phones see the same room), and **Vercel** (hosts the website). No credit card is needed for any of them.

### Step 1: Create the database (Supabase)

1. Go to **https://supabase.com** → **Start your project** → sign in with GitHub.
2. Click **New project**. Name it `dinner-club`, make up a database password (you won't need it again), pick the region closest to LA (**West US**), and click **Create new project**. Wait about a minute.
3. In the left sidebar, open **SQL Editor** → **New query**.
4. Open the file [`supabase/schema.sql`](supabase/schema.sql) in this repo, copy **everything**, paste it into the editor, and click **Run**. You should see "Success. No rows returned".
5. Now get two values you'll paste into Vercel in step 2:
   - Click **Project Settings** (gear icon) → **Data API** (or **API**). Copy the **Project URL**. It looks like `https://abcdefgh.supabase.co`.
   - Click **API Keys**. Copy the **secret** key (starts with `sb_secret_`) or, under "Legacy API keys", the **`service_role`** key. Either works. ⚠️ Keep it private: it only ever goes into Vercel, never into a chat or the code.

### Step 2: Put the website online (Vercel)

1. Go to **https://vercel.com** → **Sign up** → **Continue with GitHub**.
2. Click **Add New… → Project**, find **`restaurant_pitcher`** and click **Import**.
   (If you don't see it, click "Adjust GitHub App Permissions" and give Vercel access to that repo.)
3. Under **Branch**, make sure the deployed code includes this app. If it lives on a branch rather than `main`, merge it into `main` first, or pick that branch in Vercel.
4. Open **Environment Variables** and add two:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL from step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service_role key from step 1 |

5. Click **Deploy**. After about a minute you get a URL like `https://restaurant-pitcher.vercel.app`. 🎉

**Check it:** open the URL on your phone. If something isn't set up correctly, the home screen shows a red "Setup needed" note saying exactly what's wrong. If you change environment variables later, go to Vercel → **Deployments** → ⋯ → **Redeploy**.

### Step 3: Test it with your three friends

1. On your iPhone, open your Vercel URL and tap **Let's Eat**. Enter your first name → **Create our table**.
2. Tap **Share invite** and send it to your friends over iMessage or WhatsApp.
3. Each friend taps the link, types their first name and taps **Join the table**. You'll see them appear with a ✓.
4. When all four of you are in, tap **Find Our Dinner**, pick a neighborhood, cuisines and budget, then tap **Start the 60 seconds**.
5. Everyone swipes on their own phone: right (or ♥) for yes, left (or ✕) for no. Nobody sees anyone else's votes.
6. When everyone's done (or the timer runs out), you all see **We found your dinner!** with the top 3.
7. As host, tap **Let's Go Here** on the winner. Everyone's screen switches to **Dinner is decided!** with directions.

Tips:
- Want to try it alone first? Open the link in two browser tabs (or on your phone + laptop), or tap **"start solo to try it"** in the lobby.
- If no spot gets a majority, you get a one-tap **Fresh round** with all-new restaurants.
- Refreshing or briefly closing the app is fine. You rejoin right where you left off.

### Step 4 (optional): Real photos, ratings and live data from Google

Without a Google key the app runs in **Demo mode**: a list of real, well-known LA restaurants, clearly labeled "Demo data", with **no** ratings, photos or websites (we never invent those). To switch to live Google data:

1. Go to **https://console.cloud.google.com** → create a project → **APIs & Services → Library** → enable **Places API (New)**.
2. Set up billing (Google gives a monthly free usage allowance; a group of friends will barely touch it).
3. **APIs & Services → Credentials → Create credentials → API key**. Under restrictions, limit it to **Places API (New)**.
4. In Vercel → your project → **Settings → Environment Variables**, add `GOOGLE_PLACES_API_KEY` = your key, then **Redeploy**.

The key is only used on the server (photos go through `/api/photo`), so it never reaches anyone's phone. If Google ever fails, the app falls back to demo data and says so.

---

## Run it on your computer (for developers)

```bash
npm install
npm run dev            # http://localhost:3000
```

With no environment variables, rooms live in the server's memory. That works fine for local testing, including phones on the same Wi-Fi via `http://<your-computer-ip>:3000`, but it **doesn't work on Vercel**, because serverless instances don't share memory. That's why Supabase is required there, and the app refuses to create rooms on Vercel without it.

Copy `.env.example` to `.env.local` to add keys locally.

### Tests

```bash
npm test                                   # unit tests: ranking, ties, missing votes, timer, host hand-off
DINNER_ROUND_SECONDS=8 npm run build && DINNER_ROUND_SECONDS=8 npx next start -p 3100 &
BASE=http://localhost:3100 node tests/e2e-api.mjs   # 20 multiplayer scenarios with 4 simulated friends
```

`DINNER_ROUND_SECONDS` is a test-only override. Leave it unset in production, where the default is 60.

---

## How it works

| Piece | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router) + React 19 + Tailwind 4 + Motion | One deployable app, with API routes keeping keys server-side |
| Shared state | Supabase Postgres via its REST API (server-side only) | Free, no extra SDK, RLS on with zero public policies |
| Sync | Each phone polls one snapshot endpoint about once a second | Reliable on iOS Safari and any host, simple to reason about |
| Restaurants | Google Places API (New) Text Search, server-side | Real ratings, photos, hours, websites and Maps links |

**Fairness rules**
- The host's server request builds **one** shortlist, which is saved on the room. Every phone gets the **same** restaurants, in an order shuffled per person (stable across refreshes).
- Votes are stored per (room, round, person, restaurant) as upserts, so double taps or retries can't double-count.
- During the round, the server only reveals *how many* cards each person has swiped, never which way.
- The round ends when everyone finishes or 60s pass. Friends who've closed the app don't block an early finish.
- Ranking: ① number of ♥ ② Google rating ③ review count. Match % = yes ÷ votes that restaurant actually received, so a card someone didn't reach isn't counted as a no.
- "Majority" = the top spot got ♥ from more than half of the friends who voted. If no spot gets a majority, the app suggests a fresh round.
- If the host leaves, the host role passes to the next friend automatically.

**On each card:** up to 6 Google photos (tap the left/right side to flip), closing time ("Open till 11 PM"), rating, price, distance, Google's Gemini summary and up to 3 amenity tags. Tap **i** for hours, all photos, a recent review, phone and address. **Been here?** marks a place you've visited. It's remembered on your device and shown to the group with the results. **↺** undoes your last swipe.

**Super-like & veto:** each person gets one ★ super-like per round (counts as an extra heart) and one ⊘ veto (a hard no that knocks the spot out of the top picks). Both stay anonymous.

**Meet in the middle:** anyone can tap **📍 Share** in the lobby. The host then picks **Middle** on the vibe screen, and the search centers on the average of everyone's shared location. Coordinates are rounded to about 100 m, stay on the server and never reach other phones.

**"Open now"** means open for at least the next 90 minutes, using Google's `nextCloseTime`.

**Group size:** no practical limit (a sanity cap of 100 stops runaway rooms).

**Data honesty:** Price shows "Price unavailable" when Google doesn't provide one. "Book a Table" only appears when a real reservation URL exists (the Places API doesn't provide one, so in practice it's hidden). Google photo author attributions are shown on every photo.

## Project map

```
src/app/page.tsx              Home ("Where are we eating tonight?")
src/app/r/[code]/page.tsx     Room page (all room screens)
src/app/api/rooms/...         Create / join / vote / finish / select… (single action endpoint)
src/app/api/photo             Google photo proxy (hides the API key)
src/app/api/status            Setup health check
src/components/               Lobby, Vibe, Swipe, Results, Decided, UI kit
src/lib/logic.ts              Pure game rules (tested)
src/lib/rooms.ts              Room actions + snapshot
src/lib/places.ts             Google Places + demo fallback
src/lib/store.ts              Supabase / in-memory storage
supabase/schema.sql           Database tables
```
