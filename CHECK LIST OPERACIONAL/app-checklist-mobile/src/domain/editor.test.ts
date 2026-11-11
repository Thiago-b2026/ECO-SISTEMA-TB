import { describe, expect, it } from "vitest";
import {
  adicionarItem, adicionarSecao, alterarItem, candidatasCondicao, definirCondicao, duplicarItem, moverItem, moverSecao,
  removerItem, removerSecao, respostasPossiveis, validarConteudo,
} from "./editor";
import { pendencias } from "./regras";
import type { ConteudoModelo } from "./tipos";

function montar() {
  let c: ConteudoModelo = { secoes: [] };
  c = adicionarSecao(c, "Abertura", "loja");
  const s = c.secoes[0].id;
  const a = adicionarItem(c, s, "sim_nao"); c = a.conteudo;
  const b = adicionarItem(c, s, "texto"); c = b.conteudo;
  const m = adicionarItem(c, s, "multipla"); c = m.conteudo;
  c = alterarItem(c, a.itemId, { texto: "A oferta deu certo?" });
  c = alterarItem(c, b.itemId, { texto: "Qual a causa?" });
  c = alterarItem(c, m.itemId, { texto: "Canal", opcoes: ["Rádio", "WhatsApp", "Encarte"], multipla_selecao: true });
  return { c, s, a: a.itemId, b: b.itemId, m: m.itemId };
}

describe("editor de checklists", () => {
  it("cria seção e itens com padrões do tipo; valida antes de publicar", () => {
    const { c, a, b } = montar();
    const ia = c.secoes[0].itens.find((i) => i.id === a)!;
    expect(ia).toMatchObject({ tipo: "sim_nao", pontua: true, peso: 1, gera_plano: true, observacao: "se_nao_conforme" });
    expect(c.secoes[0].itens.find((i) => i.id === b)).toMatchObject({ pontua: false, peso: 0, gera_plano: false });
    expect(validarConteudo(c)).toEqual([]);
    expect(validarConteudo({ secoes: [] })).toContain("O checklist precisa de pelo menos um item.");
    expect(validarConteudo(alterarItem(c, a, { texto: "" }))).toContain("Há um item sem texto.");
    expect(validarConteudo(alterarItem(c, a, { peso: 0 })).join()).toMatch("peso maior que zero");
  });

  it("condicional: só pergunta anterior e com resposta escolhível; sem ciclos", () => {
    const { c, a, b, m } = montar();
    expect(candidatasCondicao(c, a)).toEqual([]); // a primeira não tem anteriores
    expect(candidatasCondicao(c, m).map((i) => i.id)).toEqual([a]); // texto não serve de condição
    expect(respostasPossiveis(c.secoes[0].itens[0]).map((r) => r.rotulo)).toEqual(["Sim", "Não", "N/A"]);
    const c2 = definirCondicao(c, b, { item_id: a, valores: [false] });
    expect(() => definirCondicao(c2, a, { item_id: b, valores: ["x"] })).toThrow("ANTERIOR"); // ciclo impossível
    expect(() => definirCondicao(c2, b, { item_id: b, valores: [true] })).toThrow("dela mesma");
    expect(() => definirCondicao(c2, b, { item_id: a, valores: [] })).toThrow("pelo menos uma resposta");
    // a condição funciona na execução: oculto não pendura, visível pendura
    const r = (item_id: string, valor: unknown) => ({ id: item_id, execucao_id: "e", item_id, valor, respondido_em: "x" }) as never;
    expect(pendencias(c2, [r(a, { tipo: "sim_nao", v: true }), r(m, { tipo: "multipla", v: ["Rádio"] })], new Map(), 1)).toEqual([]);
    expect(pendencias(c2, [r(a, { tipo: "sim_nao", v: false }), r(m, { tipo: "multipla", v: ["Rádio"] })], new Map(), 1).filter((p) => p.tipo === "resposta").map((p) => p.item_id)).toEqual([b]);
  });

  it("reordenar que deixa a condição apontando para frente remove a condição; remover limpa dependentes", () => {
    const { c, a, b } = montar();
    const c2 = definirCondicao(c, b, { item_id: a, valores: [false] });
    const c3 = moverItem(c2, b, -1); // b passa para antes de a
    expect(c3.secoes[0].itens[0].id).toBe(b);
    expect(c3.secoes[0].itens[0].condicao).toBeUndefined();
    const c4 = removerItem(c2, a);
    expect(c4.secoes[0].itens.find((i) => i.id === b)!.condicao).toBeUndefined();
    const c5 = alterarItem(c2, a, { tipo: "texto" }); // trocar o tipo da pergunta-mãe também limpa
    expect(c5.secoes[0].itens.find((i) => i.id === b)!.condicao).toBeUndefined();
    expect(c5.secoes[0].itens.find((i) => i.id === a)).toMatchObject({ pontua: false, gera_plano: false });
  });

  it("seções: renomear, subir/descer, remover; itens: duplicar; o original nunca é alterado", () => {
    const { c } = montar();
    const antes = JSON.stringify(c);
    let c2 = adicionarSecao(c, "Fechamento");
    c2 = moverSecao(c2, c2.secoes[1].id, -1);
    expect(c2.secoes.map((s) => s.titulo)).toEqual(["Fechamento", "Abertura"]);
    c2 = duplicarItem(c2, c2.secoes[1].itens[0].id);
    expect(c2.secoes[1].itens).toHaveLength(4);
    expect(new Set(c2.secoes[1].itens.map((i) => i.id)).size).toBe(4);
    expect(validarConteudo(c2)).toContain('A seção "Fechamento" está vazia.');
    c2 = removerSecao(c2, c2.secoes[0].id);
    expect(c2.secoes.map((s) => s.titulo)).toEqual(["Abertura"]);
    expect(JSON.stringify(c)).toBe(antes); // funções puras
  });
});

describe("tempo padrão no editor", () => {
  it("checklist e item: define, limpa com vazio/0 e valida o limite", async () => {
    const { definirTempoItem, definirTempoPadrao } = await import("./editor");
    const { c, a } = montar();
    let n = definirTempoPadrao(c, 15);
    n = definirTempoItem(n, a, 2.5);
    expect(n.tempo_padrao_min).toBe(15);
    expect(n.secoes[0].itens.find((i) => i.id === a)!.tempo_padrao_min).toBe(2.5);
    expect(c.tempo_padrao_min).toBeUndefined(); // não muda o original
    expect(validarConteudo(n)).toEqual([]);
    expect("tempo_padrao_min" in definirTempoPadrao(n, 0)).toBe(false);
    expect("tempo_padrao_min" in definirTempoItem(n, a, null).secoes[0].itens.find((i) => i.id === a)!).toBe(false);
    expect(validarConteudo({ ...n, tempo_padrao_min: 2000 })).toContain("Tempo padrão do checklist inválido (de 1 min a 24 h).");
  });
});
