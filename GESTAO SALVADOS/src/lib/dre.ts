// Regras do DRE gerencial (mesmas do projeto "marketwise-margin-map" do Lovable).

export type BenchStatus = "otimo" | "bom" | "atencao" | "ruim";

/**
 * Compara a despesa atual (% do faturamento) com o benchmark (%).
 *  ÓTIMO: até 90% do benchmark · BOM: até o benchmark · ATENÇÃO: até 15% acima · RUIM: 15% ou mais acima.
 */
export function statusBenchmark(atual: number, bench: number): BenchStatus {
  if (!Number.isFinite(atual) || atual <= 0) return "otimo";
  if (!Number.isFinite(bench) || bench <= 0) return "ruim";
  const r = atual / bench;
  if (r <= 0.9) return "otimo";
  if (r <= 1) return "bom";
  if (r < 1.15) return "atencao";
  return "ruim";
}

export const STATUS_DRE: Record<BenchStatus, { label: string; classe: string }> = {
  otimo: { label: "ÓTIMO", classe: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300" },
  bom: { label: "BOM", classe: "bg-success/10 text-success border-success/30" },
  atencao: { label: "ATENÇÃO", classe: "bg-warning/15 text-amber-700 border-warning/40 dark:text-warning" },
  ruim: { label: "RUIM", classe: "bg-destructive/10 text-destructive border-destructive/30" },
};

export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Faturamento que vale no DRE: o digitado tem prioridade sobre o automático (vendas). */
export function faturamentoEfetivo(automatico: number, manual: number | null | undefined): number {
  return manual != null ? Number(manual) : Number(automatico) || 0;
}

export const pctDe = (valor: number, base: number) => (base > 0 ? (valor / base) * 100 : 0);

export const fmtPct = (n: number, casas = 1) =>
  `${(Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
