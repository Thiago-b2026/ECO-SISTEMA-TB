// Importa os dados do DRE do Lovable (projeto marketwise-margin-map) para o Financeiro.
//
// Uso (PowerShell, na pasta PDV SALVADOS):
//   node scripts/importar-dre-lovable.mjs "C:\PROJETOS_CLAUDE\PROJETO LOVABLE\TABELAS FINANCEIRO"
//
// A pasta precisa ter os CSV exportados do Lovable (nomes contendo):
//   empresas, categorias, subcategorias, lancamentos, faturamento_mensal
// Gera, dentro da pasta, a subpasta SQL_IMPORTACAO com os arquivos para aplicar EM ORDEM.
// Pode rodar de novo sem duplicar (lançamentos já importados são pulados).
import fs from "node:fs";
import path from "node:path";

const pasta = process.argv[2];
if (!pasta || !fs.existsSync(pasta)) {
  console.error('Informe a pasta dos CSV. Ex.: node scripts/importar-dre-lovable.mjs "C:\\...\\TABELAS FINANCEIRO"');
  process.exit(1);
}

// ---------- leitura de CSV (aspas, vírgula ou ponto e vírgula, quebras de linha dentro de aspas) ----------
function lerCsv(arquivo) {
  let txt = fs.readFileSync(arquivo, "utf8").replace(/^\uFEFF/, "");
  const primeira = txt.slice(0, txt.indexOf("\n") >>> 0);
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (aspas) {
      if (ch === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && txt[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((c) => c !== "")) linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  if (campo !== "" || linha.length) { linha.push(campo); if (linha.some((c) => c !== "")) linhas.push(linha); }
  const [cab, ...resto] = linhas;
  const nomes = cab.map((c) => c.trim().toLowerCase());
  return resto.map((l) => Object.fromEntries(nomes.map((n, i) => [n, l[i] === undefined || l[i] === "" || l[i] === "NULL" ? null : l[i]])));
}

const arquivos = fs.readdirSync(pasta).filter((f) => f.toLowerCase().endsWith(".csv"));
const achar = (teste) => {
  const f = arquivos.find((a) => teste(a.toLowerCase()));
  return f ? lerCsv(path.join(pasta, f)) : null;
};
const empresas = achar((a) => a.includes("empresas") && !a.includes("user_"));
const categorias = achar((a) => a.includes("categorias") && !a.includes("sub"));
const subcategorias = achar((a) => a.includes("subcategorias")) ?? [];
const lancamentos = achar((a) => a.includes("lancamentos"));
const faturamento = achar((a) => a.includes("faturamento")) ?? [];

const faltando = [["empresas", empresas], ["categorias", categorias], ["lancamentos", lancamentos]].filter(([, v]) => !v).map(([n]) => n);
if (faltando.length) {
  console.error(`Faltam os CSV de: ${faltando.join(", ")}. Arquivos encontrados: ${arquivos.join(", ") || "nenhum"}`);
  process.exit(1);
}

// ---------- utilidades SQL ----------
const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => {
  if (v == null) return 0;
  let s = String(v).trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const data = (l) => {
  const d = (l.data ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const br = (l.data ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return `${l.ano}-${String(l.mes).padStart(2, "0")}-01`;
};
const digitos = (s) => (s ?? "").replace(/\D/g, "");
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const saida = path.join(pasta, "SQL_IMPORTACAO");
fs.mkdirSync(saida, { recursive: true });
for (const f of fs.readdirSync(saida)) fs.unlinkSync(path.join(saida, f));
const gravar = (nome, sql) => fs.writeFileSync(path.join(saida, nome), sql, "utf8");

// ---------- resumo por empresa ----------
const usadas = new Set([...lancamentos.map((l) => l.empresa_id), ...faturamento.map((f) => f.empresa_id)].filter(Boolean));
console.log("\nEmpresas do Lovable:");
for (const e of empresas) {
  const nL = lancamentos.filter((l) => l.empresa_id === e.id).length;
  const nF = faturamento.filter((f) => f.empresa_id === e.id && num(f.valor) > 0).length;
  console.log(`  - ${e.nome} | CNPJ ${e.cnpj ?? "(sem)"} | ${nL} lançamentos | ${nF} meses de faturamento${usadas.has(e.id) ? "" : " (sem dados, ignorada)"}`);
}

// ---------- 01: preparar (empresas, categorias, contas do plano) ----------
let s = `-- 01 · Prepara a importação do DRE do Lovable: liga empresas às lojas, categorias e contas do plano.
begin;
create table if not exists public.importacao_lovable_mapa (
  tabela text not null, lovable_id text not null, novo_id uuid not null, primary key (tabela, lovable_id)
);
alter table public.importacao_lovable_mapa enable row level security;

create or replace function pg_temp.imp_nova_conta(_pai uuid, _nome text, _cat uuid) returns uuid language plpgsql as $f$
declare _id uuid; _pc text; _n int; _cod text;
begin
  select id into _id from public.plano_contas where pai_id is not distinct from _pai and lower(trim(nome)) = lower(trim(_nome)) limit 1;
  if _id is not null then
    if _cat is not null then update public.plano_contas set dre_categoria_id = coalesce(dre_categoria_id, _cat) where id = _id; end if;
    return _id;
  end if;
  select codigo into _pc from public.plano_contas where id = _pai;
  select coalesce(max((regexp_match(codigo, '(\\d+)$'))[1]::int), 0) + 1 into _n from public.plano_contas where pai_id is not distinct from _pai;
  if _pai is null then _cod := _n::text;
  elsif array_length(string_to_array(_pc, '.'), 1) + 1 >= 3 then _cod := _pc || '.' || lpad(_n::text, 2, '0');
  else _cod := _pc || '.' || _n; end if;
  insert into public.plano_contas (codigo, nome, tipo, pai_id, dre_categoria_id) values (_cod, trim(_nome), 'despesa', _pai, _cat) returning id into _id;
  return _id;
end $f$;
`;

for (const e of empresas.filter((x) => usadas.has(x.id))) {
  s += `
do $$ declare _id uuid; begin
  select id into _id from public.lojas where cnpj = ${q(digitos(e.cnpj) || "-")};
  if _id is null then select id into _id from public.lojas where upper(trim(nome)) = upper(trim(${q(e.nome)})); end if;
  if _id is null then
    raise exception 'A empresa do Lovable "%" (CNPJ %) não foi encontrada nas lojas do sistema. Cadastre o CNPJ dela em Lojas e configurações e rode de novo.', ${q(e.nome)}, ${q(e.cnpj ?? "sem")};
  end if;
  insert into public.importacao_lovable_mapa values ('empresas', ${q(e.id)}, _id) on conflict (tabela, lovable_id) do update set novo_id = excluded.novo_id;
end $$;
`;
}

for (const c of categorias) {
  s += `
do $$ declare _cat uuid; _conta uuid; _pai uuid; begin
  select id into _cat from public.dre_categorias where lower(trim(nome)) = lower(trim(${q(c.nome)}));
  if _cat is null then
    insert into public.dre_categorias (nome, benchmark_pct, cor, ordem) values (trim(${q(c.nome)}), ${num(c.benchmark_pct)}, ${q(c.cor ?? "#3b82f6")}, ${Number(c.ordem) || 0}) returning id into _cat;
  else
    update public.dre_categorias set benchmark_pct = ${num(c.benchmark_pct)}, cor = ${q(c.cor ?? "#3b82f6")} where id = _cat;
  end if;
  select id into _conta from public.plano_contas where dre_categoria_id = _cat and tipo = 'despesa' order by length(codigo), codigo limit 1;
  if _conta is null then
    select id into _pai from public.plano_contas where codigo = '3' and tipo = 'despesa';
    _conta := pg_temp.imp_nova_conta(_pai, ${q(c.nome)}, _cat);
  end if;
  insert into public.importacao_lovable_mapa values ('categorias', ${q(c.id)}, _conta) on conflict (tabela, lovable_id) do update set novo_id = excluded.novo_id;
end $$;
`;
}

for (const sc of subcategorias) {
  s += `
do $$ declare _pai uuid; begin
  select novo_id into _pai from public.importacao_lovable_mapa where tabela = 'categorias' and lovable_id = ${q(sc.categoria_id)};
  if _pai is not null then
    insert into public.importacao_lovable_mapa values ('subcategorias', ${q(sc.id)}, pg_temp.imp_nova_conta(_pai, ${q(sc.nome)}, null))
      on conflict (tabela, lovable_id) do update set novo_id = excluded.novo_id;
  end if;
end $$;
`;
}
s += "\ncommit;\n";
gravar("01_preparar.sql", s);

// ---------- 02: lançamentos (em partes de até ~1500 linhas) ----------
const validos = [];
let ignoradosZero = 0, semEmpresa = 0;
for (const l of lancamentos) {
  const v = num(l.valor);
  if (!v) { ignoradosZero++; continue; }
  if (!usadas.has(l.empresa_id)) { semEmpresa++; continue; }
  let tipo = l.tipo === "entrada" ? "receber" : "pagar";
  if (v < 0) tipo = tipo === "pagar" ? "receber" : "pagar";
  validos.push({ ...l, v: Math.abs(v), tipo, d: data(l) });
}
const PARTE = 1500;
for (let i = 0, n = 1; i < validos.length; i += PARTE, n++) {
  const linhas = validos.slice(i, i + PARTE).map((l) =>
    `(${q(l.id)}, ${q(l.empresa_id)}, ${q(l.categoria_id)}, ${q(l.subcategoria_id)}, ${q(l.tipo)}, ${q((l.descricao ?? "").trim() || "Lançamento importado do Lovable")}, ${q(l.v.toFixed(2))}, ${q(l.d)}, ${q(l.observacoes)})`);
  gravar(`02_lancamentos_${String(n).padStart(2, "0")}.sql`, `-- 02 · Lançamentos do DRE do Lovable → contas pagas no Financeiro (parte ${n}).
begin;
insert into public.lancamentos (loja_id, tipo, descricao, plano_conta_id, valor, vencimento, competencia, status, data_pagamento, valor_pago, documento, origem, observacao, created_by)
select me.novo_id, v.tipo, v.descricao, coalesce(ms.novo_id, mc.novo_id), v.valor::numeric, v.data::date, v.data::date, 'pago', v.data::date, v.valor::numeric,
       'LOV-' || v.id, 'importacao', v.obs, null
from (values
${linhas.join(",\n")}
) as v(id, emp, cat, sub, tipo, descricao, valor, data, obs)
join public.importacao_lovable_mapa me on me.tabela = 'empresas' and me.lovable_id = v.emp
left join public.importacao_lovable_mapa mc on mc.tabela = 'categorias' and mc.lovable_id = v.cat
left join public.importacao_lovable_mapa ms on ms.tabela = 'subcategorias' and ms.lovable_id = v.sub
where not exists (select 1 from public.lancamentos l where l.origem = 'importacao' and l.documento = 'LOV-' || v.id);
commit;
`);
}

// ---------- 03: faturamento digitado ----------
const fat = faturamento.filter((f) => num(f.valor) > 0 && usadas.has(f.empresa_id));
if (fat.length) {
  gravar("03_faturamento.sql", `-- 03 · Faturamento mensal digitado no Lovable (vale no lugar das vendas do sistema nesses meses).
begin;
insert into public.dre_faturamento (loja_id, ano, mes, valor, observacao, updated_by)
select me.novo_id, v.ano::int, v.mes::int, sum(v.valor::numeric), 'importado do Lovable', null
from (values
${fat.map((f) => `(${q(f.empresa_id)}, ${q(f.ano)}, ${q(f.mes)}, ${q(num(f.valor).toFixed(2))})`).join(",\n")}
) as v(emp, ano, mes, valor)
join public.importacao_lovable_mapa me on me.tabela = 'empresas' and me.lovable_id = v.emp
group by 1, 2, 3
on conflict (loja_id, ano, mes) do update set valor = excluded.valor, observacao = excluded.observacao;
commit;
`);
}

// ---------- 04: conferência ----------
gravar("04_conferir.sql", `-- 04 · Conferência (só leitura): o que entrou por loja e mês.
select lj.nome as loja, to_char(l.competencia, 'YYYY-MM') as mes, count(*) as lancamentos,
       sum(case when l.tipo = 'pagar' then l.valor else -l.valor end) as despesas
from public.lancamentos l join public.lojas lj on lj.id = l.loja_id
where l.origem = 'importacao'
group by 1, 2 order by 1, 2;
`);

// ---------- resumo no console (para comparar com o 04) ----------
console.log(`\nLançamentos: ${validos.length} para importar (${ignoradosZero} com valor zero e ${semEmpresa} sem empresa foram ignorados).`);
const porMes = new Map();
for (const l of validos) {
  const nome = empresas.find((e) => e.id === l.empresa_id)?.nome ?? "?";
  const k = `${nome} · ${l.d.slice(0, 7)}`;
  porMes.set(k, (porMes.get(k) ?? 0) + (l.tipo === "pagar" ? l.v : -l.v));
}
for (const [k, v] of [...porMes].sort()) console.log(`  ${k}: ${brl(v)}`);
console.log(`Faturamento: ${fat.length} meses digitados.`);
console.log(`\nArquivos gerados em: ${saida}`);
for (const f of fs.readdirSync(saida).sort()) console.log(`  ${f}`);
