// Gera o SQL de importação do HISTÓRICO de vendas do PDV antigo (Lovable).
// Entram como origem = 'legado', na loja indicada (padrão: loja de código MATRIZ), sem mexer em estoque nem caixa.
// Pode rodar de novo sem duplicar (on conflict do nothing).
//
// Uso:
//   node scripts/gerar-sql-historico.ts "<sales-com-data-suspeita.csv>" "<sale_items.csv>" "<saida.sql>" [cnpj-da-loja] [sale_cancellations.csv]
// Depois: npx supabase db query --linked --project-ref <ref> -f "<saida.sql>"
import { readFileSync, writeFileSync } from "node:fs";

const [arqVendas, arqItens, saida, cnpjLoja, arqCancel] = process.argv.slice(2);
if (!arqVendas || !arqItens || !saida) {
  console.error('Uso: node scripts/gerar-sql-historico.ts "<vendas.csv>" "<itens.csv>" "<saida.sql>"');
  process.exit(1);
}

function lerCsv(caminho: string): Record<string, string>[] {
  const linhas = readFileSync(caminho, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const cab = dividir(linhas[0]);
  return linhas.slice(1).map((l) => {
    const c = dividir(l);
    return Object.fromEntries(cab.map((h, i) => [h, (c[i] ?? "").trim()]));
  });
}
function dividir(linha: string): string[] {
  const out: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas;
    } else if (ch === ";" && !aspas) { out.push(atual); atual = ""; } else atual += ch;
  }
  out.push(atual);
  return out;
}

const txt = (v: string | null | undefined) => (v == null || v === "" ? "null" : `'${v.replace(/'/g, "''")}'`);
const num = (v: string) => {
  const n = Number(String(v).replace(/\s/g, ""));
  return Number.isFinite(n) ? String(n) : "0";
};
const ts = (v: string) => (v ? `'${v.replace(" ", "T")}'::timestamptz` : "now()");
const FORMAS = new Set(["dinheiro", "pix", "debito", "credito"]);
const cnpj = (cnpjLoja ?? "").replace(/D/g, "");
const LOJA = cnpj ? `(select id from public.lojas where cnpj = '${cnpj}')` : "(select id from public.lojas where codigo = 'MATRIZ')";
// motivo/data do cancelamento (o último registro de cada venda vale)
const cancel = new Map<string, { motivo: string; quando: string }>();
if (arqCancel) for (const c of lerCsv(arqCancel)) cancel.set(c.sale_id, { motivo: c.motivo, quando: c.cancelled_at });

const vendas = lerCsv(arqVendas);
const itens = lerCsv(arqItens);
const idsVendas = new Set(vendas.map((v) => v.id));

const sql: string[] = ["begin;"];
const lote = <T,>(xs: T[], n = 500) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

for (const bloco of lote(vendas)) {
  sql.push(
    "insert into public.vendas (id, numero, loja_id, vendedor_nome, subtotal, desconto, total, status, origem, data_venda, data_suspeita, motivo_data_suspeita, observacao, created_at, motivo_cancelamento, cancelado_em) values\n" +
      bloco
        .map((v) =>
          `(${txt(v.id)}, ${num(v.numero)}, ${LOJA}, ${txt(v.vendedor_nome?.trim())}, ${num(v.subtotal)}, ${Math.max(0, Number(num(v.desconto)))}, ${num(v.total)}, ` +
          `${v.status === "cancelada" ? "'cancelada'" : "'finalizada'"}, 'legado', ${ts(v.data_venda)}, ${v.data_suspeita === "true"}, ` +
          `${txt(v.motivo_data_suspeita)}, ${txt(v.observacao)}, ${ts(v.created_at)}, ` +
          `${txt(cancel.get(v.id)?.motivo)}, ${cancel.get(v.id)?.quando ? ts(cancel.get(v.id)!.quando) : "null"})`,
        )
        .join(",\n") +
      "\non conflict (id) do nothing;",
  );
}

const itensOk = itens.filter((i) => idsVendas.has(i.sale_id) && Number(num(i.quantidade)) > 0);
for (const bloco of lote(itensOk)) {
  sql.push(
    "insert into public.venda_itens (id, venda_id, descricao, quantidade, preco_unit, desconto, total) values\n" +
      bloco
        .map((i) => `(${txt(i.id)}, ${txt(i.sale_id)}, ${txt(i.produto_nome || "Item")}, ${num(i.quantidade)}, ${num(i.preco_unitario)}, ${num(i.desconto)}, ${num(i.total)})`)
        .join(",\n") +
      "\non conflict (id) do nothing;",
  );
}

const pags = vendas.filter((v) => Number(num(v.total)) > 0);
for (const bloco of lote(pags)) {
  sql.push(
    "insert into public.venda_pagamentos (venda_id, forma, valor) select x.venda_id::uuid, x.forma::public.forma_pagamento, x.valor from (values\n" +
      bloco.map((v) => `(${txt(v.id)}, '${FORMAS.has(v.forma_pagamento) ? v.forma_pagamento : "outro"}', ${num(v.total)}::numeric)`).join(",\n") +
      "\n) as x(venda_id, forma, valor)\nwhere not exists (select 1 from public.venda_pagamentos p where p.venda_id = x.venda_id::uuid);",
  );
}
sql.push("commit;");

writeFileSync(saida, sql.join("\n\n") + "\n", "utf8");
console.log(`${vendas.length} vendas, ${itensOk.length} itens (${itens.length - itensOk.length} ignorados), ${pags.length} pagamentos → ${saida}`);
