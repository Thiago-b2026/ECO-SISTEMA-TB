// Impressão de etiquetas "De / Por" com código de barras (abre janela de impressão).
// Modelos prontos + modelos personalizados (tabela modelos_etiqueta, tela Etiquetas).
import { supabase } from "@/lib/supabase";
import { code128Svg } from "@/lib/code128";
import { fmtBRL } from "@/lib/format";
import logoSalvados from "@/assets/logo-salvados.jpg";

export interface CamposEtiqueta {
  titulo: boolean;
  de: boolean;
  off: boolean;
  grade: boolean;
  codigo: boolean;
  sku: boolean;
  loja: boolean;
  /** Logo da Salvados ao lado do código de barras (modelos antigos não têm o campo: sem logo). */
  logo?: boolean;
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
  /** "De" e "Por" (pt) */
  fonteDe?: number;
  fonteOff?: number;
  alturaCodigo?: number; // mm
  personalizado?: boolean;
}

export const CAMPOS_PADRAO: CamposEtiqueta = { titulo: true, de: true, off: true, grade: false, codigo: true, sku: true, loja: false, logo: true };

/** Mesmos tamanhos e proporções das impressoras do PrecificaLote. */
export const MODELOS_ETIQUETA: ModeloEtiqueta[] = [
  { id: "100x50", nome: "100x50/1 — 100×50mm (1 por linha)", largura: 100, altura: 50, porLinha: 1, espaco: 0, fonteTitulo: 15, fonteDe: 15, fontePreco: 38, fonteOff: 12 },
  { id: "33x22", nome: "33x22/3 — 33×22mm (3 por linha)", largura: 33, altura: 22, porLinha: 3, espaco: 3, fonteTitulo: 7, fonteDe: 6, fontePreco: 11, fonteOff: 5 },
  { id: "50x25", nome: "50x25/2 — 50×25mm (2 por linha)", largura: 50, altura: 25, porLinha: 2, espaco: 3, fonteTitulo: 8, fonteDe: 9, fontePreco: 14, fonteOff: 6.5 },
  { id: "70x30", nome: "70x30/1 — 70×30mm (1 por linha)", largura: 70, altura: 30, porLinha: 1, espaco: 0, fonteTitulo: 10, fonteDe: 8, fontePreco: 16, fonteOff: 6 },
  { id: "50x30", nome: "50x30/2 — 50×30mm (2 por linha)", largura: 50, altura: 30, porLinha: 2, espaco: 3, fonteTitulo: 8.5, fonteDe: 9, fontePreco: 18, fonteOff: 7 },
];

/** Prontos + personalizados salvos no banco. */
export async function carregarModelos(): Promise<ModeloEtiqueta[]> {
  const { data } = await supabase.from("modelos_etiqueta").select("id, nome, config").order("nome");
  const proprios = (data ?? []).map((m) => ({ ...(m.config as ModeloEtiqueta), id: m.id, nome: m.nome, personalizado: true }));
  return [...proprios, ...MODELOS_ETIQUETA];
}

