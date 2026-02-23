import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "identity",
};

// Mirrors TYPE_TO_CATEGORY from recommendation-webhook (full list matching config.json)
const TYPE_TO_CATEGORY: Record<string, string> = {
  hotel: "accommodation", glamping: "accommodation", hostel: "accommodation", villa: "accommodation",
  resort: "accommodation", apartment: "accommodation", guesthouse: "accommodation",
  bedAndBreakfast: "accommodation", motel: "accommodation", lodge: "accommodation",
  ecoLodge: "accommodation", boutiqueHotel: "accommodation", capsuleHotel: "accommodation",
  ryokan: "accommodation", homestay: "accommodation", farmStay: "accommodation",
  cottage: "accommodation", chalet: "accommodation", bungalow: "accommodation",
  treehouse: "accommodation", houseboat: "accommodation", campground: "accommodation",
  campingTent: "accommodation", rvPark: "accommodation", servicedApartment: "accommodation",
  longStayHotel: "accommodation", luxuryHotel: "accommodation", budgetHotel: "accommodation",
  otherAccommodation: "accommodation",
  restaurant: "eatery", cafe: "eatery", bakery: "eatery", deli: "eatery",
  bistro: "eatery", diner: "eatery", foodTruck: "eatery", foodCourt: "eatery",
  buffet: "eatery", iceCreamParlor: "eatery", juiceBar: "eatery", pub: "eatery",
  bar: "eatery", tavern: "eatery", wineBar: "eatery", brewpub: "eatery",
  sushiBar: "eatery", teahouse: "eatery", steakhouse: "eatery", tapasBar: "eatery",
  doughnutShop: "eatery", dessertBar: "eatery", streetFood: "eatery",
  rooftopBar: "eatery", brunchSpot: "eatery", speakeasy: "eatery",
  fineDining: "eatery", localCuisine: "eatery", veganRestaurant: "eatery",
  vegetarianRestaurant: "eatery", seafoodRestaurant: "eatery", familyRestaurant: "eatery",
  otherEatery: "eatery",
  market: "attraction", park: "attraction", landmark: "attraction", natural: "attraction",
  historical: "attraction", cultural: "attraction", amusement: "attraction", beach: "attraction",
  mountain: "attraction", wildlife: "attraction", adventure: "attraction", religious: "attraction",
  architectural: "attraction", underwater: "attraction", nationalPark: "attraction",
  scenic: "attraction", museum: "attraction", shopping: "attraction", zoo: "attraction",
  themePark: "attraction", botanicalGarden: "attraction", sports: "attraction",
  music: "attraction", art: "attraction", nightlife: "attraction", spa: "attraction",
  casino: "attraction", viewpoint: "attraction", hikingTrail: "attraction",
  extremeSports: "attraction", hiddenGem: "attraction", beachClub: "attraction",
  stargazing: "attraction", streetArt: "attraction", photographySpot: "attraction",
  temple: "attraction", boatTour: "attraction", playground: "attraction",
  walkingTour: "attraction", shoppingMall: "attraction", historicSite: "attraction",
  waterPark: "attraction", skiResort: "attraction", vineyard: "attraction",
  brewery: "attraction", movieTheater: "attraction", concertHall: "attraction",
  botanicalPark: "attraction", fishingSpot: "attraction", birdSanctuary: "attraction",
  zipLine: "attraction", hotSpring: "attraction", canyon: "attraction",
  volcano: "attraction", observatory: "attraction", lighthouse: "attraction",
  artGallery: "attraction", aquarium: "attraction", cave: "attraction",
  waterfall: "attraction", snorkeling: "attraction", diving: "attraction",
  surfing: "attraction", kayakingActivity: "attraction", rafting: "attraction",
  climbing: "attraction", trekking: "attraction", jeepTour: "attraction",
  safari: "attraction", foodTour: "attraction", streetMarketTour: "attraction",
  cookingClass: "attraction", wineTasting: "attraction", breweryTour: "attraction",
  kidsAttraction: "attraction", point_of_interest: "attraction", otherActivity: "attraction",
  festival: "attraction", musicFestival: "attraction", carnival: "attraction",
  culturalParade: "attraction", foodFestival: "attraction", artExhibition: "attraction",
  fireworks: "attraction", sportingEvent: "attraction", localFestival: "attraction",
  religiousFestival: "attraction", streetParade: "attraction", sportsMatch: "attraction",
  marathon: "attraction", concert: "attraction", theaterShow: "attraction", foodFair: "attraction",
  car: "transportation", bus: "transportation", train: "transportation", subway: "transportation",
  bicycle: "transportation", motorcycle: "transportation", taxi: "transportation",
  ferry: "transportation", airplane: "transportation", scooter: "transportation",
  cruise: "transportation", tram: "transportation", cruiseShip: "transportation",
  carRental: "transportation", domesticFlight: "transportation", internationalFlight: "transportation",
  nightTrain: "transportation", highSpeedTrain: "transportation", cableCar: "transportation",
  funicular: "transportation", boatTaxi: "transportation", rideshare: "transportation",
  privateTransfer: "transportation", otherTransportation: "transportation",
  airport: "transportation", transit_hub: "attraction",
  atm: "service", travelAgency: "service", laundry: "service", simCard: "service",
  hospital: "service", pharmacy: "service", currencyExchange: "service",
  luggageStorage: "service", touristInfo: "service", supermarket: "service",
  tourGuide: "service", driverService: "service", bikeRental: "service",
  scooterRental: "service", equipmentRental: "service", locker: "service",
  showerFacility: "service", wifiHotspot: "service", coworkingSpace: "service",
  embassy: "service", otherService: "service",
};

