import { handleError, json, readBody } from "@/lib/http";
import { createRoom } from "@/lib/rooms";

export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    return json(await createRoom(body.name));
  } catch (e) {
    return handleError(e);
  }
}
