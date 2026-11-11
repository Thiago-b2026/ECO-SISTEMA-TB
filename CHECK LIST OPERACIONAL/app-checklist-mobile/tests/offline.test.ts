// Critérios 3, 4, 5 e 7: offline, sair e voltar, reenvio sem duplicar, conclusão bloqueada, plano ligado ao item.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DemoServidor, LOJAS_DEMO, REDES_DEMO, USUARIOS_DEMO } from "../src/data/demo-servidor";
import { BancoLocal } from "../src/data/local";
import { Repositorio } from "../src/data/repositorio";
import { Sincronizador } from "../src/data/sync";
import { idPlano, novoId } from "../src/domain/ids";
import { dataSP } from "../src/domain/tempo";

const MATRIZ = LOJAS_DEMO[0].id;
const ana = USUARIOS_DEMO.find((u) => u.email.startsWith("ana"))!;
const hoje = dataSP();

async function aparelho(srv: DemoServidor, nomeBanco: string, online: boolean) {
  const db = new BancoLocal(ana.id, nomeBanco);
  const s = new Sincronizador(db, srv, ana.id, online);
  s.rede = REDES_DEMO[0].id;
  s.lojas = [MATRIZ];
  await db.lojas.bulkPut(await srv.minhasLojas());
  await s.iniciar();
  return { db, s, repo: new Repositorio(s) };
}