// All non-geo types (for recommendations.category)
const ALLOWED_TYPES = Object.keys(TYPE_TO_CATEGORY).join(", ");

// Geo types (is_geo_location: true from config.json) — for sites_hierarchy site_type
const GEO_TYPES = [
  "continent", "country", "state", "province", "territory", "region",
  "archipelago", "island_group", "island", "mountain_range", "valley",
  "canyon", "volcano", "waterfall", "lagoon", "bay", "lake", "coastline",
  "national_park", "nature_reserve", "metropolitan_area", "municipality",
  "city", "town", "village", "suburb", "district", "neighborhood",
  "pedestrian_zone", "transit_hub", "resort_complex", "itinerary_route",
  "border_crossing", "area", "historicDistrict", "oldTown",
  "river", "delta", "fjord", "plateau", "desert", "glacier", "reef",
  "peninsula", "harbor", "monastery", "county", "republic", "oblast",
  "borough", "capital_city", "department", "reserve", "township",
  "forest", "governorate", "metropolis", "prefecture", "atoll",
  "otherGeography",
].join(", ");

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawPlace {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
}

interface FetchResult {
  places: RawPlace[];
  listName: string | null;
}

interface EnrichedPlace {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  types: string[];
  rating?: number;
  summary: string;
}

interface AiRecommendation {
  name: string;
  category: string;
  sentiment: string;
  paragraph: string;
  site: string;
  location: {
    address?: string;
    coordinates?: { lat: number; lng: number };
  };
}

interface SiteNode {
  site: string;
  site_type: string;
  sub_sites?: SiteNode[];
}

interface AiOutput {
  sites_hierarchy: SiteNode[];
  recommendations: AiRecommendation[];
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { list_id, token } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate webhook token
    const { data: tokenRow } = await supabase
      .from("webhook_tokens")
      .select("user_id")
      .eq("token", token)
      .single();

    if (!tokenRow) return json({ error: "Invalid token" }, 401);

    // Get the list (must belong to this user)
    const { data: list } = await supabase
      .from("map_lists")
      .select("*")
      .eq("id", list_id)
      .eq("user_id", tokenRow.user_id)
      .single();

    if (!list) return json({ error: "List not found" }, 404);

    // ── Step 1: fetch raw places from Google Maps entitylist API ──
    const { places: rawPlaces, listName } = await fetchRawPlacesFromGoogleMaps(list.url);
    if (rawPlaces.length === 0) {
      if (listName) {
        await supabase.from("map_lists").update({ name: listName }).eq("id", list_id);
      }
      return json({ success: true, new_places: 0, total_places: 0, message: "No places found" });
    }

    // ── Step 2: filter to new items (not yet synced) ──
    const { data: existingItems } = await supabase
      .from("map_list_items")
      .select("place_key")
      .eq("list_id", list_id);

