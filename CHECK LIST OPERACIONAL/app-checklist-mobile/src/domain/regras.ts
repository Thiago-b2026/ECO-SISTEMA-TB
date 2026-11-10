// Regras puras: visibilidade (condicionais / dia da semana), conformidade, fator, pontuação e pendências.
// A MESMA regra existe no banco (checklist.calcular_pontuacao / checklist.pendencias_execucao).
import type { ConteudoModelo, Item, Resposta, ValorResposta } from "./tipos";

export const TIPOS_AVALIATIVOS = new Set(["sim_nao", "conformidade", "numero"]);

export function todosItens(c: ConteudoModelo): Item[] {
  return c.secoes.flatMap((s) => s.itens.map((i) => ({ ...i, setor: i.setor ?? s.setor })));
}

type MapaRespostas = Map<string, Resposta>;
export const mapaRespostas = (rs: Resposta[]): MapaRespostas => new Map(rs.map((r) => [r.item_id, r]));

/** Valor "simples" de uma resposta, usado nas condições. */
export function valorSimples(v: ValorResposta | null | undefined): string | boolean | number | null {
  if (!v) return null;
  if (v.tipo === "multipla") return v.v.join("|");
  return v.v as string | boolean | number;
}

/**
 * Item visível?
 * - dias_semana: só no dia da semana da execução (data local)
 * - condicao: o item de referência precisa estar visível E ter um dos valores
 */
export function itemVisivel(item: Item, itens: Map<string, Item>, rs: MapaRespostas, diaSemana: number, prof = 0): boolean {
  if (item.dias_semana && item.dias_semana.length && !item.dias_semana.includes(diaSemana)) return false;
  if (!item.condicao) return true;
  if (prof > 20) return false; // proteção contra ciclo
  const ref = itens.get(item.condicao.item_id);
  if (!ref || !itemVisivel(ref, itens, rs, diaSemana, prof + 1)) return false;
  const v = valorSimples(rs.get(ref.id)?.valor);
  if (v === null) return false;
  if (ref.tipo === "multipla") {
    const marcados = String(v).split("|");
    return item.condicao.valores.some((x) => marcados.includes(String(x)));
  }
  return item.condicao.valores.some((x) => x === v);
}

/**
 * Fator de 0 a 1 de uma resposta avaliativa. null = não entra no cálculo (N/A, sem resposta, não avaliativo).
 * conforme / sim esperado = 1 · parcial = 0,5 · não conforme / não = 0 · N/A = fora.
 */
export function fator(item: Item, v: ValorResposta | null | undefined): number | null {
  if (!item.pontua || !v || !TIPOS_AVALIATIVOS.has(item.tipo)) return null;
  if (v.tipo === "conformidade") {
    return v.v === "conforme" ? 1 : v.v === "parcial" ? 0.5 : v.v === "nao_conforme" ? 0 : null;
  }
  if (v.tipo === "sim_nao") {
    if (v.v === "na") return null;
    const esperado = item.resposta_esperada ?? true;
    return v.v === esperado ? 1 : 0;
  }
  if (v.tipo === "numero") {
    if (item.min == null && item.max == null) return null;
    const ok = (item.min == null || v.v >= item.min) && (item.max == null || v.v <= item.max);
    return ok ? 1 : 0;
  }
  return null;
}

/** Não conforme (gera plano / exige foto "se_nao_conforme"). Parcial também conta como não conforme. */
export function naoConforme(item: Item, v: ValorResposta | null | undefined): boolean {
  if (!v) return false;
  if (v.tipo === "conformidade") return v.v === "nao_conforme" || v.v === "parcial";
  if (v.tipo === "sim_nao") return v.v !== "na" && v.v !== (item.resposta_esperada ?? true);
  if (v.tipo === "numero") return fator({ ...item, pontua: true }, v) === 0;
  return false;
}

export interface Pontuacao {
  /** null = "Sem pontuação aplicável" */
  percentual: number | null;
  obtidos: number;
  possiveis: number;
}

export interface EntradaPontuacao {
  peso: number;
  fator: number | null;
}