describe("offline-first", () => {
  it("trabalha sem internet, sai e volta, envia uma vez só e cria o plano ligado ao item", async () => {
    const srv = new DemoServidor(`srv-${novoId()}`, null);
    await srv.entrar(ana.email, "demo");
    await srv.gerarTarefas(hoje);
    const banco = `local-${novoId()}`;

    // 1) baixa os dados com internet
    let a = await aparelho(srv, banco, true);
    await a.s.baixar();
    const tarefa = (await a.db.tarefas.toArray()).find((t) => t.loja_id === MATRIZ)!;
    const modelo = (await a.db.modelos.get(tarefa.modelo_id))!;
    expect(modelo).toBeTruthy();

    // 2) perde a internet e trabalha
    a.s.setOnline(false);
    const execId = await a.repo.iniciar({ tarefa, modeloId: tarefa.modelo_id, lojaId: MATRIZ });
    const v = (await a.repo.versaoPublicada(tarefa.modelo_id))!;
    const itens = v.conteudo.secoes.flatMap((s) => s.itens);
    const primeiro = itens.find((i) => i.tipo === "conformidade" || i.tipo === "sim_nao")!;
    if (primeiro.tipo === "conformidade") await a.repo.responder(execId, primeiro.id, { tipo: "conformidade", v: "nao_conforme" }, "Balcão sujo");
    else await a.repo.responder(execId, primeiro.id, { tipo: "sim_nao", v: false }, "Não feito");
    await a.repo.adicionarFoto(execId, primeiro.id, new Blob(["jpg"], { type: "image/jpeg" }), new Date().toISOString(), { lat: -20.4, lng: -54.6, precisao_m: 10 });
    expect(await a.s.processar()).toBe(false); // sem internet: nada sai, nada é erro
    expect(a.s.estado.erro).toBeNull();
    expect(a.s.estado.pendentes).toBeGreaterThan(0);
    expect(a.s.estado.salvoEm).not.toBeNull();

    // 3) "fecha o app" e abre de novo (novas instâncias, mesmo banco do aparelho)
    a.db.close();
    a = await aparelho(srv, banco, false);
    expect(await a.db.respostas.where("execucao_id").equals(execId).count()).toBe(1);
    const foto = (await a.db.fotos.where("execucao_id").equals(execId).first())!;
    expect(foto.blob).toBeTruthy();
    expect(foto).toMatchObject({ enviada: false, lat: -20.4 });

    // 4) conclusão bloqueada enquanto houver pendência
    const pend = await a.repo.pendencias(execId);
    expect(pend.length).toBeGreaterThan(0);
    await expect(a.repo.concluir(execId, null)).rejects.toThrow("pendência");
    for (const i of itens) {
      if (i.id === primeiro.id) continue;
      if (i.tipo === "conformidade") await a.repo.responder(execId, i.id, { tipo: "conformidade", v: "conforme" });
      else if (i.tipo === "sim_nao") await a.repo.responder(execId, i.id, { tipo: "sim_nao", v: true });
      else if (i.tipo === "texto") await a.repo.responder(execId, i.id, { tipo: "texto", v: "ok" });
      if (i.foto === "sempre") await a.repo.adicionarFoto(execId, i.id, new Blob(["jpg"], { type: "image/jpeg" }), new Date().toISOString(), null);
    }
    expect(await a.repo.pendencias(execId)).toEqual([]);
    const r = await a.repo.concluir(execId, new Blob(["png"], { type: "image/png" }));
    expect(r.planos).toBe(1);
    const planoLocal = await a.db.planos.get(idPlano(execId, primeiro.id));
    expect(planoLocal).toMatchObject({ item_id: primeiro.id, status: "aberto" });

    // 5) a internet volta: envia; reenviar não duplica
    a.s.setOnline(true);
    expect(await a.s.processar()).toBe(true);
    expect(a.s.estado.pendentes).toBe(0);
    expect(a.s.estado.enviadoEm).not.toBeNull();
    await a.s.enfileirar({ tipo: "execucao", chave: execId, dados: {} });
    await a.db.execucoes.update(execId, { conclusao_pendente: true });
    expect(await a.s.processar()).toBe(true);

    const det = await srv.detalheExecucao(execId);
    expect(det.execucao.status).toBe("concluida");
    expect(det.execucao.pontuacao).toBe(r.pontuacao);
    expect(det.respostas.length).toBe(await a.db.respostas.where("execucao_id").equals(execId).count());
    expect(det.fotos.length).toBe(await a.db.fotos.where("execucao_id").equals(execId).count());
    expect(new Set(det.fotos.map((f) => f.id)).size).toBe(det.fotos.length);

    await srv.sair();
    await srv.entrar(USUARIOS_DEMO.find((u) => u.email.startsWith("bruno"))!.email, "demo");
    const pac = await srv.baixar(REDES_DEMO[0].id, [MATRIZ], hoje, hoje);
    const planos = pac.planos.filter((p) => p.execucao_id === execId);
    expect(planos).toHaveLength(1);
    expect(planos[0].id).toBe(planoLocal!.id); // o MESMO plano do aparelho
    expect(pac.tarefas.find((t) => t.id === tarefa.id)?.concluida_em).toBeTruthy();
  });

  it("erro do servidor aparece como erro (não como sucesso) e Tentar de novo funciona", async () => {
    const srv = new DemoServidor(`srv-${novoId()}`, null);
    await srv.entrar(ana.email, "demo");
    await srv.gerarTarefas(hoje);
    const a = await aparelho(srv, `local-${novoId()}`, true);
    await a.s.baixar();
    const tarefa = (await a.db.tarefas.toArray())[0];
    const execId = await a.repo.iniciar({ tarefa, modeloId: tarefa.modelo_id, lojaId: MATRIZ });
    await srv.sair(); // sessão expirou no servidor
    expect(await a.s.processar()).toBe(false);
    expect(a.s.estado.erro).toBe("Sem login.");
    expect(a.s.estado.pendentes).toBe(1);
    await srv.entrar(ana.email, "demo");
    expect(await a.s.tentarDeNovo()).toBe(true);
    expect(a.s.estado.erro).toBeNull();
    expect((await srv.detalheExecucao(execId)).execucao.id).toBe(execId);
  });
});

describe("download não pisa no que está na fila", () => {
  it("execução e plano alterados no aparelho continuam como estão até serem enviados", async () => {
    const srv = new DemoServidor(`srv-${novoId()}`, null);
    await srv.entrar(ana.email, "demo");
    await srv.gerarTarefas(hoje);
    const a = await aparelho(srv, `local-${novoId()}`, true);
    await a.s.baixar();
    const tarefa = (await a.db.tarefas.toArray())[0];
    a.s.setOnline(false);
    const execId = await a.repo.iniciar({ tarefa, modeloId: tarefa.modelo_id, lojaId: MATRIZ });
    // o servidor ainda não conhece a execução; um download não pode apagá-la nem mudar a tarefa
    await a.s.baixar();
    expect(await a.db.execucoes.get(execId)).toBeTruthy();
    expect((await a.db.fila.toArray()).map((o) => o.chave)).toContain(execId);
  });
});

describe("service worker", () => {
  it("o modelo tem os marcadores que o build substitui", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const sw = readFileSync(resolve(import.meta.dirname, "../sw-modelo.js"), "utf8");
    expect(sw).toContain('"__VERSAO__"');
    expect(sw).toContain("__ARQUIVOS__");
    expect(sw).toMatch(/url\.origin !== self\.location\.origin\) return/); // Supabase não passa pelo cache
  });
});
