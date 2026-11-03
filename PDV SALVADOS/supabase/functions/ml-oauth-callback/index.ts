// Retorno do Mercado Livre depois que o usuário autoriza.
// O ML abre esta URL no navegador (sem login do app), por isso ela é
// publicada com --no-verify-jwt e a segurança vem do "state" + PKCE.
import { adminClient, ML_API, pedirToken, redirectUri } from "../_shared/ml.ts";

function voltarParaApp(resultado: string, detalhe = "") {
  const app = Deno.env.get("APP_URL") ?? "http://localhost:5173";
  const url = new URL("/mercado-livre", app);
  url.searchParams.set("ml", resultado);
  if (detalhe) url.searchParams.set("detalhe", detalhe.slice(0, 200));
  return Response.redirect(url.toString(), 302);
}

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (params.get("error")) return voltarParaApp("erro", params.get("error_description") ?? params.get("error")!);
  if (!code || !state) return voltarParaApp("erro", "Retorno do Mercado Livre sem código.");

  try {
    const db = adminClient();
    const { data: est } = await db.from("ml_oauth_estado").select("*").eq("state", state).maybeSingle();
    if (!est) return voltarParaApp("erro", "Pedido de conexão expirado. Clique em Conectar de novo.");
    await db.from("ml_oauth_estado").delete().eq("state", state);

    const t = await pedirToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: est.code_verifier,
    });

    const me = await fetch(`${ML_API}/users/me`, { headers: { Authorization: `Bearer ${t.access_token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    const { error } = await db.from("ml_conexao").upsert({
      id: 1,
      ml_user_id: t.user_id,
      ml_nickname: me?.nickname ?? null,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      scope: t.scope ?? null,
      conectado_por: est.user_id,
    });
    if (error) throw error;
    return voltarParaApp("ok");
  } catch (e) {
    return voltarParaApp("erro", (e as Error).message);
  }
});
