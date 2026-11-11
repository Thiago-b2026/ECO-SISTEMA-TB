// Operações do editor de checklists (puras: recebem o conteúdo e devolvem um NOVO conteúdo).
// Sempre sobre o RASCUNHO: a versão publicada nunca muda (regra A).
import { novoId } from "./ids";
import { TIPOS_AVALIATIVOS, todosItens } from "./regras";
import type { Condicao, ConteudoModelo, Item, Secao, TipoItem } from "./tipos";

const clonar = (c: ConteudoModelo): ConteudoModelo => structuredClone(c);
const idCurto = (p: string) => `${p}_${novoId().replace(/-/g, "").slice(0, 8)}`;

export const ROTULO_TIPO: Record<TipoItem, string> = {
  sim_nao: "Sim / Não", conformidade: "Conforme / Não conforme", numero: "Número", texto: "Texto",
  multipla: "Múltipla escolha", assinatura: "Assinatura", foto: "Só foto",
};

/** Item novo com padrões sensatos para o tipo. */
export function itemPadrao(tipo: TipoItem, texto = "Nova pergunta"): Item {
  const avaliativo = TIPOS_AVALIATIVOS.has(tipo) && tipo !== "numero";
  return {
    id: idCurto("i"), texto, tipo, obrigatorio: true,
    foto: tipo === "foto" ? "sempre" : "nunca",
    observacao: avaliativo ? "se_nao_conforme" : "nunca",
    gera_plano: avaliativo, pontua: avaliativo, peso: avaliativo ? 1 : 0,
    ...(tipo === "multipla" ? { opcoes: ["Opção 1", "Opção 2"], multipla_selecao: false } : {}),
    ...(tipo === "sim_nao" ? { permite_na: true } : {}),
  };
}

export function adicionarSecao(c: ConteudoModelo, titulo = "Nova seção", setor?: string): ConteudoModelo {
  const n = clonar(c);
  n.secoes.push({ id: idCurto("s"), titulo, setor, itens: [] });
  return n;
}

export function alterarSecao(c: ConteudoModelo, secaoId: string, p: Partial<Pick<Secao, "titulo" | "setor">>): ConteudoModelo {
  const n = clonar(c);
  Object.assign(n.secoes.find((s) => s.id === secaoId)!, p);
  return n;
}

const mover = <T,>(xs: T[], i: number, d: -1 | 1) => {
  const j = i + d;
  if (i < 0 || j < 0 || j >= xs.length) return xs;
  const c = [...xs];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
};

/** Itens cuja condição deixaria de apontar para uma pergunta ANTERIOR depois de uma mudança de ordem. */
function limparCondicoesInvalidas(c: ConteudoModelo): ConteudoModelo {
  const vistos = new Set<string>();
  for (const s of c.secoes) for (const i of s.itens) {
    if (i.condicao && !vistos.has(i.condicao.item_id)) delete i.condicao;
    vistos.add(i.id);
  }
  return c;
}

export function moverSecao(c: ConteudoModelo, secaoId: string, d: -1 | 1): ConteudoModelo {
  const n = clonar(c);
  n.secoes = mover(n.secoes, n.secoes.findIndex((s) => s.id === secaoId), d);
  return limparCondicoesInvalidas(n);
}

/** Remove a seção. Perguntas de outras seções que dependiam das dela perdem a condição. */
export function removerSecao(c: ConteudoModelo, secaoId: string): ConteudoModelo {
  const n = clonar(c);
  const ids = new Set(n.secoes.find((s) => s.id === secaoId)?.itens.map((i) => i.id) ?? []);
  n.secoes = n.secoes.filter((s) => s.id !== secaoId);
  for (const i of todosItensRef(n)) if (i.condicao && ids.has(i.condicao.item_id)) delete i.condicao;
  return n;
}

const todosItensRef = (c: ConteudoModelo) => c.secoes.flatMap((s) => s.itens);

export function adicionarItem(c: ConteudoModelo, secaoId: string, tipo: TipoItem): { conteudo: ConteudoModelo; itemId: string } {
  const n = clonar(c);
  const it = itemPadrao(tipo);
  n.secoes.find((s) => s.id === secaoId)!.itens.push(it);
  return { conteudo: n, itemId: it.id };
}

export function alterarItem(c: ConteudoModelo, itemId: string, p: Partial<Item>): ConteudoModelo {
  const n = clonar(c);
  const it = todosItensRef(n).find((i) => i.id === itemId)!;
  Object.assign(it, p);
  // trocar o tipo ajusta o que não faz sentido no tipo novo
  if (p.tipo) {
    if (!TIPOS_AVALIATIVOS.has(p.tipo)) { it.pontua = false; it.peso = 0; it.gera_plano = false; }
    if (p.tipo === "multipla" && !it.opcoes?.length) it.opcoes = ["Opção 1", "Opção 2"];
    if (p.tipo !== "multipla") { delete it.opcoes; delete it.multipla_selecao; }
    if (p.tipo === "foto") it.foto = "sempre";
    // quem dependia deste item com valores do tipo antigo perde a condição
    for (const x of todosItensRef(n)) if (x.condicao?.item_id === itemId) delete x.condicao;
  }
  for (const k of Object.keys(p) as (keyof Item)[]) if (p[k] === undefined) delete it[k];
  return n;
}

