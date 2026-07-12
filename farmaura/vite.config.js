/*
farmaura/vite.config.js

Build and development configuration for the Farmaura multi-page frontend.

Responsibilities:
- serve the internal console and marketplace with the same static structure used in production;
- build both HTML entrypoints into a production-ready dist directory;
- build both portals directly from native ESM entrypoints;

Observations:
- Vite runs from the repository root so the existing /farmaura/... URLs resolve correctly during development.
- CSS, images, and module entrypoints are bundled directly by Vite for production.
*/

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";


// ============================================================================
// VITE CONFIGURATION
// ============================================================================


const configDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(configDirectory, "..");

export default defineConfig({
  root: repositoryRoot,
  appType: "mpa",
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
  build: {
    outDir: resolve(configDirectory, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        internal: resolve(configDirectory, "internal.html"),
        marketplace: resolve(configDirectory, "marketplace.html"),
      },
    },
  },
});
