#!/usr/bin/env node
/**
 * Generates frontend/supabase/functions/_shared/categories.ts
 * from the root config.json (single source of truth).
 *
 * Run:  node scripts/generate-categories.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '../../config.json');
const outPath = resolve(__dirname, '../supabase/functions/_shared/categories.ts');

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const { master_list, categories } = config;

// Derive category_to_db from unified categories object
const category_to_db = {};
for (const [configCat, meta] of Object.entries(categories)) {
  if (meta.db_name) category_to_db[configCat] = meta.db_name;
}

// Build TYPE_TO_CATEGORY (non-geo, non-tip types → DB category)
const typeToCat = {};
for (const entry of master_list) {
  const db = category_to_db[entry.category];
  if (db) typeToCat[entry.type] = db;
}

// Collect GEO_TYPES (is_geo_location === true)
const geoTypes = master_list
  .filter(e => e.is_geo_location)
  .map(e => e.type);

// Collect TIP_TYPES (category === 'Tips')
const tipTypes = master_list
  .filter(e => e.category === 'Tips')
  .map(e => e.type);

// Format a JS object as aligned key-value pairs
function formatRecord(obj) {
  const entries = Object.entries(obj);
  const lines = [];
  let line = '  ';
  for (let i = 0; i < entries.length; i++) {
    const pair = `${entries[i][0]}: '${entries[i][1]}'`;
    const sep = i < entries.length - 1 ? ', ' : '';
    if (line.length + pair.length + sep.length > 100) {
      lines.push(line);
      line = '  ' + pair + sep;
    } else {
      line += pair + sep;
    }
  }
  if (line.trim()) lines.push(line);
  return lines.join('\n');
}

function formatSet(arr) {
  const lines = [];
  let line = '  ';
  for (let i = 0; i < arr.length; i++) {
    const val = `'${arr[i]}'`;
    const sep = i < arr.length - 1 ? ', ' : '';
    if (line.length + val.length + sep.length > 100) {
      lines.push(line);
      line = '  ' + val + sep;
    } else {
      line += val + sep;
    }
  }
  if (line.trim()) lines.push(line);
  return lines.join('\n');
}

const output = `\
// ──────────────────────────────────────────────────────────────────────────────
// AUTO-GENERATED from config.json — do not edit manually.
// Regenerate: cd frontend && npm run generate:categories
// ──────────────────────────────────────────────────────────────────────────────

/** Maps extracted item type → DB entity category. */
export const TYPE_TO_CATEGORY: Record<string, string> = {
${formatRecord(typeToCat)}
};

/** All non-geo types as a comma-separated string (for AI prompts). */
export const ALLOWED_TYPES_CSV = Object.keys(TYPE_TO_CATEGORY).join(', ');

/** Geographic location types (not actionable POIs). */
export const GEO_TYPES = new Set([
${formatSet(geoTypes)}
]);

/** Geo types as a comma-separated string (for AI prompts). */
export const GEO_TYPES_CSV = [...GEO_TYPES].join(', ');

/** Tip types — informational, not entities. */
export const TIP_TYPES = new Set([
${formatSet(tipTypes)}
]);

export function getCategoryForType(type: string): string | undefined {
  return TYPE_TO_CATEGORY[type];
}

export function isGeographicType(type: string): boolean {
  return GEO_TYPES.has(type);
}
`;

writeFileSync(outPath, output, 'utf8');
console.log(`Generated ${outPath}`);
