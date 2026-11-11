// Etapa 13 no aparelho + modo demonstração: início/fim do item, pausa, offline sem perder o início, comparativo, empresa A × B.
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { DemoServidor, LOJAS_DEMO, REDES_DEMO, USUARIOS_DEMO } from "../src/data/demo-servidor";
import { BancoLocal } from "../src/data/local";
import { Repositorio } from "../src/data/repositorio";
import { Sincronizador } from "../src/data/sync";
import { novoId } from "../src/domain/ids";
import { dataSP, somarDias } from "../src/domain/tempo";
import { analisarExecucoes, analisarItens, sugestaoPadrao, tempoAtivoSeg } from "../src/domain/tempos";

const [SUPERMIX, EX2] = REDES_DEMO.map((r) => r.id);
const MATRIZ = LOJAS_DEMO[0].id;
const hoje = dataSP();
const pessoa = (n: string) => USUARIOS_DEMO.find((u) => u.email.startsWith(n))!;

async function aparelho(srv: DemoServidor, nome: string, online = true, banco = `local-${novoId()}`) {
  const s0 = await srv.entrar(pessoa(nome).email, "demo");
  const db = new BancoLocal(s0.usuario_id, banco);
  const sinc = new Sincronizador(db, srv, s0.usuario_id, online);
  sinc.rede = SUPERMIX;
  sinc.lojas = [MATRIZ];
  await db.lojas.bulkPut(await srv.minhasLojas());
  await sinc.iniciar();
  await srv.gerarTarefas(hoje);
  if (online) await sinc.baixar();
  return { db, sinc, repo: new Repositorio(sinc) };
}

