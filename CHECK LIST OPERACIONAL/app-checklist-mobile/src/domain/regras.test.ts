import { describe, expect, it } from "vitest";
import { pendencias, pontuar, pontuacaoExecucao, itensParaPlano, textoPontuacao, fator } from "./regras";
import type { ConteudoModelo, Item, Resposta, ValorResposta } from "./tipos";

const item = (id: string, extra: Partial<Item> = {}): Item => ({
  id, texto: id, tipo: "conformidade", obrigatorio: true, foto: "nunca", observacao: "nunca",
  gera_plano: true, pontua: true, peso: 1, ...extra,
});
const resp = (item_id: string, valor: ValorResposta | null, observacao?: string): Resposta => ({
  id: "r-" + item_id, execucao_id: "e1", item_id, valor, observacao, respondido_em: "2026-11-10T10:00:00Z",
});

describe("pontuação (regra B)", () => {
  it("pesos 2,3,5,2 com conforme, parcial, não conforme e N/A = 35%", () => {
    const c: ConteudoModelo = { secoes: [{ id: "s", titulo: "S", itens: [
      item("a", { peso: 2 }), item("b", { peso: 3 }), item("c", { peso: 5 }), item("d", { peso: 2 }),
    ] }] };
    const rs = [
      resp("a", { tipo: "conformidade", v: "conforme" }),
      resp("b", { tipo: "conformidade", v: "parcial" }),
      resp("c", { tipo: "conformidade", v: "nao_conforme" }),
      resp("d", { tipo: "conformidade", v: "na" }),
    ];
    const p = pontuacaoExecucao(c, rs, 2);
    expect(p.percentual).toBe(35);
    expect(p.obtidos).toBe(3.5);
    expect(p.possiveis).toBe(10);
  });

  it("sem item pontuável = Sem pontuação aplicável (nunca 0% nem 100%)", () => {
    expect(pontuar([]).percentual).toBeNull();
    expect(pontuar([{ peso: 3, fator: null }]).percentual).toBeNull();
    expect(textoPontuacao(pontuar([]))).toBe("Sem pontuação aplicável");
    const c: ConteudoModelo = { secoes: [{ id: "s", titulo: "S", itens: [item("t", { tipo: "texto", pontua: false })] }] };
    expect(pontuacaoExecucao(c, [resp("t", { tipo: "texto", v: "ok" })], 1).percentual).toBeNull();
    const tudoNa: ConteudoModelo = { secoes: [{ id: "s", titulo: "S", itens: [item("a")] }] };
    expect(pontuacaoExecucao(tudoNa, [resp("a", { tipo: "conformidade", v: "na" })], 1).percentual).toBeNull();
  });

  it("sim/não respeita a resposta esperada; número respeita a faixa", () => {
    expect(fator(item("x", { tipo: "sim_nao" }), { tipo: "sim_nao", v: true })).toBe(1);
    expect(fator(item("x", { tipo: "sim_nao", resposta_esperada: false }), { tipo: "sim_nao", v: true })).toBe(0);
    expect(fator(item("x", { tipo: "numero", min: 0, max: 5 }), { tipo: "numero", v: 7 })).toBe(0);
    expect(fator(item("x", { tipo: "numero" }), { tipo: "numero", v: 7 })).toBeNull();
  });
});

describe("condicionais e pendências (regra F)", () => {
  const c: ConteudoModelo = { secoes: [{ id: "s", titulo: "Ofertas", itens: [
    item("oferta_ok", { tipo: "sim_nao", gera_plano: false, peso: 2 }),
    item("causa", { tipo: "texto", pontua: false, gera_plano: false, condicao: { item_id: "oferta_ok", valores: [false] } }),
    item("placa", { foto: "sempre" }),
    item("balcao", { foto: "se_nao_conforme", observacao: "se_nao_conforme" }),
    item("segunda", { dias_semana: [1] }),
  ] }] };

  it("oculto por condição não gera pendência e não pontua", () => {
    const rs = [resp("oferta_ok", { tipo: "sim_nao", v: true }), resp("placa", { tipo: "conformidade", v: "conforme" }), resp("balcao", { tipo: "conformidade", v: "conforme" })];
    const p = pendencias(c, rs, new Map([["placa", 1]]), 2);
    expect(p).toEqual([]);
  });

  it("condição satisfeita: a causa vira pendência", () => {
    const rs = [resp("oferta_ok", { tipo: "sim_nao", v: false }), resp("placa", { tipo: "conformidade", v: "conforme" }), resp("balcao", { tipo: "conformidade", v: "conforme" })];
    const p = pendencias(c, rs, new Map([["placa", 1]]), 2);
    expect(p.map((x) => `${x.item_id}:${x.tipo}`)).toEqual(["causa:resposta"]);
  });

  it("foto obrigatória, foto e observação quando não conforme, item do dia", () => {
    const rs = [resp("oferta_ok", { tipo: "sim_nao", v: true }), resp("placa", { tipo: "conformidade", v: "conforme" }), resp("balcao", { tipo: "conformidade", v: "nao_conforme" })];
    const p = pendencias(c, rs, new Map(), 1);
    expect(p.map((x) => `${x.item_id}:${x.tipo}`)).toEqual(["placa:foto", "balcao:foto", "balcao:observacao", "segunda:resposta"]);
  });

  it("não conforme gera plano ligado ao item", () => {
    const rs = [resp("balcao", { tipo: "conformidade", v: "nao_conforme" }), resp("placa", { tipo: "conformidade", v: "conforme" })];
    expect(itensParaPlano(c, rs, 2).map((i) => i.id)).toEqual(["balcao"]);
  });
});
