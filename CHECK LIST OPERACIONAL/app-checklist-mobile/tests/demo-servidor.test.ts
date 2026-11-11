import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DemoServidor, LOJAS_DEMO, REDES_DEMO, USUARIOS_DEMO } from "../src/data/demo-servidor";
import { idPlano, novoId } from "../src/domain/ids";
import { dataSP } from "../src/domain/tempo";
import type { Execucao, Foto, Resposta } from "../src/domain/tipos";

const [MATRIZ, FILIAL] = LOJAS_DEMO.map((l) => l.id);
const SUPERMIX = REDES_DEMO[0].id;
const email = (n: string) => USUARIOS_DEMO.find((u) => u.email.startsWith(n))!.email;
const hoje = dataSP();

async function como(srv: DemoServidor, nome: string) { // entra como a pessoa de exemplo
  await srv.sair();
  await srv.entrar(email(nome), "demo");
}

describe("servidor de demonstração (mesmas regras do banco)", () => {
  it("fluxo completo: agendar → executar → não conforme → plano → solução → validação → dashboard", async () => {
    const srv = new DemoServidor(`demo-${novoId()}`, null);
    await como(srv, "ana");
    await srv.gerarTarefas(hoje);
    await srv.gerarTarefas(hoje); // idempotente
    let pac = await srv.baixar(SUPERMIX, [MATRIZ, FILIAL], hoje, hoje);
    const tarefas = pac.tarefas.filter((t) => t.loja_id === MATRIZ);
    // Ana (operador) só vê as tarefas de operador da Matriz: fiscal manhã e tarde
    expect(tarefas).toHaveLength(2);
    const t = tarefas.find((x) => pac.modelos.find((m) => m.id === x.modelo_id)?.nome.includes("tarde"))!;
    const versao = pac.versoes.find((v) => v.modelo_id === t.modelo_id && v.status === "publicada")!;

    const e: Execucao = { id: novoId(), tarefa_id: t.id, modelo_id: t.modelo_id, versao_id: versao.id, loja_id: MATRIZ, usuario_id: "", inicio_em: new Date(Date.now() - 600000).toISOString(), status: "em_andamento" };
    const agora = new Date().toISOString();
    const itens = versao.conteudo.secoes.flatMap((s) => s.itens);
    const rs: Resposta[] = itens.map((i) => ({
      id: novoId(), execucao_id: e.id, item_id: i.id, respondido_em: agora,
      valor: i.tipo === "conformidade" ? { tipo: "conformidade", v: "nao_conforme" } : { tipo: "sim_nao", v: true },
      observacao: i.tipo === "conformidade" ? "Pão vencido na exposição" : null,
    }));
    await srv.syncExecucao(e, rs, []);
    // foto obrigatória ainda falta → conclusão bloqueada
    await expect(srv.concluirExecucao(e.id, agora, null, null, null)).rejects.toThrow("pendências");
    const foto: Foto = { id: novoId(), execucao_id: e.id, item_id: "ft_validade_padaria", storage_path: `${MATRIZ}/${e.id}/f.jpg`, mime: "image/jpeg", bytes: 1000, tirada_em: agora };
    await srv.enviarArquivo(foto.storage_path, new Blob(["x"], { type: "image/jpeg" }), "image/jpeg");
    await srv.syncExecucao(e, rs, [foto]);
    await srv.syncExecucao(e, rs, [foto]); // reenvio
    const r = await srv.concluirExecucao(e.id, agora, null, null, null);
    // 10 itens sim (peso 1) + validade padaria não conforme (peso 3) → 10/13
    expect(r.pontuacao).toBeCloseTo(76.92, 2);
    await srv.concluirExecucao(e.id, agora, null, null, null); // idempotente

    // plano automático ligado ao item, responsável = líder da loja
    await como(srv, "bruno");
    pac = await srv.baixar(SUPERMIX, [MATRIZ], hoje, hoje);
    expect(pac.planos).toHaveLength(1);
    const plano = pac.planos[0];
    expect(plano).toMatchObject({ id: idPlano(e.id, "ft_validade_padaria"), item_id: "ft_validade_padaria", status: "aberto" });
    expect(plano.responsavel_id).toBe(USUARIOS_DEMO.find((u) => u.email.startsWith("bruno"))!.id);

    // o líder valida a execução da fiscal
    await srv.validarExecucao(e.id, true);
    // o líder resolve e NÃO pode validar a própria solução; a gestora valida
    await srv.acaoPlano(plano.id, "iniciar", {});
    await srv.acaoPlano(plano.id, "enviar_solucao", { texto: "Produtos retirados e desconto aplicado" });
    await expect(srv.acaoPlano(plano.id, "validar", {})).rejects.toThrow("Quem executou não valida");
    await como(srv, "carla");
    await srv.acaoPlano(plano.id, "rejeitar", { texto: "Faltou a foto" });
    await como(srv, "bruno");
    await srv.acaoPlano(plano.id, "enviar_solucao", { texto: "Foto anexada" });
    await como(srv, "carla");
    await srv.acaoPlano(plano.id, "validar", {});
    const hist = await srv.historico(plano.id);
    expect(hist.map((h) => h.acao)).toEqual(["criado_automatico", "iniciado", "solucao_enviada", "rejeitado", "solucao_enviada", "validado"]);

    const d = await srv.dashboard(hoje, hoje, MATRIZ, null);
    expect(d.tarefas_concluidas).toBe(1);
    expect(d.execucoes).toBe(1);
    expect(d.conformidade).toBeCloseTo(76.92, 2);
    expect(d.por_pessoa[0]).toMatchObject({ nome: "Ana (Fiscal – Matriz)", execucoes: 1 });
    expect(d.planos_abertos).toBe(0);
    expect((await srv.relatorio(hoje, hoje, null, null))[0]).toMatchObject({ pessoa: "Ana (Fiscal – Matriz)", nao_conformes: 1, planos: 1, status: "validada" });
  });

  it("operador de outra loja não vê nada da Matriz nem envia em nome de outro", async () => {
    const srv = new DemoServidor(`demo-${novoId()}`, null);
    await como(srv, "ana");
    await srv.gerarTarefas(hoje);
    await como(srv, "diego");
    await srv.gerarTarefas(hoje);
    const pac = await srv.baixar(SUPERMIX, [MATRIZ, FILIAL], hoje, hoje);
    expect(pac.tarefas.every((t) => t.loja_id === FILIAL)).toBe(true);
    // vê a equipe da própria unidade e os gestores da empresa; ninguém da Matriz
    expect(pac.membros.some((m) => m.loja_id === MATRIZ)).toBe(false);
    expect(pac.membros.every((m) => m.loja_id === FILIAL || (m.loja_id == null && m.perfil === "gestor"))).toBe(true);
    await expect(srv.dashboard(hoje, hoje, MATRIZ, null)).resolves.toMatchObject({ tarefas_total: 0 });
    await expect(srv.enviarArquivo(`${MATRIZ}/x/y.jpg`, new Blob(["x"]), "image/jpeg")).rejects.toThrow("Sem permissão");
  });
});

