// @vitest-environment jsdom
// O app montado de verdade, no modo demonstração: login → menu por permissão → lançar → fechar o mês.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reiniciarDemo } from "../src/data/demo-servidor";

class SemTamanho { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = SemTamanho as unknown as typeof ResizeObserver;

async function abrirComo(nome: RegExp, rota = "/") {
  window.history.pushState({}, "", rota);
  vi.resetModules(); // cada teste começa com um servidor de demonstração novo
  const { default: App } = await import("../src/App");
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: nome }));
  await screen.findByRole("navigation", { name: "Telas do Meta de Vendas" });
}
const menu = () => within(screen.getByRole("navigation", { name: "Telas do Meta de Vendas" })).getAllByRole("link").map((a) => a.textContent);

beforeEach(() => {
  localStorage.clear();
  reiniciarDemo();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => cleanup());

describe("app no modo demonstração", () => {
  it("tela de entrada mostra o login único, sem 'Criar conta'", async () => {
    vi.resetModules();
    const { default: App } = await import("../src/App");
    render(<App />);
    expect(await screen.findByText("Eco Sistema TB")).toBeTruthy();
    expect(screen.queryByText(/criar conta/i)).toBeNull();
  });

  it("gerente: entra no Dashboard e vê as 7 telas", async () => {
    await abrirComo(/Gerente da Loja 1/);
    expect(await screen.findByRole("heading", { name: /Dashboard/ })).toBeTruthy();
    expect(menu()).toEqual(["Dashboard", "Ranking", "Meu desempenho", "Histórico", "Lançamentos do mês", "Vendedores", "Meta e fechamento do mês"]);
    expect(screen.getByTitle("Ir para o Portal do Ecossistema TB").getAttribute("href")).toBe("https://portal-grupotb.vercel.app");
  });

  it("vendedora: entra no Meu desempenho, só vê as telas liberadas e lança o próprio resultado", async () => {
    await abrirComo(/Ana \(vendedora\)/);
    expect(await screen.findByRole("heading", { name: /Meu desempenho/ })).toBeTruthy();
    expect(menu()).toEqual(["Ranking", "Meu desempenho"]);
    fireEvent.change(await screen.findByLabelText("Faturamento (R$)"), { target: { value: "40.000,00" } });
    fireEvent.change(screen.getByLabelText("Clientes engajados"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Resultado salvo.")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("R$ 40.000,00")).toBeTruthy());
  });

  it("vendedor só com 'ver' não tem o formulário; tela não liberada mostra 'Acesso negado'", async () => {
    await abrirComo(/Bruno \(vendedor\)/, "/configuracao");
    expect(await screen.findByText("Acesso negado")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Meu desempenho" }));
    expect(await screen.findByRole("heading", { name: /Meu desempenho/ })).toBeTruthy();
    expect(screen.queryByLabelText("Faturamento (R$)")).toBeNull();
  });

  it("gerente: altera um lançamento, fecha o mês e os campos travam", async () => {
    await abrirComo(/Gerente da Loja 1/, "/lancamentos");
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
    expect(screen.getByDisplayValue("25000")).toBeTruthy();
  });

  it("admin escolhe a unidade no topo", async () => {
    await abrirComo(/Admin \(Ecossistema TB\)/);
    const sel = await screen.findByLabelText("Unidade");
    expect(within(sel).getAllByRole("option").map((o) => o.textContent)).toEqual(["Supermix Loja 1 · SUPERMIX BRAZ", "Supermix Loja 2 · SUPERMIX BRAZ"]);
    fireEvent.change(sel, { target: { value: "demo-loja-2" } });
    fireEvent.click(screen.getByRole("link", { name: "Ranking" }));
    expect(await screen.findByText("Davi")).toBeTruthy();
  });
});
