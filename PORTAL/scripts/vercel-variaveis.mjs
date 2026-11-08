// Cadastra na Vercel (projeto já vinculado com "vercel link") as 2 variáveis PÚBLICAS do Portal,
// lendo do arquivo .env desta pasta. Não mostra os valores na tela e não publica nada.
// Uso (dentro da pasta PORTAL):  node scripts/vercel-variaveis.mjs
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(join(raiz, ".vercel", "project.json"))) {
  console.error("Primeiro vincule o projeto: npx --yes vercel@latest link --yes --project portal-grupotb --scope grupotb");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(join(raiz, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

const CHAVES = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]; // só as públicas; nenhuma chave secreta
let ok = true;
for (const k of CHAVES) {
  if (!env[k]) { console.error(`Falta ${k} no .env`); process.exit(1); }
  for (const alvo of ["production", "preview"]) {
    const r = spawnSync("npx", ["--yes", "vercel@latest", "env", "add", k, alvo, "--force"], {
      cwd: raiz, input: env[k], encoding: "utf8", shell: true, stdio: ["pipe", "pipe", "pipe"],
    });
    const passou = r.status === 0;
    ok &&= passou;
    console.log(`${passou ? "OK  " : "ERRO"} ${k} (${alvo})`);
    if (!passou) console.log((r.stderr || r.stdout || "").split("\n").slice(-4).join("\n"));
  }
}
process.exit(ok ? 0 : 1);
