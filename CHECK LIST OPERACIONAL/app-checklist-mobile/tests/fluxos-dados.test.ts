// @vitest-environment jsdom
// Fluxos em dados reais (modo demonstração + aparelho):
//  operador executa com foto, observação e assinatura → supervisor DEVOLVE → operador corrige e reenvia → supervisor valida;
//  plano: iniciar, solução, gestor rejeita com justificativa e aprova; dashboard e relatório batem; Excel e PDF gerados.
import "fake-indexeddb/auto";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { DemoServidor, LOJAS_DEMO, REDES_DEMO, USUARIOS_DEMO } from "../src/data/demo-servidor";
import { BancoLocal } from "../src/data/local";
import { Repositorio } from "../src/data/repositorio";
import { Sincronizador } from "../src/data/sync";
import { idPlano, novoId } from "../src/domain/ids";
import { dataSP } from "../src/domain/tempo";
import { gerarExcel, gerarPdfExecucao } from "../src/lib/relatorios";

const SUPERMIX = REDES_DEMO[0].id;
const MATRIZ = LOJAS_DEMO[0].id;
const hoje = dataSP();
const pessoa = (n: string) => USUARIOS_DEMO.find((u) => u.email.startsWith(n))!;

async function aparelho(srv: DemoServidor, nome: string) {
  const s0 = await srv.entrar(pessoa(nome).email, "demo");
  const db = new BancoLocal(s0.usuario_id, `local-${novoId()}`);
  const sinc = new Sincronizador(db, srv, s0.usuario_id, true);
  sinc.rede = SUPERMIX;
  sinc.lojas = [MATRIZ];
  await db.lojas.bulkPut(await srv.minhasLojas());
  await sinc.iniciar();
  await srv.gerarTarefas(hoje);
  await sinc.baixar();
  return { db, sinc, repo: new Repositorio(sinc), usuario: s0.usuario_id };
}

