// Server-only: builds the shared shortlist for a round.
import "server-only";
import { DEMO_RESTAURANTS } from "./demoData.ts";
import { DECK_MAX, DECK_MIN, diversify, haversineMi } from "./logic.ts";
import { LA_CENTER, NEIGHBORHOODS, findNeighborhood } from "./neighborhoods.ts";
import type { Cuisine, Filters, Restaurant } from "./types.ts";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

export function placesConfigured(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}

export interface Origin {
  lat: number;
  lng: number;
  label: string;
  approximate?: boolean;
}

export interface Shortlist {
  restaurants: Restaurant[];
  source: "google" | "demo";
  notice: string | null;
  origin: Origin;
}

// ---------------------------------------------------------------- origin

export async function resolveOrigin(filters: Filters): Promise<{ origin: Origin; notice: string | null }> {
  const loc = filters.location;
  if (loc.mode === "current" && isFiniteNum(loc.lat) && isFiniteNum(loc.lng)) {
    return { origin: { lat: loc.lat!, lng: loc.lng!, label: "your location" }, notice: null };
  }
  if (loc.mode === "neighborhood") {
    const n = NEIGHBORHOODS.find((x) => x.name === loc.neighborhood) ?? findNeighborhood(loc.neighborhood);
    if (n) return { origin: { lat: n.lat, lng: n.lng, label: n.name }, notice: null };
  }
  if (loc.mode === "address" && loc.address?.trim()) {
    const address = loc.address.trim();
    if (placesConfigured()) {
      try {
        const g = await geocode(address);
        if (g) return { origin: g, notice: null };
      } catch (e) {
        console.error("geocode failed", e);
      }
    }
    const n = findNeighborhood(address);
    if (n) return { origin: { lat: n.lat, lng: n.lng, label: n.name }, notice: null };
    return {
      origin: { ...LA_CENTER, label: "Los Angeles", approximate: true },
      notice: placesConfigured()
        ? "We couldn't find that address, so we searched all of LA."
        : "Address lookup needs a Google Places key — searching all of LA instead.",
    };
  }
  return { origin: { ...LA_CENTER, label: "Los Angeles" }, notice: null };
}

async function geocode(address: string): Promise<Origin | null> {
  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": "places.location,places.shortFormattedAddress",
    },
    body: JSON.stringify({
      textQuery: address,
      pageSize: 1,
      locationBias: { circle: { center: { latitude: LA_CENTER.lat, longitude: LA_CENTER.lng }, radius: 50000 } },
    }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const data = (await res.json()) as { places?: { location?: { latitude: number; longitude: number }; shortFormattedAddress?: string }[] };
  const p = data.places?.[0];
  if (!p?.location) return null;
  return { lat: p.location.latitude, lng: p.location.longitude, label: p.shortFormattedAddress || address };
}

// ---------------------------------------------------------------- shortlist

export async function buildShortlist(filters: Filters, excludeIds: string[]): Promise<Shortlist> {
  const { origin, notice: originNotice } = await resolveOrigin(filters);
  if (placesConfigured()) {
    try {
      const restaurants = await googleShortlist(filters, origin, new Set(excludeIds));
      return { restaurants, source: "google", notice: originNotice, origin };
    } catch (e) {
      console.error("Google Places failed, falling back to demo data:", e);
      const demo = demoShortlist(filters, origin, new Set(excludeIds));
      return {
        restaurants: demo.restaurants,
        source: "demo",
        notice: "Google Places is unavailable right now, so we're showing demo data.",
        origin,
      };
    }
  }
  const demo = demoShortlist(filters, origin, new Set(excludeIds));
  return {
    restaurants: demo.restaurants,
    source: "demo",
    notice: [originNotice, demo.relaxed].filter(Boolean).join(" ") || null,
    origin,
  };
}

// ---------------------------------------------------------------- demo

