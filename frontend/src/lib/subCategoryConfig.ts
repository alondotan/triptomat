import {
  Globe, Flag, Droplets, Waves, Mountain, Sun, Snowflake, Compass, Anchor,
  Landmark, Church, Building2, Users, Tent, TreePine, Home, Hotel,
  MapPin, Navigation, Layers, Flame, BarChart3, Trees, Palmtree, Map as MapIcon,
  ShoppingBag, Palette, Smile, Bike, Star, Eye, Footprints, Camera,
  Ship, Music, Brush, Moon, Sparkles, Gamepad2, Theater,
  Wine, Beer, Film, Fish, Bird, Rocket, Bath, Car, Bus, Train, TrainFront,
  Plane, Sailboat, CreditCard, ShoppingCart, Wifi, Lock, Droplet,
  Briefcase, Phone, Pill, Heart, Lightbulb, AlertTriangle, Cloud, Handshake,
  Calendar, Info, Luggage, Utensils, Coffee, UtensilsCrossed, IceCream2,
  GlassWater, Beef, Egg, Pizza, Soup, Gem, BedDouble, House,
  Receipt, CircleDollarSign, Package, Smartphone, Hospital, 
  type LucideIcon, MoreHorizontal, Zap, Wrench, Bed,
  PlaneTakeoff, CableCar, Truck, Construction,
  BookOpen, Baby, Timer, Scissors, DoorOpen, 
} from 'lucide-react';

// Material Design icon name → Lucide icon component
const materialToLucide: Record<string, LucideIcon> = {
  public: Globe,
  flag: Flag,
  water: Droplets,
  waves: Waves,
  landscape: Mountain,
  wb_sunny: Sun,
  ac_unit: Snowflake,
  explore: Compass,
  anchor: Anchor,
  account_balance: Landmark,
  church: Church,
  map: MapIcon,
  domain: Building2,
  location_city: Building2,
  groups: Users,
  category: Sparkles,
  apartment: Building2,
  architecture: Landmark,
  terrain: Mountain,
  layers: Layers,
  whatshot: Flame,
  waterfall_chart: BarChart3,
  park: Trees,
  nature: TreePine,
  nature_people: TreePine,
  home: Home,
  holiday_village: Home,
  home_work: House,
  grid_view: MapPin,
  reorder: MapPin,
  directions_walk: Footprints,
  hub: Navigation,
  moving: Navigation,
  door_front: DoorOpen,
  place: MapPin,
  location_on: MapPin,
  shop: ShoppingBag,
  eco: TreePine,
  history: BookOpen,
  palette: Palette,
  emoji_objects: Lightbulb,
  beach_access: Palmtree,
  pets: Fish,
  directions_bike: Bike,
  star: Star,
  visibility: Eye,
  photo_camera: Camera,
  directions_boat: Ship,
  music_note: Music,
  brush: Brush,
  nights_stay: Moon,
  spa: Bath,
  casino: Gamepad2,
  kayaking: Waves,
  auto_awesome: Sparkles,
  umbrella: Palmtree,
  format_paint: Brush,
  temple_hindu: Church,
  child_care: Baby,
  child_friendly: Baby,
  local_mall: ShoppingBag,
  history_edu: BookOpen,
  pool: Waves,
  wine_bar: Wine,
  local_drink: Beer,
  theaters: Theater,
  cabin: Home,
  festival: Tent,
  local_parking: Fish,
  flight: Plane,
  flight_takeoff: PlaneTakeoff,
  hot_tub: Bath,
  navigation: Navigation,
  art_track: Palette,
  alt_route: Navigation,
  scuba_diving: Waves,
  surfing: Waves,
  hiking: Footprints,
  directions_car: Car,
  restaurant: Utensils,
  storefront: ShoppingBag,
  restaurant_menu: UtensilsCrossed,
  record_voice_over: Users,
  hotel: Hotel,
  king_bed: BedDouble,
  gite: House,
  free_breakfast: Coffee,
  stars: Gem,
  view_compact: Building2,
  hotel_class: Star,
  family_restroom: Users,
  agriculture: TreePine,
  cottage: Home,
  house: House,
  rv_hookup: Truck,
  calendar_month: Calendar,
  diamond: Gem,
  savings: CircleDollarSign,
  local_cafe: Coffee,
  local_dining: UtensilsCrossed,
  emoji_food_beverage: GlassWater,
  icecream: IceCream2,
  local_bar: Wine,
  fastfood: Pizza,
  nightlife: Moon,
  egg_alt: Egg,
  set_meal: Soup,
  directions_bus: Bus,
  train: Train,
  subway: Train,
  taxi_alert: Car,
  airplanemode_active: Plane,
  tram: TrainFront,
  car_rental: Car,
  airport_shuttle: Car,
  local_taxi: Car,
  two_wheeler: Bike,
  atm: CreditCard,
  travel_explore: Compass,
  local_laundry_service: Scissors,
  sim_card: Smartphone,
  local_hospital: Hospital,
  local_pharmacy: Pill,
  currency_exchange: CircleDollarSign,
  luggage: Luggage,
  info: Info,
  shopping_cart: ShoppingCart,
  badge: Receipt,
  construction: Construction,
  lock: Lock,
  shower: Droplet,
  wifi: Wifi,
  work: Briefcase,
  event_available: Calendar,
  gpp_maybe: AlertTriangle,
  inventory_2: Package,
  install_mobile: Smartphone,
  payments: CircleDollarSign,
  commute: Car,
  report_problem: AlertTriangle,
  wb_cloudy: Cloud,
  health_and_safety: Heart,
  handshake: Handshake,
  more_horiz: MoreHorizontal,
  gavel: Landmark,
  celebration: Tent,
  sports_soccer: Zap,
  sports_basketball: Zap,
  directions_run: Footprints,
  museum: Landmark,
  panorama: Eye,
  shopping_basket: ShoppingBag,
  business_center: Briefcase,
};