    const existingKeys = new Set((existingItems || []).map((i: any) => i.place_key));
    const newRaw = rawPlaces.filter((p) => !existingKeys.has(toKey(p.name)));

    if (newRaw.length === 0) {
      // Still update list name if we got it
      if (listName) {
        await supabase.from("map_lists").update({ name: listName, last_synced_at: new Date().toISOString() }).eq("id", list_id);
      }
      return json({ success: true, new_places: 0, total_places: rawPlaces.length, message: "All up to date" });
    }

    // ── Step 3: deduplicate against existing POIs ──
    const { data: existingPois } = await supabase
      .from("points_of_interest")
      .select("name")
      .eq("trip_id", list.trip_id);

    const existingPoiNames = new Set(
      (existingPois || []).map((p: any) => p.name.toLowerCase().trim())
    );
    const dedupedRaw = newRaw.filter(
      (p) => !existingPoiNames.has(p.name.toLowerCase().trim())
    );

    if (dedupedRaw.length === 0) {
      // Still record map_list_items even if all POIs already exist
      await supabase.from("map_list_items").insert(
        newRaw.map((p) => ({ list_id, place_key: toKey(p.name), place_name: p.name }))
      );
      const totalCount = existingKeys.size + newRaw.length;
      const metaUpdate: Record<string, unknown> = { last_synced_at: new Date().toISOString(), item_count: totalCount };
      if (listName) metaUpdate.name = listName;
      await supabase.from("map_lists").update(metaUpdate).eq("id", list_id);
      return json({ success: true, new_places: 0, total_places: totalCount, message: "All POIs already exist" });
    }

    // ── Step 4: enrich with Google Places API ──
    const enriched = await enrichWithGooglePlaces(dedupedRaw);
    console.log(`[sync] Enriched ${enriched.length} places`);

    // ── Step 5: classify with Gemini / OpenAI ──
    const aiOutput = await classifyWithAI(enriched);
    console.log(`[sync] AI returned ${aiOutput.recommendations.length} recommendations`);
    console.log("[sync] sites_hierarchy:", JSON.stringify(aiOutput.sites_hierarchy));

    // ── Step 6: insert POIs ──
    const recs = aiOutput.recommendations.filter((r) => r.name);
    if (recs.length > 0) {
      const poiRows = recs.map((rec) => {
        const subCat = rec.category in TYPE_TO_CATEGORY ? rec.category : "landmark";
        const category = TYPE_TO_CATEGORY[subCat] || "attraction";
        return {
          trip_id: list.trip_id,
          name: rec.name,
          category,
          sub_category: subCat,
          status: "candidate",
          location: {
            city: rec.site || null,
            address: rec.location?.address || null,
            coordinates: rec.location?.coordinates || null,
          },
          source_refs: { email_ids: [], recommendation_ids: [], map_list_id: list_id },
          details: {
            from_map_list: true,
            source_url: list.url,
            source_title: list.name,
          },
        };
      });

      const { error: poiError } = await supabase.from("points_of_interest").insert(poiRows);
      if (poiError) console.error("[sync] POI insert error:", poiError);
      else console.log(`[sync] Inserted ${poiRows.length} POIs`);
    }

    // ── Step 7: record synced items + update list metadata ──
    await supabase.from("map_list_items").insert(
      newRaw.map((p) => ({ list_id, place_key: toKey(p.name), place_name: p.name }))
    );

    const totalCount = existingKeys.size + newRaw.length;
    const metaUpdate: Record<string, unknown> = { last_synced_at: new Date().toISOString(), item_count: totalCount };
    if (listName) metaUpdate.name = listName;
    await supabase.from("map_lists").update(metaUpdate).eq("id", list_id);

    // ── Step 8: update trip hierarchy + countries (same as recommendation-webhook) ──
    // Insert a source_recommendations record so TripContext picks up the sites_hierarchy
    // (used by city selectors, location pickers, etc.)
    if (aiOutput.sites_hierarchy.length > 0) {
      await supabase.from("source_recommendations").insert([{
        recommendation_id: crypto.randomUUID(),
        trip_id: list.trip_id,
        timestamp: new Date().toISOString(),
        source_url: list.url,
        source_title: list.name,
        source_image: null,
        analysis: { sites_hierarchy: aiOutput.sites_hierarchy, recommendations: [] },
        status: "linked",
        linked_entities: [],
      }]);

      // Note: we intentionally do NOT auto-update trips.countries here.
      // Countries on a trip are managed explicitly by the user.
    }

