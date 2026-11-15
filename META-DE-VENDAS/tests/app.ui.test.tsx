// @vitest-environment jsdom
// O app montado de verdade, no modo demonstração: login → menu por permissão → lançar → fechar o mês.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reiniciarDemo, semearExemplo } from "../src/data/demo-servidor";

class SemTamanho { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = SemTamanho as unknown as typeof ResizeObserver;

/** Entra pelo formulário (e-mail e senha), como uma pessoa de verdade. */
async function abrirComo(email: string, rota = "/") {
  window.history.pushState({}, "", rota);
  vi.resetModules(); // cada teste começa com um servidor de demonstração novo
  const { default: App } = await import("../src/App");
  render(<App />);
  fireEvent.change(await screen.findByLabelText("E-mail"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "demo" } });
  fireEvent.click(screen.getByRole("button", { name: /Entrar/ }));
  await screen.findByRole("navigation", { name: "Telas do Meta de Vendas" });
}
const menu = () => within(screen.getByRole("navigation", { name: "Telas do Meta de Vendas" })).getAllByRole("link").map((a) => a.textContent);

beforeEach(() => {
  localStorage.clear();
  semearExemplo(); // os testes de tela partem dos dados de exemplo (o app de verdade começa vazio)
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => cleanup());

describe("app no modo demonstração", () => {
  it("a demonstração começa vazia: só o administrador, que é levado ao cadastro", async () => {
    reiniciarDemo();
    vi.resetModules();
    const { default: App } = await import("../src/App");
    render(<App />);
    expect(screen.queryByRole("button", { name: /Gerente/ })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /Administrador \(Ecossistema TB\)/ }));
    expect(await screen.findByText(/Nenhuma unidade usa o Meta de Vendas ainda/)).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Cadastre a empresa e as lojas" }));
    expect(await screen.findByText("Nenhuma empresa cadastrada.")).toBeTruthy();
  });

  it("tela de entrada mostra o login único, sem 'Criar conta'", async () => {
    vi.resetModules();
    const { default: App } = await import("../src/App");
    render(<App />);
    expect(await screen.findByText("Eco Sistema TB")).toBeTruthy();
    expect(screen.queryByText(/criar conta/i)).toBeNull();
  });

  it("gerente: entra no Dashboard e vê as 7 telas", async () => {
    await abrirComo("gerente@demo.tb");
    expect(await screen.findByRole("heading", { name: /Dashboard/ })).toBeTruthy();
    expect(menu()).toEqual(["Dashboard", "Ranking", "Meu desempenho", "Histórico", "Lançamentos do mês", "Vendedores", "Meta e fechamento do mês"]);
    expect(screen.getByTitle("Ir para o Portal do Ecossistema TB").getAttribute("href")).toBe("https://portal-grupotb.vercel.app");
  });

  it("vendedora: entra no Meu desempenho, só vê as telas liberadas e lança o próprio resultado", async () => {
    await abrirComo("ana@demo.tb");
    expect(await screen.findByRole("heading", { name: /Meu desempenho/ })).toBeTruthy();
    expect(menu()).toEqual(["Ranking", "Meu desempenho"]);
    fireEvent.change(await screen.findByLabelText("Faturamento (R$)"), { target: { value: "40.000,00" } });
    fireEvent.change(screen.getByLabelText("Clientes engajados"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Resultado salvo.")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("R$ 40.000,00")).toBeTruthy());
  });

  it("vendedor só com 'ver' não tem o formulário; tela não liberada mostra 'Acesso negado'", async () => {
    await abrirComo("bruno@demo.tb", "/configuracao");
    expect(await screen.findByText("Acesso negado")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Meu desempenho" }));
    expect(await screen.findByRole("heading", { name: /Meu desempenho/ })).toBeTruthy();
    expect(screen.queryByLabelText("Faturamento (R$)")).toBeNull();
  });

  it("gerente: altera um lançamento, fecha o mês e os campos travam", async () => {
    await abrirComo("gerente@demo.tb", "/lancamentos");
    const campo = await screen.findByLabelText("Faturamento de Carla");
    fireEvent.change(campo, { target: { value: "25000" } });
    expect(await screen.findByText("Alterado, falta salvar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Salvar \(1\)/ }));
    expect(await screen.findByText("1 lançamento(s) salvo(s).")).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Meta e fechamento do mês" }));
    fireEvent.click(await screen.findByRole("button", { name: /Fechar o mês/ }));
    expect(await screen.findByText("Mês fechado.")).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Lançamentos do mês" }));
    await waitFor(() => expect((screen.getByLabelText("Faturamento de Carla") as HTMLInputElement).disabled).toBe(true));
    expect(await screen.findByDisplayValue("25000")).toBeTruthy();
  });

  it("admin escolhe a unidade no topo", async () => {
    await abrirComo("admin@demo.tb");
    const sel = await screen.findByLabelText("Unidade");
    expect(within(sel).getAllByRole("option").map((o) => o.textContent)).toEqual(["Supermix Loja 1", "Supermix Loja 2"]);
    fireEvent.change(sel, { target: { value: "demo-loja-2" } });
    fireEvent.click(screen.getByRole("link", { name: "Ranking" }));
    expect(await screen.findByText("Davi")).toBeTruthy();
  });

  it("gerente não vê Empresas e lojas nem Usuários e acessos (só o admin)", async () => {
    await abrirComo("gerente@demo.tb", "/empresas");
    expect(await screen.findByText("Acesso negado")).toBeTruthy();
    expect(menu()).not.toContain("Empresas e lojas");
    expect(menu()).not.toContain("Usuários e acessos");
  });

  it("admin cadastra empresa e loja, cria o login do vendedor, e o vendedor entra na loja nova", async () => {
    await abrirComo("admin@demo.tb", "/empresas");
    fireEvent.change(await screen.findByLabelText("Nova empresa (rede)"), { target: { value: "Rede Norte" } });
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar empresa/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Nova unidade em REDE NORTE/ }));
    // padrão do cadastro: CNPJ obrigatório; "Pesquisar CNPJ" traz os dados da Receita (BrasilAPI, aqui simulada)
    fireEvent.click(screen.getByRole("button", { name: "Salvar unidade" }));
    expect(await screen.findByText("Informe o CNPJ da unidade.")).toBeTruthy();
    const receita = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      razao_social: "NORTE COMERCIO LTDA", nome_fantasia: "NORTE MATRIZ", cep: "01001000", descricao_tipo_de_logradouro: "PRACA",
      logradouro: "DA SE", numero: "100", bairro: "SE", municipio: "SAO PAULO", uf: "SP", descricao_situacao_cadastral: "ATIVA",
    }), { status: 200 }));
    fireEvent.change(screen.getByLabelText(/CNPJ \(obrigatório\)/), { target: { value: "11222333000181" } });
    fireEvent.click(screen.getByRole("button", { name: /Pesquisar CNPJ/ }));
    expect(await screen.findByText("Dados da Receita preenchidos. Confira e salve.")).toBeTruthy();
    expect(receita).toHaveBeenCalledWith("https://brasilapi.com.br/api/cnpj/v1/11222333000181");
    expect((screen.getByLabelText("Razão social") as HTMLInputElement).value).toBe("NORTE COMERCIO LTDA");
    expect((screen.getByLabelText("Rua / Avenida") as HTMLInputElement).value).toBe("PRACA DA SE");
    expect((screen.getByLabelText("Cidade") as HTMLInputElement).value).toBe("SAO PAULO");
    fireEvent.change(screen.getByLabelText("Nome da unidade no sistema"), { target: { value: "Norte Matriz" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar unidade" }));
    expect(await screen.findByText("Unidade Norte Matriz cadastrada.")).toBeTruthy();
    expect(await screen.findByText((_, el) => el?.tagName === "SPAN" && el.textContent === "11.222.333/0001-81 · matriz")).toBeTruthy();
    expect(await screen.findByText("PRACA DA SE, 100 · SE · SAO PAULO/SP")).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Usuários e acessos" }));
    const principal = within(screen.getByRole("main"));
    const selEmpresa = await principal.findByLabelText("Empresa");
    fireEvent.change(selEmpresa, { target: { value: (within(selEmpresa).getByRole("option", { name: "REDE NORTE" }) as HTMLOptionElement).value } });
    fireEvent.click(await screen.findByRole("button", { name: /Dar acesso/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Criar login novo/ }));
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "lia@norte.com" } });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Lia" } });
    fireEvent.change(screen.getByLabelText(/Senha inicial/), { target: { value: "senha1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar login e dar acesso" }));
    expect(await screen.findByText(/Login de Lia criado/)).toBeTruthy();
    expect(await screen.findByText("lia@norte.com")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Sair/ }));
    fireEvent.change(await screen.findByLabelText("E-mail"), { target: { value: "lia@norte.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha1234" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar/ }));
    expect(await screen.findByRole("heading", { name: /Meu desempenho/ })).toBeTruthy();
    expect(screen.getByText("Norte Matriz")).toBeTruthy();
    expect(screen.getByText("REDE NORTE")).toBeTruthy();
  });
});
