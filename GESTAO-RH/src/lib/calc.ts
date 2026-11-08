// Regras de cálculo idênticas ao RH Compass original (Lovable),
// agora com lojas e percentuais configuráveis por empresa.
import type { Empresa, Loja } from "./types";

export const ITENS = [
  "Funcionários na Folha",
  "Funcionários Fora da Folha",
  "Adiantamento Salarial",
  "FGTS",
  "Simples Nacional",
  "Férias",
  "Rescisões",
  "Multa Rescisória",
  "Serviços de Contabilidade",
  "Serviços Jurídicos",
  "Serviços de Medicina do Trabalho",
  "Demanda Judicial",
  "Premiação Extra",
] as const;

export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export type Valores = Record<string, number>;
export interface DadosMes {
  faturamento: Valores;
  items: Valores[];
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Converte o JSON salvo em estrutura completa, SEM descartar chaves desconhecidas. */
export function normalizar(raw: unknown, lojas: Loja[]): DadosMes {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fatRaw = (r.faturamento && typeof r.faturamento === "object" ? r.faturamento : {}) as Record<string, unknown>;
  const faturamento: Valores = {};
  for (const [k, v] of Object.entries(fatRaw)) faturamento[k] = num(v);
  for (const l of lojas) faturamento[l.codigo] = num(fatRaw[l.codigo]);

  const itRaw = Array.isArray(r.items) ? r.items : [];
  const items = ITENS.map((_, i) => {
    const o = (itRaw[i] && typeof itRaw[i] === "object" ? itRaw[i] : {}) as Record<string, unknown>;
    const out: Valores = {};
    for (const [k, v] of Object.entries(o)) out[k] = num(v);
    for (const l of lojas) out[l.codigo] = num(o[l.codigo]);
    return out;
  });
  return { faturamento, items };
}

export function vazio(lojas: Loja[]): DadosMes {
  return normalizar({}, lojas);
}

export function temValores(d: DadosMes): boolean {
  return (
    Object.values(d.faturamento).some((v) => v !== 0) ||
    d.items.some((it) => Object.values(it).some((v) => v !== 0))
  );
}

/** Soma vários meses (visão "Acumulado do ano"). */
export function somar(lista: DadosMes[], lojas: Loja[]): DadosMes {
  const tot = vazio(lojas);
  for (const d of lista) {
    for (const l of lojas) {
      tot.faturamento[l.codigo] += d.faturamento[l.codigo] ?? 0;
      d.items.forEach((it, i) => (tot.items[i][l.codigo] += it[l.codigo] ?? 0));
    }
  }
  return tot;
}

export const soma = (v: Valores, lojas: Loja[]) => lojas.reduce((s, l) => s + (v[l.codigo] ?? 0), 0);

export interface Resultado {
  somaItens: Valores;
  extras: Valores;
  total: Valores;
  fatGlobal: number;
  custoGlobal: number;
  extrasGlobal: number;
  pct: number;
  pctLoja: (codigo: string) => number;
}

export function calcular(d: DadosMes, lojas: Loja[], empresa: Pick<Empresa, "pct_extras">): Resultado {
  const fator = Number(empresa.pct_extras) / 100;
  const somaItens: Valores = {};
  const extras: Valores = {};
  const total: Valores = {};
  for (const l of lojas) {
    somaItens[l.codigo] = d.items.reduce((s, it) => s + (it[l.codigo] ?? 0), 0);
    extras[l.codigo] = somaItens[l.codigo] * fator;
    total[l.codigo] = somaItens[l.codigo] + extras[l.codigo];
  }
  const fatGlobal = soma(d.faturamento, lojas);
  const custoGlobal = soma(total, lojas);
  return {
    somaItens,
    extras,
    total,
    fatGlobal,
    custoGlobal,
    extrasGlobal: soma(extras, lojas),
    pct: fatGlobal > 0 ? (custoGlobal / fatGlobal) * 100 : 0,
    pctLoja: (c) => ((d.faturamento[c] ?? 0) > 0 ? (total[c] / d.faturamento[c]) * 100 : 0),
  };
}

export type Status = { label: "ÓTIMO" | "BOM" | "ALERTA"; cor: string; texto: string; fundo: string };

export function classificar(pct: number, e: Pick<Empresa, "meta_otimo" | "meta_alerta">): Status {
  if (pct < Number(e.meta_otimo)) return { label: "ÓTIMO", cor: "rgb(var(--success))", texto: "text-success", fundo: "bg-success/15" };
  if (pct < Number(e.meta_alerta)) return { label: "BOM", cor: "rgb(var(--warning))", texto: "text-warning", fundo: "bg-warning/15" };
  return { label: "ALERTA", cor: "rgb(var(--danger))", texto: "text-danger", fundo: "bg-danger/15" };
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const pctFmt = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;