function demoShortlist(filters: Filters, origin: Origin, exclude: Set<string>): { restaurants: Restaurant[]; relaxed: string | null } {
  const all = DEMO_RESTAURANTS.map((d): Restaurant => {
    const id = "demo_" + d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return {
      id,
      name: d.name,
      cuisine: d.label,
      rating: null,
      reviewCount: null,
      priceLevel: d.priceLevel,
      priceText: null,
      lat: d.lat,
      lng: d.lng,
      distanceMi: round1(haversineMi(origin.lat, origin.lng, d.lat, d.lng)),
      neighborhood: d.neighborhood,
      address: null,
      description: d.description,
      photoUrl: null,
      photoAttribution: null,
      openNow: null,
      website: null,
      mapsUrl: mapsSearchUrl(`${d.name} ${d.neighborhood} Los Angeles`),
      reservationUrl: null,
      source: "demo",
    };
  });
  const byId = new Map(DEMO_RESTAURANTS.map((d) => ["demo_" + d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), d]));

  // Progressive relaxation: strict filters first, then loosen until we have enough cards.
  const attempts: { useRadius: boolean; useBudget: boolean; useTags: boolean; useCuisine: boolean }[] = [
    { useRadius: true, useBudget: true, useTags: true, useCuisine: true },
    { useRadius: true, useBudget: true, useTags: false, useCuisine: true },
    { useRadius: false, useBudget: true, useTags: false, useCuisine: true },
    { useRadius: false, useBudget: false, useTags: false, useCuisine: true },
    { useRadius: false, useBudget: false, useTags: false, useCuisine: false },
  ];
  const run = (a: (typeof attempts)[number]) =>
    all.filter((rest) => {
      if (exclude.has(rest.id)) return false;
      const d = byId.get(rest.id)!;
      if (a.useCuisine && filters.cuisines.length && !filters.cuisines.includes(d.cuisine)) return false;
      if (a.useBudget && filters.budget.length && !filters.budget.includes(d.priceLevel)) return false;
      if (a.useRadius && filters.radius != null && (rest.distanceMi ?? 0) > filters.radius + 1) return false;
      if (a.useTags) {
        if (filters.casual && !d.tags?.includes("casual")) return false;
        if (filters.dateNight && !d.tags?.includes("dateNight")) return false;
        if (filters.outdoor && !d.tags?.includes("outdoor")) return false;
      }
      return true;
    });
  let pool: Restaurant[] = [];
  let used = 0;
  for (let i = 0; i < attempts.length; i++) {
    const next = run(attempts[i]);
    // Never drop the cuisine choice if we still have a few matching spots — a smaller deck is fine.
    if (!attempts[i].useCuisine && pool.length >= 3) break;
    if (next.length > pool.length) {
      pool = next;
      used = i;
    }
    if (pool.length >= DECK_MIN) break;
  }
  let toppedUp = false;
  if (pool.length > 0 && pool.length < DECK_MIN && attempts[used].useCuisine && filters.cuisines.length) {
    const have = new Set(pool.map((x) => x.id));
    const extra = run(attempts[attempts.length - 1])
      .filter((x) => !have.has(x.id))
      .sort((x, y) => (x.distanceMi ?? 0) - (y.distanceMi ?? 0))
      .slice(0, 8 - pool.length);
    pool = pool.concat(extra);
    toppedUp = extra.length > 0;
  }
  const relaxed = toppedUp
    ? `Only a few ${filters.cuisines.join(" / ")} spots matched, so we added some nearby favorites.`
    : !attempts[used].useCuisine && filters.cuisines.length
    ? `We ran out of ${filters.cuisines.join(" / ")} spots, so we mixed in other cuisines.`
    : !attempts[used].useRadius && filters.radius != null
      ? `Slim pickings within ${filters.radius} mi, so we looked a little further.`
      : null;
  pool.sort((x, y) => (x.distanceMi ?? 0) - (y.distanceMi ?? 0));
  const groupOf = (x: Restaurant) => byId.get(x.id)!.cuisine;
  return { restaurants: diversify(pool, DECK_MAX, groupOf), relaxed };
}

