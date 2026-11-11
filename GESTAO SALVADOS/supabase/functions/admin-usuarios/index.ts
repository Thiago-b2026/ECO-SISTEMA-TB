// Gestão de usuários pelo admin (precisa da service_role, por isso fica no servidor).
// Body:
//  { acao: "criar", email, senha, nome, papel, lojas: string[], pessoa_id?: uuid }
//  { acao: "criar", sistema: "checklist", email, senha, nome, rede_id, loja_id?, perfil }  (Check List:
//     só o login + checklist.membros + telas do perfil; NÃO grava user_roles, usuario_lojas nem pessoas)
//  { acao: "papel", user_id, papel }
//  { acao: "ativo", user_id, ativo: boolean }
//  { acao: "senha", user_id, senha }
//  { acao: "motivos", user_id }  → { motivos: string[] } (por que não pode excluir; vazio = pode)
//  { acao: "excluir", user_id }  → apaga o LOGIN (e permissões); o cadastro da pessoa continua
import { adminClient, cors, exigirPapel, json } from "../_shared/ml.ts";
import { PAPEIS, criarUsuario, type ClienteAdmin } from "./criar.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { user, erro } = await exigirPapel(req, ["admin"]);
    if (erro) return erro;
    const body = await req.json().catch(() => ({}));
    const db = adminClient();

    if (body.acao === "criar") {
      const r = await criarUsuario(db as unknown as ClienteAdmin, body);
      return json(r.corpo, r.status);
    }

    const alvo = String(body.user_id ?? "");
    if (!alvo) return json({ erro: "Usuário não informado." }, 400);
    if (alvo === user!.id && (body.acao === "ativo" || body.acao === "papel")) {
      return json({ erro: "Você não pode alterar o próprio perfil ou se desativar." }, 400);
    }

    if (body.acao === "motivos" || body.acao === "excluir") {
      const motivos: string[] = [];
      if (alvo === user!.id) motivos.push("você não pode excluir a si mesmo");
      const { data: papel } = await db.from("user_roles").select("role").eq("user_id", alvo).maybeSingle();
      if (papel?.role === "admin") motivos.push("o admin não pode ser excluído");
      const { data: hist, error: eHist } = await db.rpc("motivos_nao_excluir_usuario", { _uid: alvo });
      if (eHist) throw eHist;
      const historico = (hist ?? []) as string[];
      if (body.acao === "motivos") return json({ motivos: [...motivos, ...historico], historico: historico.length > 0 });
      if (motivos.length) return json({ erro: `Não pode excluir: ${motivos.join(", ")}.` }, 400);
      if (historico.length) return json({ erro: `Não pode excluir, já tem histórico (${historico.join(", ")}). Use Desativar.` }, 400);

      const { data: pessoa } = await db.from("pessoas").select("id").eq("user_id", alvo).maybeSingle();
      // apaga o login: perfil, papel, empresas e permissões saem junto (on delete cascade)
      const { error } = await db.auth.admin.deleteUser(alvo);
      if (error) return json({ erro: "O banco não deixou excluir: " + error.message + ". Use Desativar." }, 400);
      if (pessoa?.id) await db.from("pessoas").update({ user_id: null, eh_usuario: false }).eq("id", pessoa.id);
      return json({ ok: true });
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
