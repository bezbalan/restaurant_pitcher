import type { NextRequest } from "next/server";
import { handleError, json, readBody } from "@/lib/http";
import {
  ApiError,
  castVote,
  cleanCode,
  finishSwiping,
  getSnapshot,
  joinRoom,
  leaveRoom,
  markBeen,
  setDiet,
  shareLocation,
  openVibe,
  reopenResults,
  selectRestaurant,
  startRound,
  undoVote,
} from "@/lib/rooms";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]">) {
  try {
    const code = cleanCode((await ctx.params).code);
    const pid = req.nextUrl.searchParams.get("pid");
    return json(await getSnapshot(code, pid));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]">) {
  try {
    const code = cleanCode((await ctx.params).code);
    const body = await readBody(req);
    const pid = body.pid;
    switch (body.action) {
      case "join":
        return json(await joinRoom(code, body.name, pid));
      case "leave":
        await leaveRoom(code, pid);
        return json(await getSnapshot(code, null));
      case "vibe":
        await openVibe(code, pid);
        break;
      case "start":
        await startRound(code, pid, body.filters);
        break;
      case "rematch":
        // Fresh round, same vibe, never-seen restaurants
        await startRound(code, pid);
        break;
      case "vote":
        await castVote(code, pid, body);
        break;
      case "undo":
        await undoVote(code, pid, body);
        break;
      case "diet":
        await setDiet(code, pid, body);
        break;
      case "location":
        await shareLocation(code, pid, body);
        break;
      case "been":
        await markBeen(code, pid, body);
        break;
      case "finish":
        await finishSwiping(code, pid, body.round);
        break;
      case "select":
        await selectRestaurant(code, pid, body.restaurantId);
        break;
      case "reopen":
        await reopenResults(code, pid);
        break;
      default:
        throw new ApiError(400, "Unknown action.");
    }
    return json(await getSnapshot(code, typeof pid === "string" ? pid : null));
  } catch (e) {
    return handleError(e);
  }
}