    return json({ success: true, new_places: recs.length, total_places: totalCount });
  } catch (e) {
    console.error("[sync] Error:", e);
    return json({ error: String(e) }, 500);
  }
});

// ─── Step 1: Google Maps entitylist API ──────────────────────────────────────

async function fetchRawPlacesFromGoogleMaps(url: string): Promise<FetchResult> {
  // Follow redirect (maps.app.goo.gl → google.com/maps/...)
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
  const finalUrl = res.url;
  await res.body?.cancel();
  console.log(`[sync] ${url} → ${finalUrl}`);

  // Extract Google list ID from URL
  let googleListId: string | null = null;
  const listPathMatch = finalUrl.match(/\/maps\/placelists\/list\/([A-Za-z0-9_-]{10,})/);
  if (listPathMatch) {
    googleListId = listPathMatch[1];
  } else {
    const dataParamMatch = finalUrl.match(/!2s([A-Za-z0-9_-]{10,})/);
    if (dataParamMatch) googleListId = dataParamMatch[1];
  }

  if (!googleListId) {
    console.error("[sync] Could not extract list ID from:", finalUrl);
    return { places: [], listName: null };
  }
  console.log(`[sync] Google list ID: ${googleListId}`);

  // Call internal entitylist API (no auth needed for public lists)
  const apiUrl =
    `https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us&pb=!1m1!1s${googleListId}!2e2!3e2!4i500`;

  const apiRes = await fetch(apiUrl, {
    headers: {
      ...BROWSER_HEADERS,
      "Accept": "*/*",
      "Referer": `https://www.google.com/maps/placelists/list/${googleListId}?hl=en`,
    },
    redirect: "follow",
  });

  const rawBody = await apiRes.text();
  console.log(`[sync] entitylist status: ${apiRes.status}, len: ${rawBody.length}`);

  // Strip Google's XSSI prefix )]}' and parse
  const jsonStr = rawBody.replace(/^\s*\)\]\}'\s*/, "").trim();
  if (!jsonStr.startsWith("[")) {
    console.error("[sync] Unexpected entitylist response:", rawBody.substring(0, 300));
    return { places: [], listName: null };
  }

  let data: any;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    console.error("[sync] JSON parse failed:", e);
    return { places: [], listName: null };
  }

  // Log structure of data[0] (up to index 7, before the places array at [8]) for debugging
  if (Array.isArray(data?.[0])) {
    for (let i = 0; i < Math.min(9, data[0].length); i++) {
      const v = data[0][i];
      console.log(`[sync] data[0][${i}] = ${JSON.stringify(v)?.substring(0, 200)}`);
    }
  }

  // Extract list name from Google Maps entitylist response.
  // Structure: data[0][1] is typically the list title string.
  // Fallback: scan data[0][0..6] for short human-readable strings (not opaque IDs).
  let listName: string | null = null;

  const idPattern = /^[A-Za-z0-9_-]{20,}$/; // long opaque IDs with no spaces/punctuation

  const isGoodTitle = (v: unknown): v is string =>
    typeof v === "string" && v.length >= 2 && v.length <= 150 && !idPattern.test(v);

  // Priority 1: data[0][1] — the canonical list title slot
  if (isGoodTitle(data?.[0]?.[1])) {
    listName = data[0][1];
  }

  // Priority 2: scan other slots (skip [8] which is the places array)
  if (!listName && Array.isArray(data?.[0])) {
    for (let i = 0; i < Math.min(7, data[0].length); i++) {
      if (i === 1) continue; // already checked
      const v = data[0][i];
      if (isGoodTitle(v)) { listName = v; break; }
    }
  }

  console.log(`[sync] Extracted list name: ${listName}`);

  // Parse places from data[0][8]
  // Each entry: [null, [null, null, subtitle, null, address, [null,null,lat,lng], ...], "Place Name", ...]
  const placesArray = data?.[0]?.[8];
  if (!Array.isArray(placesArray)) {
    console.warn("[sync] No places array at data[0][8]");
    return { places: [], listName };
  }

  const result: RawPlace[] = [];
  for (const entry of placesArray) {
    if (!Array.isArray(entry)) continue;
    const name = entry[2];
    if (!name || typeof name !== "string") continue;
    const details = entry[1];
    const address: string = details?.[4] || "";
    const coords = details?.[5]; // [null, null, lat, lng]
    result.push({
      name,
      address,
      lat: coords?.[2] ?? undefined,
      lng: coords?.[3] ?? undefined,
    });
  }

  console.log(`[sync] Raw places: ${result.length}`);
  return { places: result, listName };
}

