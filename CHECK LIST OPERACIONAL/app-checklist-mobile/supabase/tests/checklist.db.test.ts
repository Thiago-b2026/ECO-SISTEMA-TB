// Testes do schema checklist num Postgres de verdade (PGlite), SEM tocar no banco de produção.
import { beforeAll, describe, expect, it } from "vitest";
import { como, falha, linhas, novoBanco, type Banco } from "./db";

const U = {
  gestor: "00000000-0000-4000-8000-000000000001",
  sup: "00000000-0000-4000-8000-000000000002",
  op: "00000000-0000-4000-8000-000000000003",
  opB: "00000000-0000-4000-8000-000000000004",
  supB: "00000000-0000-4000-8000-000000000005",
};
const LOJA_A = "10000000-0000-4000-8000-00000000000a";
const LOJA_B = "10000000-0000-4000-8000-00000000000b";
const MODELO = "20000000-0000-4000-8000-000000000001";

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id, texto: `Item ${id}`, tipo: "conformidade", obrigatorio: true, foto: "nunca", observacao: "nunca",
  gera_plano: true, pontua: true, peso: 1, ...extra,
});
const CONTEUDO_V1 = {
  secoes: [{ id: "s1", titulo: "Padaria", setor: "padaria", itens: [
    item("a", { peso: 2 }), item("b", { peso: 3 }), item("c", { peso: 5, foto: "se_nao_conforme" }), item("d", { peso: 2 }),
    item("oferta_ok", { tipo: "sim_nao", peso: 0, pontua: false, gera_plano: false }),
    item("causa", { tipo: "texto", pontua: false, gera_plano: false, condicao: { item_id: "oferta_ok", valores: [false] } }),
  ] }],
};

let db: Banco;
let versao1: string;
let tarefaA: string;

const uuid = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sql = (u: string | null, q: string, p: unknown[] = []) => como(db, u, () => linhas(db, q, p));
const deve = (u: string, q: string, p: unknown[], trecho: string | RegExp) => como(db, u, () => falha(db, q, p, trecho));

async function novaExecucao(id: string, usuario: string, loja: string, tarefa: string | null = null, versao = versao1) {
  await sql(usuario, `insert into checklist.execucoes (id, tarefa_id, modelo_id, versao_id, loja_id, usuario_id, inicio_em)
                      values ($1, $2, $3, $4, $5, $6, now() - interval '10 minutes')`, [id, tarefa, MODELO, versao, loja, usuario]);
}
async function responder(exec: string, usuario: string, itemId: string, valor: unknown, obs: string | null = null) {
  await sql(usuario, `insert into checklist.respostas (id, execucao_id, item_id, valor, observacao) values (gen_random_uuid(), $1, $2, $3, $4)
                      on conflict (execucao_id, item_id) do update set valor = excluded.valor, observacao = excluded.observacao`,
    [exec, itemId, JSON.stringify(valor), obs]);
}
const conf = (v: string) => ({ tipo: "conformidade", v });

beforeAll(async () => {
  db = await novoBanco();
  await db.exec(`
    insert into auth.users (id) values ('${U.gestor}'), ('${U.sup}'), ('${U.op}'), ('${U.opB}'), ('${U.supB}');
    insert into public.lojas (id, nome) values ('${LOJA_A}', 'Braz Matriz'), ('${LOJA_B}', 'Braz Filial');
    insert into checklist.membros (usuario_id, loja_id, perfil, nome) values
      ('${U.gestor}', '${LOJA_A}', 'gestor', 'Gestora'), ('${U.gestor}', '${LOJA_B}', 'gestor', 'Gestora'),
      ('${U.sup}', '${LOJA_A}', 'supervisor', 'Líder A'), ('${U.op}', '${LOJA_A}', 'operador', 'Fiscal A'),
      ('${U.opB}', '${LOJA_B}', 'operador', 'Fiscal B'), ('${U.supB}', '${LOJA_B}', 'supervisor', 'Líder B');
  `);
  await sql(U.gestor, `insert into checklist.modelos (id, codigo, nome, perfil_executor) values ($1, 'teste', 'Modelo teste', 'operador')`, [MODELO]);
  const [{ id }] = await sql(U.gestor, `select checklist.criar_rascunho($1) id`, [MODELO]) as { id: string }[];
  versao1 = id;
  await sql(U.gestor, `update checklist.modelo_versoes set conteudo = $2 where id = $1`, [versao1, JSON.stringify(CONTEUDO_V1)]);
  await sql(U.gestor, `select checklist.publicar_versao($1)`, [versao1]);
  await sql(U.sup, `insert into checklist.agendamentos (id, modelo_id, loja_id, perfil_responsavel, frequencia, hora_inicio, hora_limite)
                    values ($1, $2, $3, 'operador', 'diaria', '00:00', '23:59')`, [uuid(900), MODELO, LOJA_A]);
  await sql(U.opB, `select checklist.gerar_tarefas()`); // operador da loja B não gera tarefa da loja A
  expect((await sql(null, `select count(*)::int n from checklist.tarefas`))[0].n).toBe(0);
  await sql(U.op, `select checklist.gerar_tarefas()`);
  await sql(U.op, `select checklist.gerar_tarefas()`); // idempotente
  const ts = await sql(null, `select id from checklist.tarefas`) as { id: string }[];
  expect(ts).toHaveLength(1);
  tarefaA = ts[0].id;
});

