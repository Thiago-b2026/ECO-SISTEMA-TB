import { formatSaleDateOnly, formatSaleDateTime } from "@/lib/sale-datetime";

export const fmtBRL = (n: number) =>
  (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtNum = (n: number, d = 0) =>
  (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtDate = (d: string | Date) => formatSaleDateTime(d);
export const fmtDateOnly = (d: string | Date) => formatSaleDateOnly(d);

export const PAYMENT_LABEL: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  debito: "Cartão Débito",
  credito: "Cartão Crédito",
};