describe("fluxos em dados reais", () => {
  it("executar com foto/obs/assinatura → devolver → corrigir e reenviar → validar; plano com rejeição; dashboard, Excel e PDF", async () => {
    const srv = new DemoServidor(`srv-${novoId()}`, null);

    // OPERADOR (Ana): rotina da tarde; validade da padaria NÃO conforme com foto e observação; assinatura
    const ana = await aparelho(srv, "ana");
    const modelo = (await ana.db.modelos.toArray()).find((m) => m.codigo === "fiscal_tarde")!;
    const tarefa = (await ana.db.tarefas.toArray()).find((t) => t.modelo_id === modelo.id)!;
    const exec = await ana.repo.iniciar({ tarefa, modeloId: modelo.id, lojaId: MATRIZ });
    const v = (await ana.repo.versaoPublicada(modelo.id))!;
    const itens = v.conteudo.secoes.flatMap((s) => s.itens);
    await expect(ana.repo.concluir(exec, null)).rejects.toThrow("pendência"); // bloqueado
    for (const i of itens) {
      if (i.id === "ft_validade_padaria") await ana.repo.responder(exec, i.id, { tipo: "conformidade", v: "nao_conforme" }, "Pão vencido na exposição");
      else await ana.repo.responder(exec, i.id, { tipo: "sim_nao", v: true });
    }
    expect((await ana.repo.pendencias(exec)).map((p) => `${p.item_id}:${p.tipo}`)).toEqual(["ft_validade_padaria:foto"]);
    await ana.repo.adicionarFoto(exec, "ft_validade_padaria", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), new Date().toISOString(), { lat: -20.46, lng: -54.62, precisao_m: 9 });
    const r = await ana.repo.concluir(exec, new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }));
    expect(r.planos).toBe(1);
    expect(await ana.sinc.processar()).toBe(true);
    await srv.sair();

    // SUPERVISOR (Bruno) DEVOLVE com motivo
    const bruno = await aparelho(srv, "bruno");
    await expect(bruno.repo.validarExecucao(exec, false, "  ")).rejects.toThrow("motivo");
    await bruno.repo.validarExecucao(exec, false, "Faltou a foto da etiqueta");
    expect(await bruno.sinc.processar()).toBe(true);
    await srv.sair();

    // OPERADORA corrige e reenvia
    const ana2 = await aparelho(srv, "ana");
    const ex = (await ana2.db.execucoes.get(exec))!;
    expect(ex).toMatchObject({ status: "devolvida", motivo_devolucao: "Faltou a foto da etiqueta" });
    await ana2.repo.trazerDoServidor(exec);
    await ana2.repo.adicionarFoto(exec, "ft_validade_padaria", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), new Date().toISOString(), null);
    await ana2.repo.concluir(exec, null);
    expect(await ana2.sinc.processar()).toBe(true);
    expect((await srv.detalheExecucao(exec)).execucao.status).toBe("concluida");
    expect((await srv.detalheExecucao(exec)).fotos.filter((f) => f.item_id === "ft_validade_padaria")).toHaveLength(2);
    await srv.sair();

    // SUPERVISOR valida; trata o plano; a GESTORA rejeita com justificativa e depois aprova
    const bruno2 = await aparelho(srv, "bruno");
    await bruno2.repo.validarExecucao(exec, true);
    const plano = idPlano(exec, "ft_validade_padaria");
    await bruno2.repo.acaoPlano(plano, "iniciar", true);
    await bruno2.repo.acaoPlano(plano, "enviar_solucao", true, { texto: "Produtos retirados, desconto aplicado" });
    await bruno2.repo.fotoPlano(plano, new Blob([new Uint8Array([0xff, 0xd8])], { type: "image/jpeg" }), new Date().toISOString(), null);
    expect(await bruno2.sinc.processar()).toBe(false); // a foto do plano só entra com o plano aberto/em andamento: erro aparece como ERRO
    expect(bruno2.sinc.estado.erro).toMatch(/não aceita foto agora/);
    const comErro = (await bruno2.db.fila.toArray()).find((o) => o.erro)!;
    await bruno2.sinc.descartar(comErro.seq!);
    expect(await bruno2.sinc.processar()).toBe(true);
    await srv.sair();
    const carla = await aparelho(srv, "carla");
    await expect(carla.repo.acaoPlano(plano, "rejeitar", true, { texto: "" })).rejects.toThrow("justificativa");
    await carla.repo.acaoPlano(plano, "rejeitar", true, { texto: "Falta conferir o estoque da padaria" });
    expect(await carla.sinc.processar()).toBe(true);
    await srv.sair();
    const bruno3 = await aparelho(srv, "bruno");
    await bruno3.repo.acaoPlano(plano, "enviar_solucao", true, { texto: "Estoque conferido e etiquetas trocadas" });
    expect(await bruno3.sinc.processar()).toBe(true);
    await srv.sair();
    const carla2 = await aparelho(srv, "carla");
    await carla2.repo.acaoPlano(plano, "validar", true);
    expect(await carla2.sinc.processar()).toBe(true);
    const hist = (await srv.historico(plano)).map((h) => h.acao);
    expect(hist).toEqual(["criado_automatico", "iniciado", "solucao_enviada", "rejeitado", "solucao_enviada", "validado"]);

    // DASHBOARD e RELATÓRIO batem
    const d = await srv.dashboard(hoje, hoje, MATRIZ, SUPERMIX);
    expect(d).toMatchObject({ tarefas_concluidas: 1, execucoes: 1, planos_abertos: 0 });
    expect(d.conformidade).toBeCloseTo(76.92, 2); // 10 sim (peso 1) + validade NC (peso 3)
    expect(d.por_setor).toEqual([expect.objectContaining({ setor: "frente_caixa", nao_conformes: 1 })]);
    expect(d.por_pessoa).toEqual([expect.objectContaining({ nome: "Ana (Fiscal – Matriz)", execucoes: 1 })]);
    const rel = await srv.relatorio(hoje, hoje, null, SUPERMIX);
    expect(rel).toEqual([expect.objectContaining({ status: "validada", nao_conformes: 1, planos: 1, pessoa: "Ana (Fiscal – Matriz)" })]);

    // EXCEL e PDF a partir dos dados reais
    await carla2.sinc.baixar();
    const xlsx = await gerarExcel(rel, await carla2.db.planos.toArray(), await carla2.db.membros.toArray(), "Teste");
    const wb = XLSX.read(new Uint8Array(await xlsx.arrayBuffer()), { type: "array" });
    expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Planos de ação"])[0]).toMatchObject({ Situação: "Concluído", Responsável: "Bruno (Líder – Matriz)" });
    const det = await srv.detalheExecucao(exec);
    // (o banco simulado dos testes não devolve Blob de verdade; no navegador o PDF busca a foto no servidor)
    const fotos = det.fotos.map((f) => ({ ...f, blob: new Blob([new Uint8Array(f.mime === "image/png" ? [0x89, 0x50] : [0xff, 0xd8, 0xff, 0xd9])], { type: f.mime }) }));
    expect(fotos.some((f) => f.item_id === "__assinatura")).toBe(true);
    const pdf = await gerarPdfExecucao({
      execucao: det.execucao, versao: v, modelo: modelo.nome, loja: "Matriz", pessoa: "Ana", dataRef: hoje, respostas: det.respostas, fotos, planos: await carla2.db.planos.toArray(),
    });
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  }, 60000);
});
