// Tempo de execução: situações e comparativos (os MESMOS cálculos no Supabase e no modo demonstração).
// Base: tempo ATIVO (total − pausas). Referência: o tempo padrão; sem padrão, a média do período.
import { dataSP } from "./tempo";

export interface ConfigTempos {
  acima_pct: number;
  muito_acima_pct: number;
  rapido_pct: number;
}
export const CONFIG_PADRAO: ConfigTempos = { acima_pct: 20, muito_acima_pct: 50, rapido_pct: 30 };

export type SituacaoTempo = "no_tempo" | "acima" | "muito_acima" | "rapido_demais" | "sem_referencia";

export const ROTULO_SITUACAO: Record<SituacaoTempo, string> = {
  no_tempo: "No tempo",
  acima: "Acima do padrão",
  muito_acima: "Muito acima",
  rapido_demais: "Rápido demais",
  sem_referencia: "Sem referência",
};

/**
 * "rápido demais": menos de rapido_pct% da referência (possível check sem fazer → alerta ao supervisor);
 * "muito acima": mais de +muito_acima_pct%; "acima": mais de +acima_pct%; senão "no tempo".
 */
export function situacaoTempo(real: number | null | undefined, referencia: number | null | undefined, cfg: ConfigTempos = CONFIG_PADRAO): SituacaoTempo {
  if (real == null || !referencia || referencia <= 0) return "sem_referencia";
  if (real < (referencia * cfg.rapido_pct) / 100) return "rapido_demais";
  if (real > referencia * (1 + cfg.muito_acima_pct / 100)) return "muito_acima";
  if (real > referencia * (1 + cfg.acima_pct / 100)) return "acima";
  return "no_tempo";
}

/** Linha bruta de execução (checklist.dados_tempos). */
export interface ExecTempo {
  execucao_id: string;
  modelo_id: string;
  modelo: string;
  versao_id?: string;
  loja_id: string;
  loja: string;
  rede_id?: string | null;
  usuario_id: string;
  pessoa: string;
  inicio_em: string;
  fim_em: string;
  total_seg: number;
  pausado_seg: number;
  ativo_seg: number | null;
  padrao_seg: number | null;
  status?: string;
}

/** Linha bruta de item. */
export interface ItemTempo {
  execucao_id: string;
  item_id: string;
  texto: string;
  secao_id?: string;
  ordem?: number;
  iniciado_em: string | null;
  concluido_em: string | null;
  duracao_seg: number | null;
  padrao_seg: number | null;
}

export interface ExecAnalisada extends ExecTempo {
  real_seg: number;
  media_seg: number | null;
  ultima_seg: number | null;
  referencia_seg: number | null;
  base: "padrao" | "media" | null;
  diferenca_seg: number | null;
  diferenca_pct: number | null;
  situacao: SituacaoTempo;
}

const media = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const real = (e: ExecTempo) => e.ativo_seg ?? e.total_seg;

/** Cada execução com média do período (mesmo checklist), última execução (mesmo checklist e loja), diferença e situação. */
export function analisarExecucoes(execs: ExecTempo[], cfgDaRede: (rede: string | null | undefined) => ConfigTempos = () => CONFIG_PADRAO): ExecAnalisada[] {
  const ordenadas = [...execs].sort((a, b) => a.inicio_em.localeCompare(b.inicio_em));
  const mediaPorModelo = new Map<string, number | null>();
  for (const m of new Set(ordenadas.map((e) => e.modelo_id))) mediaPorModelo.set(m, media(ordenadas.filter((e) => e.modelo_id === m).map(real)));
  return ordenadas.map((e, i) => {
    const anterior = [...ordenadas.slice(0, i)].reverse().find((x) => x.modelo_id === e.modelo_id && x.loja_id === e.loja_id);
    const m = mediaPorModelo.get(e.modelo_id) ?? null;
    const ref = e.padrao_seg && e.padrao_seg > 0 ? e.padrao_seg : m;
    const r = real(e);
    return {
      ...e, real_seg: r, media_seg: m, ultima_seg: anterior ? real(anterior) : null,
      referencia_seg: ref, base: e.padrao_seg && e.padrao_seg > 0 ? "padrao" : m ? "media" : null,
      diferenca_seg: ref ? r - ref : null, diferenca_pct: ref ? Math.round(((r - ref) / ref) * 100) : null,
      situacao: situacaoTempo(r, ref, cfgDaRede(e.rede_id)),
    };
  });
}

export interface ItemAnalisado extends ItemTempo {
  media_seg: number | null;
  referencia_seg: number | null;
  situacao: SituacaoTempo;
}

