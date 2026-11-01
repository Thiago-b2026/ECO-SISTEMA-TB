import { supabase } from "@/lib/supabase";

export interface Caixa {
  id: string;
  loja_id: string;
  operador_id: string;
  status: "aberto" | "fechado";
  valor_abertura: number;
  aberto_em: string;
  fechado_em: string | null;
  valor_informado: number | null;
  valor_esperado: number | null;
  diferenca: number | null;
}

/** Caixa aberto do usuário logado na loja (ou null). */
export async function meuCaixaAberto(lojaId: string, userId: string): Promise<Caixa | null> {
  const { data } = await supabase
    .from("caixas")
    .select("*")
    .eq("loja_id", lojaId)
    .eq("operador_id", userId)
    .eq("status", "aberto")
    .maybeSingle();
  return (data as Caixa) ?? null;
}

export const FORMAS: { id: "dinheiro" | "pix" | "debito" | "credito" | "outro"; label: string }[] = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "pix", label: "Pix" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
  { id: "outro", label: "Outro" },
];
export const FORMA_LABEL = Object.fromEntries(FORMAS.map((f) => [f.id, f.label])) as Record<string, string>;