// ---------------------------------------------------------------- google

const PRICE_ENUM: Record<number, string> = {
  1: "PRICE_LEVEL_INEXPENSIVE",
  2: "PRICE_LEVEL_MODERATE",
  3: "PRICE_LEVEL_EXPENSIVE",
  4: "PRICE_LEVEL_VERY_EXPENSIVE",
};
const PRICE_FROM_ENUM: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.shortFormattedAddress",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.priceRange",
  "places.primaryTypeDisplayName",
  "places.photos",
  "places.currentOpeningHours.openNow",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.editorialSummary",
  "places.outdoorSeating",
  "places.goodForGroups",
  "places.businessStatus",
].join(",");

interface GPlace {
  id: string;
  displayName?: { text: string };
  shortFormattedAddress?: string;
  formattedAddress?: string;
  addressComponents?: { longText: string; types: string[] }[];
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  priceRange?: { startPrice?: { units?: string }; endPrice?: { units?: string } };
  primaryTypeDisplayName?: { text: string };
  photos?: { name: string; authorAttributions?: { displayName: string; uri?: string }[] }[];
  currentOpeningHours?: { openNow?: boolean };
  websiteUri?: string;
  googleMapsUri?: string;
  editorialSummary?: { text: string };
  outdoorSeating?: boolean;
  goodForGroups?: boolean;
  businessStatus?: string;
}

async function searchText(body: Record<string, unknown>): Promise<GPlace[]> {
  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Places searchText ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { places?: GPlace[] };
  return data.places ?? [];
}