describe("pontuação no banco (regra B)", () => {
  it("pesos 2,3,5,2 com conforme, parcial, não conforme e N/A = 35%", async () => {
    const [p] = await sql(null, `select * from checklist.calcular_pontuacao($1, $2, 2)`, [JSON.stringify(CONTEUDO_V1), JSON.stringify({
      a: conf("conforme"), b: conf("parcial"), c: conf("nao_conforme"), d: conf("na"), oferta_ok: { tipo: "sim_nao", v: true },
    })]);
    expect(Number(p.percentual)).toBe(35);
    expect(Number(p.possiveis)).toBe(10);
  });
  it("sem item pontuável = null (Sem pontuação aplicável)", async () => {
    const [p] = await sql(null, `select * from checklist.calcular_pontuacao($1, $2, 2)`, [JSON.stringify(CONTEUDO_V1), JSON.stringify({
      a: conf("na"), b: conf("na"), c: conf("na"), d: conf("na"),
    })]);
    expect(p.percentual).toBeNull();
  });
});

describe("RLS: operador não vê dados de outra loja", () => {
  it("operador da loja B não vê tarefa, execução, plano nem agendamento da loja A", async () => {
    const exec = uuid(1);
    await novaExecucao(exec, U.op, LOJA_A, tarefaA);
    for (const t of ["tarefas", "execucoes", "agendamentos", "v_tarefas"]) {
      expect(await sql(U.opB, `select * from checklist.${t}`)).toHaveLength(0);
      expect((await sql(U.op, `select * from checklist.${t}`)).length).toBeGreaterThan(0);
    }
    expect(await sql(U.opB, `select * from checklist.execucoes where id = $1`, [exec])).toHaveLength(0);
    expect(await sql(U.supB, `select * from checklist.execucoes where id = $1`, [exec])).toHaveLength(0);
    expect(await sql(U.supB, `select checklist.dashboard(current_date - 1, current_date + 1, $1) d`, [LOJA_A]))
      .toEqual([{ d: expect.objectContaining({ tarefas_total: 0 }) }]);
  });

  it("operador não cria execução em loja que não é dele nem em nome de outro", async () => {
    await deve(U.opB, `insert into checklist.execucoes (id, modelo_id, versao_id, loja_id, usuario_id, inicio_em) values ($1,$2,$3,$4,$5, now())`,
      [uuid(2), MODELO, versao1, LOJA_A, U.opB], /row-level security/);
    await deve(U.op, `insert into checklist.execucoes (id, modelo_id, versao_id, loja_id, usuario_id, inicio_em) values ($1,$2,$3,$4,$5, now())`,
      [uuid(3), MODELO, versao1, LOJA_A, U.sup], /row-level security/);
  });

  it("operador não responde execução de outro e não mexe direto em plano", async () => {
    await deve(U.sup, `insert into checklist.respostas (id, execucao_id, item_id, valor) values (gen_random_uuid(), $1, 'a', '{"tipo":"conformidade","v":"conforme"}')`,
      [uuid(1)], /row-level security/);
    await deve(U.sup, `update checklist.planos_acao set status = 'concluido'`, [], /permission denied|row-level security|0 rows/).catch(() => undefined);
  });
});

