// @vitest-environment jsdom
// FLUXOS PELA TELA (modo demonstração), clicando como a pessoa faria:
//  Admin: empresa do zero com matriz e filial, inativar/reativar unidade, empresa copiando checklists, colaborador novo.
//  Gestor: checklist do zero com TODOS os tipos e condicional → pré-visualizar → publicar → agendar.
//  Operador: a tarefa aparece em "Minhas tarefas"; ao abrir, a condicional só aparece com "Não".
import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "../src/App";
import { servidor } from "../src/data/conexao";
import { ROTULO_TIPO } from "../src/domain/editor";

(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
window.confirm = () => true;

const T = { timeout: 10000 };
let erros: unknown[][] = [];
const original = console.error;
afterEach(async () => { cleanup(); await servidor.sair(); console.error = original; });

async function entrar(nomeDemo: string) {
  localStorage.clear();
  erros = [];
  console.error = (...a: unknown[]) => { erros.push(a); };
  render(<App />);
  fireEvent.click(await screen.findByText(nomeDemo, {}, T));
  await screen.findByRole("navigation", { name: "Menu" }, T);
}
async function entrarComo(email: string, senha: string) {
  localStorage.clear();
  erros = [];
  console.error = (...a: unknown[]) => { erros.push(a); };
  render(<App />);
  fireEvent.change(await screen.findByLabelText("E-mail", {}, T), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: senha } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Entrar/ })); });
  await screen.findByRole("navigation", { name: "Menu" }, T);
}
async function ir(rota: string) {
  await act(async () => { window.history.pushState({}, "", rota); window.dispatchEvent(new PopStateEvent("popstate")); });
}
const clicar = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); };
const digitar = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
const sucesso = (re: RegExp) => waitFor(() => expect(screen.getAllByRole("status").some((s) => re.test(s.textContent ?? ""))).toBe(true), T);
const semErros = () => expect(erros.filter((e) => !String(e[0]).includes("not wrapped in act"))).toEqual([]);

