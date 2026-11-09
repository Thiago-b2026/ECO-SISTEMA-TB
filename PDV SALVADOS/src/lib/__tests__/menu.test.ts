import { describe, expect, it } from "vitest";
import { GRUPOS_MENU, NAV, PORTAL_URL, itemVisivel, montarMenu } from "@/lib/nav";
import { GRUPOS, TELAS, telasLegado } from "@/lib/telas";

const visiveisPara = (liberadas: Set<string>) =>
  NAV.filter((n) => itemVisivel(n, { podeTela: (c) => !c || liberadas.has(c), pode: () => true }));

describe("menu novo do PDV (Etapa A)", () => {
  it("os grupos do menu são os mesmos grupos das permissões (banco), na mesma ordem", () => {
    expect(GRUPOS_MENU.map((g) => [g.codigo, g.nome])).toEqual(
      GRUPOS.filter((g) => g.sistema === "pdv").sort((a, b) => a.ordem - b.ordem).map((g) => [g.codigo, g.nome]),
    );
  });

  it("cada tela do menu está no mesmo grupo em que aparece nas permissões", () => {
    for (const n of NAV.filter((x) => x.tela)) {
      expect(n.grupo, n.to).toBe(TELAS.find((t) => t.codigo === n.tela)!.grupo);
    }
  });

  it("admin vê os 6 grupos na ordem combinada, com as subtelas certas", () => {
    const tudo = new Set(TELAS.map((t) => t.codigo));
    const blocos = montarMenu(visiveisPara(tudo));
    const grupos = blocos.filter((b) => b.tipo === "grupo");
    expect(grupos.map((b) => b.nome)).toEqual(["Dashboard", "PDV · Frente de loja", "Produtos", "Financeiro", "Cadastros", "CRM e WhatsApp"]);
    const itens = (nome: string) => grupos.find((b) => b.nome === nome)!.itens.map((i) => i.label);
    expect(itens("Dashboard")).toEqual(["Dashboard"]); // Relatórios virou aba dentro do Dashboard
    expect(itens("PDV · Frente de loja")).toEqual(["PDV", "Vendas e notas"]);
    expect(itens("Produtos")).toEqual(["Cadastro de produtos", "Mercadológico", "Lotes", "Etiquetas", "Transferências"]);
    expect(itens("Financeiro")).toEqual(["Financeiro", "Movimentações de caixa", "Formas e meios de pagamento", "Contas bancárias", "Plano de contas"]);
    expect(itens("Cadastros")).toEqual(["Empresas", "Pessoas", "Login de acesso"]);
    expect(itens("CRM e WhatsApp")).toEqual(["CRM"]);
  });

  it("vendedora vê só os grupos das telas dela; a tela principal é a 1ª liberada do grupo", () => {
    const blocos = montarMenu(visiveisPara(telasLegado("vendedor", () => true)));
    const grupos = blocos.filter((b) => b.tipo === "grupo");
    expect(grupos.map((b) => b.nome)).toEqual(["Dashboard", "PDV · Frente de loja", "Produtos", "Financeiro", "CRM e WhatsApp"]);
    expect(grupos.find((b) => b.nome === "Financeiro")!.itens.map((i) => i.label)).toEqual(["Movimentações de caixa"]);
    expect(grupos.find((b) => b.nome === "Dashboard")!.itens.map((i) => i.label)).toEqual(["Dashboard"]);
  });

  it("estoquista não vê PDV · Frente de loja nem Financeiro", () => {
    const nomes = montarMenu(visiveisPara(telasLegado("estoquista", () => true))).filter((b) => b.tipo === "grupo").map((b) => b.nome);
    expect(nomes).toEqual(["Dashboard", "Produtos"]);
  });

  it("'Lojas e configurações' virou 'Empresas' e 'Produtos e estoque' virou 'Cadastro de produtos'", () => {
    expect(NAV.find((n) => n.to === "/lojas")!.label).toBe("Empresas");
    expect(NAV.find((n) => n.to === "/produtos")!.label).toBe("Cadastro de produtos");
    expect(NAV.some((n) => n.label === "Lojas e configurações" || n.label === "Produtos e estoque")).toBe(false);
  });

  it("'Sistemas' saiu do menu: a escolha de sistema é pelo Portal", () => {
    expect(NAV.some((n) => n.to === "/sistemas" || n.label === "Sistemas")).toBe(false);
    expect(PORTAL_URL).toBe("https://portal-grupotb.vercel.app");
  });
});
