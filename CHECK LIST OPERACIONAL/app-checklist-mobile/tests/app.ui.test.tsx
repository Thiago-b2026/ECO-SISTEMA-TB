// @vitest-environment jsdom
// Monta o APP DE VERDADE (modo demonstração) num DOM simulado e percorre o caminho principal:
// login "Eco Sistema TB" → Minhas tarefas → iniciar → responder → conclusão bloqueada com pendências.
import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "../src/App";
import { servidor } from "../src/data/conexao";

afterEach(async () => { cleanup(); await servidor.sair(); });

describe("app (modo demonstração)", () => {
  it("login sem 'Criar conta', menu por perfil, execução e conclusão bloqueada", async () => {
    localStorage.clear();
    render(<App />);
    // tela de login do Ecossistema
    expect(await screen.findByText("Eco Sistema TB")).toBeTruthy();
    expect(screen.queryByText(/criar conta/i)).toBeNull();
    expect(screen.getByText(/Modo demonstração/)).toBeTruthy();

    fireEvent.click(screen.getByText("Ana (Fiscal – Matriz)"));
    expect(await screen.findByText(/Minhas tarefas ·/, {}, { timeout: 8000 })).toBeTruthy();
    // operador: sem Dashboard/Modelos no menu; botão do Portal no topo
    const menu = screen.getByRole("navigation", { name: "Menu" });
    expect(within(menu).queryByText("Dashboard")).toBeNull();
    expect(within(menu).queryByText("Modelos de checklist")).toBeNull();
    expect(screen.getByTitle("Ir para o Portal do Ecossistema TB").getAttribute("href")).toBe("https://portal-grupotb.vercel.app");

    // as tarefas do dia aparecem (geradas pela agenda) e a barra de status está visível
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Iniciar/ }).length).toBeGreaterThan(0), { timeout: 8000 });
    expect(screen.getAllByRole("status").some((s) => /Salvo no aparelho|Nada salvo/.test(s.textContent ?? ""))).toBe(true);

    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Iniciar/ })[0]); });
    expect(await screen.findByText(/Revisar e concluir/, {}, { timeout: 8000 })).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();

    // responde o primeiro "Sim"
    const sim = screen.getAllByRole("radio", { name: "Sim" })[0];
    await act(async () => { fireEvent.click(sim); });
    await waitFor(() => expect(screen.getAllByRole("radio", { name: "Sim" })[0].getAttribute("aria-checked")).toBe("true"));

    // vai revisar: conclusão bloqueada e lista de pendências com link para os itens
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Revisar e concluir/ })); });
    expect(await screen.findByText(/Resolva antes de concluir/)).toBeTruthy();
    const concluir = screen.getByRole("button", { name: /Concluir \(bloqueado/ });
    expect((concluir as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole("link", { name: /Ir/ }).length).toBeGreaterThan(0);
  }, 30000);

  it("supervisor vê as telas de supervisão no menu", async () => {
    localStorage.clear();
    render(<App />);
    fireEvent.click(await screen.findByText("Bruno (Líder – Matriz)"));
    const menu = await screen.findByRole("navigation", { name: "Menu" }, { timeout: 8000 });
    for (const t of ["Minhas tarefas", "Planos de ação", "Tarefas da loja", "Dashboard", "Relatórios", "Agendamentos"]) {
      expect(within(menu).getByText(t)).toBeTruthy();
    }
    expect(within(menu).queryByText("Equipe e perfis")).toBeNull();
  }, 30000);
});
