import { describe, expect, it } from "vitest";
import { ABAS_PRODUTOS, GRUPOS_MENU, NAV, PORTAL_URL, abasLiberadas, itemDaRota, itemVisivel, montarMenu, podeAbrirItem } from "@/lib/nav";
import { GRUPOS, TELAS, telasLegado } from "@/lib/telas";

const perm = (liberadas: Set<string>) => ({ podeTela: (c: string | undefined) => !c || liberadas.has(c), pode: () => true });
const visiveisPara = (liberadas: Set<string>) => NAV.filter((n) => itemVisivel(n, perm(liberadas)));
const grupos = (liberadas: Set<string>) => montarMenu(visiveisPara(liberadas)).filter((b) => b.tipo === "grupo");
const TUDO = new Set(TELAS.map((t) => t.codigo));
const PAPEIS = ["gerente", "vendedor", "estoquista"] as const;

describe("menu do PDV: DASHBOARD, PDV · FRENTE DE LOJA, CADASTROS, FINANCEIRO, CRM E WHATSAPP", () => {
  it("os grupos do menu existem nas permissões (banco) com o mesmo nome; Produtos virou item de Cadastros", () => {
    const doBanco = GRUPOS.filter((g) => g.sistema === "pdv");
    for (const g of GRUPOS_MENU) expect(doBanco.find((b) => b.codigo === g.codigo)?.nome, g.codigo).toBe(g.nome);
    expect(GRUPOS_MENU.map((g) => g.codigo)).toEqual(["dashboard", "frente", "cadastros", "financeiro", "crm"]);
  });

  it("cada tela do menu está no mesmo grupo das permissões (as telas de Produtos ficam em Cadastros)", () => {
    for (const n of NAV.filter((x) => x.tela && x.grupo)) {
      const g = TELAS.find((t) => t.codigo === n.tela)!.grupo;
      expect(n.grupo, n.to).toBe(g === "produtos" ? "cadastros" : g);
    }
  });

  it("admin vê os 5 grupos na ordem combinada, com as subtelas certas", () => {
    const gs = grupos(TUDO);
    expect(gs.map((b) => b.nome)).toEqual(["Dashboard", "PDV · Frente de loja", "Cadastros", "Financeiro", "CRM e WhatsApp"]);
    const itens = (nome: string) => gs.find((b) => b.nome === nome)!.itens.map((i) => i.label);
    expect(itens("Dashboard")).toEqual(["Dashboard"]); // Relatórios virou aba dentro do Dashboard
    expect(itens("PDV · Frente de loja")).toEqual(["PDV", "Vendas e notas"]);
    expect(itens("Cadastros")).toEqual(["Produtos", "Pessoas", "Empresas"]);
    expect(itens("Financeiro")).toEqual(["Financeiro", "Movimentações de caixa", "Formas e meios de pagamento", "Contas bancárias", "Plano de contas"]);
    expect(itens("CRM e WhatsApp")).toEqual(["CRM"]);
  });

  it("'Login de acesso' e as telas de produtos saíram do menu, mas os endereços antigos continuam existindo", () => {
    for (const to of ["/usuarios", "/mercadologico", "/lotes", "/etiquetas", "/transferencias", "/relatorios"]) {
      const n = NAV.find((x) => x.to === to)!;
      expect(n.oculto, to).toBe(true);
      expect(itemDaRota(to), to).toBe(n);
    }
    expect(itemDaRota("/lotes/123")?.tela).toBe("pdv.lotes"); // detalhe do lote continua com a trava da tela Lotes
  });

  it("estoquista vê CADASTROS → Produtos com as abas dele; vendedor vê só a aba CADASTRO", () => {
    const est = telasLegado("estoquista", () => true);
    expect(grupos(est).map((b) => b.nome)).toEqual(["Dashboard", "Cadastros"]);
    expect(abasLiberadas(ABAS_PRODUTOS, perm(est)).map((a) => a.aba)).toEqual(ABAS_PRODUTOS.filter((a) => est.has(a.tela)).map((a) => a.aba));
    const vend = telasLegado("vendedor", () => true);
    expect(abasLiberadas(ABAS_PRODUTOS, perm(vend)).map((a) => a.aba)).toEqual(["cadastro"]);
  });

  it("quem só tem a tela Lotes ainda entra em Produtos (abre direto na aba LOTES)", () => {
    const soLotes = new Set(["pdv.lotes"]);
    const produtos = NAV.find((n) => n.to === "/produtos")!;
    expect(itemVisivel(produtos, perm(soLotes))).toBe(true);
    expect(podeAbrirItem(produtos, perm(soLotes))).toBe(true);
    expect(abasLiberadas(ABAS_PRODUTOS, perm(soLotes)).map((a) => a.aba)).toEqual(["lotes"]);
    expect(podeAbrirItem(produtos, perm(new Set(["pdv.pdv"])))).toBe(false);
  });

  it("ninguém ganha nem perde acesso: cada tela liberada continua no menu ou como aba", () => {
    for (const papel of PAPEIS) {
      const lib = telasLegado(papel, () => true);
      const noMenu = new Set<string>();
      for (const n of visiveisPara(lib)) {
        if (n.abas) abasLiberadas(n.abas, perm(lib)).forEach((a) => noMenu.add(a.tela));
        else if (n.tela) noMenu.add(n.tela);
      }
      noMenu.add("pdv.relatorios"); // aba do Dashboard
      noMenu.add("pdv.login_acesso"); // aba da pessoa (só admin)
      noMenu.add("pdv.mercado_livre"); // nunca teve item no menu
      for (const t of lib) if (t.startsWith("pdv.")) expect(noMenu.has(t), `${papel}: ${t}`).toBe(true);
      // e nenhuma aba aparece sem a tela liberada
      for (const a of abasLiberadas(ABAS_PRODUTOS, perm(lib))) expect(lib.has(a.tela), `${papel}: ${a.tela}`).toBe(true);
    }
  });

  it("'Sistemas' saiu do menu: a escolha de sistema é pelo Portal", () => {
    expect(NAV.some((n) => n.to === "/sistemas" || n.label === "Sistemas")).toBe(false);
    expect(PORTAL_URL).toBe("https://portal-grupotb.vercel.app");
  });

  it("'Lojas e configurações' virou 'Empresas'", () => {
    expect(NAV.find((n) => n.to === "/lojas")!.label).toBe("Empresas");
    expect(NAV.some((n) => n.label === "Lojas e configurações" || n.label === "Produtos e estoque")).toBe(false);
  });
});
