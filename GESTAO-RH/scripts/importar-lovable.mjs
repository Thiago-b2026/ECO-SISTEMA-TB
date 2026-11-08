// Importa os dados exportados do Lovable (CSV) para o banco novo, como uma empresa.
//
// Uso:
//   npm run importar -- --empresa "Supermix Braz" --dono comprassupermixms@gmail.com
//   npm run importar -- --empresa "Supermix Braz" --dono email --simular   (só mostra, não grava)
//
// Coloque na pasta dados-lovable/ os CSVs exportados do Lovable:
//   rh_entries-export-*.csv     (obrigatório – os lançamentos)
//   profiles-export-*.csv       (opcional – nomes/e-mails dos usuários)
//   user_roles-export-*.csv     (opcional – perfis dos usuários)
//
// Segurança: lançamentos que JÁ existem no banco novo com conteúdo diferente NÃO são
// sobrescritos (a menos que use --sobrescrever). Nada é apagado.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ---------- .env ----------
for (const arq of [".env", ".env.local"]) {
  if (!fs.existsSync(arq)) continue;
  for (const linha of fs.readFileSync(arq, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ---------- argumentos ----------
const args = process.argv.slice(2);
const arg = (n, padrao) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : padrao;
};
const flag = (n) => args.includes(`--${n}`);
const EMPRESA = arg("empresa", "Supermix Braz");
const DONO = (arg("dono", "") || "").toLowerCase();
const PASTA = arg("pasta", "dados-lovable");
const SIMULAR = flag("simular");
const SOBRESCREVER = flag("sobrescrever");

const URL_SB = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SB || !KEY) sair("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env");
if (!DONO) sair('Informe o e-mail do dono: --dono seu@email.com');

const sb = createClient(URL_SB, KEY, { db: { schema: "rh" }, auth: { persistSession: false } });

function sair(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

// ---------- CSV (aceita ; ou , e campos com aspas/JSON) ----------
function lerCsv(arquivo) {
  let txt = fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "");
  const primeira = txt.slice(0, txt.indexOf("\n") >>> 0);
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ";" : ",";
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && txt[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((x) => x !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...resto] = linhas;
  return resto.map((l) => Object.fromEntries(cab.map((h, i) => [h.trim(), l[i] ?? ""])));
}

function acharArquivo(prefixo) {
  if (!fs.existsSync(PASTA)) return null;
  const lista = fs.readdirSync(PASTA).filter((f) => f.toLowerCase().startsWith(prefixo) && f.toLowerCase().endsWith(".csv")).sort();
  return lista.length ? path.join(PASTA, lista[lista.length - 1]) : null;
}

const ITENS = 13;
function totais(data) {
  const s = (o) => Object.values(o || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  const fat = s(data?.faturamento);
  const itens = (data?.items || []).slice(0, ITENS).reduce((a, it) => a + s(it), 0);
  return { fat, custo: itens * 1.05 };
}
const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------- 1. Lançamentos ----------
const arqRh = acharArquivo("rh_entries");
if (!arqRh) sair(`Não achei rh_entries-*.csv na pasta "${PASTA}". Exporte a tabela rh_entries no Lovable e salve lá.`);
const rhCsv = lerCsv(arqRh);
console.log(`\n📄 ${arqRh}: ${rhCsv.length} lançamentos`);

const lancamentos = [];
const chavesLoja = new Set();
for (const [i, r] of rhCsv.entries()) {
  let data;
  try {
    data = typeof r.data === "string" ? JSON.parse(r.data || "{}") : r.data;
  } catch {
    sair(`Linha ${i + 2}: o campo "data" não é um JSON válido. Exporte novamente o CSV.`);
  }
  const tab = String(r.tab).trim();
  const ano = Number(r.ano), mes = Number(r.mes);
  if (!["provisao", "realizado"].includes(tab) || !ano || !(mes >= 0 && mes <= 11)) sair(`Linha ${i + 2}: tab/ano/mes inválidos (${tab}/${r.ano}/${r.mes}).`);
  Object.keys(data?.faturamento || {}).forEach((k) => chavesLoja.add(k));
  (data?.items || []).forEach((it) => Object.keys(it || {}).forEach((k) => chavesLoja.add(k)));
  lancamentos.push({ tab, ano, mes, data, updated_at: r.updated_at || null });
}
const lojasCodigos = [...chavesLoja].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
console.log(`   Lojas encontradas nos dados: ${lojasCodigos.join(", ") || "(nenhuma)"}`);

// Resumo por ano/aba (para conferir com o app antigo)
const resumo = {};
for (const l of lancamentos) {
  const k = `${l.ano} ${l.tab === "provisao" ? "Provisão " : "Realizado"}`;
  const t = totais(l.data);
  resumo[k] ??= { meses: 0, fat: 0, custo: 0 };
  resumo[k].meses++;
  resumo[k].fat += t.fat;
  resumo[k].custo += t.custo;
}
console.log("\n   Conferência (some no app antigo e compare):");
for (const k of Object.keys(resumo).sort())
  console.log(`   ${k}: ${resumo[k].meses} meses • Faturamento ${brl(resumo[k].fat)} • Custo c/ extras ${brl(resumo[k].custo)}`);

if (SIMULAR) {
  console.log("\n(modo --simular: nada foi gravado)\n");
  process.exit(0);
}

// ---------- 2. Dono ----------
const senhas = [];
async function garantirUsuario(email, nome) {
  const { data: p } = await sb.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (p) return { id: p.id, novo: false };
  const senha = randomBytes(6).toString("base64url");
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
  if (error) throw new Error(`${email}: ${error.message}`);
  await sb.from("profiles").upsert({ id: data.user.id, nome, email });
  senhas.push(`${email}\t${senha}`);
  return { id: data.user.id, novo: true };
}
const dono = await garantirUsuario(DONO, "Administrador");
console.log(`\n👤 Dono: ${DONO}${dono.novo ? " (conta criada – senha temporária no arquivo senhas-temporarias.txt)" : ""}`);

// ---------- 3. Empresa + lojas ----------
let { data: emp } = await sb.from("empresas").select("id").eq("nome", EMPRESA).maybeSingle();
if (!emp) {
  const r = await sb.from("empresas").insert({ nome: EMPRESA }).select("id").single();
  if (r.error) sair(r.error.message);
  emp = r.data;
  console.log(`🏢 Empresa criada: ${EMPRESA}`);
} else console.log(`🏢 Empresa já existia: ${EMPRESA} (dados serão somados a ela)`);

const codigos = lojasCodigos.length ? lojasCodigos : ["loja1", "loja2", "loja3"];
const { data: lojasExist } = await sb.from("lojas").select("codigo").eq("empresa_id", emp.id);
for (const [i, codigo] of codigos.entries()) {
  if ((lojasExist || []).some((l) => l.codigo === codigo)) continue;
  const n = codigo.match(/\d+/)?.[0] ?? String(i + 1);
  const { error } = await sb.from("lojas").insert({ empresa_id: emp.id, codigo, nome: `Loja ${n}`, ordem: Number(n) || i + 1 });
  if (error) sair(error.message);
  console.log(`   + loja ${codigo} → "Loja ${n}" (pode renomear depois em Empresas > Configurar)`);
}
await sb.from("empresa_membros").upsert({ empresa_id: emp.id, user_id: dono.id, papel: "owner" });

// ---------- 4. Gravar lançamentos ----------
const { data: jaTem } = await sb.from("rh_entries").select("tab,ano,mes,data").eq("empresa_id", emp.id);
let inseridos = 0, iguais = 0, pulados = 0;
for (const l of lancamentos) {
  const ex = (jaTem || []).find((x) => x.tab === l.tab && x.ano === l.ano && x.mes === l.mes);
  if (ex && JSON.stringify(ex.data) === JSON.stringify(l.data)) { iguais++; continue; }
  if (ex && !SOBRESCREVER) {
    pulados++;
    console.log(`   ⚠ ${l.tab} ${l.mes + 1}/${l.ano} já existe com valores diferentes – mantido (use --sobrescrever para trocar)`);
    continue;
  }
  const { error } = await sb.from("rh_entries").upsert(
    { empresa_id: emp.id, tab: l.tab, ano: l.ano, mes: l.mes, data: l.data, updated_by: dono.id },
    { onConflict: "empresa_id,tab,ano,mes" },
  );
  if (error) sair(`${l.tab} ${l.mes + 1}/${l.ano}: ${error.message}`);
  inseridos++;
}
console.log(`\n✔ Lançamentos: ${inseridos} gravados • ${iguais} já estavam iguais • ${pulados} mantidos`);

// ---------- 5. Usuários (opcional) ----------
const arqPerfis = acharArquivo("profiles");
const arqPapeis = acharArquivo("user_roles");
if (arqPerfis) {
  const perfis = lerCsv(arqPerfis);
  const papeis = arqPapeis ? lerCsv(arqPapeis) : [];
  const papelDe = (id) => {
    const ps = papeis.filter((p) => p.user_id === id).map((p) => p.role);
    return ps.includes("owner") ? "owner" : ps.includes("admin") ? "admin" : "operador";
  };
  let n = 0;
  for (const p of perfis) {
    const email = String(p.email || "").trim().toLowerCase();
    if (!email) continue;
    const nome = p.nome || p.name || p.full_name || email.split("@")[0];
    const u = email === DONO ? dono : await garantirUsuario(email, nome);
    const papel = email === DONO ? "owner" : papelDe(p.id);
    await sb.from("empresa_membros").upsert({ empresa_id: emp.id, user_id: u.id, papel });
    n++;
    console.log(`   👤 ${nome} <${email}> → ${papel}${u.novo ? " (nova conta)" : ""}`);
  }
  console.log(`✔ Usuários vinculados: ${n}`);
} else {
  console.log("\nℹ Sem profiles-*.csv: só o dono foi cadastrado. Os demais usuários podem ser criados na tela Usuários.");
}

if (senhas.length) {
  fs.writeFileSync("senhas-temporarias.txt", "E-MAIL\tSENHA TEMPORÁRIA\n" + senhas.join("\n") + "\n");
  console.log(`\n🔑 ${senhas.length} senha(s) temporária(s) em senhas-temporarias.txt – entregue a cada pessoa e apague o arquivo.`);
}
console.log("\nPronto.\n");
