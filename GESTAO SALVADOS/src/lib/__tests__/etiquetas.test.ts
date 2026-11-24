import { describe, expect, it } from "vitest";
import { htmlEtiquetas, MODELOS_ETIQUETA, textoOff } from "@/lib/etiquetas";

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
