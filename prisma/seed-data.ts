/**
 * SAMPLE development data. Prices, stock levels and delivery zones are
 * illustrative only and must be replaced/verified by the business owner.
 * Amounts are in pesewas; quantities in milli-units (1000 = 1 unit).
 */

type Unit = "ITEM" | "KG" | "PACK" | "BOTTLE" | "BAG" | "BOX" | "BUNCH" | "CRATE" | "TIN" | "LOAF" | "LITRE" | "DOZEN";

export interface SeedVariant {
  name: string;
  unit: Unit;
  price: number;
  sale?: number;
  /** Sale ends this many days after seeding (sample countdown). */
  saleDays?: number;
  /** Bulk prices: buy at least `min` units, pay `price` each. */
  tiers?: { min: number; price: number }[];
  stock: number;
  step?: number;
  min?: number;
  max?: number;
}

export interface SeedProduct {
  slug: string;
  name: string;
  category: string;
  short: string;
  description: string;
  keywords: string;
  featured?: boolean;
  variants: SeedVariant[];
}

export const CATEGORIES = [
  { slug: "rice-grains", name: "Rice & Grains", image: "royal-basmati-rice", description: "Rice in large bags for the family and for resale." },
  { slug: "cooking-oil", name: "Cooking Oil", image: "members-mark-vegetable-oil", description: "Vegetable oil in family and bulk sizes." },
  { slug: "breakfast", name: "Breakfast & Coffee", image: "quaker-quick-oats", description: "Cereal, oats and coffee creamer." },
  { slug: "juices-drinks", name: "Juices & Drinks", image: "ocean-spray-cran-grape", description: "Juices and juice drinks by the bottle and by the pack." },
  { slug: "snacks", name: "Snacks & Cookies", image: "welchs-fruit-snacks", description: "Fruit snacks and cookies in family boxes." },
  { slug: "health-nutrition", name: "Health & Nutrition", image: "ensure-original", description: "Nutrition shakes in multipacks." },
  { slug: "personal-care", name: "Personal Care", image: "dove-cool-moisture-bar-soap", description: "Bar soap in value packs." },
  { slug: "pet-food", name: "Pet Food", image: "purina-dog-chow", description: "Dog food in large bags." },
] as const;

/** The maker's brand for each product, as printed on the packaging. */
export const BRANDS: Record<string, string> = {
  "royal-basmati-rice": "Royal",
  "wesson-vegetable-oil": "Wesson",
  "members-mark-vegetable-oil": "Member's Mark",
  "kelloggs-corn-flakes": "Kellogg's",
  "quaker-quick-oats": "Quaker",
  "coffee-mate-original": "Coffee-mate",
  "ocean-spray-cran-grape": "Ocean Spray",
  "ocean-spray-cranberry": "Ocean Spray",
  "martinellis-apple-juice": "Martinelli's",
  "martinellis-sparkling-apple-grape": "Martinelli's",
  "welchs-juice-variety-pack": "Welch's",
  "apple-and-eve-juice-boxes": "Apple & Eve",
  "welchs-fruit-snacks": "Welch's",
  "famous-amos-cookies": "Famous Amos",
  "ensure-original": "Ensure",
  "ensure-plus": "Ensure",
  "dove-cool-moisture-bar-soap": "Dove",
  "dove-sensitive-bar-soap": "Dove",
  "irish-spring-deodorant-soap": "Irish Spring",
  "purina-dog-chow": "Purina",
};