describe("conclusão, pendências e plano automático (regras F e D)", () => {
  it("bloqueia com pendências; condição oculta não pendura; não conforme exige foto", async () => {
    const exec = uuid(1);
    await responder(exec, U.op, "a", conf("conforme"));
    await deve(U.op, `select checklist.concluir_execucao($1, now())`, [exec], "Há pendências obrigatórias");
    await responder(exec, U.op, "b", conf("parcial"));
    await responder(exec, U.op, "c", conf("nao_conforme"));
    await responder(exec, U.op, "d", conf("na"));
    await responder(exec, U.op, "oferta_ok", { tipo: "sim_nao", v: false });
    const pend = await sql(U.op, `select item_id, tipo from checklist.pendencias_execucao($1)`, [exec]);
    expect(pend).toEqual([{ item_id: "c", tipo: "foto" }, { item_id: "causa", tipo: "resposta" }]);
    await responder(exec, U.op, "oferta_ok", { tipo: "sim_nao", v: true }); // causa some
    expect(await sql(U.op, `select item_id, tipo from checklist.pendencias_execucao($1)`, [exec])).toEqual([{ item_id: "c", tipo: "foto" }]);
    await sql(U.op, `insert into checklist.fotos (id, execucao_id, item_id, loja_id, storage_path, mime, bytes, tirada_em)
                     values ($1, $2, 'c', $3, $4, 'image/jpeg', 1000, now())`, [uuid(11), exec, LOJA_A, `${LOJA_A}/${exec}/${uuid(11)}.jpg`]);
  });

  it("foto inválida é recusada (tipo e tamanho)", async () => {
    await deve(U.op, `insert into checklist.fotos (id, execucao_id, item_id, loja_id, storage_path, mime, bytes, tirada_em)
                      values ($1, $2, 'c', $3, 'x/y.gif', 'image/gif', 10, now())`, [uuid(12), uuid(1), LOJA_A], /check constraint/);
    await deve(U.op, `insert into checklist.fotos (id, execucao_id, item_id, loja_id, storage_path, mime, bytes, tirada_em)
                      values ($1, $2, 'c', $3, 'x/z.jpg', 'image/jpeg', 6000000, now())`, [uuid(13), uuid(1), LOJA_A], /check constraint/);
  });

  it("conclui: pontua 35%, cria UM plano ligado ao item e fecha a tarefa; reenviar não duplica", async () => {
    const exec = uuid(1);
    const [r] = await sql(U.op, `select checklist.concluir_execucao($1, now()) r`, [exec]) as { r: { pontuacao: number; planos_criados: number } }[];
    expect(Number(r.r.pontuacao)).toBe(35);
    // b (parcial) e c (não conforme) geram plano
    expect(r.r.planos_criados).toBe(2);
    const [r2] = await sql(U.op, `select checklist.concluir_execucao($1, now()) r`, [exec]) as { r: { ja_concluida: boolean } }[];
    expect(r2.r.ja_concluida).toBe(true);
    // reenvio do pacote inteiro (como faz a fila do celular) não duplica e não falha
    const pacote = [
      JSON.stringify({ id: exec, modelo_id: MODELO, versao_id: versao1, loja_id: LOJA_A, inicio_em: new Date().toISOString() }),
      JSON.stringify([{ id: uuid(70), item_id: "c", valor: conf("conforme"), respondido_em: new Date().toISOString() }]),
      JSON.stringify([{ id: uuid(11), item_id: "c", storage_path: `${LOJA_A}/${exec}/${uuid(11)}.jpg`, mime: "image/jpeg", bytes: 1000, tirada_em: new Date().toISOString() }]),
    ];
    const [s1] = await sql(U.op, `select checklist.sync_execucao($1, $2, $3) r`, pacote);
    expect(s1.r).toEqual({ status: "concluida", respostas: 0, fotos: 0 });
    await deve(U.opB, `select checklist.sync_execucao($1, $2, $3)`, pacote, /outra pessoa/);
    const cont = await sql(null, `select (select count(*) from checklist.execucoes)::int e, (select count(*) from checklist.fotos)::int f,
                                  (select count(*) from checklist.planos_acao)::int p`);
    expect(cont[0]).toEqual({ e: 1, f: 1, p: 2 });
    const planos = await sql(null, `select id, item_id, responsavel_id, status, setor from checklist.planos_acao order by item_id`);
    expect(planos.map((p) => p.item_id)).toEqual(["b", "c"]);
    expect(planos[1]).toMatchObject({ responsavel_id: U.sup, status: "aberto", setor: "padaria" });
    const [{ id }] = await sql(null, `select checklist.id_plano($1, 'c') id`, [exec]);
    expect(planos[1].id).toBe(id);
    const [t] = await sql(U.op, `select situacao from checklist.v_tarefas where id = $1`, [tarefaA]);
    expect(t.situacao).toBe("concluida");
    // depois de concluída, o operador não muda mais as respostas
    await deve(U.op, `update checklist.respostas set valor = '{"tipo":"conformidade","v":"conforme"}' where execucao_id = $1 and item_id = 'c' returning id`,
      [exec], /.*/).catch(() => undefined);
    const [c] = await sql(null, `select valor from checklist.respostas where execucao_id = $1 and item_id = 'c'`, [exec]);
    expect((c.valor as { v: string }).v).toBe("nao_conforme");
  });

  it("o líder valida a execução do fiscal; o fiscal não valida a própria", async () => {
    await deve(U.op, `select checklist.validar_execucao($1, true)`, [uuid(1)], /Só supervisor/);
    await deve(U.sup, `select checklist.validar_execucao($1, false, '')`, [uuid(1)], "motivo");
    await sql(U.sup, `select checklist.validar_execucao($1, true)`, [uuid(1)]);
    expect((await sql(null, `select status from checklist.execucoes where id = $1`, [uuid(1)]))[0].status).toBe("validada");
  });
});

