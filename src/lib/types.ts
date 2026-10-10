export type RoomState = "lobby" | "vibe" | "swiping" | "results" | "decided";

export type Cuisine =
  | "Japanese"
  | "Korean"
  | "Thai"
  | "Italian"
  | "Mexican"
  | "Indian"
  | "American"
  | "Mediterranean"
  | "Chinese"
  | "Vietnamese";

/** "middle" = the midpoint of every friend who shared their location */
export type LocationMode = "current" | "neighborhood" | "address" | "middle";

export interface LocationChoice {
  mode: LocationMode;
  /** Neighborhood name (mode = neighborhood) */
  neighborhood?: string;
  /** Free-text address (mode = address) */
  address?: string;
  /** Coordinates, when already known (current location or a neighborhood) */
  lat?: number;
  lng?: number;
}

/** Radius in miles. `null` means "Anywhere in LA". */
export type Radius = 2 | 5 | 10 | null;

export interface Filters {
  location: LocationChoice;
  radius: Radius;
  /** Empty array = Anything */
  cuisines: Cuisine[];
  /** 1..4. Empty = any budget */
  budget: number[];
  openNow: boolean;
  highlyRated: boolean;
  casual: boolean;
  dateNight: boolean;
  outdoor: boolean;
}

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number | null;
  reviewCount: number | null;
  /** 1..4, or null if unavailable */
  priceLevel: number | null;
  /** e.g. "$20–40" from Google's priceRange, when available */
  priceText: string | null;
  lat: number;
  lng: number;
  /** Miles from the chosen location */
  distanceMi: number | null;
  neighborhood: string | null;
  address: string | null;
  description: string;
  /** Path to our photo proxy, or null */
  photoUrl: string | null;
  photoAttribution: { name: string; uri?: string } | null;
  openNow: boolean | null;
  website: string | null;
  mapsUrl: string;
  /** Only set when a real reservation URL is known */
  reservationUrl: string | null;
  source: "google" | "demo";
  // ---- Richer details (Google only; optional so older rooms still render) ----
  /** Up to 6 photos via our proxy, best first */
  photos?: { url: string; attribution: { name: string; uri?: string } | null }[];
  /** e.g. "11 PM" — local closing time if open now */
  closesAt?: string | null;
  /** Minutes until closing, measured when the round started */
  minutesToClose?: number | null;
  /** e.g. "Monday: 5:00 – 11:00 PM" for today */
  hoursToday?: string | null;
  /** Full week, Monday first */
  weekHours?: string[] | null;
  /** Amenity / offering tags from Google, most useful first */
  tags?: string[];
  /** AI overview from Google Maps (needs "Summarized with Gemini" attribution) */
  aiSummary?: string | null;
  /** One helpful review snippet, with author attribution */
  review?: { text: string; author: string; rating: number | null; when: string | null } | null;
  phone?: string | null;
  reservable?: boolean | null;
}

export interface Participant {
  id: string;
  roomCode: string;
  name: string;
  joinedAt: number;
  lastSeen: number;
  /** Round number this participant finished swiping (0 = none) */
  finishedRound: number;
  left: boolean;
}

export interface Vote {
  roomCode: string;
  round: number;
  participantId: string;
  restaurantId: string;
  liked: boolean;
  createdAt: number;
}

export interface Room {
  code: string;
  hostId: string;
  state: RoomState;
  round: number;
  filters: Filters | null;
  restaurants: Restaurant[];
  /** Restaurant ids already shown in earlier rounds — excluded from fresh rounds */
  seenIds: string[];
  /** Participants taking part in the current round */
  roundParticipantIds: string[];
  startsAt: number | null;
  endsAt: number | null;
  selectedId: string | null;
  dataSource: "google" | "demo" | null;
  /** Human-readable notice about data (e.g. "Google Places unavailable — showing demo data") */
  notice: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RankedResult {
  restaurant: Restaurant;
  yes: number;
  votes: number;
  /** Super-likes (each counts as an extra heart in the ranking) */
  supers: number;
  /** Someone used their veto on it — it can't be a top pick */
  vetoed: boolean;
  /** yes / votes received (0..100), null if no votes */
  matchPct: number | null;
  rank: number;
}

export interface Results {
  ranked: RankedResult[];
  /** Number of participants who cast at least one vote this round */
  voters: number;
  /** True if the top restaurant received yes votes from a strict majority of voters */
  hasMajority: boolean;
}

export interface PublicParticipant {
  id: string;
  name: string;
  isHost: boolean;
  active: boolean;
  finished: boolean;
  /** Number of cards swiped this round (count only — never which way) */
  progress: number;
  /** Taking part in the current round */
  inRound: boolean;
  /** Shared their location for meet-in-the-middle (coordinates are never sent to other phones) */
  sharedLocation: boolean;
}

/** restaurantId → names of friends who've been there (shown after the round) */
export type BeenMap = Record<string, string[]>;

export interface Snapshot {
  serverNow: number;
  code: string;
  state: RoomState;
  round: number;
  hostId: string;
  filters: Filters | null;
  participants: PublicParticipant[];
  /** Present during swiping/results/decided */
  restaurants: Restaurant[];
  startsAt: number | null;
  endsAt: number | null;
  myVotes: Record<string, boolean>;
  /** The restaurant I super-liked / vetoed this round */
  mySuper: string | null;
  myVeto: string | null;
  /** Restaurants I've marked as "been here" */
  myBeen: string[];
  /** Who has been where — only revealed with the results */
  been: BeenMap;
  results: Results | null;
  selectedId: string | null;
  dataSource: "google" | "demo" | null;
  notice: string | null;
  me: { id: string; name: string } | null;
}
