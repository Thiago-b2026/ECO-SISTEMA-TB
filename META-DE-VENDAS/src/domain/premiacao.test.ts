// O cálculo precisa dar o MESMO resultado do Lovable (src/lib/calculo-premiacao.ts do "Sales Champion").
import { describe, expect, it } from "vitest";
import { calcularPremiacao, ordenarRanking, quantoFalta, type ConfigMeta } from "./premiacao";

const CONFIG: ConfigMeta = { meta_total: 136000, percentual_minimo: 0.9, premio_meta_100: 4000, premio_meta_90: 1500, valor_por_cliente_engajado: 0.5 };
const l = (id: string, fat: number, cli = 0) => ({ vendedor_id: id, nome: id, faturamento_realizado: fat, clientes_engajados: cli });

describe("calcularPremiacao", () => {
  it("bateu 100%: divide o prêmio 100% pela participação e soma o engajamento", () => {
    const r = calcularPremiacao(CONFIG, [l("ana", 81600, 100), l("bruno", 54400, 20)]);
    expect(r.faturamento_loja).toBe(136000);
    expect(r.percentual_atingido).toBe(1);
    expect(r.faixa).toBe("100");
    expect(r.premio_a_dividir).toBe(4000);
    const [ana, bruno] = r.vendedores;
    expect(ana.participacao).toBeCloseTo(0.6);
    expect(ana.premio_faturamento).toBeCloseTo(2400);
    expect(ana.premio_engajamento).toBe(50);
    expect(ana.premio_total).toBeCloseTo(2450);
    expect(bruno.premio_total).toBeCloseTo(1600 + 10);
    expect(r.total_premio_faturamento).toBeCloseTo(4000);
    expect(r.total_premio_engajamento).toBe(60);
    expect(r.total_premio).toBeCloseTo(4060);
  });

  it("entre o mínimo e 100%: usa o prêmio da meta mínima", () => {
    const r = calcularPremiacao(CONFIG, [l("ana", 122400)]); // exatamente 90%
    expect(r.faixa).toBe("minima");
    expect(r.premio_a_dividir).toBe(1500);
    expect(r.vendedores[0].premio_faturamento).toBe(1500);
  });

  it("abaixo do mínimo: sem prêmio de faturamento, mas o engajamento continua valendo", () => {
    const r = calcularPremiacao(CONFIG, [l("ana", 122399.99, 10)]);
    expect(r.faixa).toBe("abaixo");
    expect(r.premio_a_dividir).toBe(0);
    expect(r.vendedores[0].premio_faturamento).toBe(0);
    expect(r.vendedores[0].premio_total).toBe(5);
  });

  it("sem meta cadastrada ou meta zero: nada de prêmio de faturamento (sem dividir por zero)", () => {
    for (const c of [null, { ...CONFIG, meta_total: 0 }]) {
      const r = calcularPremiacao(c, [l("ana", 50000, 4)]);
      expect(r.percentual_atingido).toBe(0);
      expect(r.faixa).toBe("abaixo");
      expect(Number.isFinite(r.total_premio)).toBe(true);
    }
  });

  it("sem lançamentos: tudo zero (sem dividir por zero)", () => {
    const r = calcularPremiacao(CONFIG, []);
    expect(r).toMatchObject({ faturamento_loja: 0, percentual_atingido: 0, total_premio: 0, vendedores: [] });
  });

  it("o % mínimo é configurável (80%)", () => {
    expect(calcularPremiacao({ ...CONFIG, percentual_minimo: 0.8 }, [l("ana", 108800)]).faixa).toBe("minima");
  });

  it("valores vindos como texto do banco (numeric) são somados como número", () => {
    const r = calcularPremiacao(CONFIG, [{ ...l("ana", 0), faturamento_realizado: "100" as unknown as number }, l("bruno", 50)]);
    expect(r.faturamento_loja).toBe(150);
  });
});

describe("apoio", () => {
  it("quanto falta para cada faixa", () => {
    expect(quantoFalta(CONFIG, 100000)).toEqual({ para100: 36000, paraMinima: 22400 });
    expect(quantoFalta(CONFIG, 200000)).toEqual({ para100: 0, paraMinima: 0 });
  });

  it("ranking: maior faturamento primeiro, empate pelo nome", () => {
    const r = calcularPremiacao(CONFIG, [l("Bruno", 10), l("Ana", 10), l("Carla", 30)]);
    expect(ordenarRanking(r.vendedores).map((v) => v.nome)).toEqual(["Carla", "Ana", "Bruno"]);
  });
});
