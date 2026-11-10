// Escolhe o servidor: com .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) usa o Supabase;
// sem .env abre o MODO DEMONSTRAÇÃO (dados de exemplo só neste navegador).
import { DemoServidor } from "./demo-servidor";
import type { Servidor } from "./servidor";
import { SupabaseServidor } from "./supabase-servidor";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const MODO_DEMO = !url || !chave;

export const servidor: Servidor = MODO_DEMO ? new DemoServidor() : new SupabaseServidor(url!, chave!);