// ─── Step 2: Google Places API enrichment ────────────────────────────────────

async function enrichWithGooglePlaces(rawPlaces: RawPlace[]): Promise<EnrichedPlace[]> {
  const mapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

  if (!mapsKey) {
    console.log("[sync] No GOOGLE_MAPS_API_KEY — skipping Places enrichment");
    return rawPlaces.map((p) => ({ ...p, types: [], summary: "" }));
  }

  const result: EnrichedPlace[] = [];
  for (const place of rawPlaces) {
    try {
      const body: Record<string, unknown> = {
        textQuery: place.name,
        languageCode: "en",
      };
      if (place.lat != null && place.lng != null) {
        body.locationBias = {
          circle: {
            center: { latitude: place.lat, longitude: place.lng },
            radius: 1000.0,
          },
        };
      }

      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": mapsKey,
          "X-Goog-FieldMask":
            "places.displayName,places.formattedAddress,places.location,places.rating,places.types,places.editorialSummary",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      const p = data.places?.[0];
      if (p) {
        result.push({
          name: p.displayName?.text || place.name,
          address: p.formattedAddress || place.address,
          lat: p.location?.latitude ?? place.lat,
          lng: p.location?.longitude ?? place.lng,
          types: p.types || [],
          rating: p.rating,
          summary: p.editorialSummary?.text || "",
        });
        console.log(`[sync] Places enriched: ${p.displayName?.text}`);
      } else {
        console.log(`[sync] Places: no result for "${place.name}"`);
        result.push({ ...place, types: [], summary: "" });
      }

      // Respect Places API rate limit
      await new Promise((r) => setTimeout(r, 150));
    } catch (e) {
      console.warn(`[sync] Places error for "${place.name}":`, e);
      result.push({ ...place, types: [], summary: "" });
    }
  }

  return result;
}

// ─── Step 3: AI classification (Gemini preferred, OpenAI fallback) ────────────

function buildPrompt(places: EnrichedPlace[]): string {
return `
Your output must be a RFC8259 compliant JSON object with the following structure:

{
      "sites_hierarchy": [
                    {
                        "site": "Country Name",
                        "site_type": "country",
                        "sub_sites": [
                            {
                                "site": "City/State Name/Region",
                                "site_type": "city",
                                "sub_sites": []
                            }
                        ]
                    }
        ],
    "recommendations": [
        {
            "name": "Name of the specific place or attraction",
            "category": "Must be one of the allowed types listed below",
            "sentiment": "good | bad",
            "paragraph": "The exact quote or sentence from the data describing this place",
            "site": "The location/neighborhood/city from the sitesList",
            "location_type": "specific | general",
            "location": {
                "address": "string",
                "coordinates": {
                    "lat": 0,
                    "lng": 0
                }
            }
        }
    ]
}

### Rules:
1. Category must be strictly from: ${ALLOWED_TYPES}.
2. The sites_hierarchy (Nested Structure):
 2.1 Construct a nested geographical tree under the key "sites_hierarchy".
 2.2 The first level must be the country or countries that are in the data.
 2.3 Each node must be an object: {"site": "Name", "site_type": "Type", "sub_sites": []}.
 2.4 Use "sub_sites" only if child locations exist.
 2.5 The sites_hierarchy must represent a geographical hierarchy and must be strictly from: ${GEO_TYPES}
 2.6 The hierarchy MUST follow a logical path: Country -> State/Region -> City -> Neighborhood/POI.
 2.7 The sites_hierarchy should only contain the sites of the recommendations.
 2.8 All values in the sites_hierarchy must be the english names.

3. Location Handling:
 3.1 Identify if the recommendation is "specific" (a concrete business, hotel, restaurant, or landmark) or "general" (e.g., "beaches", "nightlife" in general).
 3.2 Set "location_type" accordingly.
 3.3 IF "location_type" is "general", leave the "location" object with null or empty strings.
 3.4 IF "location_type" is "specific", fill the "location" object ONLY if the information is explicitly provided or clearly inferred.
 3.5 Put coordinates and address only if unknown.
4. The recommendations:
 4.1 The data in the paragraph should be in the original language of the data.
5. Only provide the JSON object. No prose or explanations.
6. Perform a JSON integrity check before responding.


### Data to Process (Enriched from Google Maps):
${JSON.stringify(places, null, 2)}`;
}