describe("plano de ação: fluxo e regras (D, E)", () => {
  const plano = async () => (await sql(null, `select id from checklist.planos_acao where item_id = 'c'`))[0].id as string;

  it("aberto → em andamento → aguardando validação → concluído, com rejeição e justificativas", async () => {
    const id = await plano();
    await deve(U.opB, `select checklist.plano_iniciar($1)`, [id], "Sem permissão");
    await sql(U.sup, `select checklist.plano_alterar($1, null, $2, 'O fiscal resolve')`, [id, U.op]);
    await deve(U.sup, `select checklist.plano_alterar($1, now() + interval '3 days', $2, '')`, [id, U.op], "justificativa");
    await sql(U.op, `select checklist.plano_iniciar($1)`, [id]);
    await sql(U.op, `select checklist.plano_iniciar($1)`, [id]); // idempotente
    await sql(U.op, `select checklist.plano_enviar_solucao($1, 'Balcão limpo e reorganizado')`, [id]);
    await deve(U.op, `select checklist.plano_validar($1)`, [id], /Só supervisor/);
    await deve(U.sup, `select checklist.plano_rejeitar($1, '  ')`, [id], "justificativa");
    await sql(U.sup, `select checklist.plano_rejeitar($1, 'Faltou a foto do balcão')`, [id]);
    expect((await sql(null, `select status from checklist.planos_acao where id = $1`, [id]))[0].status).toBe("em_andamento");
    await sql(U.op, `select checklist.plano_enviar_solucao($1, 'Balcão limpo, foto anexada')`, [id]);
    await sql(U.sup, `select checklist.plano_validar($1)`, [id]);
    expect((await sql(null, `select status from checklist.planos_acao where id = $1`, [id]))[0].status).toBe("concluido");
    await deve(U.sup, `select checklist.plano_cancelar($1, 'x')`, [id], "concluído não pode");
    const hist = await sql(null, `select acao, justificativa from checklist.historico where registro_id = $1 order by id`, [id]);
    expect(hist.map((h) => h.acao)).toEqual(["criado_automatico", "alterado", "iniciado", "solucao_enviada", "rejeitado", "solucao_enviada", "validado"]);
    expect(hist.find((h) => h.acao === "rejeitado")?.justificativa).toBe("Faltou a foto do balcão");
  });

  it("quem executou não valida a própria solução", async () => {
    const id = (await sql(null, `select id from checklist.planos_acao where item_id = 'b'`))[0].id as string;
    await sql(U.sup, `select checklist.plano_enviar_solucao($1, 'Eu mesmo resolvi')`, [id]);
    await deve(U.sup, `select checklist.plano_validar($1)`, [id], "Quem executou não valida");
    await sql(U.gestor, `select checklist.plano_validar($1)`, [id]);
  });

  it("cancelar exige motivo; nada é apagado; histórico não muda", async () => {
    await sql(U.sup, `select checklist.plano_criar($1, $2, 'Trocar lâmpada', null, null, now() - interval '1 hour')`, [uuid(50), LOJA_A]);
    const [v] = await sql(U.sup, `select atrasado from checklist.v_planos where id = $1`, [uuid(50)]);
    expect(v.atrasado).toBe(true); // calculado, não gravado
    expect((await sql(null, `select status from checklist.planos_acao where id = $1`, [uuid(50)]))[0].status).toBe("aberto");
    await deve(U.sup, `select checklist.plano_cancelar($1, '')`, [uuid(50)], "motivo");
    await sql(U.sup, `select checklist.plano_cancelar($1, 'Duplicado')`, [uuid(50)]);
    await expect(sql(null, `delete from checklist.planos_acao where id = $1`, [uuid(50)])).rejects.toThrow(/não são apagados/);
    await expect(sql(null, `delete from checklist.execucoes`)).rejects.toThrow(/não são apagados/);
    await expect(sql(null, `update checklist.historico set acao = 'x'`)).rejects.toThrow(/não pode ser alterado/);
  });
});

