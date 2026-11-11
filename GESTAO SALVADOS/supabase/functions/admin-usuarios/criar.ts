// Criação de login pelo admin (separado do index.ts para ser testado no npm test do PDV, sem Deno).
//  sistema ausente ou "pdv": comportamento de SEMPRE (papel do PDV, usuario_lojas, Pessoas).
//  sistema = "checklist": cria só o login e coloca a pessoa na equipe do Check List
//    (checklist._incluir_colaborador → checklist.membros + telas do perfil). NÃO grava user_roles,
//    usuario_lojas nem pessoas (efeitos do PDV).

export const PAPEIS = ["admin", "gerente", "vendedor", "estoquista"];
export const PERFIS_CHECKLIST = ["operador", "supervisor", "gestor"];

type Erro = { message: string } | null;
type Res<T = unknown> = Promise<{ data: T | null; error: Erro }>;

/** O mínimo do cliente Supabase (service_role) que a criação usa. */
export interface ClienteAdmin {
  auth: { admin: { createUser(a: { email: string; password: string; email_confirm: boolean; user_metadata: Record<string, unknown> }): Res<{ user: { id: string } }> } };
  from(tabela: string): {
    upsert(v: unknown, o?: unknown): Res;
    insert(v: unknown): Res;
    delete(): { eq(c: string, v: unknown): Res };
    update(v: unknown): { eq(c: string, v: unknown): Res };
  };
  schema(s: string): { rpc(fn: string, args: Record<string, unknown>): Res<string> };
}

export interface CorpoCriar {
  email?: unknown;
  senha?: unknown;
  nome?: unknown;
  papel?: unknown;
  lojas?: unknown;
  pessoa_id?: unknown;
  sistema?: unknown;
  // Check List
  rede_id?: unknown;
  loja_id?: unknown;
  perfil?: unknown;
}

export type Resposta = { status: number; corpo: Record<string, unknown> };

export async function criarUsuario(db: ClienteAdmin, body: CorpoCriar): Promise<Resposta> {
  const email = String(body.email ?? "").trim().toLowerCase();
  const senha = String(body.senha ?? "");
  const nome = String(body.nome ?? "").trim();
  const sistema = body.sistema == null ? "pdv" : String(body.sistema);
  if (!/^\S+@\S+\.\S+$/.test(email)) return { status: 400, corpo: { erro: "E-mail inválido." } };
  if (senha.length < 8) return { status: 400, corpo: { erro: "A senha precisa ter pelo menos 8 caracteres." } };
  if (!nome) return { status: 400, corpo: { erro: "Informe o nome." } };
  if (sistema !== "pdv" && sistema !== "checklist") return { status: 400, corpo: { erro: "Sistema inválido." } };

  if (sistema === "checklist") {
    const perfil = String(body.perfil ?? "");
    const rede = String(body.rede_id ?? "");
    const loja = body.loja_id ? String(body.loja_id) : null;
    if (!PERFIS_CHECKLIST.includes(perfil)) return { status: 400, corpo: { erro: "Perfil do Check List inválido." } };
    if (!rede) return { status: 400, corpo: { erro: "Escolha a empresa." } };
    if (perfil !== "gestor" && !loja) return { status: 400, corpo: { erro: "Escolha a unidade." } };
  } else if (!PAPEIS.includes(String(body.papel))) {
    return { status: 400, corpo: { erro: "Perfil inválido." } };
  }

  const { data, error } = await db.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
  if (error || !data) {
    const msg = error?.message ?? "Não foi possível criar o login.";
    return { status: 400, corpo: { erro: msg.includes("already") ? "Já existe usuário com esse e-mail." + (sistema === "checklist" ? " Use \"Incluir quem já tem login\"." : "") : msg } };
  }
  const id = data.user.id;

  if (sistema === "checklist") {
    const r = await db.schema("checklist").rpc("_incluir_colaborador", {
      _usuario: id, _nome: nome, _rede: String(body.rede_id), _loja: body.loja_id ? String(body.loja_id) : null, _perfil: String(body.perfil),
    });
    if (r.error) return { status: 400, corpo: { erro: `Login criado, mas não entrou na equipe: ${r.error.message}`, id } };
    return { status: 200, corpo: { id, membro_id: r.data } };
  }

  // PDV (comportamento de sempre)
  await db.from("user_roles").upsert({ user_id: id, role: body.papel }, { onConflict: "user_id" });
  const lojas: string[] = Array.isArray(body.lojas) ? (body.lojas as string[]) : [];
  if (lojas.length) {
    await db.from("usuario_lojas").delete().eq("user_id", id);
    await db.from("usuario_lojas").insert(lojas.map((loja_id) => ({ user_id: id, loja_id })));
  }
  // Cadastro de Pessoas: liga o login à pessoa (ou cria a pessoa marcada como usuário)
  if (body.pessoa_id) {
    await db.from("pessoas").update({ user_id: id, eh_usuario: true, email }).eq("id", body.pessoa_id);
  } else {
    await db.from("pessoas").insert({ tipo: "F", nome, email, eh_usuario: true, user_id: id });
  }
  return { status: 200, corpo: { id } };
}