/** Conformidade = 100 × Σ(peso × fator) ÷ Σ(pesos aplicáveis). Sem item aplicável → null. */
export function pontuar(entradas: EntradaPontuacao[]): Pontuacao {
  let obtidos = 0;
  let possiveis = 0;
  for (const e of entradas) {
    if (e.fator == null || !(e.peso > 0)) continue;
    obtidos += e.peso * e.fator;
    possiveis += e.peso;
  }
  if (possiveis === 0) return { percentual: null, obtidos: 0, possiveis: 0 };
  return { percentual: Math.round(((100 * obtidos) / possiveis) * 100) / 100, obtidos, possiveis };
}

export function pontuacaoExecucao(c: ConteudoModelo, respostas: Resposta[], diaSemana: number, secaoId?: string): Pontuacao {
  const itens = todosItens(c);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const rs = mapaRespostas(respostas);
  const alvo = secaoId ? c.secoes.find((s) => s.id === secaoId)?.itens ?? [] : itens;
  return pontuar(
    alvo
      .filter((i) => itemVisivel(porId.get(i.id) ?? i, porId, rs, diaSemana))
      .map((i) => ({ peso: i.peso, fator: fator(i, rs.get(i.id)?.valor) })),
  );
}

export const textoPontuacao = (p: { percentual: number | null }) =>
  p.percentual == null ? "Sem pontuação aplicável" : `${p.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export type TipoPendencia = "resposta" | "foto" | "observacao";

export interface Pendencia {
  item_id: string;
  secao_id: string;
  texto: string;
  tipo: TipoPendencia;
  mensagem: string;
}

/** Resposta "vazia"? */
export function semResposta(v: ValorResposta | null | undefined): boolean {
  if (!v) return true;
  if (v.tipo === "texto") return !v.v.trim();
  if (v.tipo === "multipla") return v.v.length === 0;
  if (v.tipo === "assinatura") return !v.v;
  if (v.tipo === "numero") return !Number.isFinite(v.v);
  return false;
}

/**
 * Pendências que impedem concluir. Item oculto (condição/dia) não gera pendência.
 * fotosPorItem: quantas fotos cada item tem.
 */
export function pendencias(c: ConteudoModelo, respostas: Resposta[], fotosPorItem: Map<string, number>, diaSemana: number): Pendencia[] {
  const itens = todosItens(c);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const rs = mapaRespostas(respostas);
  const out: Pendencia[] = [];
  for (const s of c.secoes) {
    for (const i of s.itens) {
      const item = porId.get(i.id)!;
      if (!itemVisivel(item, porId, rs, diaSemana)) continue;
      const r = rs.get(i.id);
      const v = r?.valor;
      const base = { item_id: i.id, secao_id: s.id, texto: i.texto };
      const precisaResposta = item.obrigatorio && item.tipo !== "foto";
      if (precisaResposta && semResposta(v)) {
        out.push({ ...base, tipo: "resposta", mensagem: "Falta responder" });
        continue;
      }
      const nc = naoConforme(item, v);
      const fotos = fotosPorItem.get(i.id) ?? 0;
      const exigeFoto = item.tipo === "foto" ? item.obrigatorio : item.foto === "sempre" || (item.foto === "se_nao_conforme" && nc);
      if (exigeFoto && fotos === 0) out.push({ ...base, tipo: "foto", mensagem: "Falta a foto" });
      const exigeObs = item.observacao === "sempre" || (item.observacao === "se_nao_conforme" && nc);
      if (exigeObs && !(r?.observacao ?? "").trim()) out.push({ ...base, tipo: "observacao", mensagem: "Falta a observação" });
    }
  }
  return out;
}

/** Itens que devem gerar plano de ação (visíveis, gera_plano e não conformes). */
export function itensParaPlano(c: ConteudoModelo, respostas: Resposta[], diaSemana: number): Item[] {
  const itens = todosItens(c);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const rs = mapaRespostas(respostas);
  return itens.filter((i) => i.gera_plano && itemVisivel(i, porId, rs, diaSemana) && naoConforme(i, rs.get(i.id)?.valor));
}

/** Progresso: respondidos / visíveis. */
export function progresso(c: ConteudoModelo, respostas: Resposta[], diaSemana: number, fotosPorItem: Map<string, number> = new Map()) {
  const itens = todosItens(c);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const rs = mapaRespostas(respostas);
  const vis = itens.filter((i) => itemVisivel(i, porId, rs, diaSemana));
  const feitos = vis.filter((i) => (i.tipo === "foto" ? (fotosPorItem.get(i.id) ?? 0) > 0 : !semResposta(rs.get(i.id)?.valor))).length;
  return { feitos, total: vis.length };
}