/** Modelled on the shop's own stock photos. Pack sizes are only stated where the packaging shows them. */
export const PRODUCTS: SeedProduct[] = [
  // Rice & Grains
  { slug: "royal-basmati-rice", name: "Royal Basmati Rice", category: "rice-grains", short: "Royal basmati rice in a large bag.", description: "Long grain Royal basmati rice for jollof, fried rice and everyday meals. Sold by the bag.", keywords: "rice basmati royal bag", featured: true, variants: [{ name: "Bag", unit: "BAG", price: 48000, sale: 45000, stock: 40_000, tiers: [{ min: 5, price: 42000 }, { min: 10, price: 40000 }] }] },
  // Cooking Oil
  { slug: "wesson-vegetable-oil", name: "Wesson Vegetable Oil", category: "cooking-oil", short: "Wesson vegetable oil by the case.", description: "Wesson vegetable oil for frying, baking and everyday cooking. Sold by the case.", keywords: "oil vegetable oil wesson cooking", featured: true, variants: [{ name: "Case", unit: "BOX", price: 52000, stock: 20_000 }] },
  { slug: "members-mark-vegetable-oil", name: "Member's Mark Vegetable Oil", category: "cooking-oil", short: "Twin pack of 3 quart bottles.", description: "Member's Mark vegetable oil in a twin pack of two 3 quart bottles.", keywords: "oil vegetable oil members mark cooking", variants: [{ name: "Twin pack (2 × 3 qt)", unit: "PACK", price: 26000, stock: 30_000, tiers: [{ min: 4, price: 23500 }] }] },
  // Breakfast & Coffee
  { slug: "kelloggs-corn-flakes", name: "Kellogg's Corn Flakes", category: "breakfast", short: "Kellogg's Corn Flakes cereal.", description: "Classic Kellogg's Corn Flakes breakfast cereal.", keywords: "cereal corn flakes kelloggs breakfast", variants: [{ name: "Pack", unit: "PACK", price: 9500, stock: 40_000 }] },
  { slug: "quaker-quick-oats", name: "Quaker Quick 1-Minute Oats", category: "breakfast", short: "Two 5 lb bags of quick oats.", description: "Quaker Quick 1-Minute Oats in a value box of two 5 lb bags.", keywords: "oats quaker porridge breakfast", featured: true, variants: [{ name: "Box (2 × 5 lb bags)", unit: "BOX", price: 18500, sale: 16500, saleDays: 5, stock: 25_000 }] },
  { slug: "coffee-mate-original", name: "Coffee-mate Original Creamer", category: "breakfast", short: "Coffee-mate The Original creamer.", description: "Nestlé Coffee-mate The Original coffee creamer in a large canister.", keywords: "coffee creamer coffee mate nestle", variants: [{ name: "Canister", unit: "ITEM", price: 9000, stock: 30_000 }] },
  // Juices & Drinks
  { slug: "ocean-spray-cran-grape", name: "Ocean Spray Cran-Grape", category: "juices-drinks", short: "Grape and cranberry juice drink.", description: "Ocean Spray Cran-Grape grape and cranberry juice drink in a large bottle.", keywords: "juice cranberry grape ocean spray drink", featured: true, variants: [{ name: "Bottle", unit: "BOTTLE", price: 7500, stock: 60_000 }] },
  { slug: "ocean-spray-cranberry", name: "Ocean Spray Cranberry", category: "juices-drinks", short: "Cranberry juice drink.", description: "Ocean Spray cranberry juice drink in a large bottle.", keywords: "juice cranberry ocean spray drink", variants: [{ name: "Bottle", unit: "BOTTLE", price: 7500, sale: 6800, stock: 60_000 }] },
  { slug: "martinellis-apple-juice", name: "Martinelli's 100% Apple Juice", category: "juices-drinks", short: "100% apple juice, not from concentrate.", description: "Martinelli's 100% apple juice, not from concentrate, in glass bottles. Sold by the pack.", keywords: "juice apple martinellis", variants: [{ name: "Pack", unit: "PACK", price: 22000, stock: 20_000 }] },
  { slug: "martinellis-sparkling-apple-grape", name: "Martinelli's Sparkling Apple-Grape", category: "juices-drinks", short: "Sparkling 100% apple and grape juice.", description: "Martinelli's sparkling apple and grape juice, 100% juice, in glass bottles. Sold by the pack.", keywords: "juice sparkling apple grape martinellis", variants: [{ name: "Pack", unit: "PACK", price: 24000, stock: 20_000 }] },
  { slug: "welchs-juice-variety-pack", name: "Welch's Juice 24 Pack", category: "juices-drinks", short: "24 bottles of Welch's juice.", description: "A 24 pack of Welch's juice bottles.", keywords: "juice welchs grape bottles pack", featured: true, variants: [{ name: "24 pack", unit: "PACK", price: 21000, stock: 25_000 }] },
  { slug: "apple-and-eve-juice-boxes", name: "Apple & Eve 100% Juice Boxes", category: "juices-drinks", short: "36 juice boxes, 100% juice.", description: "A 36 pack of Apple & Eve 100% juice boxes, handy for lunch boxes.", keywords: "juice boxes apple eve kids", variants: [{ name: "36 pack", unit: "PACK", price: 19500, sale: 17500, stock: 25_000 }] },
  // Snacks & Cookies
  { slug: "welchs-fruit-snacks", name: "Welch's Fruit Snacks", category: "snacks", short: "Mixed fruit snacks in a family box.", description: "Welch's mixed fruit snacks in individual pouches, packed in a family box.", keywords: "snacks fruit snacks welchs kids", featured: true, variants: [{ name: "Box", unit: "BOX", price: 16000, stock: 30_000 }] },
  { slug: "famous-amos-cookies", name: "Famous Amos Cookies", category: "snacks", short: "Cookies in individual snack packs.", description: "Famous Amos cookies in individual snack packs, sold by the box.", keywords: "cookies biscuits famous amos snacks", variants: [{ name: "Box", unit: "BOX", price: 14500, stock: 12_000 }] },
  // Health & Nutrition
  { slug: "ensure-original", name: "Ensure Original Nutrition Shake", category: "health-nutrition", short: "24 bottles.", description: "Ensure Original nutrition shake in a 24 bottle pack.", keywords: "ensure nutrition shake drink", featured: true, variants: [{ name: "24 bottles", unit: "PACK", price: 85000, stock: 15_000 }] },
  { slug: "ensure-plus", name: "Ensure Plus Nutrition Shake", category: "health-nutrition", short: "24 bottles.", description: "Ensure Plus nutrition shake in a 24 bottle pack.", keywords: "ensure plus nutrition shake drink", variants: [{ name: "24 bottles", unit: "PACK", price: 95000, sale: 89000, stock: 15_000 }] },
  // Personal Care
  { slug: "dove-cool-moisture-bar-soap", name: "Dove Cool Moisture Bar Soap", category: "personal-care", short: "16 bars with a cool, crisp scent.", description: "Dove Cool Moisture beauty bars in a value pack of 16.", keywords: "soap dove bar beauty bar bath", featured: true, variants: [{ name: "16 bars", unit: "PACK", price: 24000, stock: 20_000 }] },
  { slug: "dove-sensitive-bar-soap", name: "Dove Sensitive Bar Soap", category: "personal-care", short: "16 bars for sensitive skin.", description: "Dove Sensitive beauty bars in a value pack of 16.", keywords: "soap dove sensitive bar bath", variants: [{ name: "16 bars", unit: "PACK", price: 24000, stock: 20_000 }] },
  { slug: "irish-spring-deodorant-soap", name: "Irish Spring Deodorant Soap", category: "personal-care", short: "12HR Fresh deodorant bar soap.", description: "Irish Spring 12HR Fresh deodorant bar soap in a value pack.", keywords: "soap irish spring deodorant bar bath", variants: [{ name: "Pack", unit: "PACK", price: 16500, sale: 15000, stock: 20_000 }] },
  // Pet Food
  { slug: "purina-dog-chow", name: "Purina Dog Chow Complete Adult", category: "pet-food", short: "Dry dog food in a large bag.", description: "Purina Dog Chow Complete Adult dry dog food in a large bag.", keywords: "dog food purina dog chow pet", variants: [{ name: "Bag", unit: "BAG", price: 52000, stock: 15_000 }] },
];

export const ZONES = [
  { name: "Accra Central", region: "Greater Accra", areas: ["Osu", "Adabraka", "Labone", "Ridge", "Asylum Down"], feeMinor: 2000, minOrderMinor: 5000, freeDeliveryThresholdMinor: 40000, isActive: true },
  { name: "East Legon & Airport", region: "Greater Accra", areas: ["East Legon", "Airport Residential", "Shiashie", "Dzorwulu", "Roman Ridge"], feeMinor: 2500, minOrderMinor: 5000, freeDeliveryThresholdMinor: 50000, isActive: true },
  { name: "Tema", region: "Greater Accra", areas: ["Community 1 to 25", "Sakumono", "Lashibi", "Spintex"], feeMinor: 3500, minOrderMinor: 10000, freeDeliveryThresholdMinor: null, isActive: true },
  { name: "Kasoa", region: "Central", areas: ["Kasoa", "Old Barrier", "Millennium City"], feeMinor: 4000, minOrderMinor: 15000, freeDeliveryThresholdMinor: null, isActive: false },
];
