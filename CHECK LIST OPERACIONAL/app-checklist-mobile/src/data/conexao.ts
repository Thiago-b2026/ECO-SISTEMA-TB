// Escolhe o servidor.
//  - Com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY → Supabase (produção).
//  - MODO DEMONSTRAÇÃO (dados de exemplo só no navegador) só no "npm run dev" ou com VITE_MODO_DEMO=1.
//  - Build de produção SEM as variáveis → tela de "erro de configuração" (nunca abre a demonstração por engano).
import { DemoServidor } from "./demo-servidor";
import type { Servidor } from "./servidor";
import { SupabaseServidor } from "./supabase-servidor";

export type Modo = "supabase" | "demo" | "erro_config";

export function decidirModo(a: { prod: boolean; url?: string; chave?: string; demo?: string }): Modo {
  if (a.demo === "1") return "demo";
  if (a.url && a.chave) return "supabase";
  return a.prod ? "erro_config" : "demo";
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const MODO: Modo = decidirModo({ prod: import.meta.env.PROD, url, chave, demo: import.meta.env.VITE_MODO_DEMO as string | undefined });
export const MODO_DEMO = MODO === "demo";
export const ERRO_CONFIG = MODO === "erro_config";

// em erro de configuração NADA de demonstração é criado: qualquer chamada falha (a tela de erro aparece antes)
const indisponivel = new Proxy({}, {
  get: (_alvo, nome) => (nome === "modo" ? "supabase" : () => Promise.reject(new Error("Erro de configuração: faltam as variáveis do Supabase."))),
}) as Servidor;

export const servidor: Servidor = MODO === "supabase" ? new SupabaseServidor(url!, chave!) : MODO === "demo" ? new DemoServidor() : indisponivel;
