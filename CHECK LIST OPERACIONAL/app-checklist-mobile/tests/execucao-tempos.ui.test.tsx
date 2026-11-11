// @vitest-environment jsdom
// Etapa 13 (a) pela tela: o item começa no 1º toque (hora de início visível), termina quando fica completo
// (hora de fim visível); app em 2º plano = "Pausado"; voltar = retoma; sair da tela pausa e voltar retoma.
import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dataSP, somarDias } from "../src/domain/tempo";
import { CONFIG_PADRAO, analisarExecucoes, resumoTempos } from "../src/domain/tempos";
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

  it("editor: tempo padrão do checklist e do item, com a sugestão 'usar como padrão' (6 execuções da rotina da manhã)", async () => {
    localStorage.clear();
    render(<App />);
    fireEvent.click(await screen.findByText("Carla (Gestora)", {}, T));
    await screen.findByRole("navigation", { name: "Menu" }, T);
    await ir("/modelos");
    const lista = await screen.findByLabelText("Checklist", {}, T);
    const opcao = [...(lista as HTMLSelectElement).options].find((o) => o.text.startsWith("Fiscal de caixa – Rotina da manhã"))!;
    await act(async () => { fireEvent.change(lista, { target: { value: opcao.value } }); });
    await screen.findByText("Versões", {}, T);
    const criar = await waitFor(() => { const b = screen.queryByRole("button", { name: /Criar rascunho para editar/ }); const ed = screen.queryByLabelText("Tempo padrão do checklist (min)"); if (!b && !ed) throw new Error("carregando"); return b; }, T);
    if (criar) await act(async () => { fireEvent.click(criar); });
    const campo = (await screen.findByLabelText("Tempo padrão do checklist (min)", {}, T)) as HTMLInputElement;
    expect(campo.value).toBe("");
    const nota = await screen.findByText(/Tempo médio real:/, {}, T);
    expect(nota.closest("[role=note]")!.textContent).toMatch(/10 min em 6 execuções/);
    await act(async () => { fireEvent.click(within(nota.closest("[role=note]") as HTMLElement).getByRole("button", { name: /Usar como padrão/ })); });
    expect(campo.value).toBe("10");
    expect(campo.getAttribute("inputmode")).toBe("decimal");
    await waitFor(() => expect(screen.queryByText(/Tempo médio real: 10 min/)).toBeNull());
    // item: abre o primeiro e digita meio minuto
    await act(async () => { fireEvent.click(document.querySelector<HTMLButtonElement>("li button[aria-expanded]")!); });
    const campoItem = screen.getByLabelText("Tempo padrão do item (min, opcional)") as HTMLInputElement;
    fireEvent.change(campoItem, { target: { value: "1,5" } });
    expect(campoItem.value).toBe("1,5");
    const salvar = screen.getByRole("button", { name: /Salvar rascunho/ }) as HTMLButtonElement;
    await waitFor(() => expect(salvar.disabled).toBe(false), T); // espera terminar a criação do rascunho
    await act(async () => { fireEvent.click(salvar); });
    await waitFor(() => expect([...screen.queryAllByRole("status"), ...screen.queryAllByRole("alert")].map((x) => x.textContent).join(" | ")).toMatch(/Rascunho salvo/), T);
    const vs = await servidor.versoesDoModelo(opcao.value);
    const rasc = vs.find((v) => v.status === "rascunho")!;
    expect(rasc.conteudo.tempo_padrao_min).toBe(10);
    expect(rasc.conteudo.secoes[0].itens[0].tempo_padrao_min).toBe(1.5);
  }, 120000);

  it("tela Tempos de execução (gestora, 2 lojas): blocos, filtro por situação, linha do tempo, comparativos, evolução e ranking", async () => {
    localStorage.clear();
    render(<App />);
    fireEvent.click(await screen.findByText("Carla (Gestora)", {}, T));
    const menu = await screen.findByRole("navigation", { name: "Menu" }, T);
    await act(async () => { fireEvent.click(within(menu).getByText("Tempos de execução")); });
    await screen.findByRole("heading", { level: 1, name: "Tempos de execução" }, T);
    const tabela = await screen.findByRole("table", { name: "Execuções" }, T);
    const linhas = () => within(tabela).getAllByRole("row").length - 1;
    const total = linhas();
    expect(total).toBeGreaterThan(5);
    expect(within(tabela).getAllByText("Rápido demais").length).toBeGreaterThan(0);
    expect(within(tabela).getAllByText("Muito acima").length).toBeGreaterThan(0);
    // filtro: só "rápido demais"
    await act(async () => { fireEvent.change(screen.getByLabelText("Situação"), { target: { value: "rapido_demais" } }); });
    await waitFor(() => expect(linhas()).toBeLessThan(total));
    expect(within(tabela).queryAllByText("No tempo")).toEqual([]);
    // linha do tempo da 1ª execução listada
    await act(async () => { fireEvent.click(within(tabela).getAllByRole("button")[0]); });
    const linha = await screen.findByRole("heading", { name: /Linha do tempo/ }, T);
    expect(linha.closest("div.rounded-xl")!.querySelectorAll("li").length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Fechar linha do tempo" })); });
    expect(screen.queryByRole("heading", { name: /Linha do tempo/ })).toBeNull();
    // comparativos, evolução e ranking
    await act(async () => { fireEvent.change(screen.getByLabelText("Situação"), { target: { value: "" } }); });
    expect(within(screen.getByRole("table", { name: "A mesma tarefa entre pessoas" })).getAllByRole("row").length).toBe(3); // Ana e Diego
    expect(within(screen.getByRole("table", { name: "A mesma tarefa entre lojas" })).getAllByRole("row").length).toBe(3); // Matriz e Filial
    expect(screen.getByRole("table", { name: "Evolução por dia" })).toBeTruthy();
    expect(within(screen.getByRole("table", { name: "Itens que mais demoram" })).getAllByRole("row").length).toBeGreaterThan(1);
    // limites da empresa (só o gestor): muda e a tela recalcula
    fireEvent.click(screen.getByText(/Limites desta empresa/));
    fireEvent.change(screen.getByLabelText("Rápido demais: menos de (%)"), { target: { value: "10" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Salvar limites/ })); });
    await screen.findByText("Limites salvos.", {}, T);
    await waitFor(() => expect(screen.getByText(/Rápido demais: menos de 10%/)).toBeTruthy(), T);
  }, 120000);

  it("Dashboard: tempo médio × padrão, % no tempo e rápido demais; se os tempos falharem, o resto continua", async () => {
    localStorage.clear();
    render(<App />);
    fireEvent.click(await screen.findByText("Carla (Gestora)", {}, T));
    await screen.findByRole("navigation", { name: "Menu" }, T);
    await ir("/dashboard");
    const secao = (await screen.findByRole("heading", { name: /Tempo de execução/ }, T)).closest("section") as HTMLElement;
    await waitFor(() => expect(within(secao).getByText("% no tempo")).toBeTruthy(), T);
    const hoje = dataSP();
    const dt = await servidor.dadosTempos(somarDias(hoje, -6), hoje, null, null);
    const r = resumoTempos(analisarExecucoes(dt.execucoes, (rede) => dt.config.find((c) => c.rede_id === rede) ?? CONFIG_PADRAO)); // limites salvos da empresa
    const bloco = (rotulo: string) => within(secao).getByText(rotulo).parentElement!.textContent ?? "";
    expect(bloco("% no tempo")).toContain(`${r.pct_no_tempo}%`);
    expect(bloco("Rápido demais")).toContain(String(r.rapido_demais));
    expect(bloco("Tempo médio × padrão")).toMatch(/\d+min \/ \d+min/);

    // tempos com erro (ex.: migration ainda não aplicada): aviso amarelo, sem erro vermelho, e o resto aparece
    const espiao = vi.spyOn(servidor, "dadosTempos").mockRejectedValue(new Error("function checklist.dados_tempos does not exist"));
    try {
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Atualizar/ })); });
      await screen.findByText(/Os tempos não puderam ser carregados/, {}, T);
      expect(screen.getByText("Tarefas concluídas")).toBeTruthy();
      expect(within(document.querySelector("main")!).queryAllByRole("alert")).toEqual([]);
    } finally { espiao.mockRestore(); }
  }, 120000);
});
