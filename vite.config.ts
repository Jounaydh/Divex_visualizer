import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Packaged Electron windows load dist/index.html through file://, so assets
  // must resolve relative to that file instead of from the filesystem root.
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
  },
});
