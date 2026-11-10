// Exportação de qualquer tabela de dados:
// - Excel: arquivo .csv com separador ";" e acentos (BOM), que o Excel em português abre direto.
// - PDF: abre uma página de impressão limpa; escolha "Salvar como PDF" na impressora.
import { fmtDate } from "@/lib/format";

export type Valor = string | number | null | undefined;
export interface Coluna {
  titulo: string;
  /** alinhar à direita (números/valores) */
  numero?: boolean;
}

const nomeArquivo = (nome: string) =>
  nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "relatorio";

function celulaCsv(v: Valor): string {
  if (v == null) return "";
  // número com vírgula decimal (padrão do Excel brasileiro)
  const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gerarCsv(colunas: Coluna[], linhas: Valor[][]): string {
  return "﻿" + [colunas.map((c) => celulaCsv(c.titulo)).join(";"), ...linhas.map((l) => l.map(celulaCsv).join(";"))].join("\r\n");
}

export function exportarExcel(nome: string, colunas: Coluna[], linhas: Valor[][]) {
  const blob = new Blob([gerarCsv(colunas, linhas)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeArquivo(nome)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtCelula = (v: Valor) => (v == null ? "" : typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : String(v));

export function exportarPdf(titulo: string, subtitulo: string, colunas: Coluna[], linhas: Valor[][]): boolean {
  const w = window.open("", "_blank", "width=1000,height=700");
  if (!w) return false;
  w.document.open();
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    @page { size: A4 ${colunas.length > 6 ? "landscape" : "portrait"}; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; }
    h1 { font-size: 16px; margin: 0 0 2px; } .sub { color: #555; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { background: #f2f2f2; } td.n, th.n { text-align: right; white-space: nowrap; } tr { break-inside: avoid; }
    .rod { margin-top: 8px; color: #777; font-size: 9px; }
  </style></head><body>
    <h1>${esc(titulo)}</h1><div class="sub">${esc(subtitulo)}</div>
    <table><thead><tr>${colunas.map((c) => `<th class="${c.numero ? "n" : ""}">${esc(c.titulo)}</th>`).join("")}</tr></thead>
    <tbody>${linhas.map((l) => `<tr>${l.map((v, i) => `<td class="${colunas[i]?.numero ? "n" : ""}">${esc(fmtCelula(v))}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <div class="rod">${linhas.length} linha(s) · gerado em ${esc(fmtDate(new Date()))} · Eco Sistema TB</div>
    <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
  </body></html>`);
  w.document.close();
  return true;
}
