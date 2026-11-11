// Etapa 12: multiempresa. Empresa A e empresa B no mesmo banco (PGlite), sem tocar em produção.
import { beforeAll, describe, expect, it } from "vitest";
import { como, falha, linhas, novoBanco, type Banco } from "./db";

const id = (p: string, n: number) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = { admin: id("a0000000", 1), gA: id("a0000000", 2), opA: id("a0000000", 3), gB: id("a0000000", 4), opB: id("a0000000", 5), supB: id("a0000000", 6) };
const REDE_A = id("b0000000", 1), REDE_B = id("b0000000", 2);
const LOJA_A = id("c0000000", 1), LOJA_B1 = id("c0000000", 2), LOJA_B2 = id("c0000000", 3);
const MOD_A = id("d0000000", 1);

let db: Banco;
const sql = (u: string | null, q: string, p: unknown[] = []) => como(db, u, () => linhas(db, q, p));
const deve = (u: string, q: string, p: unknown[], trecho: string | RegExp) => como(db, u, () => falha(db, q, p, trecho));
const item = (i: string, extra: Record<string, unknown> = {}) => ({
  id: i, texto: `Item ${i}`, tipo: "conformidade", obrigatorio: true, foto: "nunca", observacao: "nunca", gera_plano: true, pontua: true, peso: 1, ...extra,
});
const conf = (v: string) => ({ tipo: "conformidade", v });

async function executar(usuario: string, loja: string, modelo: string, respostas: Record<string, unknown>) {
  const [{ v }] = await sql(null, `select id::text v from checklist.modelo_versoes where modelo_id = $1 and status = 'publicada'`, [modelo]);
  const e = id("e0000000", Math.floor(Math.random() * 1e9));
  const agora = new Date().toISOString();
  await sql(usuario, `select checklist.sync_execucao($1, $2, '[]')`, [
    JSON.stringify({ id: e, modelo_id: modelo, versao_id: v, loja_id: loja, inicio_em: agora }),
    JSON.stringify(Object.entries(respostas).map(([item_id, valor], n) => ({ id: id("f0000000", Math.floor(Math.random() * 1e9) + n), item_id, valor, respondido_em: agora }))),
  ]);
  const [r] = await sql(usuario, `select checklist.concluir_execucao($1, now()) r`, [e]);
  return { e, r: r.r as { pontuacao: number | null; planos_criados: number } };
}

beforeAll(async () => {
  db = await novoBanco();
  await db.exec(`
    insert into auth.users (id, email) values ('${U.admin}', 'admin@tb'), ('${U.gA}', 'ga@a'), ('${U.opA}', 'opa@a'), ('${U.gB}', 'gb@b'), ('${U.opB}', 'opb@b'), ('${U.supB}', 'supb@b');
    insert into public.admins_stub values ('${U.admin}');
    insert into public.redes (id, nome) values ('${REDE_A}', 'EMPRESA A'), ('${REDE_B}', 'EMPRESA B');
    insert into public.lojas (id, nome, rede_id, cnpj) values
      ('${LOJA_A}', 'A Matriz', '${REDE_A}', '22222222000100'),
      ('${LOJA_B1}', 'B Matriz', '${REDE_B}', '33333333000100'), ('${LOJA_B2}', 'B Filial', '${REDE_B}', '33333333000200');
    insert into checklist.membros (usuario_id, rede_id, loja_id, perfil, nome) values
      ('${U.gA}', '${REDE_A}', null, 'gestor', 'Gestor A'), ('${U.opA}', '${REDE_A}', '${LOJA_A}', 'operador', 'Op A'),
      ('${U.gB}', '${REDE_B}', null, 'gestor', 'Gestor B'), ('${U.opB}', '${REDE_B}', '${LOJA_B2}', 'operador', 'Op B'),
      ('${U.supB}', '${REDE_B}', '${LOJA_B2}', 'supervisor', 'Líder B');
  `);
  await sql(U.admin, `select checklist.preparar_empresa($1)`, [REDE_A]);
  // checklist da empresa A, publicado, agendado, executado com um não conforme
  await sql(U.gA, `insert into checklist.modelos (id, rede_id, codigo, nome, perfil_executor) values ($1, $2, 'rotina', 'Rotina A', 'operador')`, [MOD_A, REDE_A]);
  const [{ v }] = await sql(U.gA, `select checklist.criar_rascunho($1)::text v`, [MOD_A]);
  await sql(U.gA, `update checklist.modelo_versoes set conteudo = $2 where id = $1`, [v, JSON.stringify({ secoes: [{ id: "s", titulo: "Loja", setor: "loja", itens: [item("x"), item("y")] }] })]);
  await sql(U.gA, `select checklist.publicar_versao($1)`, [v]);
  await sql(U.gA, `insert into checklist.agendamentos (modelo_id, loja_id, perfil_responsavel, frequencia, hora_inicio, hora_limite) values ($1, $2, 'operador', 'diaria', '00:00', '23:59')`, [MOD_A, LOJA_A]);
  await sql(U.opA, `select checklist.gerar_tarefas()`);
  await executar(U.opA, LOJA_A, MOD_A, { x: conf("conforme"), y: conf("nao_conforme") });
});

