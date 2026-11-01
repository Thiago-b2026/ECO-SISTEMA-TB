// Inicia a conexão com o Mercado Livre: gera state + PKCE e devolve a URL
// de autorização. Só admin/gerente podem conectar a conta da loja.
import { adminClient, aleatorio, codeChallenge, cors, env, exigirPapel, json, ML_AUTH, redirectUri } from "../_shared/ml.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { user, erro } = await exigirPapel(req, ["admin", "gerente"]);
    if (erro) return erro;

    const state = aleatorio(24);
    const verifier = aleatorio(48);
    const db = adminClient();
    // limpa tentativas antigas (mais de 1 hora)
    await db.from("ml_oauth_estado").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
    const { error } = await db.from("ml_oauth_estado").insert({ state, code_verifier: verifier, user_id: user!.id });
    if (error) throw error;

    const url = new URL(ML_AUTH);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", env("ML_CLIENT_ID"));
    url.searchParams.set("redirect_uri", redirectUri());
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", await codeChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    return json({ url: url.toString() });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