describe("fluxos pela tela", () => {
  it("Admin: empresa do zero com matriz e filial; inativa e reativa; empresa copiando checklists; colaborador novo", async () => {
    await entrar("Admin (Ecossistema TB)");
    await ir("/empresas");
    await screen.findByRole("heading", { name: /Empresas e lojas/ }, T);
    await screen.findByRole("heading", { name: "SUPERMIX BRAZ" }, T); // lista carregada

    // empresa do zero
    await clicar(screen.getByRole("button", { name: /Nova empresa/ }));
    digitar(screen.getByLabelText("Nome da empresa"), "Mercado Zero");
    await clicar(screen.getByRole("button", { name: /Criar empresa/ }));
    await sucesso(/Empresa criada/);
    // matriz (CNPJ errado é recusado; certo vira "matriz")
    digitar(await screen.findByLabelText("Nome da unidade", {}, T), "Zero Matriz");
    digitar(screen.getByLabelText("CNPJ"), "11.222.333/0001-00");
    expect(screen.getByText(/CNPJ inválido/)).toBeTruthy();
    digitar(screen.getByLabelText("CNPJ"), "11.222.333/0001-81");
    expect(screen.getByText(/matriz \(\/0001\)/)).toBeTruthy();
    await clicar(screen.getByRole("button", { name: "Salvar" }));
    await sucesso(/Unidade cadastrada/);
    // filial
    const cartao = (await screen.findByRole("heading", { name: "MERCADO ZERO" }, T)).closest("div.rounded-xl") as HTMLElement;
    await clicar(within(cartao).getByRole("button", { name: /Unidade/ }));
    digitar(await screen.findByLabelText("Nome da unidade", {}, T), "Zero Filial");
    digitar(screen.getByLabelText("CNPJ"), "11.222.333/0002-62");
    await clicar(screen.getByRole("button", { name: "Salvar" }));
    await sucesso(/Unidade cadastrada/);
    const empresas = await servidor.empresas();
    const zero = empresas.find((e) => e.nome === "MERCADO ZERO")!;
    expect(zero.unidades.map((u) => [u.nome, u.tipo, u.sistemas.includes("checklist")]).sort()).toEqual([["Zero Filial", "filial", true], ["Zero Matriz", "matriz", true]]);
    // inativar e reativar a filial
    const linhaFilial = () => screen.getByText("Zero Filial").closest("li") as HTMLElement;
    await clicar(within(linhaFilial()).getByRole("button", { name: /Inativar/ }));
    await sucesso(/Zero Filial inativada/);
    expect(within(linhaFilial()).getByText("Inativa")).toBeTruthy();
    await clicar(within(linhaFilial()).getByRole("button", { name: /Reativar/ }));
    await sucesso(/Zero Filial reativada/);

    // empresa copiando checklists da Supermix (2 escolhidos)
    await clicar(screen.getByRole("button", { name: /Nova empresa/ }));
    digitar(screen.getByLabelText("Nome da empresa"), "Mercado Copia");
    await clicar(screen.getByLabelText("Copiar checklists de outra empresa"));
    digitar(screen.getByLabelText("Copiar de"), (await servidor.empresas()).find((e) => e.nome === "SUPERMIX BRAZ")!.id);
    const caixas = await waitFor(() => { const c = screen.getAllByRole("checkbox").filter((x) => x.closest("ul")); expect(c.length).toBe(8); return c; }, T);
    for (const c of caixas.slice(2)) await clicar(c); // deixa só 2 marcados
    await clicar(screen.getByRole("button", { name: /Criar e copiar 2/ }));
    await sucesso(/2 checklist\(s\) copiado/);
    const copia = (await servidor.empresas()).find((e) => e.nome === "MERCADO COPIA")!;
    const copiados = await servidor.modelosDaEmpresa(copia.id);
    expect(copiados).toHaveLength(2);
    expect((await servidor.versoesDoModelo(copiados[0].id))[0]).toMatchObject({ status: "rascunho", numero: 1 });

    // colaborador novo na Empresa Exemplo 2 (operador da matriz)
    digitar(screen.getByRole("combobox", { name: "Empresa" }), (await servidor.empresas()).find((e) => e.nome === "EMPRESA EXEMPLO 2")!.id);
    await ir("/equipe");
    await screen.findByRole("heading", { name: /Colaboradores · EMPRESA EXEMPLO 2/ }, T);
    await clicar(screen.getByRole("tab", { name: /Colaborador novo/ }));
    digitar(screen.getByLabelText("Nome (como aparece no app)"), "Iara (Fiscal – Ex2)");
    digitar(screen.getByLabelText("E-mail do login"), "iara@demo.ex2");
    digitar(screen.getByLabelText("Senha inicial"), "senha1234");
    await clicar(screen.getByRole("button", { name: /Criar login e incluir/ }));
    await sucesso(/Colaborador criado/);
    expect(await screen.findByText("Iara (Fiscal – Ex2)", {}, T)).toBeTruthy();
    semErros();
  }, 120000);

  it("Gestor: checklist do zero com todos os tipos e condicional → pré-visualizar → publicar → agendar", async () => {
    await entrar("Gabriel (Gestor – Exemplo 2)");
    await ir("/modelos");
    await screen.findByRole("heading", { name: /Cadastrar tarefas e checklists · EMPRESA EXEMPLO 2/ }, T);
    await clicar(screen.getByRole("button", { name: /Novo checklist/ }));
    digitar(screen.getByLabelText("Nome"), "Abertura (do zero)");
    await clicar(screen.getByRole("button", { name: "Salvar" }));
    await sucesso(/Checklist criado em rascunho/);
    await clicar(await screen.findByRole("button", { name: /Nova seção/ }, T));
    // um item de cada tipo (o primeiro sim/não controla a condicional do texto)
    const tipos = ["sim_nao", "texto", "conformidade", "numero", "multipla", "assinatura", "foto"] as const;
    for (const t of tipos) {
      const botoes = screen.getAllByRole("button", { name: new RegExp(`^${ROTULO_TIPO[t].replace("/", "\\/")}$`) });
      await clicar(botoes[0]);
      if (t === "texto") {
        // texto só aparece quando o sim/não for "Não"
        const sel = await screen.findByLabelText("Mostrar esta pergunta só quando…", {}, T);
        digitar(sel, (sel as HTMLSelectElement).options[1].value);
        const grupo = await screen.findByRole("group", { name: "Respostas que mostram a pergunta" }, T);
        await clicar(within(grupo).getByRole("checkbox", { name: /Não/ }));
        await clicar(within(grupo).getByRole("checkbox", { name: /Sim/ }));
      }
    }
    expect(screen.queryByText("Corrija antes de publicar")).toBeNull();
    // pré-visualizar: a condicional aparece só com "Não"
    await clicar(screen.getByRole("tab", { name: /Pré-visualizar/ }));
    const perguntas = () => screen.getAllByText("Nova pergunta", { ignore: ".sr-only, script, style" }).length;
    const antes = perguntas();
    await clicar(screen.getAllByRole("radio", { name: "Não" })[0]);
    await waitFor(() => expect(perguntas()).toBe(antes + 1), T);
    // publicar e criar o agendamento
    await clicar(screen.getByRole("button", { name: /Publicar versão 1/ }));
    await clicar(await screen.findByRole("button", { name: /Criar agendamento/ }, T));
    await screen.findByRole("heading", { name: /Agendamentos|Agendar/ }, T);
    expect(((await screen.findByLabelText("Checklist", {}, T)) as HTMLSelectElement).selectedOptions[0].text).toBe("Abertura (do zero)");
    digitar(screen.getByLabelText("Começa às"), "00:00");
    digitar(screen.getByLabelText("Prazo (horário-limite)"), "23:59");
    await clicar(screen.getByRole("button", { name: "Salvar" }));
    await sucesso(/Agendamento salvo/);
    semErros();
  }, 120000);

  it("Operador: a tarefa nova aparece em Minhas tarefas; a condicional funciona na execução", async () => {
    await entrarComo("iara@demo.ex2", "senha1234");
    await ir("/"); // o jsdom guarda o endereço do teste anterior
    const iniciar = await screen.findByRole("button", { name: /Iniciar/ }, T);
    // o cartão da tarefa (e o nome também aparece na lista de "checklist fora da agenda")
    expect(iniciar.closest("li")?.textContent).toMatch(/Abertura \(do zero\)/);
    await clicar(iniciar);
    await screen.findByRole("button", { name: /Revisar e concluir/ }, T);
    const conta = () => screen.getAllByText("Nova pergunta", { ignore: ".sr-only, script, style" }).length;
    const antes = conta();
    await clicar(screen.getAllByRole("radio", { name: "Não" })[0]);
    await waitFor(() => expect(conta()).toBe(antes + 1), T);
    await clicar(screen.getByRole("button", { name: /Revisar e concluir/ }));
    const bloqueado = await screen.findByRole("button", { name: /Concluir \(bloqueado/ }, T);
    expect((bloqueado as HTMLButtonElement).disabled).toBe(true);
    semErros();
  }, 120000);
});