describe("separação por empresa (RLS)", () => {
  it("a empresa B não vê modelo, versão, tarefa, execução, plano, setor, histórico nem dashboard da A", async () => {
    for (const u of [U.gB, U.opB, U.supB]) {
      for (const t of ["modelos", "modelo_versoes", "agendamentos", "tarefas", "v_tarefas", "execucoes", "respostas", "planos_acao", "v_planos", "setores", "historico"]) {
        expect(await sql(u, `select * from checklist.${t}`), `${u} ${t}`).toHaveLength(0);
      }
      const [{ d }] = await sql(u, `select checklist.dashboard(current_date - 1, current_date + 1) d`);
      expect(d).toMatchObject({ tarefas_total: 0, execucoes: 0, planos_abertos: 0 });
      expect(await sql(u, `select * from checklist.relatorio_execucoes(current_date - 1, current_date + 1)`)).toHaveLength(0);
    }
    // a própria empresa A vê
    expect(await sql(U.gA, `select * from checklist.planos_acao`)).toHaveLength(1);
    const [{ d }] = await sql(U.gA, `select checklist.dashboard(current_date - 1, current_date + 1) d`);
    expect(d).toMatchObject({ execucoes: 1, conformidade: 50 });
  });

  it("o gestor da A não edita a B (e vice-versa)", async () => {
    await deve(U.gA, `insert into checklist.modelos (rede_id, nome) values ($1, 'Intruso')`, [REDE_B], /row-level security/);
    await deve(U.gB, `select checklist.criar_rascunho($1)`, [MOD_A], "Só o gestor da empresa");
    await deve(U.gB, `select checklist.arquivar_modelo($1)`, [MOD_A], "Só o gestor da empresa");
    await deve(U.gA, `select checklist.criar_modelo($1, 'X', null, 'diaria', 'operador')`, [REDE_B], "Só o gestor da empresa");
    await deve(U.gA, `select checklist.definir_membro('opa@a', $1, $2, 'operador', 'X')`, [REDE_B, LOJA_B1], "Só o gestor da empresa");
    expect((await sql(U.gB, `update checklist.modelos set nome = 'hack' where id = $1 returning id`, [MOD_A]))).toHaveLength(0);
    // modelo da A não pode ser agendado em loja da B, nem executado lá
    await deve(U.admin, `insert into checklist.agendamentos (modelo_id, loja_id, perfil_responsavel, frequencia) values ($1, $2, 'operador', 'diaria')`, [MOD_A, LOJA_B1], "outra empresa");
  });

  it("gestor vale para a empresa toda; o admin vê as duas", async () => {
    const lojasGB = await sql(U.gB, `select loja_id::text, perfil, rede_nome from checklist.minhas_lojas()`);
    expect(lojasGB.map((l) => l.perfil)).toEqual(["gestor", "gestor"]);
    expect(lojasGB.every((l) => l.rede_nome === "EMPRESA B")).toBe(true);
    expect((await sql(U.opB, `select loja_id::text from checklist.minhas_lojas()`)).map((l) => l.loja_id)).toEqual([LOJA_B2]);
    expect((await sql(U.admin, `select nome from checklist.minhas_redes()`)).map((r) => r.nome)).toEqual(["EMPRESA A", "EMPRESA B"]);
    expect((await sql(U.gB, `select nome from checklist.minhas_redes()`)).map((r) => r.nome)).toEqual(["EMPRESA B"]);
    expect(await sql(U.admin, `select * from checklist.planos_acao`)).toHaveLength(1);
    const [{ d }] = await sql(U.admin, `select checklist.dashboard(current_date - 1, current_date + 1, null, $1) d`, [REDE_B]);
    expect(d).toMatchObject({ execucoes: 0 }); // filtro por empresa
  });
});

