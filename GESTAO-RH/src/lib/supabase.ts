import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  console.error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env");
}

export const supabase = createClient(url || "http://localhost", key || "anon", { db: { schema: "rh" } });

/** id do usuario -> nome (so aparecem pessoas das empresas em comum, pela seguranca do banco). */
export async function carregarNomes(): Promise<Record<string, string>> {
  const { data } = await supabase.from("profiles").select("id,nome,email");
  const m: Record<string, string> = {};
  (data ?? []).forEach((p: { id: string; nome: string | null; email: string | null }) => (m[p.id] = p.nome || p.email || "usuário"));
  return m;
}
