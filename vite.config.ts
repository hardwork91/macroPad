/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages sirve el sitio desde /macroPad/ y el build se
// publica en docs/ (Settings -> Pages -> main /docs).
export default defineConfig({
  plugins: [react()],
  base: "/macroPad/",
  build: { outDir: "docs" },
  test: { environment: "node" },
});