const BATCH_SIZE = 20;

async function classifyWithAI(enrichedPlaces: EnrichedPlace[]): Promise<AiOutput> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  if (!geminiKey && !openaiKey) {
    console.error("[sync] No AI key found (GEMINI_API_KEY or OPENAI_API_KEY)");
    return { sites_hierarchy: [], recommendations: [] };
  }

  // Split into batches to avoid Gemini output token limits
  const batches: EnrichedPlace[][] = [];
  for (let i = 0; i < enrichedPlaces.length; i += BATCH_SIZE) {
    batches.push(enrichedPlaces.slice(i, i + BATCH_SIZE));
  }
  console.log(`[sync] Processing ${enrichedPlaces.length} places in ${batches.length} batch(es)`);

  const merged: AiOutput = { sites_hierarchy: [], recommendations: [] };

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const prompt = buildPrompt(batch);
    console.log(`[sync] Batch ${i + 1}/${batches.length}: ${batch.length} places, prompt length: ${prompt.length}`);

    let result: AiOutput;
    if (geminiKey) {
      result = await callGemini(prompt, geminiKey);
    } else {
      result = await callOpenAI(prompt, openaiKey!);
    }

    merged.recommendations.push(...result.recommendations);
    mergeHierarchies(merged.sites_hierarchy, result.sites_hierarchy);
  }

  return merged;
}

/** Merge src hierarchy nodes into dst in-place (same logic as frontend mergeSubSites) */
function mergeHierarchies(dst: SiteNode[], src: SiteNode[]) {
  for (const srcNode of src) {
    let existing: SiteNode | undefined;
    for (let i = 0; i < dst.length; i++) {
      if (dst[i].site.toLowerCase() === srcNode.site.toLowerCase()) {
        existing = dst[i];
        break;
      }
    }
    if (existing) {
      if (srcNode.sub_sites && srcNode.sub_sites.length > 0) {
        if (!existing.sub_sites) existing.sub_sites = [];
        mergeHierarchies(existing.sub_sites, srcNode.sub_sites);
      }
    } else {
      dst.push(srcNode);
    }
  }
}

async function callGemini(prompt: string, apiKey: string): Promise<AiOutput> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    }
  );
  const data = await res.json();
  console.log("[sync] Gemini response status:", res.status);
  if (data.error) {
    console.error("[sync] Gemini error:", data.error);
    return { sites_hierarchy: [], recommendations: [] };
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  console.log("[sync] Gemini output preview:", text.substring(0, 500));
  try {
    return JSON.parse(text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim());
  } catch (e) {
    console.error("[sync] Gemini JSON parse error:", e);
    return { sites_hierarchy: [], recommendations: [] };
  }
}

async function callOpenAI(prompt: string, apiKey: string): Promise<AiOutput> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a travel data classifier. Return valid JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });
  const data = await res.json();
  console.log("[sync] OpenAI response preview:", JSON.stringify(data).substring(0, 500));
  if (data.error) {
    console.error("[sync] OpenAI error:", data.error);
    return { sites_hierarchy: [], recommendations: [] };
  }
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch (e) {
    console.error("[sync] OpenAI JSON parse error:", e);
    return { sites_hierarchy: [], recommendations: [] };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 80);
}

function extractCountriesFromHierarchy(nodes: SiteNode[]): string[] {
  const countries: string[] = [];
  for (const node of nodes) {
    if (node.site_type === "country") countries.push(node.site);
    if (node.sub_sites) countries.push(...extractCountriesFromHierarchy(node.sub_sites));
  }
  return countries;
}
