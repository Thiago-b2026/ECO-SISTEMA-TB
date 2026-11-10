/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import type { Plugin } from "vite";

/** Gera dist/sw.js com a lista de arquivos do build e uma versão nova (o celular percebe a atualização). */
function serviceWorker(): Plugin {
  return {
    name: "checklist-service-worker",
    apply: "build",
    closeBundle() {
      const dist = path.resolve(import.meta.dirname, "dist");
      const manifesto = JSON.parse(readFileSync(path.join(dist, ".vite/manifest.json"), "utf8")) as Record<string, { file: string; css?: string[]; assets?: string[] }>;
      const arquivos = new Set<string>();
      for (const e of Object.values(manifesto)) {
        arquivos.add("/" + e.file);
        for (const c of e.css ?? []) arquivos.add("/" + c);
        for (const a of e.assets ?? []) arquivos.add("/" + a);
      }
      const modelo = readFileSync(path.resolve(import.meta.dirname, "sw-modelo.js"), "utf8");
      writeFileSync(path.join(dist, "sw.js"), modelo.replace("__VERSAO__", Date.now().toString(36)).replace("__ARQUIVOS__", JSON.stringify([...arquivos].sort())));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // manifest: o service worker lê a lista de arquivos do build para guardar tudo offline
  build: { manifest: true, sourcemap: false },
  test: {
    environment: "node",
    env: { TZ: "UTC" },
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "supabase/tests/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
