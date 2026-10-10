// Approximate neighborhood centers, used as search origins.
export const NEIGHBORHOODS: { name: string; lat: number; lng: number }[] = [
  { name: "Culver City", lat: 34.0211, lng: -118.3965 },
  { name: "Santa Monica", lat: 34.0195, lng: -118.4912 },
  { name: "Venice", lat: 33.985, lng: -118.4695 },
  { name: "Marina del Rey", lat: 33.9803, lng: -118.4517 },
  { name: "West Hollywood", lat: 34.09, lng: -118.3617 },
  { name: "Koreatown", lat: 34.0618, lng: -118.3004 },
  { name: "Downtown LA", lat: 34.043, lng: -118.25 },
  { name: "Silver Lake", lat: 34.0869, lng: -118.2702 },
  { name: "Beverly Hills", lat: 34.0736, lng: -118.4004 },
];

/** Central LA — used for "Anywhere in LA" and as a last-resort fallback. */
export const LA_CENTER = { name: "Los Angeles", lat: 34.0522, lng: -118.2437 };

export function findNeighborhood(text: string | undefined) {
  if (!text) return undefined;
  const t = text.toLowerCase();
  return NEIGHBORHOODS.find((n) => t.includes(n.name.toLowerCase()));
}
