// node scripts/gerar-seed.ts  → supabase/seed/checklist_seed.sql
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gerarSeedSql } from "../src/data/seed-sql.ts";

const destino = resolve(import.meta.dirname, "../supabase/seed/checklist_seed.sql");
writeFileSync(destino, gerarSeedSql(), "utf8");
console.log("Gerado:", destino);
