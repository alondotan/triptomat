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
    if (!fs.existsSync(src)) {
      // On Vercel the root is frontend/ so ../config.json doesn't exist;
      // the checked-in public/data/sub-categories.json is used instead.
      return;
    }
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