export interface DadosEtiqueta {
  /** Produto do cadastro: a impressão fica registrada (etiqueta impressa conta como movimento). */
  produto_id?: string;
  /** Item de lote: soma em "x/y impressos". */
  lote_item_id?: string;
  titulo: string;
  sku: string;
  preco: number;
  precoDe?: number | null;
  grade?: string | null;
  copias: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** "10,00% OFF" (desconto do De para o Por); vazio quando não há desconto. */
export function textoOff(preco: number, precoDe?: number | null): string {
  if (!precoDe || precoDe <= preco) return "";
  return `${((1 - preco / precoDe) * 100).toFixed(2).replace(".", ",")}% OFF`;
}

/**
 * Etiqueta no desenho do PrecificaLote: nome em 2 linhas, SKU na vertical à esquerda, De / % OFF, Por, código de barras
 * e logo. O código de barras ocupa a altura que sobra (ou `alturaCodigo`).
 */
export function htmlEtiquetas(itens: DadosEtiqueta[], m: ModeloEtiqueta, loja?: string, opts: { imprimir?: boolean; previa?: boolean } = {}): string {
  const c = m.campos ?? CAMPOS_PADRAO;
  const pequena = m.altura < 30;
  const fTit = m.fonteTitulo || (pequena ? 7 : m.altura >= 45 ? 15 : 8.5);
  const fPreco = m.fontePreco || (pequena ? 12 : m.altura >= 45 ? 34 : 16);
  const fDe = m.fonteDe || Math.max(6, Math.min(15, Math.round(fPreco * 0.5)));
  const fOff = m.fonteOff || Math.max(5, Math.round(fDe * 0.75));
  const logoUrl = typeof location !== "undefined" ? new URL(logoSalvados, location.origin).href : logoSalvados;
  const ladoLogo = Math.max(5, Math.round(m.altura * 0.26));
  const etiquetas = itens.flatMap((it) => {
    const off = textoOff(it.preco, it.precoDe);
    const [reais, cent] = fmtBRL(it.preco).replace("R$", "").trim().split(",");
    const mostraDe = c.de && !!off;
    const mostraOff = c.off && !!off;
    const html = `<div class="et">
      ${c.titulo ? `<div class="tit">${esc(it.titulo)}</div>` : ""}
      <div class="corpo">
        ${c.sku ? `<div class="sku"><span>${esc(it.sku)}</span></div>` : ""}
        <div class="dir">
          ${mostraDe || mostraOff ? `<div class="linha">${mostraDe ? `<span class="de">De: ${fmtBRL(it.precoDe!)}</span>` : "<span></span>"}${mostraOff ? `<b class="off">${off}</b>` : ""}</div>` : ""}
          <div class="linha"><span class="por">${mostraDe ? "Por: " : ""}<small>R$</small><b>${esc(reais)}</b><i>,${esc(cent ?? "00")}</i></span>${c.grade && it.grade ? `<b class="grade">${esc(it.grade)}</b>` : ""}</div>
          <div class="base">
            ${c.codigo ? `<div class="cb">${code128Svg(it.sku, { altura: 40, silencio: 4 })}</div>` : '<div class="cb"></div>'}
            ${c.logo ? `<img class="logo" src="${logoUrl}" alt="">` : ""}
          </div>
          ${c.loja && loja ? `<div class="loja">${esc(loja)}</div>` : ""}
        </div>
      </div>
    </div>`;
    return Array.from({ length: Math.max(1, it.copias) }, () => html);
  });
  const larguraPagina = m.largura * m.porLinha + m.espaco * (m.porLinha - 1);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas</title><style>
    @page { size: ${larguraPagina}mm ${m.altura}mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; width: ${larguraPagina}mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    ${opts.previa ? "html, body { overflow: hidden; }" : ""}
    .folha { display: grid; grid-template-columns: repeat(${m.porLinha}, ${m.largura}mm); grid-auto-rows: ${m.altura}mm; column-gap: ${m.espaco}mm; }
    .et { width: ${m.largura}mm; height: ${m.altura}mm; padding: 1mm 1.2mm; display: flex; flex-direction: column; overflow: hidden; break-inside: avoid; ${opts.imprimir === false && !opts.previa ? "outline: 0.2mm dashed #aaa;" : ""} }
    .tit { font-size: ${fTit}pt; line-height: 1.12; max-height: 2.24em; overflow: hidden; letter-spacing: -0.03em; flex: none; }
    .corpo { flex: 1; min-height: 0; display: flex; gap: 0.6mm; }
    .sku { flex: none; display: flex; align-items: flex-end; font-size: ${pequena ? 6 : m.altura >= 45 ? 10 : 7}pt; line-height: 1; }
    .sku span { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; }
    .dir { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .linha { display: flex; align-items: center; justify-content: space-between; gap: 1mm; white-space: nowrap; line-height: 1.05; flex: none; }
    .de { font-size: ${fDe}pt; }
    .off { font-size: ${fOff}pt; }
    .por { font-size: ${fDe}pt; }
    .por small { font-size: 0.75em; }
    .por b { font-size: ${fPreco}pt; line-height: 1; }
    .por i { font-style: normal; font-weight: bold; font-size: ${Math.max(fDe, fPreco * 0.4)}pt; }
    .grade { font-size: ${pequena ? 8 : 12}pt; border: 0.3mm solid #000; padding: 0 1mm; }
    .base { flex: 1; min-height: 0; display: flex; align-items: flex-end; gap: 1.2mm; padding-top: 0.3mm; }
    .cb { flex: 1; min-width: 0; height: ${m.alturaCodigo ? `${m.alturaCodigo}mm` : "100%"}; max-height: 100%; }
    .cb svg { width: 100%; height: 100%; display: block; }
    .logo { flex: none; width: ${ladoLogo}mm; height: ${ladoLogo}mm; max-height: 100%; object-fit: contain; background: #000; }
    .loja { font-size: ${pequena ? 5 : 7}pt; text-align: center; flex: none; }
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

/**
 * Imprime sem abrir janela (quadro escondido na própria página). Serve para imprimir depois de um "await"
 * (ex.: ao salvar), quando o navegador já bloquearia uma janela nova.
 */
export function imprimirEtiquetasNaPagina(itens: DadosEtiqueta[], m: ModeloEtiqueta, loja?: string) {
  const quadro = document.createElement("iframe");
  quadro.setAttribute("aria-hidden", "true");
  quadro.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(quadro);
  const doc = quadro.contentDocument!;
  doc.open();
  doc.write(htmlEtiquetas(itens, m, loja, { imprimir: false }));
  doc.close();
  // espera o logo carregar (no máximo 3 s) antes de imprimir
  const imagens = [...doc.images].filter((im) => !im.complete).map((im) => new Promise((ok) => { im.onload = im.onerror = ok; }));
  void Promise.race([Promise.all(imagens), new Promise((ok) => setTimeout(ok, 3000))]).then(() => setTimeout(() => {
    quadro.contentWindow?.focus();
    quadro.contentWindow?.print();
    setTimeout(() => quadro.remove(), 60_000);
  }, 400));
}

/** Registra as etiquetas impressas: produto do cadastro (conta como movimento) e item de lote ("x/y impressos"). Devolve o erro, se houver. */
export async function registrarImpressao(lista: DadosEtiqueta[]): Promise<string | null> {
  const copias = (i: DadosEtiqueta) => Math.max(1, i.copias);
  const doCadastro = lista.filter((i) => i.produto_id).map((i) => ({ produto_id: i.produto_id, copias: copias(i) }));
  const doLote = lista.filter((i) => i.lote_item_id).map((i) => ({ item_id: i.lote_item_id, copias: copias(i) }));
  const [a, b] = await Promise.all([
    doCadastro.length ? supabase.rpc("registrar_etiquetas", { _itens: doCadastro }) : null,
    doLote.length ? supabase.rpc("registrar_etiquetas_lote", { _itens: doLote }) : null,
  ]);
  return a?.error?.message ?? b?.error?.message ?? null;
}
