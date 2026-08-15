import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function vendorChunk(id: string) {
  const moduleId = id.replaceAll("\\", "/");
  if (!moduleId.includes("/node_modules/")) return undefined;
  if (moduleId.includes("/ace-builds/")) return "editor-engine";
  if (
    moduleId.includes("/react/") ||
    moduleId.includes("/react-dom/") ||
    moduleId.includes("/scheduler/")
  ) {
    return "react-vendor";
  }
  if (moduleId.includes("/lucide-react/")) return "icon-vendor";
  return undefined;
}

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
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
        onlyExplicitManualChunks: true,
        entryFileNames: "assets/entry/[name]-[hash].js",
        chunkFileNames: "assets/chunks/[name]-[hash].js",
        assetFileNames: "assets/[ext]/[name]-[hash][extname]",
      },
    },
    // The editor remains optional and is loaded only when source view opens.
    chunkSizeWarningLimit: 950,
  },
});
