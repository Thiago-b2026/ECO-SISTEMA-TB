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
    expect(within(menu).queryByText("Cadastrar tarefas e checklists")).toBeNull();
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
    for (const t of ["Minhas tarefas", "Planos de ação", "Tarefas da loja", "Dashboard", "Relatórios", "Agendar tarefas"]) {
      expect(within(menu).getByText(t)).toBeTruthy();
    }
    expect(within(menu).queryByText("Colaboradores")).toBeNull();
    // configurações vêm ANTES do dia a dia (não ficam escondidas no fim do menu) e há o botão "Configurar" embaixo
    const itens = within(menu).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(itens.findIndex((t) => t.includes("Agendar tarefas"))).toBeLessThan(itens.findIndex((t) => t.includes("Minhas tarefas")));
    expect(within(screen.getByRole("navigation", { name: "Atalhos" })).getByRole("button", { name: /Configurar/ })).toBeTruthy();
  }, 30000);
});

describe("todas as telas abrem sem erro", () => {
  it("supervisor e gestor percorrem as telas", async () => {
    // recharts precisa de ResizeObserver (o jsdom não tem)
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    const erros: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { erros.push(a); orig(...a); };
    try {
      for (const [quem, telas] of [
        ["Bruno (Líder – Matriz)", ["Tarefas da loja", "Planos de ação", "Agendar tarefas", "Relatórios", "Dashboard"]],
        ["Carla (Gestora)", ["Cadastrar tarefas e checklists", "Colaboradores"]],
        ["Admin (Ecossistema TB)", ["Empresas e lojas", "Cadastrar tarefas e checklists", "Colaboradores"]],
      ] as const) {
        localStorage.clear();
        render(<App />);
        fireEvent.click(await screen.findByText(quem));
        const menu = await screen.findByRole("navigation", { name: "Menu" }, { timeout: 8000 });
        // empresa sempre no topo; o admin escolhe entre as duas empresas de exemplo
        if (quem.startsWith("Admin")) {
          const sel = screen.getByRole("combobox", { name: "Empresa" }) as HTMLSelectElement;
          expect([...sel.options].map((o) => o.text)).toEqual(["SUPERMIX BRAZ", "EMPRESA EXEMPLO 2"]);
        } else {
          expect(screen.getAllByText("SUPERMIX BRAZ").length).toBeGreaterThan(0);
          expect(within(menu).queryByText("Empresas e lojas")).toBeNull(); // só o admin
        }
        for (const t of telas) {
          await act(async () => { fireEvent.click(within(menu).getByText(t)); });
          await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(new RegExp(t.split(" ")[0])), { timeout: 8000 });
          expect(screen.queryByText("Acesso negado")).toBeNull();
        }
        cleanup();
        await servidor.sair();
      }
      expect(erros.filter((e) => !String(e).includes("act("))).toEqual([]);
    } finally {
      console.error = orig;
    }
  }, 60000);
});
