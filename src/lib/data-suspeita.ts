// Regra de "data suspeita" para as vendas importadas do PDV antigo (Lovable).
// No PDV antigo a data retroativa não tinha limite, então algumas vendas ficaram com a data
// digitada errada. Elas entram no histórico normalmente, mas marcadas para revisão.
// Import com extensão .ts para o script de importação rodar direto no Node.
import { formatLocalDateInput } from "./sale-datetime.ts";

/** Primeiro dia de uso real do PDV antigo (data local, America/Sao_Paulo). */
export const INICIO_PDV_LEGADO = "2026-05-01";

export type MotivoDataSuspeita = "antes_do_sistema" | "depois_do_registro";

export const MOTIVO_DATA_SUSPEITA_LABEL: Record<MotivoDataSuspeita, string> = {
  antes_do_sistema: "Data anterior ao início do sistema (01/05/2026)",
  depois_do_registro: "Data da venda posterior ao dia em que ela foi registrada",
};

/**
 * Diz por que a data da venda é suspeita, ou `null` se estiver ok.
 * Compara dias no fuso da loja (America/Sao_Paulo):
 * - antes de 01/05/2026: o sistema ainda não existia;
 * - depois do dia em que foi registrada (`created_at`): venda não pode acontecer depois de ser lançada.
 */
export function motivoDataSuspeita(
  dataVenda: string | Date,
  createdAt: string | Date,
): MotivoDataSuspeita | null {
  const diaVenda = formatLocalDateInput(normalizar(dataVenda));
  const diaRegistro = formatLocalDateInput(normalizar(createdAt));

  if (diaVenda < INICIO_PDV_LEGADO) return "antes_do_sistema";
  if (diaVenda > diaRegistro) return "depois_do_registro";
  return null;
}

// Aceita o formato do export do Supabase ("2026-05-30 22:58:00+00").
function normalizar(valor: string | Date): string | Date {
  if (valor instanceof Date) return valor;
  return valor.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
}
