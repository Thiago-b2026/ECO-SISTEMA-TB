// Etapa 12: checklist criado DO ZERO no editor (seção, itens, condicional) → publicar → agendar → executar no aparelho.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DemoServidor, LOJAS_DEMO, REDES_DEMO, USUARIOS_DEMO } from "../src/data/demo-servidor";
import { BancoLocal } from "../src/data/local";
import { Repositorio } from "../src/data/repositorio";
import { Sincronizador } from "../src/data/sync";
import { adicionarItem, adicionarSecao, alterarItem, definirCondicao, validarConteudo } from "../src/domain/editor";
import { novoId } from "../src/domain/ids";
import { dataSP } from "../src/domain/tempo";
import type { ConteudoModelo } from "../src/domain/tipos";

const EX2 = REDES_DEMO[1].id;
const EX2_MATRIZ = LOJAS_DEMO[2].id;
const email = (n: string) => USUARIOS_DEMO.find((u) => u.email.startsWith(n))!.email;

describe("editor → publicar → executar", () => {
  it("gestor da Exemplo 2 cria do zero com condicional; operador executa; a condicional pede a causa", async () => {
    const srv = new DemoServidor(`srv-${novoId()}`, null);
    // admin cria o operador da Exemplo 2 (login novo + equipe)
    await srv.entrar(email("admin"), "demo");
    await srv.criarColaborador({ nome: "Iara (Fiscal – Ex2)", email: "iara@demo.ex2", senha: "12345678", rede_id: EX2, loja_id: EX2_MATRIZ, perfil: "operador" });
    await srv.sair();

    // gestor monta o checklist no editor
    await srv.entrar(email("gabriel"), "demo");
    const id = await srv.criarModelo(EX2, "Abertura da loja", "Criado no editor", "diaria", "operador");
    const [rasc] = await srv.versoesDoModelo(id);
    let c: ConteudoModelo = adicionarSecao(rasc.conteudo, "Abertura", "loja");
    const s = c.secoes[0].id;
    const ok = adicionarItem(c, s, "sim_nao"); c = ok.conteudo;
    const causa = adicionarItem(c, s, "texto"); c = causa.conteudo;
    const temp = adicionarItem(c, s, "numero"); c = temp.conteudo;
    c = alterarItem(c, ok.itemId, { texto: "Loja abriu no horário?", observacao: "nunca", gera_plano: false });
    c = alterarItem(c, causa.itemId, { texto: "Por que atrasou?" });
    c = alterarItem(c, temp.itemId, { texto: "Temperatura da câmara fria", min: -2, max: 4, unidade: "°C", pontua: true, peso: 2, gera_plano: true });
    c = definirCondicao(c, causa.itemId, { item_id: ok.itemId, valores: [false] });
    expect(validarConteudo(c)).toEqual([]);
    await srv.salvarRascunho({ ...rasc, conteudo: c });
    await srv.publicarVersao(rasc.id);
    await srv.salvarAgendamento({
      id: novoId(), modelo_id: id, loja_id: EX2_MATRIZ, responsavel_id: null, perfil_responsavel: "operador", frequencia: "diaria",
      dias_semana: null, dia_mes: null, dias_antes_fim_mes: null, hora_inicio: "00:00", hora_limite: "23:59", ativo: true,
    });
    // um modelo da Supermix não pode ser agendado na Exemplo 2
    await srv.sair();
    await srv.entrar(email("admin"), "demo");
    const daSupermix = (await srv.modelosDaEmpresa(REDES_DEMO[0].id))[0];
    await expect(srv.salvarAgendamento({
      id: novoId(), modelo_id: daSupermix.id, loja_id: EX2_MATRIZ, responsavel_id: null, perfil_responsavel: "operador", frequencia: "diaria",
      dias_semana: null, dia_mes: null, dias_antes_fim_mes: null, hora_inicio: "00:00", hora_limite: "23:59", ativo: true,
    })).rejects.toThrow("outra empresa");
    await srv.sair();

    // operador executa no aparelho
    const sessao = await srv.entrar("iara@demo.ex2", "12345678");
    await srv.gerarTarefas(dataSP());
    const db = new BancoLocal(sessao.usuario_id, `local-${novoId()}`);
    const sinc = new Sincronizador(db, srv, sessao.usuario_id, true);
    sinc.rede = EX2;
    sinc.lojas = [EX2_MATRIZ];
    await db.lojas.bulkPut(await srv.minhasLojas());
    await sinc.iniciar();
    await sinc.baixar();
    const repo = new Repositorio(sinc);
    const [tarefa] = await db.tarefas.toArray();
    expect(tarefa.modelo_id).toBe(id);
    const exec = await repo.iniciar({ tarefa, modeloId: id, lojaId: EX2_MATRIZ });
    await repo.responder(exec, ok.itemId, { tipo: "sim_nao", v: false });
    await repo.responder(exec, temp.itemId, { tipo: "numero", v: 7 }); // fora da faixa
    expect((await repo.pendencias(exec)).map((p) => p.item_id)).toContain(causa.itemId); // a condicional apareceu
    await repo.responder(exec, causa.itemId, { tipo: "texto", v: "Chave atrasou" });
    await repo.observar(exec, temp.itemId, "Câmara com problema");
    expect(await repo.pendencias(exec)).toEqual([]);
    const r = await repo.concluir(exec, null);
    expect(r).toEqual({ pontuacao: 0, planos: 1 }); // Não (peso 1) e 7 °C fora da faixa (peso 2)
    expect(await sinc.processar()).toBe(true);
    expect((await srv.detalheExecucao(exec)).execucao).toMatchObject({ status: "concluida", pontuacao: 0 });
  });
});
