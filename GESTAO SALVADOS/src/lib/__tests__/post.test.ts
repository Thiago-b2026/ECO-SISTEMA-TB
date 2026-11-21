import { describe, expect, it } from "vitest";
import { descontoPercent, layoutsProntos, nomeArquivoPost, preencherCampos } from "@/lib/post";

const dados = { nome: "Bicicleta Aro 26", precoML: 899, precoVenda: 584.35, qtd: 3, foto: null };

describe("post de produto", () => {
  it("preenche os campos da legenda", () => {
    expect(preencherCampos("{nome} | R$ {precoML} | R$ {precoVenda} | {desconto}% | {qtd} un", dados)).toBe(
      "Bicicleta Aro 26 | R$ 899,00 | R$ 584,35 | 35% | 3 un",
    );
  });

  it("desconto com uma casa e sem preço ML vira traço", () => {
    expect(descontoPercent({ precoML: 100, precoVenda: 66.6 })).toBe(33.4);
    expect(descontoPercent({ precoML: null, precoVenda: 10 })).toBeNull();
    expect(preencherCampos("{desconto} {precoML}", { ...dados, precoML: null })).toBe("— —");
  });

  it("layouts prontos têm fundo embaixo e nomes únicos", () => {
    const ls = layoutsProntos();
    expect(new Set(ls.map((l) => l.nome)).size).toBe(ls.length);
    for (const l of ls) expect(l.camadas[0].tipo).toBe("fundo");
  });

  it("nome do arquivo sem acento nem espaço", () => {
    expect(nomeArquivoPost("Árvore de Natal 1,50m")).toBe("post-arvore-de-natal-1-50m.jpg");
  });
});
