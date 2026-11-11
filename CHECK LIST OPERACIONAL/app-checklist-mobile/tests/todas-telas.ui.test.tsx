// @vitest-environment jsdom
// VARREDURA: cada usuário de exemplo abre TODAS as rotas (inclusive as proibidas).
// Permitidas: título carregado, sem "Acesso negado", sem erro na tela, sem console.error.
// Proibidas: "Acesso negado". Menu e botão "Configurar" só com o que o perfil pode.
// Gabriel (Empresa Exemplo 2) não vê nada da Supermix. Troca de empresa e de unidade atualiza as telas.
import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import App from "../src/App";
import { servidor } from "../src/data/conexao";
import { LOJAS_DEMO, REDES_DEMO, USUARIOS_DEMO } from "../src/data/demo-servidor";
import { idPlano, novoId } from "../src/domain/ids";
import { dataSP } from "../src/domain/tempo";
import type { Execucao, Resposta } from "../src/domain/tipos";

(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const [SUPERMIX] = REDES_DEMO.map((r) => r.id);
const [MATRIZ] = LOJAS_DEMO.map((l) => l.id);
const hoje = dataSP();
let EXEC = "";
let PLANO = "";

/** Dados reais para as telas: Ana executa a rotina da tarde com 1 não conforme + foto → 1 plano. */
beforeAll(async () => {
  const ana = USUARIOS_DEMO.find((u) => u.email.startsWith("ana"))!;
  await servidor.entrar(ana.email, "demo");
  await servidor.gerarTarefas(hoje);
  const pac = await servidor.baixar(SUPERMIX, [MATRIZ], hoje, hoje);
  const modelo = pac.modelos.find((m) => m.codigo === "fiscal_tarde")!;
  const tarefa = pac.tarefas.find((t) => t.modelo_id === modelo.id)!;
  const versao = pac.versoes.find((v) => v.modelo_id === modelo.id && v.status === "publicada")!;
  EXEC = novoId();
  const e: Execucao = { id: EXEC, tarefa_id: tarefa.id, modelo_id: modelo.id, versao_id: versao.id, loja_id: MATRIZ, usuario_id: ana.id, inicio_em: new Date(Date.now() - 900000).toISOString(), status: "em_andamento" };
  const agora = new Date().toISOString();
  const rs: Resposta[] = versao.conteudo.secoes.flatMap((s) => s.itens).map((i) => ({
    id: novoId(), execucao_id: EXEC, item_id: i.id, respondido_em: agora,
    valor: i.tipo === "conformidade" ? { tipo: "conformidade", v: "nao_conforme" } : { tipo: "sim_nao", v: true },
    observacao: i.tipo === "conformidade" ? "Pão vencido na exposição" : null,
  }));
  const foto = { id: novoId(), execucao_id: EXEC, item_id: "ft_validade_padaria", storage_path: `${MATRIZ}/${EXEC}/f.jpg`, mime: "image/jpeg", bytes: 3, tirada_em: agora };
  await servidor.enviarArquivo(foto.storage_path, new Blob(["jpg"], { type: "image/jpeg" }), "image/jpeg");
  await servidor.syncExecucao(e, rs, [foto]);
  await servidor.concluirExecucao(EXEC, agora, null, null, null);
  PLANO = idPlano(EXEC, "ft_validade_padaria");
  await servidor.sair();
});

let erros: unknown[][] = [];
const original = console.error;
afterEach(async () => {
  cleanup();
  await servidor.sair();
  console.error = original;
});

async function entrar(nome: string) {
  localStorage.clear();
  erros = [];
  console.error = (...a: unknown[]) => { erros.push(a); };
  render(<App />);
  fireEvent.click(await screen.findByText(nome, {}, { timeout: 8000 }));
  return screen.findByRole("navigation", { name: "Menu" }, { timeout: 8000 });
}

async function ir(rota: string) {
  await act(async () => {
    window.history.pushState({}, "", rota);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

const errosReais = () => erros.filter((e) => !String(e[0]).includes("not wrapped in act"));

// rota → texto que prova que a tela carregou
const ROTAS: { rota: string; nome: string; carregou: RegExp }[] = [
  { rota: "/", nome: "Minhas tarefas", carregou: /^Minhas tarefas ·/ },
  { rota: "/planos", nome: "Planos de ação", carregou: /^Planos de ação/ },
  { rota: "/loja", nome: "Tarefas da loja", carregou: /^Tarefas da loja ·/ },
  { rota: "/dashboard", nome: "Dashboard", carregou: /^Dashboard/ },
  { rota: "/relatorios", nome: "Relatórios", carregou: /^Relatórios/ },
  { rota: "/agendamentos", nome: "Agendar tarefas", carregou: /^Agendamentos ·|^Agendar/ },
  { rota: "/modelos", nome: "Cadastrar tarefas e checklists", carregou: /^Modelos de checklist ·|^Cadastrar/ },
  { rota: "/equipe", nome: "Colaboradores", carregou: /^Colaboradores ·/ },
  { rota: "/empresas", nome: "Empresas e lojas", carregou: /^Empresas e lojas/ },
];
const TODAS = ROTAS.map((r) => r.rota);
const OPERADOR = ["/", "/planos"];
const SUPERVISOR = [...OPERADOR, "/loja", "/dashboard", "/relatorios", "/agendamentos"];
const GESTOR = [...SUPERVISOR, "/modelos", "/equipe"];

// veMatriz: enxerga a execução e o plano da Matriz (quem é da Filial ou de outra empresa recebe "não encontrada")
const PESSOAS: { nome: string; pode: string[]; configurar: boolean; supermix: boolean; veMatriz: boolean }[] = [
  { nome: "Admin (Ecossistema TB)", pode: TODAS, configurar: true, supermix: true, veMatriz: true },
  { nome: "Ana (Fiscal – Matriz)", pode: OPERADOR, configurar: false, supermix: true, veMatriz: true },
  { nome: "Bruno (Líder – Matriz)", pode: SUPERVISOR, configurar: true, supermix: true, veMatriz: true },
  { nome: "Carla (Gestora)", pode: GESTOR, configurar: true, supermix: true, veMatriz: true },
  { nome: "Diego (Fiscal – Filial)", pode: OPERADOR, configurar: false, supermix: true, veMatriz: false },
  { nome: "Elisa (Líder – Filial)", pode: SUPERVISOR, configurar: true, supermix: true, veMatriz: false },
  { nome: "Gabriel (Gestor – Exemplo 2)", pode: GESTOR, configurar: true, supermix: false, veMatriz: false },
];

/** Resultado da varredura (tela × perfil), impresso no fim para o relatório. */
const matriz: Record<string, Record<string, string>> = {};

// textos que só existem nos dados da Supermix
const DA_SUPERMIX = [/supermix/i, /Fiscal de caixa/, /Líder – Rotina/, /Método Polar/, /Ana \(/, /Bruno \(/, /Carla \(/, /Diego \(/, /Elisa \(/, /Pão vencido/];

describe("varredura: todas as telas × todos os perfis", () => {
  for (const p of PESSOAS) {
    it(p.nome, async () => {
      const menu = await entrar(p.nome);
      matriz[p.nome] = {};
      // menu e "Configurar" só com o que o perfil pode
      const noMenu = ROTAS.filter((r) => within(menu).queryByText(r.nome)).map((r) => r.rota);
      expect(noMenu.sort()).toEqual([...p.pode].sort());
      const atalhos = screen.getByRole("navigation", { name: "Atalhos" });
      expect(!!within(atalhos).queryByText("Configurar")).toBe(p.configurar);

      for (const r of [...ROTAS, { rota: `/execucao/${EXEC}`, nome: "Execução", carregou: /./ }, { rota: `/planos/${PLANO}`, nome: "Detalhe do plano", carregou: /./ }]) {
        await ir(r.rota);
        const permitida = r.rota.startsWith("/execucao") || r.rota.startsWith("/planos/") ? true : p.pode.includes(r.rota);
        if (permitida) {
          // espera carregar (título, ou o conteúdo da execução/plano, ou o aviso de "não encontrado" para outra empresa)
          await waitFor(() => {
            const h1 = screen.queryByRole("heading", { level: 1 });
            const texto = document.querySelector("main")?.textContent ?? "";
            if (r.rota.startsWith("/execucao")) expect(/Versão \d|não encontrada/.test(texto)).toBe(true);
            else if (r.rota.startsWith("/planos/")) expect(!!h1 || /não encontrado/.test(texto)).toBe(true);
            else expect(h1?.textContent ?? "").toMatch(r.carregou);
            expect(texto).not.toMatch(/Carregando…/);
          }, { timeout: 8000 });
          const main = document.querySelector("main")!;
          expect(within(main).queryByText("Acesso negado"), `${p.nome} ${r.rota}`).toBeNull();
          // nenhum erro na tela (avisos de erro usam role="alert")
          const alertas = within(main).queryAllByRole("alert").map((a) => a.textContent);
          const detalhe = r.rota.startsWith("/execucao") || r.rota.startsWith("/planos/");
          const esperado = !p.veMatriz && detalhe; // outra unidade/empresa: "não encontrada", sem mostrar nada
          if (esperado) expect((document.querySelector("main")?.textContent ?? "")).toMatch(/não encontrad/);
          else expect(alertas, `${p.nome} ${r.rota}: ${JSON.stringify(alertas)}`).toEqual([]);
          if (!esperado && detalhe && r.rota.startsWith("/execucao")) expect(document.querySelector("main")?.textContent).toMatch(/Fiscal de caixa – Rotina da tarde/);
          matriz[p.nome][r.nome] = esperado ? "🔒 (não encontrado)" : "✅";
        } else {
          await waitFor(() => expect(screen.getByText("Acesso negado")).toBeTruthy(), { timeout: 8000 });
          matriz[p.nome][r.nome] = "❌ (Acesso negado)";
        }
        if (!p.supermix) {
          const texto = document.body.textContent ?? "";
          for (const re of DA_SUPERMIX) expect(texto, `${p.nome} viu ${re} em ${r.rota}`).not.toMatch(re);
        }
      }
      expect(errosReais(), `console.error de ${p.nome}`).toEqual([]);
    }, 120000);
  }

  it("Admin troca de empresa: as telas passam a mostrar só a empresa escolhida", async () => {
    await entrar("Admin (Ecossistema TB)");
    await ir("/modelos");
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/SUPERMIX BRAZ/), { timeout: 8000 });
    await waitFor(() => expect((screen.getByRole("combobox", { name: "Checklist" }) as HTMLSelectElement).options.length).toBeGreaterThan(5), { timeout: 8000 });
    const sel = screen.getByRole("combobox", { name: "Empresa" }) as HTMLSelectElement;
    await act(async () => { fireEvent.change(sel, { target: { value: REDES_DEMO[1].id } }); });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/EMPRESA EXEMPLO 2/), { timeout: 8000 });
    await waitFor(() => expect(screen.getByText(/ainda não tem checklists/)).toBeTruthy(), { timeout: 8000 });
    for (const rota of ["/", "/planos", "/loja", "/dashboard", "/relatorios", "/agendamentos", "/equipe"]) {
      await ir(rota);
      await waitFor(() => expect(document.querySelector("main")?.textContent ?? "").not.toMatch(/Carregando…/), { timeout: 8000 });
      const texto = document.querySelector("main")?.textContent ?? "";
      for (const re of DA_SUPERMIX) expect(texto, `${rota} ainda mostra ${re}`).not.toMatch(re);
    }
    expect(errosReais()).toEqual([]);
  }, 120000);

  it("Carla troca de unidade: Tarefas da loja e Minhas tarefas acompanham", async () => {
    await entrar("Carla (Gestora)");
    await ir("/loja");
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Matriz/), { timeout: 8000 });
    const sel = screen.getByRole("combobox", { name: "Unidade" }) as HTMLSelectElement;
    await act(async () => { fireEvent.change(sel, { target: { value: LOJAS_DEMO[1].id } }); });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Filial/), { timeout: 8000 });
    expect(screen.queryByText(/Aguardando a sua validação/)).toBeNull(); // a execução da Ana é da Matriz
    expect(errosReais()).toEqual([]);
  }, 60000);

  it("imprime a matriz tela × perfil", () => {
    const telas = [...ROTAS.map((r) => r.nome), "Execução", "Detalhe do plano"];
    const linhas = telas.map((t) => `| ${t} | ${PESSOAS.map((p) => matriz[p.nome]?.[t] ?? "?").join(" | ")} |`);
    console.log(["| Tela | " + PESSOAS.map((p) => p.nome.split(" ")[0]).join(" | ") + " |", "|---|" + PESSOAS.map(() => "---").join("|") + "|", ...linhas].join("\n"));
  });
});
