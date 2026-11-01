import { describe, expect, it } from "vitest";
import { codificar128B, code128Svg, larguras128, PADROES_CODE128 } from "@/lib/code128";

describe("code128", () => {
  it("todo símbolo soma 11 módulos (STOP soma 13)", () => {
    PADROES_CODE128.forEach((p, i) => {
      const soma = p.split("").reduce((s, d) => s + Number(d), 0);
      expect(soma, `símbolo ${i}`).toBe(i === 106 ? 13 : 11);
    });
    expect(new Set(PADROES_CODE128).size).toBe(107);
  });

  it("calcula o dígito verificador", () => {
    // 104 + P48×1 + J42×2 + J42×3 + "1"17×4 + "2"18×5 + "3"19×6 + C35×7 = 879 → 879 mod 103 = 55
    const v = codificar128B("PJJ123C");
    expect(v[0]).toBe(104);
    expect(v[v.length - 2]).toBe(55);
    expect(v[v.length - 1]).toBe(106);
  });

  it("gera larguras e SVG", () => {
    const ls = larguras128("P1234");
    // início + 5 caracteres + verificador = 7 símbolos × 6 + STOP 7
    expect(ls.length).toBe(7 * 6 + 7);
    expect(code128Svg("P1234")).toContain("<svg");
  });

  it("recusa caractere fora da tabela", () => {
    expect(() => codificar128B("Ação")).toThrow();
  });
});
