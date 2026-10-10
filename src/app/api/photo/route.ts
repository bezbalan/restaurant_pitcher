import type { NextRequest } from "next/server";

// Proxies Google Places photos so the API key never reaches the browser.
// Google returns a short-lived, key-less photoUri which we redirect to.
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const base = process.env.GOOGLE_PLACES_BASE_URL || "https://places.googleapis.com";
    const url = `${base}/v1/${ref}/media?maxWidthPx=1000&maxHeightPx=1400&skipHttpRedirect=true&key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return new Response("Photo unavailable", { status: 502 });
    const { photoUri } = (await res.json()) as { photoUri?: string };
    if (!photoUri) return new Response("Photo unavailable", { status: 502 });
    return new Response(null, {
      status: 302,
      headers: { Location: photoUri, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new Response("Photo unavailable", { status: 502 });
  }
}
