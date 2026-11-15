// Formatos e meses. Fuso: America/Sao_Paulo (regra do ecossistema). Mês sempre "AAAA-MM-01".
import type { Faixa } from "../domain/premiacao";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const INT = new Intl.NumberFormat("pt-BR");
export const fmtBRL = (v: number | null | undefined) => BRL.format(Number(v ?? 0));
export const fmtInt = (v: number | null | undefined) => INT.format(Number(v ?? 0));
export const fmtPct = (v: number | null | undefined) => `${(Number(v ?? 0) * 100).toFixed(1).replace(".", ",")}%`;

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Mês atual em São Paulo. */
export function mesAtual(agora = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(agora);
  const ano = p.find((x) => x.type === "year")!.value;
  const mes = p.find((x) => x.type === "month")!.value;
  return `${ano}-${mes}-01`;
}

/** Soma (ou subtrai) meses. */
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

/** Os últimos N meses até `ate` (inclusive), do mais antigo ao mais novo. */
export const ultimosMeses = (n: number, ate: string) => Array.from({ length: n }, (_, i) => somarMeses(ate, i - n + 1));

/** "2026-11-01" → "11/2026" */
export const mesCurto = (mes: string) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
/** "2026-11-01" → "novembro de 2026" */
export const mesLongo = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;

export const nomeFaixa = (f: Faixa, percentualMinimo: number) =>
  f === "100" ? "Meta 100%" : f === "minima" ? `Meta mínima (${fmtPct(percentualMinimo).replace(",0%", "%")})` : "Abaixo da meta";

/** Lê "1.234,56" ou "1234.56" como número. Vazio → 0. Texto inválido → NaN. */
export function lerNumero(texto: string): number {
  const t = texto.trim();
  if (!t) return 0;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN;
}
