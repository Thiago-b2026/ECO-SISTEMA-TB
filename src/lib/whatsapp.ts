// WhatsApp sem API (por enquanto): monta a mensagem e o link wa.me.
// No futuro, a uazapi entra aqui (mesmas funções, envio pelo servidor).
import { fmtBRL } from "@/lib/format";

/** Troca {nome}, {primeiro_nome} e {produtos} na mensagem. */
export function montarMensagem(modelo: string, dados: { nome?: string | null; produtos?: { titulo: string; preco: number }[] }): string {
  const nome = (dados.nome ?? "").trim();
  const primeiro = nome.split(/\s+/)[0] ?? "";
  const lista = (dados.produtos ?? []).map((p) => `• ${p.titulo} — ${fmtBRL(p.preco)}`).join("\n");
  return modelo
    .replace(/\{nome\}/gi, nome || "cliente")
    .replace(/\{primeiro_nome\}/gi, primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : "cliente")
    .replace(/\{produtos\}/gi, lista);
}

/** Telefone no formato do WhatsApp (55 + DDD + número). null se não der. */
export function normalizarTelefone(tel: string | null | undefined): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}

export function linkWhatsApp(telefone: string, texto: string): string {
  return `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}`;
}
