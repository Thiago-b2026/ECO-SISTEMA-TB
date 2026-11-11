import { describe, expect, it } from "vitest";
import { analisarExecucoes, analisarItens, compararPor, evolucao, rankingItens, resumoTempos, situacaoTempo, sugestaoPadrao, type ExecTempo, type ItemTempo } from "./tempos";

const ex = (n: number, ativo: number, extra: Partial<ExecTempo> = {}): ExecTempo => ({
  execucao_id: `e${n}`, modelo_id: "m", modelo: "Abertura", loja_id: "l1", loja: "Matriz", usuario_id: "u1", pessoa: "Ana",
  inicio_em: new Date(Date.UTC(2026, 10, n, 13)).toISOString(), fim_em: new Date(Date.UTC(2026, 10, n, 14)).toISOString(),
  total_seg: ativo + 60, pausado_seg: 60, ativo_seg: ativo, padrao_seg: 600, ...extra,
});

describe("situação do tempo", () => {
  it("no tempo, acima (+20%), muito acima (+50%), rápido demais (< 30%), sem referência", () => {
    expect(situacaoTempo(600, 600)).toBe("no_tempo");
    expect(situacaoTempo(720, 600)).toBe("no_tempo"); // exatamente +20%
    expect(situacaoTempo(721, 600)).toBe("acima");
    expect(situacaoTempo(901, 600)).toBe("muito_acima");
    expect(situacaoTempo(179, 600)).toBe("rapido_demais");
    expect(situacaoTempo(180, 600)).toBe("no_tempo");
    expect(situacaoTempo(600, null)).toBe("sem_referencia");
    expect(situacaoTempo(null, 600)).toBe("sem_referencia");
  });
  it("limites configuráveis por empresa", () => {
    const cfg = { acima_pct: 10, muito_acima_pct: 30, rapido_pct: 50 };
    expect(situacaoTempo(670, 600, cfg)).toBe("acima");
    expect(situacaoTempo(790, 600, cfg)).toBe("muito_acima");
    expect(situacaoTempo(290, 600, cfg)).toBe("rapido_demais");
  });
});

describe("comparativos", () => {
  const execs = [
    ex(1, 600), ex(2, 900, { usuario_id: "u2", pessoa: "Diego", loja_id: "l2", loja: "Filial" }), ex(3, 100), ex(4, 1000), ex(5, 620, { padrao_seg: null }),
  ];
  const a = analisarExecucoes(execs);

  it("usa o tempo ATIVO; padrão quando existe, senão a média do período; diferença; última da mesma loja", () => {
    // 900 contra 600 = exatamente +50% → "acima" (para "muito acima" precisa passar de +50%)
    expect(a.map((e) => e.situacao)).toEqual(["no_tempo", "acima", "rapido_demais", "muito_acima", "no_tempo"]);
    expect(a[0]).toMatchObject({ real_seg: 600, base: "padrao", diferenca_seg: 0, ultima_seg: null });
    expect(a[2]).toMatchObject({ ultima_seg: 600, diferenca_pct: -83 }); // anterior da Matriz é a e1 (a e2 é da Filial)
    expect(a[4]).toMatchObject({ base: "media", referencia_seg: 644, media_seg: 644 });
  });

  it("entre pessoas e entre lojas, contra a média geral", () => {
    const p = compararPor(a, "pessoa");
    expect(p.map((x) => [x.nome, x.n, x.media_seg, x.vs_media_pct, x.rapido_demais])).toEqual([["Ana", 4, 580, -10, 1], ["Diego", 1, 900, 40, 0]]);
    expect(compararPor(a, "loja").map((x) => x.nome)).toEqual(["Matriz", "Filial"]);
  });

  it("evolução por dia, resumo do dashboard e sugestão de padrão depois de 5 execuções", () => {
    expect(evolucao(a)).toHaveLength(5);
    expect(resumoTempos(a)).toMatchObject({ n: 5, pct_no_tempo: 40, acima: 1, muito_acima: 1, rapido_demais: 1 });
    expect(sugestaoPadrao(execs.slice(0, 4), "m")).toBeNull();
    expect(sugestaoPadrao(execs, "m")).toEqual({ n: 5, media_min: 11 });
  });

  it("itens: situação contra o padrão do item (ou a média do item) e ranking dos que mais demoram", () => {
    const it = (e: string, item: string, d: number | null, padrao: number | null = null): ItemTempo => ({ execucao_id: e, item_id: item, texto: item, iniciado_em: "x", concluido_em: "y", duracao_seg: d, padrao_seg: padrao });
    const itens = [it("e1", "a", 60, 60), it("e2", "a", 200, 60), it("e1", "b", 30), it("e3", "b", 300), it("e3", "a", 10, 60)];
    expect(analisarItens(itens, execs).map((i) => i.situacao)).toEqual(["no_tempo", "muito_acima", "rapido_demais", "muito_acima", "rapido_demais"]);
    expect(rankingItens(itens).map((r) => [r.item_id, r.media_seg])).toEqual([["b", 165], ["a", 90]]);
  });
});