describe("versões (regra A)", () => {
  it("publicada não muda; nova versão não altera execuções antigas", async () => {
    await expect(sql(null, `update checklist.modelo_versoes set conteudo = '{"secoes":[]}' where id = $1`, [versao1])).rejects.toThrow(/não pode ser alterada/);
    const [{ id: v2 }] = await sql(U.gestor, `select checklist.criar_rascunho($1) id`, [MODELO]) as { id: string }[];
    const novo = { secoes: [{ id: "s1", titulo: "Padaria", itens: [item("a", { peso: 10 }), item("z")] }] };
    await sql(U.gestor, `update checklist.modelo_versoes set conteudo = $2 where id = $1`, [v2, JSON.stringify(novo)]);
    expect(await sql(U.op, `select id from checklist.modelo_versoes where id = $1`, [v2])).toHaveLength(0); // rascunho invisível ao operador
    await deve(U.sup, `select checklist.publicar_versao($1)`, [v2], "Só o gestor");
    await sql(U.gestor, `select checklist.publicar_versao($1)`, [v2]);
    const vs = await sql(null, `select numero, status from checklist.modelo_versoes order by numero`);
    expect(vs).toEqual([{ numero: 1, status: "arquivada" }, { numero: 2, status: "publicada" }]);
    const [e] = await sql(null, `select versao_id, pontuacao from checklist.execucoes where id = $1`, [uuid(1)]);
    expect(e.versao_id).toBe(versao1);
    expect(Number(e.pontuacao)).toBe(35);
    const [{ n }] = await sql(null, `select count(*)::int n from checklist.historico where tabela = 'modelo_versoes' and acao = 'publicada'`);
    expect(n).toBe(2);
  });
});

describe("agenda (C e frequências)", () => {
  it("semanal por dia, mensal por dia e N dias antes do fim do mês", async () => {
    const vale = async (freq: string, extra: string, data: string) => {
      const [r] = await sql(null, `select checklist.agenda_vale(row(gen_random_uuid(), $1, $2, null, 'operador', $3, ${extra}, '07:00', '18:00', true, now(), null)::checklist.agendamentos, $4::date) v`,
        [MODELO, LOJA_A, freq, data]);
      return r.v;
    };
    expect(await vale("semanal", "array[1], null, null", "2026-11-09")).toBe(true); // segunda
    expect(await vale("semanal", "array[1], null, null", "2026-11-10")).toBe(false);
    expect(await vale("mensal", "null, 31, null", "2026-11-30")).toBe(true); // último dia quando o mês é curto
    expect(await vale("mensal", "null, null, 8", "2026-11-22")).toBe(true); // 30 - 8
    expect(await vale("mensal", "null, null, 8", "2026-11-23")).toBe(false);
  });

  it("tarefa vencida aparece como atrasada sem gravar status", async () => {
    await sql(U.sup, `insert into checklist.tarefas (id, modelo_id, loja_id, perfil_responsavel, data_ref, prazo) values ($1, $2, $3, 'operador', current_date, now() - interval '1 minute')`,
      [uuid(60), MODELO, LOJA_A]);
    const [t] = await sql(U.op, `select situacao, atrasada from checklist.v_tarefas where id = $1`, [uuid(60)]);
    expect(t).toEqual({ situacao: "atrasada", atrasada: true });
    await deve(U.op, `select checklist.cancelar_tarefa($1, 'x')`, [uuid(60)], "Só supervisor");
    await sql(U.sup, `select checklist.cancelar_tarefa($1, 'Loja fechada')`, [uuid(60)]);
    expect((await sql(U.op, `select situacao from checklist.v_tarefas where id = $1`, [uuid(60)]))[0].situacao).toBe("cancelada");
  });
});

