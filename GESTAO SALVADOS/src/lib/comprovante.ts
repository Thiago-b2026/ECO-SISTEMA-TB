// Comprovante de venda NÃO FISCAL para impressora térmica 80 mm (ou 58 mm).
import { fmtBRL, fmtDate } from "@/lib/format";
import { FORMA_LABEL } from "@/lib/caixa";

export interface DadosComprovante {
  numero: number;
  data: string;
  loja: string;
  cnpj?: string | null;
  endereco?: string | null;
  vendedor?: string | null;
  itens: { descricao: string; quantidade: number; preco_unit: number; desconto: number; total: number }[];
  subtotal: number;
  desconto: number;
  total: number;
  pagamentos: { forma: string; valor: number; troco?: number }[];
  cancelada?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function htmlComprovante(d: DadosComprovante, largura: 80 | 58 = 80): string {
  const troco = d.pagamentos.reduce((s, p) => s + (p.troco ?? 0), 0);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Venda ${d.numero}</title><style>
    @page { size: ${largura}mm auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Courier New", monospace; font-size: ${largura === 80 ? 11 : 9}px; width: ${largura}mm; padding: 3mm; color: #000; }
    .c { text-align: center; } .b { font-weight: bold; } hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
    .l { display: flex; justify-content: space-between; gap: 6px; } .it { margin: 2px 0; } .t { font-size: 1.4em; }
  </style></head><body>
    <div class="c b">${esc(d.loja)}</div>
    ${d.cnpj ? `<div class="c">CNPJ ${esc(d.cnpj)}</div>` : ""}
    ${d.endereco ? `<div class="c">${esc(d.endereco)}</div>` : ""}
    <div class="c">COMPROVANTE DE VENDA</div>
    <div class="c b">NÃO É DOCUMENTO FISCAL</div>
    <hr>
    <div class="l"><span>Venda nº ${d.numero}</span><span>${esc(fmtDate(d.data))}</span></div>
    ${d.vendedor ? `<div>Vendedor: ${esc(d.vendedor)}</div>` : ""}
    ${d.cancelada ? `<div class="c b">*** VENDA CANCELADA ***</div>` : ""}
    <hr>
    ${d.itens.map((i) => `<div class="it"><div>${esc(i.descricao)}</div>
      <div class="l"><span>${i.quantidade} x ${fmtBRL(i.preco_unit)}${i.desconto > 0 ? ` - ${fmtBRL(i.desconto)}` : ""}</span><span>${fmtBRL(i.total)}</span></div></div>`).join("")}
    <hr>
    <div class="l"><span>Subtotal</span><span>${fmtBRL(d.subtotal)}</span></div>
    ${d.desconto > 0 ? `<div class="l"><span>Desconto</span><span>- ${fmtBRL(d.desconto)}</span></div>` : ""}
    <div class="l b t"><span>TOTAL</span><span>${fmtBRL(d.total)}</span></div>
    <hr>
    ${d.pagamentos.map((p) => `<div class="l"><span>${esc(FORMA_LABEL[p.forma] ?? p.forma)}</span><span>${fmtBRL(p.valor)}</span></div>`).join("")}
    ${troco > 0 ? `<div class="l b"><span>Troco</span><span>${fmtBRL(troco)}</span></div>` : ""}
    <hr>
    <div class="c">Obrigado pela preferência!</div>
    <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
  </body></html>`;
}

export function imprimirComprovante(d: DadosComprovante): boolean {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return false;
  w.document.open();
  w.document.write(htmlComprovante(d));
  w.document.close();
  return true;
}

/** Busca a venda no banco e imprime o comprovante. */
export async function imprimirComprovanteDaVenda(vendaId: string, loja: string): Promise<string | null> {
  const { supabase } = await import("@/lib/supabase");
  const [{ data: v, error }, { data: itens }, { data: pags }] = await Promise.all([
    supabase.from("vendas").select("numero, data_venda, vendedor_nome, subtotal, desconto, total, status, loja_id").eq("id", vendaId).single(),
    supabase.from("venda_itens").select("descricao, quantidade, preco_unit, desconto, total").eq("venda_id", vendaId),
    supabase.from("venda_pagamentos").select("forma, valor, troco").eq("venda_id", vendaId),
  ]);
  if (error || !v) return "Venda não encontrada.";
  const { data: lj } = await supabase.from("lojas").select("nome, nome_fantasia, cnpj, logradouro, numero, bairro, cidade, uf").eq("id", v.loja_id).maybeSingle();
  const cnpj = lj?.cnpj ? String(lj.cnpj).replace(/^(d{2})(d{3})(d{3})(d{4})(d{2})$/, "$1.$2.$3/$4-$5") : null;
  const endereco = lj ? [lj.logradouro && `${lj.logradouro}${lj.numero ? ", " + lj.numero : ""}`, lj.bairro, lj.cidade && `${lj.cidade}/${lj.uf ?? ""}`].filter(Boolean).join(" - ") : null;
  const n = (x: unknown) => Number(x ?? 0);
  const ok = imprimirComprovante({
    numero: v.numero, data: v.data_venda, loja: lj?.nome_fantasia || lj?.nome || loja, cnpj, endereco, vendedor: v.vendedor_nome,
    itens: (itens ?? []).map((i) => ({ descricao: i.descricao, quantidade: n(i.quantidade), preco_unit: n(i.preco_unit), desconto: n(i.desconto), total: n(i.total) })),
    subtotal: n(v.subtotal), desconto: n(v.desconto), total: n(v.total),
    pagamentos: (pags ?? []).map((p) => ({ forma: p.forma, valor: n(p.valor), troco: n(p.troco) })),
    cancelada: v.status === "cancelada",
  });
  return ok ? null : "O navegador bloqueou a janela de impressão. Permita pop-ups para este site.";
}
