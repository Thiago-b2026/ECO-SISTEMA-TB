/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: { sourcemap: false },
  test: {
    environment: "node",
    env: { TZ: "UTC" },
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "tests/**/*.test.tsx", "supabase/tests/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
