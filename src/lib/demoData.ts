// DEMO DATA — used only when GOOGLE_PLACES_API_KEY is not configured (or Google is unreachable).
//
// These are real, long-running Los Angeles restaurants, but this file deliberately contains
// NO ratings, review counts, photos, websites or reservation links: we don't invent those.
// Coordinates are approximate neighborhood centers, so distances are approximate.
// Price levels are rough estimates and are labeled as demo data in the UI.
import type { Cuisine } from "./types.ts";

export interface DemoRestaurant {
  name: string;
  cuisine: Cuisine;
  label: string;
  neighborhood: string;
  lat: number;
  lng: number;
  priceLevel: number;
  description: string;
  tags?: ("casual" | "dateNight" | "outdoor")[];
}

const N = {
  culver: [34.0211, -118.3965],
  santaMonica: [34.0195, -118.4912],
  venice: [33.985, -118.4695],
  weho: [34.09, -118.3617],
  ktown: [34.0618, -118.3004],
  dtla: [34.043, -118.25],
  littleTokyo: [34.05, -118.24],
  artsDistrict: [34.0403, -118.2353],
  silverLake: [34.0869, -118.2702],
  beverlyHills: [34.0736, -118.4004],
  sawtelle: [34.0377, -118.443],
  thaiTown: [34.1017, -118.3047],
  fairfax: [34.0765, -118.3615],
  hollywood: [34.0983, -118.3267],
  chinatown: [34.0623, -118.2383],
  palms: [34.0219, -118.4048],
  centuryCity: [34.0577, -118.417],
  losFeliz: [34.1066, -118.2847],
  highlandPark: [34.1115, -118.192],
  midCity: [34.049, -118.34],
  westlake: [34.0573, -118.277],
  boyleHeights: [34.0335, -118.205],
  alhambra: [34.0953, -118.127],
  sanGabriel: [34.0961, -118.1058],
  melrose: [34.0836, -118.3389],
  westLA: [34.04, -118.43],
} as const;

function r(
  name: string,
  cuisine: Cuisine,
  label: string,
  neighborhood: string,
  at: readonly [number, number],
  priceLevel: number,
  description: string,
  tags?: DemoRestaurant["tags"],
): DemoRestaurant {
  return { name, cuisine, label, neighborhood, lat: at[0], lng: at[1], priceLevel, description, tags };
}