describe("tempo de execução", () => {
  it("item: início no 1º toque, fim quando fica completo (resposta + foto + observação); pausa fora do tempo ativo; offline sem perder o início", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${hoje}T13:00:00.000Z`)); // 10:00 em SP
    try {
      const srv = new DemoServidor(`srv-${novoId()}`, null);
      const a = await aparelho(srv, "ana");
      const modelo = (await a.db.modelos.toArray()).find((m) => m.codigo === "fiscal_tarde")!;
      const tarefa = (await a.db.tarefas.toArray()).find((t) => t.modelo_id === modelo.id)!;
      const exec = await a.repo.iniciar({ tarefa, modeloId: modelo.id, lojaId: MATRIZ });
      a.sinc.setOnline(false); // a partir daqui, SEM internet

      // validade da padaria: foto sempre + observação se não conforme
      vi.setSystemTime(new Date(`${hoje}T13:01:00.000Z`));
      await a.repo.iniciarItem(exec, "ft_validade_padaria");
      await a.repo.iniciarItem(exec, "ft_validade_padaria"); // 2º toque não muda o início
      vi.setSystemTime(new Date(`${hoje}T13:02:00.000Z`));
      await a.repo.responder(exec, "ft_validade_padaria", { tipo: "conformidade", v: "nao_conforme" });
      let r = (await a.db.respostas.where("[execucao_id+item_id]").equals([exec, "ft_validade_padaria"]).first())!;
      expect(r).toMatchObject({ iniciado_em: `${hoje}T13:01:00.000Z`, concluido_em: null }); // falta foto e observação
      vi.setSystemTime(new Date(`${hoje}T13:03:00.000Z`));
      await a.repo.observar(exec, "ft_validade_padaria", "Pão vencido");
      vi.setSystemTime(new Date(`${hoje}T13:04:30.000Z`));
      await a.repo.adicionarFoto(exec, "ft_validade_padaria", new Blob([new Uint8Array([1])], { type: "image/jpeg" }), new Date().toISOString(), null);
      r = (await a.db.respostas.where("[execucao_id+item_id]").equals([exec, "ft_validade_padaria"]).first())!;
      expect(r).toMatchObject({ iniciado_em: `${hoje}T13:01:00.000Z`, concluido_em: `${hoje}T13:04:30.000Z` });

      // pausa: app em 2º plano por 5 min
      await a.repo.pausar(exec);
      vi.setSystemTime(new Date(`${hoje}T13:09:30.000Z`));
      await a.repo.retomar(exec);
      expect((await a.db.execucoes.get(exec))!.tempo_pausado_seg).toBe(300);

      // responde o resto e conclui (ainda offline)
      const v = (await a.repo.versaoPublicada(modelo.id))!;
      for (const i of v.conteudo.secoes.flatMap((s) => s.itens)) {
        if (i.id !== "ft_validade_padaria") await a.repo.responder(exec, i.id, { tipo: "sim_nao", v: true });
      }
      vi.setSystemTime(new Date(`${hoje}T13:20:00.000Z`));
      await a.repo.concluir(exec, null);

      // a internet volta: envia; depois um reenvio com início "atrasado" de outro aparelho não muda o início
      a.sinc.setOnline(true);
      expect(await a.sinc.processar()).toBe(true);
      const det = await srv.detalheExecucao(exec);
      expect(det.respostas.find((x) => x.item_id === "ft_validade_padaria")).toMatchObject({ iniciado_em: `${hoje}T13:01:00.000Z` });
      expect(det.execucao.tempo_pausado_seg).toBe(300);

      // comparativo: dadosTempos tem a execução com total 20 min, pausado 5, ativo 15 (= padrão de 15 → "no tempo")
      await srv.sair();
      await srv.entrar(pessoa("bruno").email, "demo");
      const d = await srv.dadosTempos(somarDias(hoje, -30), hoje, SUPERMIX, null);
      const minha = analisarExecucoes(d.execucoes).find((e) => e.execucao_id === exec)!;
      expect(minha).toMatchObject({ total_seg: 1200, pausado_seg: 300, ativo_seg: 900, padrao_seg: 900, situacao: "no_tempo" });
      const item = analisarItens(d.itens, d.execucoes).find((i) => i.execucao_id === exec && i.item_id === "ft_validade_padaria")!;
      expect(item).toMatchObject({ duracao_seg: 210, padrao_seg: 180, situacao: "no_tempo" }); // 3min30 contra 3 min (+17%)
    } finally {
      vi.useRealTimers();
    }
  });

  it("trocar de tela (pausar e retomar juntos) não deixa pausa aberta nem conta segundos; tempo ativo desconta a pausa aberta", async () => {
    const srv = new DemoServidor(`srv-${novoId()}`, null);
    const a = await aparelho(srv, "ana");
    const modelo = (await a.db.modelos.toArray()).find((m) => m.codigo === "fiscal_tarde")!;
    const exec = await a.repo.iniciar({ modeloId: modelo.id, lojaId: MATRIZ });
    await Promise.all([a.repo.pausar(exec), a.repo.retomar(exec)]); // Execução → Concluir
    let e = (await a.db.execucoes.get(exec))!;
    expect(e.pausa_desde ?? null).toBeNull();
    expect(e.tempo_pausado_seg ?? 0).toBe(0);
    expect(e.pausas ?? []).toEqual([]);
    await a.repo.pausar(exec);
    e = (await a.db.execucoes.get(exec))!;
    const daqui10min = new Date(new Date(e.pausa_desde!).getTime() + 600000).toISOString();
    expect(tempoAtivoSeg({ ...e, inicio_em: new Date(new Date(e.pausa_desde!).getTime() - 120000).toISOString() }, daqui10min)).toBe(120);
  });

  it("dois aparelhos: o reenvio de quem abriu o item DEPOIS não apaga nem atrasa o início", async () => {
    const srv = new DemoServidor(`srv-${novoId()}`, null);
    const a = await aparelho(srv, "ana");
    const modelo = (await a.db.modelos.toArray()).find((m) => m.codigo === "fiscal_tarde")!;
    const exec = await a.repo.iniciar({ modeloId: modelo.id, lojaId: MATRIZ });
    await a.repo.iniciarItem(exec, "ft_copos");
    expect(await a.sinc.processar()).toBe(true);
    const e = (await a.db.execucoes.get(exec))!;
    const inicioOriginal = (await a.db.respostas.where("[execucao_id+item_id]").equals([exec, "ft_copos"]).first())!.iniciado_em!;
    const depois = new Date(Date.now() + 60000).toISOString();
    await srv.syncExecucao(e, [{ id: novoId(), execucao_id: exec, item_id: "ft_copos", valor: { tipo: "sim_nao", v: true }, respondido_em: depois, iniciado_em: depois, concluido_em: depois }], []);
    await srv.syncExecucao(e, [{ id: novoId(), execucao_id: exec, item_id: "ft_copos", valor: { tipo: "sim_nao", v: true }, respondido_em: depois, iniciado_em: null, concluido_em: depois }], []);
    const r = (await srv.detalheExecucao(exec)).respostas.find((x) => x.item_id === "ft_copos")!;
    expect(r.iniciado_em).toBe(inicioOriginal);
    expect(r.concluido_em).toBe(depois);
  });

  it("histórico de exemplo: tem 'rápido demais' e 'muito acima'; sugestão de padrão; empresa B não vê os tempos da A; limites só pelo gestor", async () => {
    const srv = new DemoServidor(`srv-${novoId()}`, null);
    await srv.entrar(pessoa("carla").email, "demo");
    const d = await srv.dadosTempos(somarDias(hoje, -30), hoje, SUPERMIX, null);
    const a = analisarExecucoes(d.execucoes);
    const sit = a.map((e) => e.situacao);
    expect(sit).toContain("rapido_demais");
    expect(sit).toContain("muito_acima");
    expect(sit).toContain("no_tempo");
    const manha = d.execucoes.find((e) => e.modelo === "Fiscal de caixa – Rotina da manhã")!;
    expect(manha.padrao_seg).toBeNull();
    expect(sugestaoPadrao(d.execucoes, manha.modelo_id)).toEqual({ n: 6, media_min: 10 });
    expect(d.itens.length).toBeGreaterThan(100);
    await expect(srv.salvarConfigTempos(EX2, { acima_pct: 10, muito_acima_pct: 40, rapido_pct: 20 })).rejects.toThrow("Só o gestor");
    await expect(srv.salvarConfigTempos(SUPERMIX, { acima_pct: 30, muito_acima_pct: 20, rapido_pct: 20 })).rejects.toThrow("maior");
    await srv.salvarConfigTempos(SUPERMIX, { acima_pct: 10, muito_acima_pct: 40, rapido_pct: 20 });
    expect((await srv.dadosTempos(somarDias(hoje, -30), hoje, SUPERMIX, null)).config[0]).toMatchObject({ acima_pct: 10 });

    await srv.sair();
    await srv.entrar(pessoa("gabriel").email, "demo");
    const outra = await srv.dadosTempos(somarDias(hoje, -30), hoje, null, null);
    expect(outra).toEqual({ config: [], execucoes: [], itens: [] });
    await srv.sair();
    await srv.entrar(pessoa("ana").email, "demo"); // operador não vê a tela de tempos
    expect((await srv.dadosTempos(somarDias(hoje, -30), hoje, SUPERMIX, null)).execucoes).toEqual([]);
  });
});