export function moverItem(c: ConteudoModelo, itemId: string, d: -1 | 1): ConteudoModelo {
  const n = clonar(c);
  const s = n.secoes.find((x) => x.itens.some((i) => i.id === itemId))!;
  s.itens = mover(s.itens, s.itens.findIndex((i) => i.id === itemId), d);
  return limparCondicoesInvalidas(n);
}

export function duplicarItem(c: ConteudoModelo, itemId: string): ConteudoModelo {
  const n = clonar(c);
  const s = n.secoes.find((x) => x.itens.some((i) => i.id === itemId))!;
  const idx = s.itens.findIndex((i) => i.id === itemId);
  s.itens.splice(idx + 1, 0, { ...structuredClone(s.itens[idx]), id: idCurto("i"), texto: `${s.itens[idx].texto} (cópia)` });
  return n;
}

/** Remove o item. Quem dependia dele perde a condição (aviso na tela). */
export function removerItem(c: ConteudoModelo, itemId: string): ConteudoModelo {
  const n = clonar(c);
  for (const s of n.secoes) s.itens = s.itens.filter((i) => i.id !== itemId);
  for (const i of todosItensRef(n)) if (i.condicao?.item_id === itemId) delete i.condicao;
  return n;
}

export const dependentes = (c: ConteudoModelo, itemId: string) => todosItens(c).filter((i) => i.condicao?.item_id === itemId);

/**
 * Perguntas que podem controlar a condição do item: só as ANTERIORES, com resposta escolhível
 * (sim/não, conformidade, múltipla). Assim não existe ciclo.
 */
export function candidatasCondicao(c: ConteudoModelo, itemId: string): Item[] {
  const lista = todosItens(c);
  const idx = lista.findIndex((i) => i.id === itemId);
  return lista.slice(0, Math.max(idx, 0)).filter((i) => i.tipo === "sim_nao" || i.tipo === "conformidade" || i.tipo === "multipla");
}

/** Respostas possíveis de uma pergunta (para escolher "mostrar quando…"). */
export function respostasPossiveis(i: Item): { valor: string | boolean; rotulo: string }[] {
  if (i.tipo === "sim_nao") return [{ valor: true, rotulo: "Sim" }, { valor: false, rotulo: "Não" }, ...(i.permite_na ? [{ valor: "na", rotulo: "N/A" }] : [])];
  if (i.tipo === "conformidade") return [
    { valor: "conforme", rotulo: "Conforme" }, { valor: "parcial", rotulo: "Parcial" }, { valor: "nao_conforme", rotulo: "Não conforme" }, { valor: "na", rotulo: "N/A" },
  ];
  if (i.tipo === "multipla") return (i.opcoes ?? []).map((o) => ({ valor: o, rotulo: o }));
  return [];
}

export function definirCondicao(c: ConteudoModelo, itemId: string, cond: Condicao | null): ConteudoModelo {
  if (cond) {
    if (cond.item_id === itemId) throw new Error("A pergunta não pode depender dela mesma.");
    if (!candidatasCondicao(c, itemId).some((x) => x.id === cond.item_id)) throw new Error("Escolha uma pergunta ANTERIOR (sim/não, conformidade ou múltipla escolha).");
    if (!cond.valores.length) throw new Error("Escolha pelo menos uma resposta que mostra a pergunta.");
  }
  return alterarItem(c, itemId, { condicao: cond ?? undefined });
}

/** Problemas que impedem publicar. Vazio = pode publicar. */
export function validarConteudo(c: ConteudoModelo): string[] {
  const erros: string[] = [];
  const itens = todosItens(c);
  if (!c.secoes.length) erros.push("Crie pelo menos uma seção.");
  if (!itens.length) erros.push("O checklist precisa de pelo menos um item.");
  c.secoes.forEach((s, n) => { if (!s.titulo.trim()) erros.push(`A seção ${n + 1} está sem nome.`); if (!s.itens.length) erros.push(`A seção "${s.titulo || n + 1}" está vazia.`); });
  const ids = new Set<string>();
  const vistos = new Set<string>();
  for (const i of itens) {
    const nome = `"${i.texto.slice(0, 40) || "(sem texto)"}"`;
    if (ids.has(i.id)) erros.push(`Item repetido: ${nome}.`);
    ids.add(i.id);
    if (!i.texto.trim()) erros.push("Há um item sem texto.");
    if (i.tipo === "multipla" && (i.opcoes ?? []).filter((o) => o.trim()).length < 2) erros.push(`${nome}: múltipla escolha precisa de pelo menos 2 opções.`);
    if (i.tipo === "multipla" && new Set(i.opcoes).size !== (i.opcoes ?? []).length) erros.push(`${nome}: há opções repetidas.`);
    if (i.prazo_hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(i.prazo_hora)) erros.push(`${nome}: prazo inválido.`);
    if (i.pontua && !(i.peso > 0)) erros.push(`${nome}: item que pontua precisa de peso maior que zero.`);
    if (i.condicao) {
      if (!vistos.has(i.condicao.item_id)) erros.push(`${nome}: a condição precisa ser de uma pergunta anterior.`);
      if (!i.condicao.valores.length) erros.push(`${nome}: escolha a resposta que mostra a pergunta.`);
    }
    vistos.add(i.id);
  }
  return erros;
}