export const DEMO_RESTAURANTS: DemoRestaurant[] = [
  r("Sugarfish", "Japanese", "Sushi", "Santa Monica", N.santaMonica, 3, "Set “Trust Me” sushi menus built around warm, loosely packed rice.", ["dateNight"]),
  r("KazuNori", "Japanese", "Hand rolls", "Downtown LA", N.dtla, 2, "A counter devoted to crisp-nori hand rolls, made one at a time.", ["casual"]),
  r("Sushi Gen", "Japanese", "Sushi", "Little Tokyo", N.littleTokyo, 3, "Little Tokyo sushi institution with a famously busy counter."),
  r("Tsujita LA Artisan Noodle", "Japanese", "Ramen", "Sawtelle", N.sawtelle, 2, "Rich tonkotsu ramen and tsukemen on Sawtelle's noodle row.", ["casual"]),
  r("Daikokuya", "Japanese", "Ramen", "Little Tokyo", N.littleTokyo, 2, "Old-school Little Tokyo ramen shop with a line out the door.", ["casual"]),
  r("Park's BBQ", "Korean", "Korean BBQ", "Koreatown", N.ktown, 3, "Koreatown's benchmark for premium Korean barbecue.", ["dateNight"]),
  r("Kang Ho-dong Baekjeong", "Korean", "Korean BBQ", "Koreatown", N.ktown, 2, "Loud, fun tabletop barbecue with egg and corn cooked on the grill rim.", ["casual"]),
  r("Sun Nong Dan", "Korean", "Korean stews", "Koreatown", N.ktown, 2, "Bubbling galbi jjim and stews, open late.", ["casual"]),
  r("Jitlada", "Thai", "Southern Thai", "Thai Town", N.thaiTown, 2, "Fiery Southern Thai cooking with a sprawling menu."),
  r("Night + Market Song", "Thai", "Thai", "Silver Lake", N.silverLake, 2, "Thai party food and natural wine in a neon-bright room.", ["casual"]),
  r("Night + Market WeHo", "Thai", "Thai", "West Hollywood", N.weho, 2, "The original Night + Market on Sunset: spicy, loud and fun.", ["casual"]),
  r("Ruen Pair", "Thai", "Thai", "Thai Town", N.thaiTown, 1, "Late-night Thai Town staple for no-frills classics.", ["casual"]),
  r("Felix Trattoria", "Italian", "Pasta", "Venice", N.venice, 4, "Handmade pasta in a Venice bungalow on Abbot Kinney.", ["dateNight"]),
  r("Bestia", "Italian", "Italian", "Arts District", N.artsDistrict, 3, "Arts District Italian known for house charcuterie and pastas.", ["dateNight", "outdoor"]),
  r("Jon & Vinny's", "Italian", "Pizza & pasta", "Fairfax", N.fairfax, 2, "All-day Italian-American spot for pizza and spicy fusilli.", ["casual"]),
  r("Pizzeria Mozza", "Italian", "Pizza", "Melrose", N.melrose, 3, "Blistered, chewy-crusted pizzas at Melrose and Highland."),
  r("Gjelina", "American", "Californian", "Venice", N.venice, 3, "Abbot Kinney favorite for seasonal plates and wood-fired pizza.", ["dateNight", "outdoor"]),
  r("Guelaguetza", "Mexican", "Oaxacan", "Koreatown", N.ktown, 2, "Family-run Oaxacan restaurant famed for its moles.", ["casual"]),
  r("Guisados", "Mexican", "Tacos", "Boyle Heights", N.boyleHeights, 1, "Braised stew tacos on fresh handmade tortillas.", ["casual"]),
  r("Sonoratown", "Mexican", "Sonoran tacos", "Downtown LA", N.dtla, 1, "Sonoran-style tacos and caramelos on thin flour tortillas.", ["casual"]),
  r("Leo's Tacos Truck", "Mexican", "Tacos", "Mid-City", N.midCity, 1, "Al pastor shaved straight off the trompo, late into the night.", ["casual", "outdoor"]),
  r("Loqui", "Mexican", "Tacos", "Culver City", N.culver, 1, "Flour-tortilla tacos with a bright, minimalist vibe.", ["casual"]),
  r("Tito's Tacos", "Mexican", "Tacos", "Culver City", N.culver, 1, "Westside institution for crispy hard-shell tacos since the ’50s.", ["casual"]),
  r("Pijja Palace", "Indian", "Indian-inspired", "Silver Lake", N.silverLake, 2, "Indian-inspired sports bar with inventive pizzas and pastas.", ["casual"]),
  r("Mayura", "Indian", "South Indian", "Palms", N.palms, 2, "Kerala-style South Indian cooking near Culver City.", ["casual"]),
  r("Annapurna Cuisine", "Indian", "South Indian vegetarian", "Culver City", N.culver, 1, "Vegetarian dosas, uttapam and thalis.", ["casual"]),
  r("Father's Office", "American", "Burgers & beer", "Santa Monica", N.santaMonica, 2, "Gastropub with a famously no-substitutions burger.", ["casual"]),
  r("Howlin' Ray's", "American", "Nashville hot chicken", "Chinatown", N.chinatown, 1, "Nashville hot chicken worth the wait.", ["casual"]),
  r("République", "American", "French-Californian", "Mid-City", N.midCity, 3, "Grand, sunlit dining room on La Brea for French-leaning plates.", ["dateNight"]),
  r("The Apple Pan", "American", "Burgers", "West LA", N.westLA, 1, "Counter-only burger and pie shop open since 1947.", ["casual"]),
  r("Langer's Deli", "American", "Deli", "Westlake", N.westlake, 2, "Legendary pastrami across from MacArthur Park.", ["casual"]),
  r("Nate 'n Al", "American", "Deli", "Beverly Hills", N.beverlyHills, 2, "Classic Beverly Hills Jewish deli.", ["casual"]),
  r("Bavel", "Mediterranean", "Middle Eastern", "Arts District", N.artsDistrict, 3, "Middle Eastern cooking from the Bestia team in a lush, plant-filled room.", ["dateNight"]),
  r("Kismet", "Mediterranean", "Mediterranean", "Los Feliz", N.losFeliz, 3, "Bright Mediterranean small plates in Los Feliz.", ["dateNight"]),
  r("Zankou Chicken", "Mediterranean", "Armenian-Lebanese", "Hollywood", N.hollywood, 1, "Rotisserie chicken with its cult-favorite garlic sauce.", ["casual"]),
  r("Mh Zh", "Mediterranean", "Israeli", "Silver Lake", N.silverLake, 2, "Tiny Israeli spot with sidewalk seating.", ["casual", "outdoor"]),
  r("Din Tai Fung", "Chinese", "Taiwanese dumplings", "Century City", N.centuryCity, 2, "Xiao long bao folded to order behind glass.", ["casual"]),
  r("Chengdu Taste", "Chinese", "Sichuan", "Alhambra", N.alhambra, 2, "Numbing, fiery Sichuan cooking in the San Gabriel Valley."),
  r("Pine & Crane", "Chinese", "Taiwanese", "Silver Lake", N.silverLake, 1, "Counter-service Taiwanese with farm-driven vegetables.", ["casual"]),
  r("Joy", "Chinese", "Taiwanese", "Highland Park", N.highlandPark, 1, "Taiwanese snacks and noodles on York Boulevard.", ["casual"]),
  r("Phorage", "Vietnamese", "Pho", "Palms", N.palms, 2, "Westside pho and Vietnamese favorites.", ["casual"]),
  r("Golden Deli", "Vietnamese", "Vietnamese", "San Gabriel", N.sanGabriel, 1, "SGV favorite for cha gio and pho.", ["casual"]),
  r("Pho Café", "Vietnamese", "Pho", "Silver Lake", N.silverLake, 1, "Low-key Silver Lake pho shop.", ["casual"]),
  r("Eggslut", "Breakfast", "Breakfast sandwiches", "Downtown LA", N.dtla, 1, "Egg sandwiches at Grand Central Market.", ["casual"]),
  r("Huckleberry", "Breakfast", "Bakery café", "Santa Monica", N.santaMonica, 2, "Santa Monica bakery café for pastries and breakfast plates.", ["casual"]),
  r("Gjusta", "Brunch", "Bakery & deli", "Venice", N.venice, 2, "Sprawling Venice bakery-deli with a sunny back patio.", ["casual", "outdoor"]),
  r("Salt & Straw", "Dessert", "Ice cream", "Venice", N.venice, 1, "Small-batch ice cream in inventive flavors on Abbot Kinney.", ["casual"]),
  r("Diddy Riese", "Dessert", "Cookies & ice cream", "Westwood", [34.0631, -118.4468], 1, "Westwood's famous cheap ice cream cookie sandwiches.", ["casual"]),
  r("Intelligentsia", "Coffee", "Coffee", "Silver Lake", N.silverLake, 1, "Sunset Junction coffee bar with a sunny patio.", ["casual", "outdoor"]),
];
