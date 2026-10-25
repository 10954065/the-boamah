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
  { slug: "fruits", name: "Fruits", image: "oranges", description: "Sweet, ripe fruit for snacking, juicing and desserts." },
  { slug: "vegetables", name: "Vegetables", image: "tomatoes", description: "Everyday vegetables and cooking staples." },
  { slug: "meat-poultry", name: "Meat & Poultry", image: "beef", description: "Chicken, beef and more for family meals." },
  { slug: "fish-seafood", name: "Fish & Seafood", image: "tilapia", description: "Fresh and smoked fish, prawns and seafood." },
  { slug: "dairy-eggs", name: "Dairy & Eggs", image: "eggs", description: "Eggs, milk, yoghurt, butter and cheese." },
  { slug: "rice-grains", name: "Rice & Grains", image: "jasmine-rice", description: "Rice, gari, beans, oats and flours." },
  { slug: "cooking-essentials", name: "Cooking Essentials", image: "palm-oil", description: "Oils, pastes, spices, sugar and pasta." },
  { slug: "drinks-beverages", name: "Drinks & Beverages", image: "orange-juice", description: "Water, soft drinks, juice, tea and coffee." },
  { slug: "snacks", name: "Snacks", image: "roasted-groundnuts", description: "Groundnuts, chips, biscuits and popcorn." },
  { slug: "bakery", name: "Bakery", image: "sugar-bread", description: "Fresh bread and baked goods." },
  { slug: "frozen-foods", name: "Frozen Foods", image: "frozen-vegetables", description: "Frozen vegetables, sausages and ice cream." },
  { slug: "household-essentials", name: "Household Essentials", image: "laundry-detergent", description: "Cleaning and everyday home supplies." },
] as const;

const kg = (price: number, stockKg: number, step = 500, min = 500, sale?: number): SeedVariant => ({
  name: "Per kg",
  unit: "KG",
  price,
  sale,
  stock: stockKg * 1000,
  step,
  min,
});

