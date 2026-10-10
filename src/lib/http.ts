import "server-only";
import { NextResponse } from "next/server";
import { ApiError } from "./rooms.ts";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function handleError(e: unknown) {
  if (e instanceof ApiError) return json({ error: e.message, code: e.code }, e.status);
  console.error(e);
  return json({ error: "Something went wrong on our side. Please try again.", code: "SERVER" }, 500);
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}
