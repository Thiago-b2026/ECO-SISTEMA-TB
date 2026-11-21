import { describe, expect, it } from "vitest";
import { candidatoDaCaptura, codigoDoBotao, lerCapturaDoHash } from "@/lib/captura-ml";

const dados = {
  titulo: "Short Duplo Academia Compressão Corrida Bermuda 2em 1 Treino",
  preco: 33.9,
  preco_original: 64.9,
  foto: "https://http2.mlstatic.com/D_NQ_NP_651082-MLB112879343422_072026-O.webp",
  link: "https://www.mercadolivre.com.br/short-duplo/up/MLBU3962023842?pdp_filters=item_id%3AMLB4667725923",
  id: "MLB4667725923",
  marca: "Hueto",
  gtin: null,
  categoria: "Bermudas",
};
const hash = (d: unknown) => "#" + encodeURIComponent(JSON.stringify(d));

describe("captura do anúncio pelo botão Enviar para o PDV", () => {
  it("lê os dados enviados no #", () => {
    const c = lerCapturaDoHash(hash(dados), new Date("2026-11-21T03:00:00Z"))!;
    expect(c.titulo).toBe(dados.titulo);
    expect(c.preco).toBe(33.9);
    expect(c.preco_original).toBe(64.9);
    expect(c.id).toBe("MLB4667725923");
    expect(c.capturado_em).toBe("2026-11-21T03:00:00.000Z");
  });

  it("recusa o que não for do Mercado Livre ou vier quebrado", () => {
    expect(lerCapturaDoHash("")).toBeNull();
    expect(lerCapturaDoHash("#%7Bquebrado")).toBeNull();
    expect(lerCapturaDoHash(hash({ ...dados, link: "https://golpe.com/x" }))).toBeNull();
    expect(lerCapturaDoHash(hash({ ...dados, link: "javascript:alert(1)" }))).toBeNull();
    expect(lerCapturaDoHash(hash({ ...dados, titulo: "" }))).toBeNull();
  });

  it("limpa campos estranhos", () => {
    const c = lerCapturaDoHash(hash({ ...dados, preco_original: 10, foto: "javascript:x", id: "abc", gtin: "789-1234567890" }))!;
    expect(c.preco_original).toBeNull(); // "de" menor que o "por" não vale
    expect(c.foto).toBeNull();
    expect(c.id).toBeNull();
    expect(c.gtin).toBe("7891234567890");
  });

  it("vira candidato com 100% de semelhança", () => {
    const cand = candidatoDaCaptura(lerCapturaDoHash(hash(dados))!);
    expect(cand).toMatchObject({ id: "MLB4667725923", tipo: "item", preco: 33.9, preco_original: 64.9, similaridade: 100 });
  });

  it("código do botão aponta para o PDV e é uma linha só", () => {
    const c = codigoDoBotao("https://eco-sistema-tb.vercel.app");
    expect(c.startsWith("javascript:(function(P){")).toBe(true);
    expect(c).toContain('"https://eco-sistema-tb.vercel.app"');
    expect(c).not.toContain("\n");
  });
});