describe("cópia de checklists entre empresas", () => {
  it("copia da A para a B em rascunho; mexer na cópia não altera a A; gestor de uma só não copia", async () => {
    await deve(U.gA, `select checklist.copiar_modelos($1, $2)`, [REDE_A, REDE_B], "Só o admin");
    await sql(U.admin, `select checklist.preparar_empresa($1)`, [REDE_B]);
    const [{ n }] = await sql(U.admin, `select checklist.copiar_modelos($1, $2, $3) n`, [REDE_A, REDE_B, `{${MOD_A}}`]);
    expect(n).toBe(1);
    const copia = await sql(U.gB, `select m.id::text id, m.codigo, v.status, v.numero, v.id::text vid from checklist.modelos m join checklist.modelo_versoes v on v.modelo_id = m.id`);
    expect(copia).toHaveLength(1);
    expect(copia[0]).toMatchObject({ codigo: "rotina", status: "rascunho", numero: 1 });
    expect(copia[0].id).not.toBe(MOD_A);
    // o gestor B altera e publica a cópia
    await sql(U.gB, `update checklist.modelo_versoes set conteudo = $2 where id = $1`, [copia[0].vid, JSON.stringify({ secoes: [{ id: "s", titulo: "Loja B", itens: [item("z")] }] })]);
    await sql(U.gB, `select checklist.publicar_versao($1)`, [copia[0].vid]);
    await sql(U.gB, `select checklist.editar_modelo($1, 'Rotina B', null, null, null)`, [copia[0].id]);
    // a original continua igual
    const [a] = await sql(null, `select m.nome, v.conteudo from checklist.modelos m join checklist.modelo_versoes v on v.modelo_id = m.id and v.status = 'publicada' where m.id = $1`, [MOD_A]);
    expect(a.nome).toBe("Rotina A");
    expect((a.conteudo as { secoes: { itens: { id: string }[] }[] }).secoes[0].itens.map((i) => i.id)).toEqual(["x", "y"]);
    expect((await sql(null, `select count(*)::int n from checklist.setores where rede_id = $1`, [REDE_B]))[0].n).toBe(11);
  });
});

describe("checklist do zero: seção, itens, condicional, publicar e executar", () => {
  it("o gestor B cria, publica, agenda; o operador B executa; a condicional pede a causa", async () => {
    const [{ m }] = await sql(U.gB, `select checklist.criar_modelo($1, 'Abertura B', 'Teste', 'diaria', 'operador')::text m`, [REDE_B]);
    const [{ v }] = await sql(U.gB, `select id::text v from checklist.modelo_versoes where modelo_id = $1`, [m]);
    await deve(U.gB, `select checklist.publicar_versao($1)`, [v], "pelo menos um item"); // vazio não publica
    const conteudo = { secoes: [{ id: "s1", titulo: "Abertura", setor: "loja", itens: [
      item("ok", { tipo: "sim_nao", gera_plano: false, peso: 2 }),
      item("causa", { tipo: "texto", pontua: false, gera_plano: false, condicao: { item_id: "ok", valores: [false] } }),
      item("tipo", { tipo: "multipla", opcoes: ["A", "B"], pontua: false, gera_plano: false }),
    ] }] };
    await sql(U.gB, `update checklist.modelo_versoes set conteudo = $2 where id = $1`, [v, JSON.stringify(conteudo)]);
    await sql(U.gB, `select checklist.publicar_versao($1)`, [v]);
    await sql(U.supB, `insert into checklist.agendamentos (modelo_id, loja_id, perfil_responsavel, frequencia, hora_inicio, hora_limite) values ($1, $2, 'operador', 'diaria', '00:00', '23:59')`, [m, LOJA_B2]);
    await sql(U.opB, `select checklist.gerar_tarefas()`);
    expect((await sql(U.opB, `select * from checklist.v_tarefas`)).length).toBeGreaterThan(0);
    await expect(executar(U.opB, LOJA_B2, m, { ok: { tipo: "sim_nao", v: false }, tipo: { tipo: "multipla", v: ["A"] } })).rejects.toThrow(/causa/);
    const r = await executar(U.opB, LOJA_B2, m, { ok: { tipo: "sim_nao", v: false }, causa: { tipo: "texto", v: "Faltou divulgação" }, tipo: { tipo: "multipla", v: ["B"] } });
    expect(r.r.pontuacao).toBe(0);
    // duplicar e arquivar
    const [{ d }] = await sql(U.gB, `select checklist.duplicar_modelo($1)::text d`, [m]);
    expect((await sql(U.gB, `select status from checklist.modelo_versoes where modelo_id = $1`, [d]))[0].status).toBe("rascunho");
    await sql(U.gB, `select checklist.arquivar_modelo($1)`, [d]);
    expect((await sql(U.gB, `select ativo from checklist.modelos where id = $1`, [d]))[0].ativo).toBe(false);
  });
});

