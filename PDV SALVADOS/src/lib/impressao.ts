// Comprovantes de caixa em formato cupom (térmica 80 mm): abertura, sangria/suprimento e fechamento.
// O cupom da venda fica em comprovante.ts. Nada aqui é documento fiscal.
import { fmtBRL, fmtDate } from "@/lib/format";
import { FORMA_LABEL } from "@/lib/caixa";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

interface Cabecalho {
  loja: string;
  cnpj?: string | null;
  operador: string;
  terminal?: string | null;
}

function cupom(titulo: string, cab: Cabecalho, corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    @page { size: 80mm auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Courier New", monospace; font-size: 11px; width: 80mm; padding: 3mm; color: #000; }
    .c { text-align: center; } .b { font-weight: bold; } hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
    .l { display: flex; justify-content: space-between; gap: 6px; } .t { font-size: 1.35em; } .ass { margin-top: 28px; border-top: 1px solid #000; text-align: center; padding-top: 2px; }
  </style></head><body>
    <div class="c b">${esc(cab.loja)}</div>
    ${cab.cnpj ? `<div class="c">CNPJ ${esc(cab.cnpj)}</div>` : ""}
    <hr><div class="c b t">${esc(titulo)}</div><hr>
    <div class="l"><span>Data/hora</span><span>${esc(fmtDate(new Date()))}</span></div>
    <div class="l"><span>Operador</span><span>${esc(cab.operador)}</span></div>
    ${cab.terminal ? `<div class="l"><span>Terminal</span><span>${esc(cab.terminal)}</span></div>` : ""}
    <hr>${corpo}
    <div class="c" style="margin-top:6px">NÃO É DOCUMENTO FISCAL</div>
    <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
  </body></html>`;
}

function abrirJanela(html: string): boolean {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export function imprimirAbertura(cab: Cabecalho, fundo: number, abertoEm: string) {
  return abrirJanela(cupom("ABERTURA DE CAIXA", cab, `
    <div class="l"><span>Aberto em</span><span>${esc(fmtDate(abertoEm))}</span></div>
    <div class="l b t"><span>Fundo de caixa</span><span>${fmtBRL(fundo)}</span></div>
    <div class="ass">Assinatura do operador</div>`));
}

export function imprimirMovimento(cab: Cabecalho, tipo: "sangria" | "suprimento", valor: number, motivo?: string) {
  return abrirJanela(cupom(tipo === "sangria" ? "SANGRIA" : "SUPRIMENTO", cab, `
    <div class="l b t"><span>Valor</span><span>${fmtBRL(valor)}</span></div>
    ${motivo ? `<div>Motivo: ${esc(motivo)}</div>` : ""}
    <div class="ass">Operador</div><div class="ass">Responsável / conferente</div>`));
}

export interface ResumoFechamento {
  abertoEm: string;
  fechadoEm: string;
  fundo: number;
  vendas: number;
  canceladas: number;
  totalVendas: number;
  porForma: { forma: string; valor: number }[];
  sangrias: number;
  suprimentos: number;
  esperado: number;
  contado: number;
  diferenca: number;
}

export function imprimirFechamento(cab: Cabecalho, r: ResumoFechamento) {
  return abrirJanela(cupom("FECHAMENTO DE CAIXA", cab, `
    <div class="l"><span>Abertura</span><span>${esc(fmtDate(r.abertoEm))}</span></div>
    <div class="l"><span>Fechamento</span><span>${esc(fmtDate(r.fechadoEm))}</span></div>
    <hr>
    <div class="l"><span>Vendas (${r.vendas})</span><span>${fmtBRL(r.totalVendas)}</span></div>
    ${r.canceladas ? `<div class="l"><span>Canceladas</span><span>${r.canceladas}</span></div>` : ""}
    ${r.porForma.map((f) => `<div class="l"><span>&nbsp;&nbsp;${esc(FORMA_LABEL[f.forma] ?? f.forma)}</span><span>${fmtBRL(f.valor)}</span></div>`).join("")}
    <hr>
    <div class="b">DINHEIRO NA GAVETA</div>
    <div class="l"><span>Fundo de caixa</span><span>${fmtBRL(r.fundo)}</span></div>
    <div class="l"><span>+ Vendas em dinheiro</span><span>${fmtBRL(r.porForma.find((f) => f.forma === "dinheiro")?.valor ?? 0)}</span></div>
    <div class="l"><span>+ Suprimentos</span><span>${fmtBRL(r.suprimentos)}</span></div>
    <div class="l"><span>- Sangrias</span><span>${fmtBRL(r.sangrias)}</span></div>
    <div class="l b"><span>Esperado</span><span>${fmtBRL(r.esperado)}</span></div>
    <div class="l b"><span>Contado</span><span>${fmtBRL(r.contado)}</span></div>
    <div class="l b t"><span>Diferença</span><span>${fmtBRL(r.diferenca)}</span></div>
    <div class="ass">Operador</div><div class="ass">Conferente</div>`));
}
