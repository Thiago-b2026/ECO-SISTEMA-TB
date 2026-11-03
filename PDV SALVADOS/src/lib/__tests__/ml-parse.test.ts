import { describe, expect, it } from "vitest";
import {
  candidatoDeProduto,
  ehCodigoDeBarras,
  extrairIdDoLink,
  precoDosAnuncios,
  similaridade,
} from "../../../supabase/functions/_shared/ml-parse.ts";

describe("extrairIdDoLink", () => {
  it("reconhece link de produto de catálogo", () => {
    expect(extrairIdDoLink("https://www.mercadolivre.com.br/liquidificador-philco/p/MLB19529284?pdp_filters=x")).toEqual({
      tipo: "produto",
      id: "MLB19529284",
    });
  });

  it("reconhece link de anúncio", () => {
    expect(extrairIdDoLink("https://produto.mercadolivre.com.br/MLB-3456789012-cafeteira-eletrica-_JM")).toEqual({
      tipo: "item",
      id: "MLB3456789012",
    });
    expect(extrairIdDoLink("https://www.mercadolivre.com.br/algo/up/MLBU123?item_id=MLB998877665")).toEqual({
      tipo: "item",
      id: "MLB998877665",
    });
  });

  it("devolve null para link desconhecido", () => {
    expect(extrairIdDoLink("https://www.google.com")).toBeNull();
  });
});

describe("ehCodigoDeBarras", () => {
  it("aceita 8 a 14 dígitos", () => {
    expect(ehCodigoDeBarras("7891234567895")).toBe(true);
    expect(ehCodigoDeBarras("1234567")).toBe(false);
    expect(ehCodigoDeBarras("78912345abc")).toBe(false);
  });
});

describe("similaridade", () => {
  it("ignora acentos e maiúsculas", () => {
    expect(similaridade("Panela Elétrica Mondial", "panela eletrica de arroz MONDIAL")).toBe(100);
    expect(similaridade("Cafeteira Elgin 15 xícaras", "Cafeteira Elétrica Elgin")).toBe(50);
  });
});

describe("candidatoDeProduto", () => {
  it("usa o preço do anúncio vencedor e os atributos", () => {
    const c = candidatoDeProduto(
      {
        id: "MLB1",
        name: "Cafeteira Elgin 15 Xícaras",
        permalink: "https://www.mercadolivre.com.br/x/p/MLB1",
        pictures: [{ url: "https://foto" }],
        attributes: [
          { id: "GTIN", value_name: "7891234567895" },
          { id: "BRAND", value_name: "Elgin" },
        ],
        buy_box_winner: { price: 95, original_price: 120, category_id: "MLB1234" },
      },
      "cafeteira elgin",
    );
    expect(c).toMatchObject({ preco: 95, preco_original: 120, gtin: "7891234567895", marca: "Elgin", similaridade: 100 });
  });

  it("sem anúncio vencedor, fica sem preço", () => {
    expect(candidatoDeProduto({ id: "MLB2", name: "X", attributes: [], buy_box_winner: null }).preco).toBeNull();
  });

  it("usa a faixa de preço quando não há vencedor", () => {
    expect(
      candidatoDeProduto({ id: "MLB3", name: "X", attributes: [], buy_box_winner: null, buy_box_winner_price_range: { min: { price: 150 } } }).preco,
    ).toBe(150);
  });
});

describe("precoDosAnuncios", () => {
  it("pega o menor preço entre os anúncios", () => {
    expect(
      precoDosAnuncios({
        results: [
          { price: 199, original_price: 249, category_id: "MLB1" },
          { price: 179, original_price: null, category_id: "MLB1" },
          { price: 0 },
        ],
      }),
    ).toEqual({ preco: 179, preco_original: null, categoria_id: "MLB1" });
  });

  it("sem anúncios com preço, devolve null", () => {
    expect(precoDosAnuncios({ results: [] })).toBeNull();
    expect(precoDosAnuncios(null)).toBeNull();
  });
});
