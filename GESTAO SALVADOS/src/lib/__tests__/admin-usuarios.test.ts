// Edge Function admin-usuarios → criação de login. O PDV continua IGUAL; o Check List (sistema="checklist")
// não grava efeitos do PDV (user_roles, usuario_lojas, pessoas).
import { describe, expect, it } from "vitest";
import { criarUsuario, type ClienteAdmin } from "../../../supabase/functions/admin-usuarios/criar";

function falso(opts: { existe?: boolean; erroRpc?: string } = {}) {
  const log: string[] = [];
  const ok = async () => ({ data: null, error: null });
  const db: ClienteAdmin = {
    auth: { admin: { createUser: async (a) => {
      log.push(`createUser:${a.email}`);
      return opts.existe ? { data: null, error: { message: "User already registered" } } : { data: { user: { id: "u1" } }, error: null };
    } } },
    from: (t) => ({
      upsert: async (v) => { log.push(`upsert:${t}:${JSON.stringify(v)}`); return ok(); },
      insert: async (v) => { log.push(`insert:${t}:${JSON.stringify(v)}`); return ok(); },
      delete: () => ({ eq: async () => { log.push(`delete:${t}`); return ok(); } }),
      update: (v) => ({ eq: async () => { log.push(`update:${t}:${JSON.stringify(v)}`); return ok(); } }),
    }),
    schema: (s) => ({ rpc: async (fn, args) => {
      log.push(`rpc:${s}.${fn}:${JSON.stringify(args)}`);
      return opts.erroRpc ? { data: null, error: { message: opts.erroRpc } } : { data: "m1", error: null };
    } }),
  };
  return { db, log };
}

const base = { email: "Ana@Braz.com", senha: "12345678", nome: "Ana" };

describe("admin-usuarios: criar login", () => {
  it("PDV (sem sistema): papel, lojas e Pessoas como sempre", async () => {
    const { db, log } = falso();
    const r = await criarUsuario(db, { ...base, papel: "vendedor", lojas: ["l1"] });
    expect(r).toEqual({ status: 200, corpo: { id: "u1" } });
    expect(log).toEqual([
      "createUser:ana@braz.com",
      'upsert:user_roles:{"user_id":"u1","role":"vendedor"}',
      "delete:usuario_lojas",
      'insert:usuario_lojas:[{"user_id":"u1","loja_id":"l1"}]',
      'insert:pessoas:{"tipo":"F","nome":"Ana","email":"ana@braz.com","eh_usuario":true,"user_id":"u1"}',
    ]);
    expect((await criarUsuario(falso().db, { ...base, papel: "chefe" })).status).toBe(400);
  });

  it("Check List: só o login + equipe do Check List; nada do PDV", async () => {
    const { db, log } = falso();
    const r = await criarUsuario(db, { ...base, sistema: "checklist", rede_id: "r1", loja_id: "l1", perfil: "operador" });
    expect(r).toEqual({ status: 200, corpo: { id: "u1", membro_id: "m1" } });
    expect(log).toEqual([
      "createUser:ana@braz.com",
      'rpc:checklist._incluir_colaborador:{"_usuario":"u1","_nome":"Ana","_rede":"r1","_loja":"l1","_perfil":"operador"}',
    ]);
    expect(log.some((l) => /user_roles|usuario_lojas|pessoas/.test(l))).toBe(false);
  });

  it("Check List: valida perfil, empresa e unidade (gestor não precisa de unidade)", async () => {
    expect((await criarUsuario(falso().db, { ...base, sistema: "checklist", rede_id: "r1", perfil: "chefe" })).corpo.erro).toMatch("Perfil");
    expect((await criarUsuario(falso().db, { ...base, sistema: "checklist", loja_id: "l1", perfil: "operador" })).corpo.erro).toMatch("empresa");
    expect((await criarUsuario(falso().db, { ...base, sistema: "checklist", rede_id: "r1", perfil: "operador" })).corpo.erro).toMatch("unidade");
    expect((await criarUsuario(falso().db, { ...base, sistema: "checklist", rede_id: "r1", perfil: "gestor" })).status).toBe(200);
    expect((await criarUsuario(falso().db, { ...base, sistema: "rh", papel: "vendedor" })).corpo.erro).toMatch("Sistema");
  });

  it("e-mail já existente e erro ao entrar na equipe aparecem como erro", async () => {
    const r1 = await criarUsuario(falso({ existe: true }).db, { ...base, sistema: "checklist", rede_id: "r1", perfil: "gestor" });
    expect(r1.status).toBe(400);
    expect(r1.corpo.erro).toMatch("Incluir quem já tem login");
    const r2 = await criarUsuario(falso({ erroRpc: "A unidade não é desta empresa." }).db, { ...base, sistema: "checklist", rede_id: "r1", loja_id: "x", perfil: "operador" });
    expect(r2).toMatchObject({ status: 400, corpo: { erro: "Login criado, mas não entrou na equipe: A unidade não é desta empresa.", id: "u1" } });
  });
});
