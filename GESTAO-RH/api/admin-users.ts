// Função de servidor (Vercel): gerencia usuários de UMA empresa.
// Usa a service role key, que só existe no servidor.
import { createClient } from "@supabase/supabase-js";

type Papel = "owner" | "admin" | "operador";
const PAPEIS: Papel[] = ["owner", "admin", "operador"];

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const admin = createClient(url, service, { db: { schema: "rh" }, auth: { persistSession: false, autoRefreshToken: false } });

const resp = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json" },
  });

class Erro extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

/**
 * Confere quem está chamando. Regra do Ecossistema TB: SÓ O ADMIN dá acessos
 * (public.user_roles com role = 'admin'). Dono/Admin de empresa não cadastra mais usuários.
 */
async function autorizar(request: Request, empresaId: string | null) {
  if (!url || !service) throw new Erro(500, "Servidor sem SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY configurados.");
  if (!empresaId) throw new Erro(400, "empresa_id obrigatório.");
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Erro(401, "Sessão expirada. Entre novamente.");
  const { data: r } = await admin
    .schema("public")
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!r) throw new Erro(403, "Só o administrador do Ecossistema TB pode gerenciar usuários.");
  // O admin age com poder de Dono em qualquer empresa.
  return { userId: data.user.id, papel: "owner" as Papel };
}

async function papelDe(empresaId: string, userId: string): Promise<Papel | null> {
  const { data } = await admin.from("empresa_membros").select("papel").eq("empresa_id", empresaId).eq("user_id", userId).maybeSingle();
  return (data?.papel as Papel) ?? null;
}

async function tratar(request: Request, fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Erro) return resp(e.status, e.message);
    console.error(e);
    return resp(500, (e as Error).message || "Erro inesperado");
  }
}

// ---------- Listar ----------
export function GET(request: Request) {
  return tratar(request, async () => {
    const empresaId = new URL(request.url).searchParams.get("empresa_id");
    await autorizar(request, empresaId);
    const { data: membros, error } = await admin
      .from("empresa_membros")
      .select("user_id,papel,created_at")
      .eq("empresa_id", empresaId!);
    if (error) throw new Erro(500, error.message);
    const ids = (membros ?? []).map((m) => m.user_id);
    const { data: perfis } = ids.length
      ? await admin.from("profiles").select("id,nome,email").in("id", ids)
      : { data: [] as { id: string; nome: string | null; email: string | null }[] };
    const users = (membros ?? [])
      .map((m) => {
        const p = (perfis ?? []).find((x) => x.id === m.user_id);
        return { id: m.user_id, nome: p?.nome ?? "", email: p?.email ?? "", papel: m.papel as Papel };
      })
      .sort((a, b) => PAPEIS.indexOf(a.papel) - PAPEIS.indexOf(b.papel) || a.nome.localeCompare(b.nome));
    return resp(200, { users });
  });
}

// ---------- Criar (ou adicionar usuário que já existe) ----------
export function POST(request: Request) {
  return tratar(request, async () => {
    const b = await request.json();
    const eu = await autorizar(request, b.empresa_id);
    const email = String(b.email || "").trim().toLowerCase();
    const papel: Papel = PAPEIS.includes(b.papel) ? b.papel : "operador";
    if (!email) throw new Erro(400, "Informe o e-mail.");
    if (papel === "owner" && eu.papel !== "owner") throw new Erro(403, "Só o Dono pode cadastrar outro Dono.");

    const { data: existente } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    let id = existente?.id as string | undefined;
    if (!id) {
      const senha = String(b.senha || "");
      if (senha.length < 6) throw new Erro(400, "A senha precisa ter pelo menos 6 caracteres.");
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome: b.nome || email.split("@")[0] },
      });
      if (error) throw new Erro(400, error.message);
      id = data.user.id;
      await admin.from("profiles").upsert({ id, nome: b.nome || email.split("@")[0], email });
    }
    if (await papelDe(b.empresa_id, id)) throw new Erro(400, "Este usuário já faz parte da empresa.");
    const { error } = await admin.from("empresa_membros").insert({ empresa_id: b.empresa_id, user_id: id, papel });
    if (error) throw new Erro(400, error.message);
    return resp(200, { ok: true, existente: Boolean(existente) });
  });
}

// ---------- Editar ----------
export function PATCH(request: Request) {
  return tratar(request, async () => {
    const b = await request.json();
    const eu = await autorizar(request, b.empresa_id);
    const atual = await papelDe(b.empresa_id, b.id);
    if (!atual) throw new Erro(404, "Usuário não pertence a esta empresa.");
    if (atual === "owner" && eu.papel !== "owner") throw new Erro(403, "Só o Dono pode alterar outro Dono.");

    if (b.papel && b.papel !== atual) {
      if (!PAPEIS.includes(b.papel)) throw new Erro(400, "Perfil inválido.");
      if (b.id === eu.userId) throw new Erro(400, "Você não pode alterar o seu próprio perfil.");
      if (b.papel === "owner" && eu.papel !== "owner") throw new Erro(403, "Só o Dono pode promover a Dono.");
      await admin.from("empresa_membros").update({ papel: b.papel }).eq("empresa_id", b.empresa_id).eq("user_id", b.id);
    }
    if (typeof b.nome === "string" && b.nome.trim()) {
      await admin.from("profiles").update({ nome: b.nome.trim() }).eq("id", b.id);
    }
    if (b.senha) {
      if (String(b.senha).length < 6) throw new Erro(400, "A senha precisa ter pelo menos 6 caracteres.");
      const { error } = await admin.auth.admin.updateUserById(b.id, { password: b.senha });
      if (error) throw new Erro(400, error.message);
    }
    return resp(200, { ok: true });
  });
}

// ---------- Remover da empresa ----------
export function DELETE(request: Request) {
  return tratar(request, async () => {
    const b = await request.json();
    const eu = await autorizar(request, b.empresa_id);
    if (b.id === eu.userId) throw new Erro(400, "Você não pode remover a si mesmo.");
    const atual = await papelDe(b.empresa_id, b.id);
    if (!atual) throw new Erro(404, "Usuário não pertence a esta empresa.");
    if (atual === "owner" && eu.papel !== "owner") throw new Erro(403, "Só o Dono pode remover outro Dono.");
    await admin.from("empresa_membros").delete().eq("empresa_id", b.empresa_id).eq("user_id", b.id);
    // NUNCA apagar a conta de login: ela é a mesma do PDV Salvados e dos outros sistemas.
    return resp(200, { ok: true });
  });
}