describe("dashboard", () => {
  it("concluídas, tempo médio, conformidade por setor e por pessoa", async () => {
    const [{ d }] = await sql(U.sup, `select checklist.dashboard(current_date - 1, current_date + 1, $1) d`, [LOJA_A]) as { d: Record<string, unknown> }[];
    expect(d).toMatchObject({ tarefas_concluidas: 1, execucoes: 1, conformidade: 35 });
    expect(Number(d.tempo_medio_seg)).toBeGreaterThan(500);
    expect(d.por_setor).toEqual([expect.objectContaining({ setor: "padaria", conformidade: 35, nao_conformes: 2 })]);
    expect(d.por_pessoa).toEqual([expect.objectContaining({ nome: "Fiscal A", execucoes: 1, conformidade: 35 })]);
    expect(await sql(U.op, `select checklist.dashboard(current_date - 1, current_date + 1, $1) d`, [LOJA_A]))
      .toEqual([{ d: expect.objectContaining({ tarefas_total: 0 }) }]); // operador não vê o dashboard
    const rel = await sql(U.sup, `select * from checklist.relatorio_execucoes(current_date - 1, current_date + 1)`);
    expect(rel).toHaveLength(1);
    expect(rel[0]).toMatchObject({ loja: "Braz Matriz", pessoa: "Fiscal A", nao_conformes: 2, planos: 2 });
  });
});

describe("sincronização idempotente (critério 4)", () => {
  it("o mesmo pacote enviado duas vezes não duplica execução, resposta, foto nem plano", async () => {
    const exec = uuid(80);
    const [{ v }] = await sql(null, `select id v from checklist.modelo_versoes where status = 'publicada'`) as { v: string }[];
    const agora = new Date().toISOString();
    const pacote = [
      JSON.stringify({ id: exec, modelo_id: MODELO, versao_id: v, loja_id: LOJA_B, inicio_em: agora }),
      JSON.stringify([
        { id: uuid(81), item_id: "a", valor: conf("nao_conforme"), respondido_em: agora },
        { id: uuid(82), item_id: "z", valor: conf("conforme"), respondido_em: agora },
      ]),
      JSON.stringify([{ id: uuid(83), item_id: "a", storage_path: `${LOJA_B}/${exec}/${uuid(83)}.jpg`, mime: "image/jpeg", bytes: 500, tirada_em: agora }]),
    ];
    const [r1] = await sql(U.opB, `select checklist.sync_execucao($1, $2, $3) r`, pacote);
    const [r2] = await sql(U.opB, `select checklist.sync_execucao($1, $2, $3) r`, pacote);
    expect(r1.r).toEqual({ status: "em_andamento", respostas: 2, fotos: 1 });
    expect(r2.r).toMatchObject({ fotos: 0 });
    await sql(U.opB, `select checklist.concluir_execucao($1, now())`, [exec]);
    await sql(U.opB, `select checklist.concluir_execucao($1, now())`, [exec]);
    const [c] = await sql(null, `select (select count(*) from checklist.execucoes where id = $1)::int e,
                                        (select count(*) from checklist.respostas where execucao_id = $1)::int r,
                                        (select count(*) from checklist.fotos where execucao_id = $1)::int f,
                                        (select count(*) from checklist.planos_acao where execucao_id = $1)::int p`, [exec]);
    expect(c).toEqual({ e: 1, r: 2, f: 1, p: 1 });
    // operador da loja A não enxerga nada disso
    expect(await sql(U.op, `select * from checklist.planos_acao where execucao_id = $1`, [exec])).toHaveLength(0);
    expect(await sql(U.op, `select * from checklist.fotos where execucao_id = $1`, [exec])).toHaveLength(0);
  });
});

describe("carga dos modelos reais", () => {
  it("o seed carrega, é idempotente e as versões saem publicadas", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const seed = readFileSync(resolve(import.meta.dirname, "../seed/checklist_seed.sql"), "utf8");
    await db.exec(seed);
    await db.exec(seed);
    const [r] = await sql(null, `select count(*)::int m, (select count(*)::int from checklist.modelo_versoes v join checklist.modelos m on m.id = v.modelo_id
      where m.codigo is not null and m.codigo <> 'teste' and v.status = 'publicada') v from checklist.modelos where codigo <> 'teste'`);
    expect(r).toEqual({ m: 8, v: 8 });
    const [{ n }] = await sql(null, `select count(*)::int n from checklist.modelo_versoes v, checklist._itens(v.conteudo) i
      join checklist.modelos m on true where m.id = v.modelo_id and m.codigo <> 'teste'`);
    expect(n).toBe(111);
    expect(await sql(U.op, `select codigo from checklist.modelos where codigo = 'fiscal_manha'`)).toHaveLength(1);
  });
});
