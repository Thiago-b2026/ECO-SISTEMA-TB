// Gera uma cópia do export de vendas do PDV antigo com as colunas
// `data_suspeita` (true/false) e `motivo_data_suspeita`, para a importação do histórico.
//
// Uso (Node 24 roda .ts direto):
//   node scripts/marcar-datas-suspeitas.ts "<sales-export.csv>" "<saida.csv>"
import { readFileSync, writeFileSync } from "node:fs";
import { motivoDataSuspeita } from "../src/lib/data-suspeita.ts";

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error('Uso: node scripts/marcar-datas-suspeitas.ts "<sales-export.csv>" "<saida.csv>"');
  process.exit(1);
}

const linhas = readFileSync(entrada, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
const cabecalho = linhas[0].split(";");
const iNumero = cabecalho.indexOf("numero");
const iDataVenda = cabecalho.indexOf("data_venda");
const iCriada = cabecalho.indexOf("created_at");
if (iDataVenda < 0 || iCriada < 0) {
  console.error("O arquivo precisa ter as colunas data_venda e created_at (separador ;).");
  process.exit(1);
}

const suspeitas: string[] = [];
const saidaLinhas = [[...cabecalho, "data_suspeita", "motivo_data_suspeita"].join(";")];

for (const linha of linhas.slice(1)) {
  const col = linha.split(";");
  const motivo = motivoDataSuspeita(col[iDataVenda], col[iCriada]);
  if (motivo) suspeitas.push(`  nº ${col[iNumero]}  venda ${col[iDataVenda]}  registrada ${col[iCriada]}  → ${motivo}`);
  saidaLinhas.push([...col, motivo ? "true" : "false", motivo ?? ""].join(";"));
}

writeFileSync(saida, saidaLinhas.join("\n") + "\n", "utf8");
console.log(`${linhas.length - 1} vendas, ${suspeitas.length} com data suspeita:`);
console.log(suspeitas.join("\n"));
console.log(`Arquivo gerado: ${saida}`);