export interface SubCategoryEntry {
  type: string;
  icon: string;
  category: string;
  is_geo_location: boolean;
}

export interface CategoryMeta {
  db_name: string | null;
  icon: string;
  color: string;
  label_he: string;
}

export interface SubCategoryConfig {
  master_list: SubCategoryEntry[];
  categories: Record<string, CategoryMeta>;
}

// Lucide icon name → component (for category-level icons)
const lucideByName: Record<string, LucideIcon> = {
  zap: Zap, bed: Bed, utensils: Utensils, wrench: Wrench,
  plane: Plane, users: Users, calendar: Calendar, lightbulb: Lightbulb, map: MapIcon,
};

let cachedConfig: SubCategoryConfig | null = null;

// Cached reverse lookup: db_name → CategoryMeta (built on load)
let dbCategoryMap: Record<string, CategoryMeta> = {};

function buildDbCategoryMap(categories: Record<string, CategoryMeta>): Record<string, CategoryMeta> {
  const result: Record<string, CategoryMeta> = {};
  for (const meta of Object.values(categories)) {
    if (meta.db_name && !result[meta.db_name]) {
      result[meta.db_name] = meta;
    }
  }
  return result;
}

function getCategoryToDbMap(): Record<string, string> {
  if (!cachedConfig?.categories) return {};
  const map: Record<string, string> = {};
  for (const [configCat, meta] of Object.entries(cachedConfig.categories)) {
    if (meta.db_name) map[configCat] = meta.db_name;
  }
  return map;
}

export async function loadSubCategoryConfig(): Promise<SubCategoryConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const res = await fetch('/data/sub-categories.json');
    if (!res.ok) return { master_list: [], categories: {} } as SubCategoryConfig;
    cachedConfig = await res.json();
    if (cachedConfig?.categories) {
      dbCategoryMap = buildDbCategoryMap(cachedConfig.categories);
    }
    return cachedConfig!;
  } catch {
    return { master_list: [], categories: {} } as SubCategoryConfig;
  }
}

// Synchronous lookup (after load)
export function getSubCategoryIcon(type: string): LucideIcon {
  if (!cachedConfig) return MapPin;
  const entry = cachedConfig.master_list.find(e => e.type.toLowerCase() === type.toLowerCase());
  if (!entry) return MapPin;
  return materialToLucide[entry.icon] || MapPin;
}

export function getSubCategoryEntry(type: string): SubCategoryEntry | undefined {
  if (!cachedConfig) return undefined;
  return cachedConfig.master_list.find(e => e.type.toLowerCase() === type.toLowerCase());
}

export function getSubCategoriesForPOICategory(poiCategory: string): SubCategoryEntry[] {
  if (!cachedConfig) return [];
  const catToDb = getCategoryToDbMap();
  const configCats = Object.entries(catToDb)
    .filter(([, db]) => db === poiCategory)
    .map(([cfg]) => cfg);
  if (!configCats.length) return [];
  return cachedConfig.master_list.filter(e => configCats.includes(e.category) && !e.is_geo_location);
}

export function getTransportSubCategories(): SubCategoryEntry[] {
  if (!cachedConfig) return [];
  return cachedConfig.master_list.filter(e => e.category === 'Transportation');
}

export function getLucideIcon(materialIcon: string): LucideIcon {
  return materialToLucide[materialIcon] || MapPin;
}

// ── Derived category helpers (used by recommendationService etc.) ────────────

/** Returns type → DB category mapping, derived from the loaded config. */
export function getTypeToCategoryMap(): Record<string, string> {
  if (!cachedConfig) return {};
  const catToDb = getCategoryToDbMap();
  const map: Record<string, string> = {};
  for (const entry of cachedConfig.master_list) {
    const db = catToDb[entry.category];
    if (db) map[entry.type] = db;
  }
  return map;
}

/** Returns the set of geographic location types. */
export function getGeoTypes(): Set<string> {
  if (!cachedConfig) return new Set();
  return new Set(
    cachedConfig.master_list.filter(e => e.is_geo_location).map(e => e.type)
  );
}

/** Returns the set of tip types. */
export function getTipTypes(): Set<string> {
  if (!cachedConfig) return new Set();
  return new Set(
    cachedConfig.master_list.filter(e => e.category === 'Tips').map(e => e.type)
  );
}

// ── Category-level helpers (by DB category name) ─────────────────────────────

/** Get the Lucide icon component for a DB category (e.g., 'attraction' → Zap). */
export function getCategoryIcon(dbCategory: string): LucideIcon {
  const meta = dbCategoryMap[dbCategory];
  if (!meta) return MapPin;
  return lucideByName[meta.icon] || MapPin;
}

/** Get Hebrew label for a DB category (e.g., 'eatery' → 'אוכל'). */
export function getCategoryLabel(dbCategory: string): string {
  const meta = dbCategoryMap[dbCategory];
  return meta?.label_he || dbCategory;
}

/** Get Tailwind color class for a DB category. */
export function getCategoryColor(dbCategory: string): string {
  const meta = dbCategoryMap[dbCategory];
  return meta?.color || 'text-gray-500';
}

/** Get all DB categories that create POIs (deduplicated). */
export function getPOICategories(): string[] {
  if (!cachedConfig?.categories) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const meta of Object.values(cachedConfig.categories)) {
    if (meta.db_name && meta.db_name !== 'transportation' && meta.db_name !== 'contact' && !seen.has(meta.db_name)) {
      seen.add(meta.db_name);
      result.push(meta.db_name);
    }
  }
  return result;
}

// Preload on module import
loadSubCategoryConfig();