export const PRODUCTS: SeedProduct[] = [
  // Fruits
  { slug: "bananas", name: "Ripe Bananas", category: "fruits", short: "Sweet, naturally ripened bananas, sold by the bunch.", description: "Naturally ripened bananas, perfect for breakfast, lunch boxes and smoothies. Sold by the bunch; bunch sizes vary.", keywords: "banana fruit", featured: true, variants: [{ name: "Bunch", unit: "BUNCH", price: 2500, stock: 40_000 }] },
  { slug: "oranges", name: "Sweet Oranges", category: "fruits", short: "Juicy local oranges, great for fresh juice.", description: "Juicy, sweet oranges. Ideal for freshly squeezed juice or as a healthy snack.", keywords: "orange citrus fruit juice", variants: [{ name: "Pack of 10", unit: "PACK", price: 3000, stock: 30_000, max: 10_000 }] },
  { slug: "pineapple", name: "Sugarloaf Pineapple", category: "fruits", short: "Sweet, mild pineapple.", description: "Sweet and fragrant pineapple. Enjoy fresh, in fruit salads or blended into drinks.", keywords: "pineapple fruit", variants: [{ name: "Each", unit: "ITEM", price: 1800, sale: 1500, stock: 25_000 }] },
  { slug: "watermelon", name: "Watermelon", category: "fruits", short: "Refreshing whole watermelon.", description: "A whole, refreshing watermelon for hot afternoons and family gatherings.", keywords: "watermelon melon fruit", variants: [{ name: "Each (whole)", unit: "ITEM", price: 4500, stock: 3_000 }] },
  { slug: "pawpaw", name: "Pawpaw (Papaya)", category: "fruits", short: "Ripe pawpaw, rich in flavour.", description: "Ripe, soft pawpaw with sweet orange flesh. Great for breakfast and fruit salads.", keywords: "papaya pawpaw fruit", variants: [{ name: "Each", unit: "ITEM", price: 2000, stock: 18_000 }] },
  { slug: "apples", name: "Red Apples", category: "fruits", short: "Crisp red apples, sold by weight.", description: "Crisp, sweet red apples. Sold by weight in steps of 500 g.", keywords: "apple fruit", variants: [kg(4500, 20)] },
  { slug: "avocado", name: "Avocado Pear", category: "fruits", short: "Creamy avocado pears.", description: "Creamy avocado pears for salads, sandwiches and guacamole.", keywords: "avocado pear", variants: [{ name: "Each", unit: "ITEM", price: 800, stock: 60_000 }] },
  { slug: "mangoes", name: "Mangoes", category: "fruits", short: "Juicy mangoes, sold by weight.", description: "Juicy seasonal mangoes, sold by weight (minimum 1 kg).", keywords: "mango fruit", variants: [kg(3000, 25, 500, 1000)] },
  // Vegetables
  { slug: "tomatoes", name: "Fresh Tomatoes", category: "vegetables", short: "Firm, ripe tomatoes for stews and salads.", description: "Firm, ripe tomatoes for stews, soups and jollof. Sold by weight in steps of 500 g.", keywords: "tomato stew jollof vegetable", featured: true, variants: [kg(2500, 50, 500, 500, 2200)] },
  { slug: "onions", name: "Red Onions", category: "vegetables", short: "Everyday red onions.", description: "Red onions for cooking and salads. Sold by weight.", keywords: "onion vegetable", variants: [kg(1800, 60)] },
  { slug: "plantain", name: "Plantain", category: "vegetables", short: "Green or ripe plantain by the bunch.", description: "Plantain for kelewele, ampesi, red-red or chips. Sold by the bunch; ripeness varies by availability.", keywords: "plantain kelewele ampesi", featured: true, variants: [{ name: "Bunch (approx. 6 fingers)", unit: "BUNCH", price: 3500, stock: 35_000 }] },
  { slug: "garden-eggs", name: "Garden Eggs", category: "vegetables", short: "Fresh garden eggs for stews.", description: "Fresh garden eggs for garden egg stew and sauces. Sold by weight.", keywords: "garden egg eggplant aubergine", variants: [kg(2000, 25)] },
  { slug: "cabbage", name: "Cabbage", category: "vegetables", short: "Whole fresh cabbage.", description: "A whole, firm cabbage for salads, stir fries and sauces.", keywords: "cabbage vegetable", variants: [{ name: "Each", unit: "ITEM", price: 1500, stock: 30_000 }] },
  { slug: "carrots", name: "Carrots", category: "vegetables", short: "Sweet, crunchy carrots.", description: "Sweet, crunchy carrots for salads, rice dishes and juices.", keywords: "carrot vegetable", variants: [kg(2200, 30)] },
  { slug: "chilli-peppers", name: "Fresh Red Chilli Peppers", category: "vegetables", short: "Hot fresh chillies, sold by weight.", description: "Fresh red chilli peppers (kpakpo shito style heat) for shito, stews and soups. Sold in steps of 250 g.", keywords: "pepper chilli kpakpo shito hot", variants: [kg(3500, 10, 250, 250)] },
  { slug: "okra", name: "Okra", category: "vegetables", short: "Tender okra for soup and stew.", description: "Tender okra for okro soup and stews. Sold by weight.", keywords: "okra okro soup", variants: [kg(2400, 15)] },
  { slug: "ginger", name: "Fresh Ginger", category: "vegetables", short: "Aromatic fresh ginger root.", description: "Aromatic fresh ginger for cooking, sobolo and tea. Sold in steps of 250 g.", keywords: "ginger spice sobolo", variants: [kg(3000, 10, 250, 250)] },
  { slug: "garlic", name: "Garlic", category: "vegetables", short: "Whole garlic bulbs.", description: "Whole garlic bulbs to flavour stews, marinades and sauces.", keywords: "garlic spice", variants: [kg(4000, 8, 250, 250)] },
  { slug: "yam", name: "Puna Yam", category: "vegetables", short: "Medium puna yam tubers.", description: "Medium puna yam tubers for ampesi, fries and mpotompoto. Tuber sizes vary.", keywords: "yam tuber puna ampesi", featured: true, variants: [{ name: "Medium tuber", unit: "ITEM", price: 2500, stock: 40_000 }] },
  { slug: "sweet-potatoes", name: "Sweet Potatoes", category: "vegetables", short: "Sweet potatoes, sold by weight.", description: "Sweet potatoes for boiling, roasting and fries. Sold by weight.", keywords: "sweet potato", variants: [kg(1500, 30)] },
  // Meat & Poultry
  { slug: "chicken-wings", name: "Chicken Wings", category: "meat-poultry", short: "Chicken wings, kept chilled.", description: "Chicken wings for grilling, frying and stews. Kept chilled; sold by weight (minimum 1 kg).", keywords: "chicken wings poultry meat", variants: [kg(6500, 30, 500, 1000)] },
  { slug: "chicken-pieces", name: "Chicken Thighs & Drumsticks", category: "meat-poultry", short: "Mixed chicken leg pieces.", description: "Mixed chicken thighs and drumsticks, ideal for soups, stews and grilling. Sold by weight (minimum 1 kg).", keywords: "chicken legs drumsticks thighs poultry", variants: [kg(7000, 30, 500, 1000)] },
  { slug: "beef", name: "Fresh Beef (Boneless)", category: "meat-poultry", short: "Boneless beef, cut to order.", description: "Boneless beef suitable for stews, soups and kebabs. Sold by weight.", keywords: "beef meat cow", variants: [kg(12000, 20)] },
  // Fish & Seafood
  { slug: "tilapia", name: "Fresh Tilapia", category: "fish-seafood", short: "Whole tilapia, cleaned on request.", description: "Whole fresh tilapia, good for grilling with banku. Sold by weight (minimum 1 kg).", keywords: "tilapia fish banku", featured: true, variants: [kg(6000, 25, 500, 1000)] },
  { slug: "smoked-mackerel", name: "Smoked Fish", category: "fish-seafood", short: "Traditionally smoked fish.", description: "Traditionally smoked fish to flavour soups, stews and kontomire.", keywords: "smoked fish herring mackerel", variants: [{ name: "Pack", unit: "PACK", price: 2500, stock: 40_000 }] },
  { slug: "prawns", name: "Fresh Prawns", category: "fish-seafood", short: "Fresh prawns, sold by weight.", description: "Fresh prawns for stir fries, soups and jollof. Sold by weight.", keywords: "prawns shrimp seafood", variants: [kg(15000, 10)] },
  // Dairy & Eggs
  { slug: "eggs", name: "Fresh Eggs", category: "dairy-eggs", short: "Fresh eggs by the crate.", description: "Fresh eggs for breakfast, baking and cooking.", keywords: "eggs egg crate", featured: true, variants: [{ name: "Crate of 30", unit: "CRATE", price: 6500, stock: 40_000 }, { name: "Half crate (15)", unit: "PACK", price: 3400, stock: 30_000 }] },
  { slug: "fresh-milk", name: "Fresh Milk", category: "dairy-eggs", short: "Chilled fresh milk.", description: "Chilled fresh milk for tea, coffee, cereals and baking.", keywords: "milk dairy", variants: [{ name: "1 litre", unit: "BOTTLE", price: 2500, stock: 40_000 }, { name: "500 ml", unit: "BOTTLE", price: 1400, stock: 40_000 }] },
  { slug: "yoghurt", name: "Fruit Yoghurt", category: "dairy-eggs", short: "Creamy fruit yoghurt.", description: "Creamy, chilled fruit yoghurt.", keywords: "yoghurt yogurt dairy", variants: [{ name: "500 g tub", unit: "ITEM", price: 2200, stock: 30_000 }] },
  { slug: "butter", name: "Salted Butter", category: "dairy-eggs", short: "250 g salted butter.", description: "Salted butter for bread, baking and cooking. 250 g block.", keywords: "butter dairy", variants: [{ name: "250 g", unit: "ITEM", price: 4500, stock: 20_000 }] },
  { slug: "cheese", name: "Cheddar Cheese", category: "dairy-eggs", short: "200 g mature cheddar.", description: "Mature cheddar cheese, 200 g.", keywords: "cheese cheddar dairy", variants: [{ name: "200 g", unit: "ITEM", price: 5500, stock: 15_000 }] },
  // Rice & Grains
  { slug: "jasmine-rice", name: "Jasmine Rice", category: "rice-grains", short: "Fragrant long grain jasmine rice.", description: "Fragrant long grain jasmine rice for jollof, waakye and everyday meals.", keywords: "rice jasmine jollof waakye", featured: true, variants: [{ name: "5 kg bag", unit: "BAG", price: 12000, sale: 11000, stock: 50_000 }, { name: "25 kg bag", unit: "BAG", price: 55000, stock: 12_000, max: 5_000 }] },
  { slug: "brown-rice", name: "Local Brown Rice", category: "rice-grains", short: "Wholesome local brown rice.", description: "Wholesome locally grown brown rice.", keywords: "rice brown local", variants: [{ name: "1 kg pack", unit: "PACK", price: 2200, stock: 40_000 }, { name: "5 kg bag", unit: "BAG", price: 10000, stock: 20_000 }] },
  { slug: "gari", name: "Gari", category: "rice-grains", short: "Crisp cassava gari.", description: "Crisp, dry cassava gari for eba, gari soakings and gari foto.", keywords: "gari cassava eba", variants: [{ name: "1 kg pack", unit: "PACK", price: 1200, stock: 60_000 }, { name: "5 kg bag", unit: "BAG", price: 5500, stock: 25_000 }] },
  { slug: "black-eyed-beans", name: "Black-eyed Beans", category: "rice-grains", short: "Black-eyed beans, sold by weight.", description: "Black-eyed beans for red-red, waakye and kose. Sold by weight (minimum 1 kg).", keywords: "beans black eyed peas red-red waakye", variants: [kg(2600, 40, 500, 1000)] },
  { slug: "oats", name: "Rolled Oats", category: "rice-grains", short: "1 kg rolled oats.", description: "Rolled oats for porridge and baking. 1 kg pack.", keywords: "oats porridge cereal", variants: [{ name: "1 kg pack", unit: "PACK", price: 3500, stock: 25_000 }] },
  { slug: "maize-flour", name: "Corn Flour (Maize Meal)", category: "rice-grains", short: "Fine maize meal for banku and porridge.", description: "Finely milled maize meal for banku, tuo zaafi and porridge.", keywords: "corn maize flour banku", variants: [{ name: "2 kg pack", unit: "PACK", price: 2400, stock: 30_000 }] },
  // Cooking Essentials
  { slug: "vegetable-oil", name: "Vegetable Cooking Oil", category: "cooking-essentials", short: "Refined vegetable oil.", description: "Refined vegetable oil for frying and cooking.", keywords: "oil cooking vegetable", featured: true, variants: [{ name: "1 litre", unit: "BOTTLE", price: 3500, stock: 40_000 }, { name: "5 litres", unit: "BOTTLE", price: 15500, stock: 15_000 }] },
  { slug: "palm-oil", name: "Red Palm Oil", category: "cooking-essentials", short: "Rich red palm oil.", description: "Rich red palm oil for palm nut soup, red-red and stews.", keywords: "palm oil red zomi", variants: [{ name: "1 litre", unit: "BOTTLE", price: 4000, stock: 25_000 }] },
  { slug: "tomato-paste", name: "Tomato Paste", category: "cooking-essentials", short: "Concentrated tomato paste.", description: "Concentrated tomato paste for stews, sauces and jollof.", keywords: "tomato paste puree", variants: [{ name: "400 g tin", unit: "TIN", price: 1500, stock: 50_000 }] },
  { slug: "salt", name: "Iodised Table Salt", category: "cooking-essentials", short: "500 g iodised salt.", description: "Iodised table salt, 500 g.", keywords: "salt", variants: [{ name: "500 g", unit: "PACK", price: 500, stock: 80_000 }] },
  { slug: "sugar", name: "Granulated Sugar", category: "cooking-essentials", short: "1 kg granulated sugar.", description: "Granulated white sugar, 1 kg.", keywords: "sugar", variants: [{ name: "1 kg", unit: "PACK", price: 2200, stock: 50_000 }] },
  { slug: "curry-powder", name: "Curry Powder", category: "cooking-essentials", short: "100 g curry powder.", description: "Aromatic curry powder blend, 100 g.", keywords: "curry spice seasoning", variants: [{ name: "100 g", unit: "PACK", price: 1200, stock: 30_000 }] },
  { slug: "spaghetti", name: "Spaghetti", category: "cooking-essentials", short: "500 g durum wheat spaghetti.", description: "Durum wheat spaghetti, 500 g.", keywords: "pasta spaghetti", variants: [{ name: "500 g", unit: "PACK", price: 1600, sale: 1400, stock: 60_000 }] },
  // Drinks & Beverages
  { slug: "bottled-water", name: "Bottled Drinking Water", category: "drinks-beverages", short: "Still drinking water.", description: "Still drinking water.", keywords: "water mineral bottled", variants: [{ name: "Pack of 12 × 500 ml", unit: "PACK", price: 3000, stock: 40_000 }, { name: "1.5 litre bottle", unit: "BOTTLE", price: 600, stock: 80_000 }] },
  { slug: "soft-drinks", name: "Assorted Soft Drinks", category: "drinks-beverages", short: "Six chilled soft drinks.", description: "A pack of six assorted soft drinks (330 ml cans).", keywords: "soda soft drink minerals", variants: [{ name: "Pack of 6 × 330 ml", unit: "PACK", price: 4200, stock: 30_000 }] },
  { slug: "orange-juice", name: "Orange Juice", category: "drinks-beverages", short: "1 litre orange juice.", description: "Orange juice, 1 litre.", keywords: "juice orange", variants: [{ name: "1 litre", unit: "BOTTLE", price: 3500, stock: 25_000 }] },
  { slug: "tea", name: "Black Tea Bags", category: "drinks-beverages", short: "Box of 50 tea bags.", description: "Black tea bags, box of 50.", keywords: "tea", variants: [{ name: "Box of 50", unit: "BOX", price: 2500, stock: 30_000 }] },
  { slug: "coffee", name: "Roasted Coffee Beans", category: "drinks-beverages", short: "250 g roasted beans.", description: "Medium roast coffee beans, 250 g.", keywords: "coffee beans", variants: [{ name: "250 g", unit: "PACK", price: 6500, stock: 12_000 }] },
  // Snacks
  { slug: "roasted-groundnuts", name: "Roasted Groundnuts", category: "snacks", short: "Roasted groundnuts in shell.", description: "Roasted groundnuts, a classic snack on their own or with banana.", keywords: "groundnuts peanuts nkate", variants: [{ name: "250 g pack", unit: "PACK", price: 1500, stock: 40_000 }] },
  { slug: "plantain-chips", name: "Plantain Chips", category: "snacks", short: "Crunchy plantain chips.", description: "Crunchy, lightly salted plantain chips.", keywords: "plantain chips crisps", featured: true, variants: [{ name: "Pack", unit: "PACK", price: 800, stock: 80_000 }] },
  { slug: "biscuits", name: "Assorted Biscuits", category: "snacks", short: "A pack of assorted biscuits.", description: "Assorted biscuits for tea time and lunch boxes.", keywords: "biscuits cookies", variants: [{ name: "Pack", unit: "PACK", price: 1800, stock: 40_000 }] },
  { slug: "popcorn", name: "Popcorn", category: "snacks", short: "Light, fluffy popcorn.", description: "Lightly salted popcorn.", keywords: "popcorn snack", variants: [{ name: "Pack", unit: "PACK", price: 700, stock: 50_000 }] },
  // Bakery
  { slug: "sugar-bread", name: "Sugar Bread Loaf", category: "bakery", short: "Soft, sweet sugar bread.", description: "Soft, slightly sweet sugar bread, baked fresh.", keywords: "bread sugar bread loaf", featured: true, variants: [{ name: "Large loaf", unit: "LOAF", price: 1800, stock: 30_000 }] },
  { slug: "wholewheat-bread", name: "Wholewheat Bread Loaf", category: "bakery", short: "Wholewheat sandwich loaf.", description: "Wholewheat sandwich loaf.", keywords: "bread wholewheat brown", variants: [{ name: "Loaf", unit: "LOAF", price: 2200, stock: 20_000 }] },
  { slug: "croissants", name: "Butter Croissants", category: "bakery", short: "Pack of 4 butter croissants.", description: "Flaky butter croissants, pack of 4.", keywords: "croissant pastry", variants: [{ name: "Pack of 4", unit: "PACK", price: 3200, stock: 0 }] },
  // Frozen Foods
  { slug: "frozen-vegetables", name: "Frozen Mixed Vegetables", category: "frozen-foods", short: "1 kg mixed vegetables.", description: "Frozen mixed vegetables: carrots, peas, sweetcorn and green beans. 1 kg.", keywords: "frozen vegetables peas corn", variants: [{ name: "1 kg bag", unit: "PACK", price: 3800, stock: 20_000 }] },
  { slug: "ice-cream", name: "Vanilla Ice Cream", category: "frozen-foods", short: "1 litre vanilla ice cream.", description: "Creamy vanilla ice cream, 1 litre tub.", keywords: "ice cream dessert", variants: [{ name: "1 litre tub", unit: "ITEM", price: 6000, stock: 10_000 }] },
  { slug: "sausages", name: "Beef Sausages", category: "frozen-foods", short: "500 g frozen beef sausages.", description: "Frozen beef sausages, 500 g pack.", keywords: "sausages beef frozen", variants: [{ name: "500 g pack", unit: "PACK", price: 4500, stock: 20_000 }] },
  // Household
  { slug: "dishwashing-liquid", name: "Dishwashing Liquid", category: "household-essentials", short: "750 ml dishwashing liquid.", description: "Dishwashing liquid, 750 ml.", keywords: "dish soap washing up liquid cleaning", variants: [{ name: "750 ml", unit: "BOTTLE", price: 2000, stock: 30_000 }] },
  { slug: "laundry-detergent", name: "Laundry Detergent Powder", category: "household-essentials", short: "2 kg washing powder.", description: "Laundry detergent powder for hand and machine washing, 2 kg.", keywords: "detergent washing powder laundry soap", variants: [{ name: "2 kg bag", unit: "BAG", price: 6000, sale: 5200, stock: 25_000 }] },
  { slug: "toilet-tissue", name: "Toilet Tissue", category: "household-essentials", short: "10-roll pack.", description: "Soft toilet tissue, pack of 10 rolls.", keywords: "toilet roll tissue paper", variants: [{ name: "Pack of 10 rolls", unit: "PACK", price: 4000, stock: 30_000 }] },
  { slug: "bar-soap", name: "Bar Soap", category: "household-essentials", short: "Pack of 3 bars.", description: "Multipurpose bar soap, pack of 3.", keywords: "soap bar washing", variants: [{ name: "Pack of 3", unit: "PACK", price: 1800, stock: 40_000 }] },
];

export const ZONES = [
  { name: "Accra Central", region: "Greater Accra", areas: ["Osu", "Adabraka", "Labone", "Ridge", "Asylum Down"], feeMinor: 2000, minOrderMinor: 5000, freeDeliveryThresholdMinor: 40000, isActive: true },
  { name: "East Legon & Airport", region: "Greater Accra", areas: ["East Legon", "Airport Residential", "Shiashie", "Dzorwulu", "Roman Ridge"], feeMinor: 2500, minOrderMinor: 5000, freeDeliveryThresholdMinor: 50000, isActive: true },
  { name: "Tema", region: "Greater Accra", areas: ["Community 1 to 25", "Sakumono", "Lashibi", "Spintex"], feeMinor: 3500, minOrderMinor: 10000, freeDeliveryThresholdMinor: null, isActive: true },
  { name: "Kasoa", region: "Central", areas: ["Kasoa", "Old Barrier", "Millennium City"], feeMinor: 4000, minOrderMinor: 15000, freeDeliveryThresholdMinor: null, isActive: false },
];
