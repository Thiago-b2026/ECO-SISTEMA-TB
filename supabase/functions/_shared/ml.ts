// Código compartilhado das Edge Functions do Mercado Livre (Deno).
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const ML_API = "https://api.mercadolibre.com";
export const ML_AUTH = "https://auth.mercadolivre.com.br/authorization";
export const SITE = "MLB";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function env(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Segredo ${nome} não configurado no Supabase (Edge Functions → Secrets).`);
  return v;
}

export function redirectUri() {
  return `${env("SUPABASE_URL")}/functions/v1/ml-oauth-callback`;
}

export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

/** Confere o usuário logado (JWT do app) e se ele tem um dos papéis. */
export async function exigirPapel(req: Request, papeis: string[]) {
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return { erro: json({ erro: "Faça login novamente." }, 401) };
  const { data: ok } = await adminClient().rpc("has_any_role", { _user_id: data.user.id, _roles: papeis });
  if (!ok) return { erro: json({ erro: "Seu perfil não tem acesso a esta função." }, 403) };
  return { user: data.user };
}

export interface TokenML {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  user_id: number;
}

/** POST /oauth/token (troca do code ou renovação). */
export async function pedirToken(params: Record<string, string>): Promise<TokenML> {
  const r = await fetch(`${ML_API}/oauth/token`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("ML_CLIENT_ID"),
      client_secret: env("ML_CLIENT_SECRET"),
      ...params,
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Mercado Livre recusou o token (${r.status}): ${body.error ?? ""} ${body.message ?? ""}`.trim());
  return body as TokenML;
}

/**
 * Devolve um access_token válido. Renova 10 min antes de vencer.
 * O refresh_token é de uso único: o novo é salvo na hora.
 */
export async function tokenValido(): Promise<string> {
  const db = adminClient();
  const { data: c } = await db.from("ml_conexao").select("*").eq("id", 1).maybeSingle();
  if (!c) throw new Error("Conta do Mercado Livre não conectada. Vá em Mercado Livre → Conectar.");
  if (new Date(c.expires_at).getTime() - Date.now() > 10 * 60 * 1000) return c.access_token;

  const t = await pedirToken({ grant_type: "refresh_token", refresh_token: c.refresh_token });
  await db.from("ml_conexao").update({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    scope: t.scope ?? c.scope,
  }).eq("id", 1);
  return t.access_token;
}

/** GET autenticado na API do ML, com 1 nova tentativa em caso de 429. */
export async function mlGet(path: string, token: string): Promise<any> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await fetch(`${ML_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 429 && tentativa === 0) {
      await new Promise((ok) => setTimeout(ok, 2000));
      continue;
    }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(body.message ?? `Erro ${r.status} no Mercado Livre`) as Error & { status?: number };
      e.status = r.status;
      throw e;
    }
    return body;
  }
}

// ---------- PKCE ----------
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function aleatorio(n = 48) {
  return base64url(crypto.getRandomValues(new Uint8Array(n)));
}
export async function codeChallenge(verifier: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(hash));
}
