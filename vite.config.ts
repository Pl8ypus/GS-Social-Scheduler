import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    cloudflare({
      configPath: path.resolve(__dirname, "wrangler.jsonc"),
      persistState: { path: path.resolve(__dirname, ".wrangler/state") },
    }),
  ],
  root: path.resolve(__dirname, "src/frontend"),
  envDir: __dirname,
});
