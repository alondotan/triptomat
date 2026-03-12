/**
 * One-time migration: Seed trip_locations for existing trips.
 *
 * For each trip:
 * 1. Seed from country-sites.json based on trip.countries
 * 2. Insert any additional sites from source_emails.parsed_data.sites_hierarchy
 * 3. Insert any additional sites from source_recommendations.analysis.sites_hierarchy
 *
 * Run: node scripts/migrate-trip-locations.mjs
 */

import { createClient } from '../frontend/node_modules/@supabase/supabase-js/dist/index.mjs';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read env from frontend/.env
const envPath = resolve(__dirname, '../frontend/.env');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  const match = trimmed.match(/^(\w+)="([^"]*)"/);
  if (match) env[match[1]] = match[2];
}

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or KEY in frontend/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Load country-sites.json
const countrySitesPath = resolve(__dirname, '../frontend/public/data/country-sites.json');
const countrySites = JSON.parse(readFileSync(countrySitesPath, 'utf-8'));

function findCountryNode(nodes, countryName) {
  for (const node of nodes) {
    if (node.site_type === 'country' && node.site.toLowerCase() === countryName.toLowerCase()) {
      return node;
    }
    if (node.sub_sites) {
      const found = findCountryNode(node.sub_sites, countryName);
      if (found) return found;
    }
  }
  return null;
}

async function seedTrip(tripId, countries) {
  // Check if trip already has locations
  const { data: existing } = await supabase
    .from('trip_locations')
    .select('id')
    .eq('trip_id', tripId)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`  Trip ${tripId} already has locations, skipping seed`);
    return;
  }

  // Build country nodes array
  const countryNodes = [];
  for (const country of (countries || [])) {
    const node = findCountryNode(countrySites.world_hierarchy, country);
    if (node) countryNodes.push(node);
  }

  if (countryNodes.length === 0) {
    console.log(`  No matching country nodes for: ${(countries || []).join(', ')}`);
    return;
  }

  // Call the seed function
  const { error } = await supabase.rpc('seed_trip_locations', {
    p_trip_id: tripId,
    p_locations: countryNodes,
  });

  if (error) {
    console.error(`  Seed error for trip ${tripId}:`, error.message);
  } else {
    console.log(`  Seeded ${countryNodes.length} countries for trip ${tripId}`);
  }
}

async function syncWebhookHierarchy(tripId) {
  // Fetch existing locations for name lookup
  const { data: locations } = await supabase
    .from('trip_locations')
    .select('id, name, parent_id')
    .eq('trip_id', tripId);

  const nameToId = new Map();
  for (const loc of (locations || [])) {
    nameToId.set(loc.name.toLowerCase(), loc.id);
  }

  async function walkAndInsert(nodes, parentId) {
    for (const node of nodes) {
      const key = node.site.toLowerCase();
      let nodeId = nameToId.get(key);
      if (!nodeId) {
        const { data: inserted } = await supabase
          .from('trip_locations')
          .insert({
            trip_id: tripId,
            parent_id: parentId,
            name: node.site,
            site_type: node.site_type,
            source: 'webhook',
          })
          .select('id')
          .maybeSingle();
        if (inserted) {
          nodeId = inserted.id;
          nameToId.set(key, nodeId);
        }
      }
      if (nodeId && node.sub_sites && node.sub_sites.length > 0) {
        await walkAndInsert(node.sub_sites, nodeId);
      }
    }
  }

  // Source emails
  const { data: emails } = await supabase
    .from('source_emails')
    .select('parsed_data')
    .eq('trip_id', tripId)
    .eq('status', 'linked');

  let webhookCount = 0;
  for (const email of (emails || [])) {
    const pd = email.parsed_data;
    if (pd?.sites_hierarchy && Array.isArray(pd.sites_hierarchy)) {
      await walkAndInsert(pd.sites_hierarchy, null);
      webhookCount++;
    }
  }

  // Source recommendations
  const { data: recs } = await supabase
    .from('source_recommendations')
    .select('analysis')
    .eq('trip_id', tripId)
    .eq('status', 'linked');

  for (const rec of (recs || [])) {
    const analysis = rec.analysis;
    if (analysis?.sites_hierarchy && Array.isArray(analysis.sites_hierarchy)) {
      await walkAndInsert(analysis.sites_hierarchy, null);
      webhookCount++;
    }
  }

  if (webhookCount > 0) {
    console.log(`  Synced hierarchy from ${webhookCount} webhook sources`);
  }
}

async function main() {
  console.log('Fetching all trips...');
  const { data: trips, error } = await supabase
    .from('trips')
    .select('id, name, countries')
    .order('created_at', { ascending: true });

  if (error) { console.error('Failed to fetch trips:', error); process.exit(1); }

  console.log(`Found ${trips.length} trips\n`);

  for (const trip of trips) {
    console.log(`Processing: "${trip.name}" (${trip.id})`);
    console.log(`  Countries: ${(trip.countries || []).join(', ') || 'none'}`);

    // Step 1: Seed from global hierarchy
    await seedTrip(trip.id, trip.countries);

    // Step 2: Sync webhook hierarchies
    await syncWebhookHierarchy(trip.id);

    console.log('');
  }

  console.log('Migration complete!');
}

main().catch(console.error);