async function googleShortlist(filters: Filters, origin: Origin, exclude: Set<string>): Promise<Restaurant[]> {
  const radiusMi = filters.radius ?? 25;
  const radiusM = Math.min(50000, Math.round(radiusMi * 1609.34));
  const vibe = [filters.casual && "casual", filters.dateNight && "romantic date night", filters.outdoor && "outdoor seating"]
    .filter(Boolean)
    .join(" ");
  const cuisines: (Cuisine | null)[] = filters.cuisines.length ? filters.cuisines.slice(0, 5) : [null];
  const perQuery = cuisines.length === 1 ? 20 : Math.max(8, Math.ceil(30 / cuisines.length));

  const base = (cuisine: Cuisine | null, withPrice: boolean) => ({
    textQuery: `${vibe ? vibe + " " : ""}${cuisine ? cuisine + " " : ""}restaurants`,
    includedType: "restaurant",
    pageSize: Math.min(20, perQuery),
    locationBias: { circle: { center: { latitude: origin.lat, longitude: origin.lng }, radius: radiusM } },
    ...(filters.openNow ? { openNow: true } : {}),
    ...(filters.highlyRated ? { minRating: 4.4 } : {}),
    ...(withPrice && filters.budget.length ? { priceLevels: filters.budget.map((b) => PRICE_ENUM[b]) } : {}),
  });

  const run = async (withPrice: boolean) => {
    const settled = await Promise.allSettled(cuisines.map((c) => searchText(base(c, withPrice)).then((ps) => ps.map((p) => ({ p, c })))));
    const ok = settled.filter((s): s is PromiseFulfilledResult<{ p: GPlace; c: Cuisine | null }[]> => s.status === "fulfilled");
    if (ok.length === 0) throw (settled[0] as PromiseRejectedResult).reason;
    return ok.flatMap((s) => s.value);
  };

  let hits = await run(true);
  // Google omits places with unknown price when filtering by price. If that leaves us short,
  // search again without the price filter and keep only places with matching or unknown price.
  if (filters.budget.length && hits.length < DECK_MAX) {
    const more = await run(false).catch(() => []);
    hits = hits.concat(more.filter(({ p }) => !p.priceLevel || filters.budget.includes(PRICE_FROM_ENUM[p.priceLevel] ?? -1)));
  }

  const seen = new Set<string>();
  const candidates: { r: Restaurant; group: string; score: number }[] = [];
  for (const { p, c } of hits) {
    if (!p.id || seen.has(p.id) || exclude.has(p.id) || !p.location || !p.displayName?.text) continue;
    if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
    seen.add(p.id);
    const r = toRestaurant(p, c, origin);
    if (filters.radius != null && r.distanceMi != null && r.distanceMi > filters.radius * 1.15) continue;
    if (filters.outdoor && p.outdoorSeating === false) continue;
    const reviews = r.reviewCount ?? 0;
    const score = (r.rating ?? 3.6) + Math.min(Math.log10(reviews + 1), 4) * 0.2 - (r.distanceMi ?? 0) * 0.04;
    candidates.push({ r, group: c ?? r.cuisine, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const groups = new Map(candidates.map((x) => [x.r.id, x.group]));
  return diversify(
    candidates.map((x) => x.r),
    DECK_MAX,
    (x) => groups.get(x.id) ?? x.cuisine,
  );
}

function toRestaurant(p: GPlace, queried: Cuisine | null, origin: Origin): Restaurant {
  const lat = p.location!.latitude;
  const lng = p.location!.longitude;
  const comp = (type: string) => p.addressComponents?.find((a) => a.types.includes(type))?.longText;
  const neighborhood = comp("neighborhood") ?? comp("sublocality") ?? comp("locality") ?? null;
  const typeLabel = p.primaryTypeDisplayName?.text?.replace(/\s*Restaurant$/i, "").trim();
  const cuisine = typeLabel && typeLabel.toLowerCase() !== "restaurant" ? typeLabel : queried ?? "Restaurant";
  const priceLevel = p.priceLevel ? PRICE_FROM_ENUM[p.priceLevel] ?? null : null;
  const start = p.priceRange?.startPrice?.units;
  const end = p.priceRange?.endPrice?.units;
  const priceText = start && end ? `$${start}–${end}` : start ? `$${start}+` : null;
  const photo = p.photos?.[0];
  const attribution = photo?.authorAttributions?.[0];

  // Short description: Google's editorial summary when present, otherwise facts we actually have.
  const facts = [
    `${cuisine}${neighborhood ? ` in ${neighborhood}` : ""}`,
    p.outdoorSeating ? "Outdoor seating" : null,
    p.goodForGroups ? "Good for groups" : null,
  ].filter(Boolean);
  return {
    id: p.id,
    name: p.displayName!.text,
    cuisine,
    rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? null,
    priceLevel,
    priceText,
    lat,
    lng,
    distanceMi: round1(haversineMi(origin.lat, origin.lng, lat, lng)),
    neighborhood,
    address: p.shortFormattedAddress ?? p.formattedAddress ?? null,
    description: p.editorialSummary?.text ?? facts.join(" · "),
    photoUrl: photo ? `/api/photo?ref=${encodeURIComponent(photo.name)}` : null,
    photoAttribution: attribution ? { name: attribution.displayName, uri: attribution.uri } : null,
    openNow: p.currentOpeningHours?.openNow ?? null,
    website: p.websiteUri ?? null,
    mapsUrl: p.googleMapsUri ?? mapsSearchUrl(p.displayName!.text, p.id),
    reservationUrl: null, // Places API doesn't expose reservation URLs; never guess one.
    source: "google",
  };
}

// ---------------------------------------------------------------- utils

function mapsSearchUrl(query: string, placeId?: string) {
  const u = new URL("https://www.google.com/maps/search/");
  u.searchParams.set("api", "1");
  u.searchParams.set("query", query);
  if (placeId) u.searchParams.set("query_place_id", placeId);
  return u.toString();
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}
