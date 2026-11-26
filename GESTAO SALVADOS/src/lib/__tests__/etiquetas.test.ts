import { describe, expect, it } from "vitest";
import { htmlEtiquetas, htmlTeste, larguraPagina, lerAjuste, salvarAjuste, MODELOS_ETIQUETA, textoOff } from "@/lib/etiquetas";

describe("etiqueta no desenho do PrecificaLote", () => {
  const item = { titulo: "Lavadora <ZM>", sku: "P5345", preco: 2281.01, precoDe: 2534.46, grade: "A", copias: 3 };
  it("% OFF com duas casas; sem desconto fica vazio", () => {
    expect(textoOff(2281.01, 2534.46)).toBe("10,00% OFF");
    expect(textoOff(100, 100)).toBe("");
    expect(textoOff(100, null)).toBe("");
  });
  it("imprime as cópias, no tamanho da impressora, com SKU, preço e logo", () => {
    const m = MODELOS_ETIQUETA.find((x) => x.id === "50x25")!;
    const h = htmlEtiquetas([item], m, "Loja", { imprimir: false });
    expect(h.match(/class="et"/g)).toHaveLength(3);
    expect(h).toContain("size: 103mm 25mm");
    expect(h).toContain("Lavadora &lt;ZM&gt;");
    expect(h).toContain('class="logo"');
    expect(h).not.toContain("window.print");
  });
  it("modelo salvo antes do logo continua sem logo", () => {
    const m = { ...MODELOS_ETIQUETA[0], campos: { titulo: true, de: true, off: true, grade: true, codigo: true, sku: true, loja: true } };
    const h = htmlEtiquetas([item], m, "Loja", { imprimir: false });
    expect(h).not.toContain('class="logo"');
    expect(h).toContain('class="grade"');
  });
});

describe("rolo com 2 etiquetas por linha (impressora da loja 2)", () => {
  const item = { titulo: "Micro-ondas", sku: "P3675", preco: 639.99, precoDe: 799, grade: "A", copias: 5 };
  const m = MODELOS_ETIQUETA.find((x) => x.id === "50x25")!;
  it("uma página do tamanho do rolo inteiro por linha", () => {
    const h = htmlEtiquetas([item], m, "Loja", { imprimir: false });
    expect(larguraPagina(m)).toBe(103);
    expect(h.match(/class="folha"/g)).toHaveLength(3);
  });
  it("ajuste fino só quando existe; teste tem moldura e não produto", () => {
    expect(htmlEtiquetas([item], m, "", { imprimir: false })).not.toContain("translate(");
    expect(htmlEtiquetas([item], m, "", { imprimir: false, ajuste: { x: 1.5, y: -2 } })).toContain("translate(1.5mm, -2mm)");
    expect(htmlTeste(m, { imprimir: false }).match(/class="t"/g)).toHaveLength(4);
    expect(htmlTeste(m, { imprimir: false })).toContain("RÉGUA: esta barra tem 90 mm");
  });
});

describe("duas impressoras", () => {
  it("o ajuste de um modelo não mexe no outro", () => {
    const guarda = new Map<string, string>();
    const antes = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => guarda.get(k) ?? null, setItem: (k: string, v: string) => guarda.set(k, v) } });
    try {
      salvarAjuste("50x25", { x: 2, y: -1 });
      salvarAjuste("100x50", { x: 0, y: 3 });
      expect(lerAjuste("50x25")).toEqual({ x: 2, y: -1 });
      expect(lerAjuste("100x50")).toEqual({ x: 0, y: 3 });
      expect(lerAjuste("33x22")).toEqual({ x: 0, y: 0 });
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: antes });
    }
  });
});
