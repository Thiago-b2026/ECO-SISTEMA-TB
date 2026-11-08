import { createClient } from "@supabase/supabase-js";

// Só a chave PÚBLICA (anon). A service_role nunca vai para o navegador.
const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  console.error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env");
}

export const supabase = createClient(url || "http://localhost", key || "anon");
