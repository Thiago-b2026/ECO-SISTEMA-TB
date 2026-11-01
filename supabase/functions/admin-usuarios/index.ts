// Gestão de usuários pelo admin (precisa da service_role, por isso fica no servidor).
// Body:
//  { acao: "criar", email, senha, nome, papel, lojas: string[], pessoa_id?: uuid }
//  { acao: "papel", user_id, papel }
//  { acao: "ativo", user_id, ativo: boolean }
//  { acao: "senha", user_id, senha }
import { adminClient, cors, exigirPapel, json } from "../_shared/ml.ts";

const PAPEIS = ["admin", "gerente", "vendedor", "estoquista"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { user, erro } = await exigirPapel(req, ["admin"]);
    if (erro) return erro;
    const body = await req.json().catch(() => ({}));
    const db = adminClient();

    if (body.acao === "criar") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const senha = String(body.senha ?? "");
      const nome = String(body.nome ?? "").trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ erro: "E-mail inválido." }, 400);
      if (senha.length < 8) return json({ erro: "A senha precisa ter pelo menos 8 caracteres." }, 400);
      if (!nome) return json({ erro: "Informe o nome." }, 400);
      if (!PAPEIS.includes(body.papel)) return json({ erro: "Perfil inválido." }, 400);
      const { data, error } = await db.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome },
      });
      if (error) return json({ erro: error.message.includes("already") ? "Já existe usuário com esse e-mail." : error.message }, 400);
      const id = data.user.id;
      await db.from("user_roles").upsert({ user_id: id, role: body.papel }, { onConflict: "user_id" });
      const lojas: string[] = Array.isArray(body.lojas) ? body.lojas : [];
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
      return json({ id });
    }

    const alvo = String(body.user_id ?? "");
    if (!alvo) return json({ erro: "Usuário não informado." }, 400);
    if (alvo === user!.id && (body.acao === "ativo" || body.acao === "papel")) {
      return json({ erro: "Você não pode alterar o próprio perfil ou se desativar." }, 400);
    }

    if (body.acao === "papel") {
      if (!PAPEIS.includes(body.papel)) return json({ erro: "Perfil inválido." }, 400);
      const { error } = await db.from("user_roles").upsert({ user_id: alvo, role: body.papel }, { onConflict: "user_id" });
      if (error) throw error;
      return json({ ok: true });
    }
    if (body.acao === "ativo") {
      const ativo = !!body.ativo;
      const { error } = await db.auth.admin.updateUserById(alvo, { ban_duration: ativo ? "none" : "876000h" });
      if (error) throw error;
      await db.from("profiles").update({ ativo }).eq("id", alvo);
      return json({ ok: true });
    }
    if (body.acao === "senha") {
      const senha = String(body.senha ?? "");
      if (senha.length < 8) return json({ erro: "A senha precisa ter pelo menos 8 caracteres." }, 400);
      const { error } = await db.auth.admin.updateUserById(alvo, { password: senha });
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ erro: "Ação inválida." }, 400);
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
