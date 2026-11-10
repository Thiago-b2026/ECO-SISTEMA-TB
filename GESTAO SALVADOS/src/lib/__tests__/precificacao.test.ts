import { describe, expect, it } from "vitest";
import {
  ARREDONDAMENTO_PADRAO,
  arredondar,
  classificar,
  colunaParaIndice,
  custoPercentual,
  lerNumero,
  margem,
  precoSugerido,
  ratearValorPago,
  type ConfigArredondamento,
} from "@/lib/precificacao";

describe("arredondar (padrão: para cima, ,99)", () => {
  it("unidade abaixo de R$ 50", () => {
    expect(arredondar(18.33)).toBe(18.99);
    expect(arredondar(44.7)).toBe(44.99);
    expect(arredondar(44.99)).toBe(44.99);
    expect(arredondar(45)).toBe(45.99);
  });
  it("dezena de R$ 50 a R$ 1.000", () => {
    expect(arredondar(84.7)).toBe(89.99);
    expect(arredondar(284.7)).toBe(289.99);
    expect(arredondar(290)).toBe(299.99);
  });
  it("centena acima de R$ 1.000", () => {
    expect(arredondar(1284.7)).toBe(1299.99);
  });
  it("para baixo", () => {
    const cfg: ConfigArredondamento = { ...ARREDONDAMENTO_PADRAO, direcao: "baixo" };
    expect(arredondar(84.7, cfg)).toBe(79.99);
    expect(arredondar(18.33, cfg)).toBe(17.99);
    expect(arredondar(0.5, cfg)).toBe(0.99); // nada abaixo de zero → sobe
  });
  it("centavos ,00 e ,90", () => {
    expect(arredondar(84.7, { ...ARREDONDAMENTO_PADRAO, centavos: 0 })).toBe(90);
    expect(arredondar(84.7, { ...ARREDONDAMENTO_PADRAO, centavos: 0.9 })).toBe(89.9);
  });
  it("desligado mantém o valor", () => {
    expect(arredondar(84.7, { ...ARREDONDAMENTO_PADRAO, ativo: false })).toBe(84.7);
  });
});

describe("preço e custo", () => {
  it("preço sugerido aplica desconto e arredonda", () => {
    expect(precoSugerido(199, 10)).toBe(179.99);
    expect(precoSugerido(null, 10)).toBeNull();
  });
  it("custo percentual", () => {
    expect(custoPercentual(314.82, 30)).toBe(94.45);
    expect(custoPercentual(0, 30)).toBeNull();
  });
  it("margem sobre a venda", () => {
    expect(margem(100, 30)).toBe(70);
    expect(margem(0, 30)).toBeNull();
  });
});

describe("ratearValorPago", () => {
  it("divide proporcional ao preço × quantidade", () => {
    const r = ratearValorPago(300, [
      { id: "a", quantidade: 1, preco_ref: 100 },
      { id: "b", quantidade: 2, preco_ref: 100 },
    ]);
    expect(r.get("a")).toBe(100);
    expect(r.get("b")).toBe(100); // 2 unidades × 100 = 200 do total
  });
});

describe("outros", () => {
  it("classificar", () => {
    expect(classificar(95, 90)).toBe("sucesso");
    expect(classificar(70, 90)).toBe("similar");
    expect(classificar(null, 90)).toBe("nao_encontrado");
  });
  it("coluna do Excel", () => {
    expect(colunaParaIndice("A")).toBe(0);
    expect(colunaParaIndice("d")).toBe(3);
    expect(colunaParaIndice("AB")).toBe(27);
    expect(colunaParaIndice("1")).toBe(-1);
  });
  it("lerNumero", () => {
    expect(lerNumero("R$ 1.234,56")).toBe(1234.56);
    expect(lerNumero("314.82")).toBe(314.82);
    expect(lerNumero(10)).toBe(10);
    expect(lerNumero("")).toBeNull();
  });
});
