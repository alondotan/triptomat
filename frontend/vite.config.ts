import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

/**
 * Syncs root config.json (single source of truth) into:
 *  1. public/data/sub-categories.json  — frontend fetches at runtime
 *  2. supabase/functions/_shared/categories.ts — edge functions import
 */
function syncConfig(): Plugin {
  const src = path.resolve(__dirname, "../config.json");
  const subCatDest = path.resolve(__dirname, "public/data/sub-categories.json");
  const categoriesDest = path.resolve(
    __dirname,
    "supabase/functions/_shared/categories.ts"
  );

  function sync() {
    if (!fs.existsSync(src)) return;

    // 1. Copy config.json → public/data/sub-categories.json
    fs.mkdirSync(path.dirname(subCatDest), { recursive: true });
    fs.copyFileSync(src, subCatDest);

    // 2. Generate _shared/categories.ts from config.json
    generateCategories(src, categoriesDest);
  }

  return {
    name: "sync-config",
    buildStart() {
      sync();
    },
    configureServer(server) {
      sync();
      server.watcher.add(src);
      server.watcher.on("change", (changed) => {
        if (path.resolve(changed) === src) {
          sync();
        }
      });
    },
  };
}

function generateCategories(configPath: string, outPath: string) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const { master_list, category_to_db } = config;

  const typeToCat: Record<string, string> = {};
  for (const entry of master_list) {
    const db = category_to_db[entry.category];
    if (db) typeToCat[entry.type] = db;
  }

  const geoTypes: string[] = master_list
    .filter((e: { is_geo_location: boolean }) => e.is_geo_location)
    .map((e: { type: string }) => e.type);

  const tipTypes: string[] = master_list
    .filter((e: { category: string }) => e.category === "Tips")
    .map((e: { type: string }) => e.type);

  const fmt = (arr: string[], q: boolean) => {
    const lines: string[] = [];
    let line = "  ";
    for (let i = 0; i < arr.length; i++) {
      const val = q ? `${arr[i]}: '${(typeToCat as Record<string, string>)[arr[i]]}'` : `'${arr[i]}'`;
      const sep = i < arr.length - 1 ? ", " : "";
      if (line.length + val.length + sep.length > 100) {
        lines.push(line);
        line = "  " + val + sep;
      } else {
        line += val + sep;
      }
    }
    if (line.trim()) lines.push(line);
    return lines.join("\n");
  };

  const output = [
    "// ──────────────────────────────────────────────────────────────────────────────",
    "// AUTO-GENERATED from config.json — do not edit manually.",
    "// Regenerate: cd frontend && npm run generate:categories",
    "// ──────────────────────────────────────────────────────────────────────────────",
    "",
    "/** Maps extracted item type → DB entity category. */",
    "export const TYPE_TO_CATEGORY: Record<string, string> = {",
    fmt(Object.keys(typeToCat), true),
    "};",
    "",
    "/** All non-geo types as a comma-separated string (for AI prompts). */",
    "export const ALLOWED_TYPES_CSV = Object.keys(TYPE_TO_CATEGORY).join(', ');",
    "",
    "/** Geographic location types (not actionable POIs). */",
    "export const GEO_TYPES = new Set([",
    fmt(geoTypes, false),
    "]);",
    "",
    "/** Geo types as a comma-separated string (for AI prompts). */",
    "export const GEO_TYPES_CSV = [...GEO_TYPES].join(', ');",
    "",
    "/** Tip types — informational, not entities. */",
    "export const TIP_TYPES = new Set([",
    fmt(tipTypes, false),
    "]);",
    "",
    "export function getCategoryForType(type: string): string | undefined {",
    "  return TYPE_TO_CATEGORY[type];",
    "}",
    "",
    "export function isGeographicType(type: string): boolean {",
    "  return GEO_TYPES.has(type);",
    "}",
    "",
  ].join("\n");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output, "utf8");
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    syncConfig(),
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
