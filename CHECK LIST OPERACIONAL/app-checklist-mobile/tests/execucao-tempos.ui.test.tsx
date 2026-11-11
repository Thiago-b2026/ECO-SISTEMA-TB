// @vitest-environment jsdom
// Etapa 13 (a) pela tela: o item começa no 1º toque (hora de início visível), termina quando fica completo
// (hora de fim visível); app em 2º plano = "Pausado"; voltar = retoma; sair da tela pausa e voltar retoma.
import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "../src/App";
import { servidor } from "../src/data/conexao";
import { USUARIOS_DEMO } from "../src/data/demo-servidor";
import { BancoLocal } from "../src/data/local";

(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
window.confirm = () => true;

const T = { timeout: 10000 };
let visibilidade: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibilidade });
const mudarVisibilidade = async (v: DocumentVisibilityState) => {
  visibilidade = v;
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
};
afterEach(async () => { cleanup(); visibilidade = "visible"; await servidor.sair(); });

async function ir(rota: string) {
  await act(async () => { window.history.pushState({}, "", rota); window.dispatchEvent(new PopStateEvent("popstate")); });
}

describe("execução: tempos pela tela", () => {
  it("início no toque, fim quando completa, pausa em 2º plano e ao sair da tela", async () => {
    localStorage.clear();
    render(<App />);
    fireEvent.click(await screen.findByText("Ana (Fiscal – Matriz)", {}, T));
    await screen.findByRole("navigation", { name: "Menu" }, T);
    await ir("/");
    const iniciar = (await screen.findAllByRole("button", { name: /Iniciar/ }, T))[0];
    await act(async () => { fireEvent.click(iniciar); });
    await screen.findByRole("button", { name: /Revisar e concluir/ }, T);
    const execId = window.location.pathname.split("/")[2];

    // 1º item com resposta Sim/Não ou Conforme: tocar marca o início; responder completa (se não exigir foto)
    const cartoes = [...document.querySelectorAll<HTMLElement>("[id^='item-']")];
    const alvo = cartoes.find((c) => within(c).queryByRole("radio", { name: /^(Sim|Conforme)$/ }) && !/Foto obrigatória/.test(c.textContent ?? ""))!;
    const itemId = alvo.id.slice(5);
    expect(within(alvo).queryByTestId(`tempo-${itemId}`)).toBeNull();
    const radio = within(alvo).getByRole("radio", { name: /^(Sim|Conforme)$/ });
    await act(async () => { fireEvent.pointerDown(radio); });
    await waitFor(() => expect(within(alvo).getByTestId(`tempo-${itemId}`).textContent).toMatch(/Início \d\d:\d\d · em andamento/), T);
    await act(async () => { fireEvent.click(radio); });
    await waitFor(() => expect(within(alvo).getByTestId(`tempo-${itemId}`).textContent).toMatch(/Início \d\d:\d\d · Fim \d\d:\d\d · \d+s/), T);

    // app em 2º plano → pausa; volta → retoma
    await mudarVisibilidade("hidden");
    await screen.findByText("Pausado", {}, T);
    const db = new BancoLocal(USUARIOS_DEMO.find((u) => u.email.startsWith("ana"))!.id); // o mesmo banco do aparelho
    expect((await db.execucoes.get(execId))?.pausa_desde).toBeTruthy();
    await mudarVisibilidade("visible");
    await waitFor(() => expect(screen.queryByText("Pausado")).toBeNull(), T);

    // sair da tela pausa; voltar retoma
    await ir("/");
    await waitFor(async () => expect((await db.execucoes.get(execId))?.pausa_desde).toBeTruthy(), T);
    await ir(`/execucao/${execId}`);
    await screen.findByRole("button", { name: /Revisar e concluir/ }, T);
    await waitFor(async () => expect((await db.execucoes.get(execId))?.pausa_desde ?? null).toBeNull(), T);
    db.close();
  }, 120000);
});