/** Itens com situação (contra o padrão do item; sem padrão, contra a média do mesmo item no período). */
export function analisarItens(itens: ItemTempo[], execs: ExecTempo[], cfgDaRede: (rede: string | null | undefined) => ConfigTempos = () => CONFIG_PADRAO): ItemAnalisado[] {
  const modeloDe = new Map(execs.map((e) => [e.execucao_id, e]));
  const chave = (i: ItemTempo) => `${modeloDe.get(i.execucao_id)?.modelo_id}|${i.item_id}`;
  const medias = new Map<string, number | null>();
  for (const k of new Set(itens.map(chave))) medias.set(k, media(itens.filter((i) => chave(i) === k && i.duracao_seg != null).map((i) => i.duracao_seg!)));
  return itens.map((i) => {
    const m = medias.get(chave(i)) ?? null;
    const ref = i.padrao_seg && i.padrao_seg > 0 ? i.padrao_seg : m;
    return { ...i, media_seg: m, referencia_seg: ref, situacao: situacaoTempo(i.duracao_seg, ref, cfgDaRede(modeloDe.get(i.execucao_id)?.rede_id)) };
  });
}

export interface Comparativo {
  chave: string;
  nome: string;
  n: number;
  media_seg: number | null;
  /** % em relação à média geral do mesmo filtro (positivo = mais lento) */
  vs_media_pct: number | null;
  rapido_demais: number;
}

/** A mesma tarefa entre pessoas ou entre lojas. */
export function compararPor(analisadas: ExecAnalisada[], por: "pessoa" | "loja"): Comparativo[] {
  const geral = media(analisadas.map((e) => e.real_seg));
  const grupos = new Map<string, ExecAnalisada[]>();
  for (const e of analisadas) {
    const k = por === "pessoa" ? e.usuario_id : e.loja_id;
    grupos.set(k, [...(grupos.get(k) ?? []), e]);
  }
  return [...grupos.entries()].map(([k, es]) => {
    const m = media(es.map((e) => e.real_seg));
    return {
      chave: k, nome: por === "pessoa" ? es[0].pessoa : es[0].loja, n: es.length, media_seg: m,
      vs_media_pct: m != null && geral ? Math.round(((m - geral) / geral) * 100) : null,
      rapido_demais: es.filter((e) => e.situacao === "rapido_demais").length,
    };
  }).sort((a, b) => (a.media_seg ?? 0) - (b.media_seg ?? 0));
}

/** Itens que mais demoram (média). */
export function rankingItens(itens: ItemTempo[], limite = 10) {
  const grupos = new Map<string, ItemTempo[]>();
  for (const i of itens) if (i.duracao_seg != null) grupos.set(i.item_id, [...(grupos.get(i.item_id) ?? []), i]);
  return [...grupos.entries()].map(([item_id, is]) => ({
    item_id, texto: is[0].texto, n: is.length, media_seg: media(is.map((i) => i.duracao_seg!))!, max_seg: Math.max(...is.map((i) => i.duracao_seg!)),
    padrao_seg: is[0].padrao_seg,
  })).sort((a, b) => b.media_seg - a.media_seg).slice(0, limite);
}

/** Evolução por dia (data de SP): média do tempo ativo e padrão médio. */
export function evolucao(analisadas: ExecAnalisada[]) {
  const dias = new Map<string, ExecAnalisada[]>();
  for (const e of analisadas) { const d = dataSP(e.inicio_em); dias.set(d, [...(dias.get(d) ?? []), e]); }
  return [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([data, es]) => ({
    data, n: es.length, media_seg: media(es.map((e) => e.real_seg)), padrao_seg: media(es.map((e) => e.padrao_seg).filter((x): x is number => !!x)),
  }));
}

/** Depois de N execuções concluídas: "tempo médio real: X min — usar como padrão?" */
export function sugestaoPadrao(execs: ExecTempo[], modeloId: string, minimo = 5): { n: number; media_min: number } | null {
  const es = execs.filter((e) => e.modelo_id === modeloId);
  if (es.length < minimo) return null;
  const m = media(es.map(real));
  return m == null ? null : { n: es.length, media_min: Math.max(1, Math.round(m / 60)) };
}

/** Números do Dashboard. */
export function resumoTempos(analisadas: ExecAnalisada[]) {
  const com = analisadas.filter((e) => e.situacao !== "sem_referencia");
  return {
    n: analisadas.length,
    media_seg: media(analisadas.map((e) => e.real_seg)),
    padrao_medio_seg: media(analisadas.map((e) => e.padrao_seg).filter((x): x is number => !!x)),
    pct_no_tempo: com.length ? Math.round((100 * com.filter((e) => e.situacao === "no_tempo").length) / com.length) : null,
    acima: com.filter((e) => e.situacao === "acima").length,
    muito_acima: com.filter((e) => e.situacao === "muito_acima").length,
    rapido_demais: com.filter((e) => e.situacao === "rapido_demais").length,
  };
}
