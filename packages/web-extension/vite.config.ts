import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    webExtension({
      manifest: "./src/manifest.json",
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  publicDir: "public",
});
