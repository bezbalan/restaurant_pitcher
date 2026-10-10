// Dietary needs each friend can set for themselves. Shared by client and server.
//
// Google Places has no vegan / halal / gluten-free fields, so for those we (1) add the term to the
// search, (2) look for it in Google's own summary, the place's name and its reviews, and (3) label
// matches honestly ("listed" vs "mentioned"). Needs we can't check at all become reminders.

export type DietKey = "vegan" | "vegetarian" | "gluten_free" | "halal" | "kosher" | "no_pork" | "dairy_free" | "nut_allergy";

export interface Diet {
  key: DietKey;
  label: string;
  /** Added to the Google search when someone at the table needs it */
  query: string | null;
  /** Text that suggests a place caters to it */
  match: RegExp | null;
}

export const DIETS: Diet[] = [
  { key: "vegan", label: "Vegan", query: "vegan-friendly", match: /\bvegan|plant[- ]based/i },
  { key: "vegetarian", label: "Vegetarian", query: "vegetarian-friendly", match: /vegetarian|veggie/i },
  { key: "gluten_free", label: "Gluten-free", query: "gluten-free options", match: /gluten[- ]free|celiac/i },
  { key: "halal", label: "Halal", query: "halal", match: /\bhalal\b/i },
  { key: "kosher", label: "Kosher", query: "kosher", match: /\bkosher\b/i },
  { key: "no_pork", label: "No pork", query: null, match: null },
  { key: "dairy_free", label: "Dairy-free", query: null, match: /dairy[- ]free/i },
  { key: "nut_allergy", label: "Nut allergy", query: null, match: null },
];

export const DIET_KEYS = DIETS.map((d) => d.key);
export const dietLabel = (k: string) => DIETS.find((d) => d.key === k)?.label ?? k;

export interface DietMatch {
  key: DietKey;
  /** "listed" = Google lists it (type / attribute / summary); "mentioned" = only in reviews */
  strength: "listed" | "mentioned";
}

export function dietChipText(m: DietMatch): string {
  const icon = m.key === "vegan" || m.key === "vegetarian" ? "🌱 " : "";
  return `${icon}${dietLabel(m.key)}${m.strength === "mentioned" ? " (per reviews)" : ""}`;
}

/** Search terms for the group's needs: at most two, strongest first (vegan covers vegetarian). */
export function dietQueryTerms(needs: string[]): string[] {
  const order: DietKey[] = ["vegan", "halal", "kosher", "gluten_free", "vegetarian"];
  const has = new Set(needs);
  if (has.has("vegan")) has.delete("vegetarian");
  return order
    .filter((k) => has.has(k))
    .map((k) => DIETS.find((d) => d.key === k)!.query!)
    .slice(0, 2);
}
