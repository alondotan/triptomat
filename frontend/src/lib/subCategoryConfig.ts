import {
  Globe, Flag, Droplets, Waves, Mountain, Sun, Snowflake, Compass, Anchor,
  Landmark, Church, Map, Building2, Users, Tent, TreePine, Home, Hotel,
  MapPin, Navigation, Layers, Flame, BarChart3, Trees, Palmtree,
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
  map: Map,
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

export interface SubCategoryConfig {
  master_list: SubCategoryEntry[];
  cat_styles: Record<string, { icon: string; color: string }>;
}

let cachedConfig: SubCategoryConfig | null = null;

export async function loadSubCategoryConfig(): Promise<SubCategoryConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const res = await fetch('/data/sub-categories.json');
    if (!res.ok) return { master_list: [] } as SubCategoryConfig;
    cachedConfig = await res.json();
    return cachedConfig!;
  } catch {
    return { master_list: [] } as SubCategoryConfig;
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

// Map POI category to config categories
const poiCategoryToConfigCategory: Record<string, string[]> = {
  accommodation: ['Accommodations'],
  eatery: ['Eateries'],
  attraction: ['Activities', 'Events'],
  service: ['Services'],
};

export function getSubCategoriesForPOICategory(poiCategory: string): SubCategoryEntry[] {
  if (!cachedConfig) return [];
  const configCats = poiCategoryToConfigCategory[poiCategory];
  if (!configCats) return [];
  return cachedConfig.master_list.filter(e => configCats.includes(e.category) && !e.is_geo_location);
}

export function getTransportSubCategories(): SubCategoryEntry[] {
  if (!cachedConfig) return [];
  return cachedConfig.master_list.filter(e => e.category === 'Transportation');
}

export function getLucideIcon(materialIcon: string): LucideIcon {
  return materialToLucide[materialIcon] || MapPin;
}

// Preload on module import
loadSubCategoryConfig();
