import { json } from "@/lib/http";
import { placesConfigured } from "@/lib/places";
import { getStore, storeIsEphemeral } from "@/lib/store";

export async function GET() {
  const storeError = await getStore().health();
  return json({
    storeError,
    restaurants: placesConfigured() ? "google" : "demo",
    store: getStore().kind,
    multiDeviceReady: !storeIsEphemeral(),
  });
}
