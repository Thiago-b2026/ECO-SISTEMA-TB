// Impressão de etiquetas "De / Por" com código de barras (abre janela de impressão).
// Modelos prontos + modelos personalizados (tabela modelos_etiqueta, tela Etiquetas).
import { supabase } from "@/lib/supabase";
import { code128Svg } from "@/lib/code128";
import { fmtBRL } from "@/lib/format";

export interface CamposEtiqueta {
  titulo: boolean;
  de: boolean;
  off: boolean;
  grade: boolean;
  codigo: boolean;
  sku: boolean;
  loja: boolean;
}

export interface ModeloEtiqueta {
  id: string;
  nome: string;
  largura: number; // mm
  altura: number; // mm
  porLinha: number;
  espaco: number; // mm entre etiquetas
  campos?: CamposEtiqueta;
  /** tamanhos em pt; 0 = automático */
  fonteTitulo?: number;
  fontePreco?: number;
  alturaCodigo?: number; // mm
  personalizado?: boolean;
}

export const CAMPOS_PADRAO: CamposEtiqueta = { titulo: true, de: true, off: true, grade: true, codigo: true, sku: true, loja: true };

export const MODELOS_ETIQUETA: ModeloEtiqueta[] = [
  { id: "100x50", nome: "100×50 mm · 1 por linha", largura: 100, altura: 50, porLinha: 1, espaco: 0 },
  { id: "70x30", nome: "70×30 mm · 1 por linha", largura: 70, altura: 30, porLinha: 1, espaco: 0 },
  { id: "50x30", nome: "50×30 mm · 2 por linha", largura: 50, altura: 30, porLinha: 2, espaco: 3 },
  { id: "50x25", nome: "50×25 mm · 2 por linha", largura: 50, altura: 25, porLinha: 2, espaco: 3 },
  { id: "33x22", nome: "33×22 mm · 3 por linha", largura: 33, altura: 22, porLinha: 3, espaco: 3 },
];

/** Prontos + personalizados salvos no banco. */
export async function carregarModelos(): Promise<ModeloEtiqueta[]> {
  const { data } = await supabase.from("modelos_etiqueta").select("id, nome, config").order("nome");
  const proprios = (data ?? []).map((m) => ({ ...(m.config as ModeloEtiqueta), id: m.id, nome: m.nome, personalizado: true }));
  return [...proprios, ...MODELOS_ETIQUETA];
}

export interface DadosEtiqueta {
  titulo: string;
  sku: string;
  preco: number;
  precoDe?: number | null;
  grade?: string | null;
  copias: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function htmlEtiquetas(itens: DadosEtiqueta[], m: ModeloEtiqueta, loja?: string, opts: { imprimir?: boolean } = {}): string {
  const c = m.campos ?? CAMPOS_PADRAO;
  const pequena = m.altura < 30;
  const fTit = m.fonteTitulo || (pequena ? 6 : m.altura >= 45 ? 11 : 8);
  const fPreco = m.fontePreco || (pequena ? 11 : m.altura >= 45 ? 30 : 16);
  const hCod = m.alturaCodigo || (pequena ? 5 : m.altura >= 45 ? 12 : 8);
  const etiquetas = itens.flatMap((it) => {
    const off = it.precoDe && it.precoDe > it.preco ? Math.round((1 - it.preco / it.precoDe) * 100) : 0;
    const [reais, cent] = fmtBRL(it.preco).replace("R$", "").trim().split(",");
    const mostraDe = c.de && off > 0;
    const rodape = [c.sku ? esc(it.sku) : "", c.loja && loja ? esc(loja) : ""].filter(Boolean).join(" · ");
    const html = `<div class="et">
      ${c.titulo ? `<div class="tit">${esc(it.titulo)}</div>` : ""}
      <div class="meio">
        <div class="precos">
          ${mostraDe ? `<div class="de">De: ${fmtBRL(it.precoDe!)}</div>` : ""}
          <div class="por"><small>${mostraDe ? "Por: " : ""}R$</small>${esc(reais)}<sup>,${esc(cent ?? "00")}</sup></div>
        </div>
        ${c.off && off > 0 ? `<div class="off">${off}% OFF</div>` : ""}
        ${c.grade && it.grade ? `<div class="grade">${esc(it.grade)}</div>` : ""}
      </div>
      ${c.codigo ? `<div class="cb">${code128Svg(it.sku, { altura: 40 })}</div>` : ""}
      ${rodape ? `<div class="sku">${rodape}</div>` : ""}
    </div>`;
    return Array.from({ length: Math.max(1, it.copias) }, () => html);
  });
  const larguraPagina = m.largura * m.porLinha + m.espaco * (m.porLinha - 1);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas</title><style>
    @page { size: ${larguraPagina}mm ${m.altura}mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
    .folha { display: grid; grid-template-columns: repeat(${m.porLinha}, ${m.largura}mm); column-gap: ${m.espaco}mm; }
    .et { width: ${m.largura}mm; height: ${m.altura}mm; padding: 1.2mm 1.6mm; display: flex; flex-direction: column; overflow: hidden; break-inside: avoid; ${opts.imprimir === false ? "outline: 0.2mm dashed #aaa;" : ""} }
    .tit { font-size: ${fTit}pt; line-height: 1.1; max-height: 2.3em; overflow: hidden; font-weight: bold; }
    .meio { display: flex; align-items: center; gap: 1.5mm; flex: 1; min-height: 0; }
    .precos { flex: 1; }
    .de { font-size: ${Math.max(6, Math.round(fPreco / 3))}pt; text-decoration: line-through; }
    .por { font-size: ${fPreco}pt; font-weight: 900; line-height: 1; }
    .por small { font-size: 0.4em; margin-right: 0.5mm; } .por sup { font-size: 0.45em; }
    .off { font-size: ${pequena ? 6 : 9}pt; font-weight: bold; border: 0.3mm solid #000; padding: 0.3mm 1mm; }
    .grade { font-size: ${pequena ? 8 : 14}pt; font-weight: bold; border: 0.4mm solid #000; padding: 0 1.5mm; }
    .cb svg { width: 100%; height: ${hCod}mm; display: block; }
    .sku { font-size: ${pequena ? 5 : 7}pt; text-align: center; }
  </style></head><body><div class="folha">${etiquetas.join("")}</div>
  ${opts.imprimir === false ? "" : "<script>window.onload = () => setTimeout(() => window.print(), 300);</script>"}</body></html>`;
}

/** Abre a janela de impressão. Retorna false se o navegador bloqueou o pop-up. */
export function imprimirEtiquetas(itens: DadosEtiqueta[], m: ModeloEtiqueta, loja?: string): boolean {
  const w = window.open("", "_blank", "width=800,height=600");
  if (!w) return false;
  w.document.open();
  w.document.write(htmlEtiquetas(itens, m, loja));
  w.document.close();
  return true;
}