describe("colaboradores e lojas (só o admin)", () => {
  it("admin cria loja e empresa; gestor não", async () => {
    await deve(U.gB, `insert into public.lojas (nome, rede_id, sistemas) values ('Loja do gestor', $1, '{checklist}')`, [REDE_B], /row-level security/);
    await deve(U.gB, `insert into public.redes (nome) values ('Empresa do gestor')`, [], /row-level security/);
    await sql(U.admin, `insert into public.lojas (nome, rede_id, cnpj, sistemas) values ('B Filial 2', $1, '33333333000300', '{checklist}')`, [REDE_B]);
    const lojas = await sql(U.gB, `select nome, tipo from checklist.minhas_lojas() order by nome`);
    expect(lojas).toContainEqual({ nome: "B Filial 2", tipo: "filial" });
  });

  it("colaborador novo só pelo serviço central (service_role); entra na equipe com as telas do perfil", async () => {
    const novo = id("a0000000", 9);
    await db.exec(`insert into auth.users (id, email) values ('${novo}', 'novo@b')`);
    // nem gestor nem admin chamam a função interna direto pelo app
    await deve(U.gB, `select checklist._incluir_colaborador($1, 'Novo', $2, $3, 'operador')`, [novo, REDE_B, LOJA_B1], /permission denied/);
    await deve(U.admin, `select checklist._incluir_colaborador($1, 'Novo', $2, $3, 'operador')`, [novo, REDE_B, LOJA_B1], /permission denied/);
    await db.exec("set role service_role");
    await db.query(`select checklist._incluir_colaborador($1, 'Novo Fiscal', $2, $3, 'operador')`, [novo, REDE_B, LOJA_B1]);
    await db.exec("reset role");
    const telas = await sql(null, `select tela_codigo from public.usuario_telas where user_id = $1 and permitido order by 1`, [novo]);
    expect(telas.map((t) => t.tela_codigo)).toEqual(["checklist.hoje", "checklist.planos"]);
    const perm = await sql(null, `select distinct unidade_id::text u from public.usuario_permissoes where user_id = $1`, [novo]);
    expect(perm.map((p) => p.u)).toEqual([LOJA_B1]);
    expect((await sql(novo, `select loja_id::text from checklist.minhas_lojas()`)).map((l) => l.loja_id)).toEqual([LOJA_B1]);
    // o gestor B promove a supervisor; o admin libera as telas novas; o gestor não libera telas
    const [{ mid }] = await sql(null, `select id::text mid from checklist.membros where usuario_id = $1`, [novo]);
    await sql(U.gB, `select checklist.alterar_membro($1, 'supervisor', true)`, [mid]);
    await deve(U.gB, `select checklist.liberar_acesso($1)`, [mid], "Só o admin");
    await sql(U.admin, `select checklist.liberar_acesso($1)`, [mid]);
    expect((await sql(null, `select count(*)::int n from public.usuario_telas where user_id = $1 and permitido`, [novo]))[0].n).toBe(6);
    // gestor: empresa toda, sem unidade
    await db.exec("set role service_role");
    await db.query(`select checklist._incluir_colaborador($1, 'Novo Gestor', $2, $3, 'gestor')`, [novo, REDE_B, LOJA_B1]);
    await db.exec("reset role");
    expect((await sql(null, `select loja_id from checklist.membros where usuario_id = $1 and perfil = 'gestor'`, [novo]))[0].loja_id).toBeNull();
  });
});