describe("multiempresa no modo demonstração (igual ao banco)", () => {
  it("admin cria empresa copiando checklists, loja e colaborador; gestor não; a cópia não altera a original", async () => {
    const srv = new DemoServidor(`demo-${novoId()}`, null);
    await como(srv, "gabriel"); // gestor da Empresa Exemplo 2
    expect((await srv.minhasEmpresas()).map((e) => e.nome)).toEqual(["EMPRESA EXEMPLO 2"]);
    expect(await srv.modelosDaEmpresa(SUPERMIX)).toEqual([]); // não vê os checklists da Supermix
    await expect(srv.criarEmpresa("Nova")).rejects.toThrow("Só o admin");
    await expect(srv.salvarUnidade({ rede_id: REDES_DEMO[1].id, nome: "X", cnpj: null, ativo: true, usaChecklist: true })).rejects.toThrow("Só o admin");
    await expect(srv.criarColaborador({ nome: "X", email: "x@x.com", senha: "12345678", rede_id: REDES_DEMO[1].id, loja_id: null, perfil: "gestor" })).rejects.toThrow("Só o admin");

    await como(srv, "admin");
    expect((await srv.minhasEmpresas()).map((e) => e.nome)).toEqual(["SUPERMIX BRAZ", "EMPRESA EXEMPLO 2"]);
    const origem = (await srv.modelosDaEmpresa(SUPERMIX)).find((m) => m.codigo === "fiscal_tarde")!;
    const nova = await srv.criarEmpresa("Mercado Três");
    expect(await srv.copiarModelos(SUPERMIX, nova, [origem.id])).toBe(1);
    await expect(srv.salvarUnidade({ rede_id: nova, nome: "Três Matriz", cnpj: "123", ativo: true, usaChecklist: true })).rejects.toThrow("14 dígitos");
    const lojaOk = await srv.salvarUnidade({ rede_id: nova, nome: "Três Matriz", cnpj: null, ativo: true, usaChecklist: true });
    await srv.criarColaborador({ nome: "Gestor Três", email: "g3@demo.tb", senha: "12345678", rede_id: nova, loja_id: null, perfil: "gestor" });

    await srv.sair();
    await srv.entrar("g3@demo.tb", "12345678");
    expect((await srv.minhasLojas()).map((l) => l.loja_id)).toEqual([lojaOk]);
    const [copia] = await srv.modelosDaEmpresa(nova);
    expect(copia.id).not.toBe(origem.id);
    const [rasc] = await srv.versoesDoModelo(copia.id);
    expect(rasc).toMatchObject({ status: "rascunho", numero: 1 });
    rasc.conteudo.secoes[0].titulo = "Alterado na cópia";
    await srv.salvarRascunho(rasc);
    await srv.publicarVersao(rasc.id);
    await expect(srv.criarRascunho(origem.id)).rejects.toThrow("Só o gestor da empresa");

    await como(srv, "carla"); // gestora da Supermix: a original continua igual
    const [orig] = (await srv.versoesDoModelo(origem.id)).filter((v) => v.status === "publicada");
    expect(orig.conteudo.secoes[0].titulo).not.toBe("Alterado na cópia");
    expect(await srv.modelosDaEmpresa(nova)).toEqual([]);
  });
});
