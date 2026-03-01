import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

/**
 * Copies the root config.json (single source of truth for sub-categories)
 * into public/data/sub-categories.json so the frontend can fetch it at runtime.
 */
function syncSubCategories(): Plugin {
  const src = path.resolve(__dirname, "../config.json");
  const dest = path.resolve(__dirname, "public/data/sub-categories.json");

  function copy() {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  return {
    name: "sync-sub-categories",
    buildStart() {
      copy();
    },
    configureServer(server) {
      copy();
      server.watcher.add(src);
      server.watcher.on("change", (changed) => {
        if (path.resolve(changed) === src) {
          copy();
        }
      });
    },
  };
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
    syncSubCategories(),
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
