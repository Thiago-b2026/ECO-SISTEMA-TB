// Post de produto (imagem + legenda para WhatsApp/redes), como o "Editor de post" do PrecificaLote.
// O layout é uma lista de camadas desenhadas num canvas de 1080 × 1350 (formato 4:5 do Instagram/WhatsApp).
// Posição e tamanho de cada camada em % do canvas; tamanho da fonte em px nesse canvas de 1080.
import { supabase } from "@/lib/supabase";

export const POST_LARGURA = 1080;
export const POST_ALTURA = 1350;

export type TipoCamada = "fundo" | "logo" | "foto" | "texto";

export interface Camada {
  id: string;
  tipo: TipoCamada;
  nome: string;
  visivel: boolean;
  /** % do canvas */
  x: number;
  y: number;
  w: number;
  h: number;
  /** fundo: cor de fundo da arte; texto: cor da faixa (se `fundo`) */
  corFundo?: string;
  fundo?: boolean;
  raio?: number;
  // texto
  texto?: string;
  cor?: string;
  tamanho?: number;
  negrito?: boolean;
  italico?: boolean;
  riscado?: boolean;
  alinhamento?: "left" | "center" | "right";
  padH?: number;
  padV?: number;
  // logo: imagem (data URL) guardada no próprio layout
  imagem?: string | null;
  // foto: fundo branco atrás da foto do produto
  fundoBranco?: boolean;
}

export interface LayoutPost {
  id: string | null; // null = layout pronto do sistema (não salvo no banco)
  nome: string;
  camadas: Camada[];
  legenda: string;
}

export interface DadosPost {
  nome: string;
  precoML: number | null;
  precoVenda: number | null;
  qtd: number;
  foto: string | null;
}

export const CAMPOS = [
  { campo: "{nome}", rotulo: "Nome" },
  { campo: "{precoML}", rotulo: "Preço ML" },
  { campo: "{precoVenda}", rotulo: "Preço Venda" },
  { campo: "{desconto}", rotulo: "Desconto" },
  { campo: "{qtd}", rotulo: "Qtd" },
] as const;

export const LEGENDA_PADRAO =
  "✨ {nome} ✨\n\n🤯 Na internet: R$ {precoML}\n💣 No saldão: R$ {precoVenda} ({desconto}% OFF)\n\n✨ Disponível: {qtd} unidade(s)";

export const EXEMPLO_POST: DadosPost = { nome: "Bicicleta Aro 26 Passeio (exemplo)", precoML: 899, precoVenda: 584.35, qtd: 3, foto: null };

const novoId = () => Math.random().toString(36).slice(2, 10);

export function novaCamadaTexto(): Camada {
  return {
    id: novoId(), tipo: "texto", nome: "Texto", visivel: true, x: 10, y: 45, w: 80, h: 8,
    texto: "Novo texto", cor: "#ffffff", tamanho: 40, negrito: true, alinhamento: "center",
    fundo: false, corFundo: "#000000", raio: 0, padH: 16, padV: 10,
  };
}

/** Layouts prontos (iguais em toda loja; para mudar, o usuário salva uma cópia com outro nome). */
export function layoutsProntos(): LayoutPost[] {
  const base = (nome: string, fundo: string, faixa: string, faixa2: string, destaque: string): LayoutPost => ({
    id: null,
    nome,
    legenda: LEGENDA_PADRAO,
    camadas: [
      { id: "fundo", tipo: "fundo", nome: "fundo", visivel: true, x: 0, y: 0, w: 100, h: 100, corFundo: fundo },
      { id: "foto", tipo: "foto", nome: "foto", visivel: true, x: 15, y: 9, w: 70, h: 50, fundoBranco: true, raio: 24 },
      { id: "logo", tipo: "logo", nome: "logo", visivel: true, x: 3, y: 2.5, w: 17, h: 12, imagem: null },
      {
        id: "off", tipo: "texto", nome: "% OFF", visivel: true, x: 72, y: 3, w: 25, h: 6.5, texto: "-{desconto}% OFF", cor: "#ffffff",
        tamanho: 40, negrito: true, alinhamento: "center", fundo: true, corFundo: destaque, raio: 40, padH: 12, padV: 6,
      },
      {
        id: "nome", tipo: "texto", nome: "nome", visivel: true, x: 0, y: 61, w: 100, h: 11, texto: "{nome}", cor: "#ffffff",
        tamanho: 46, negrito: true, alinhamento: "center", fundo: true, corFundo: faixa, raio: 0, padH: 40, padV: 10,
      },
      {
        id: "de", tipo: "texto", nome: "DE", visivel: true, x: 0, y: 72, w: 100, h: 7, texto: "DE R$ {precoML}", cor: "#ffffff",
        tamanho: 36, negrito: false, riscado: true, alinhamento: "center", fundo: true, corFundo: faixa2, raio: 0, padH: 16, padV: 6,
      },
      {
        id: "por", tipo: "texto", nome: "POR", visivel: true, x: 0, y: 79, w: 100, h: 14, texto: "POR R$ {precoVenda}", cor: "#ffffff",
        tamanho: 84, negrito: true, alinhamento: "center", fundo: true, corFundo: faixa, raio: 0, padH: 16, padV: 10,
      },
      {
        id: "qtd", tipo: "texto", nome: "estoque", visivel: true, x: 0, y: 94, w: 100, h: 5, texto: "Restam {qtd} unidade(s)", cor: "#ffffff",
        tamanho: 30, negrito: false, alinhamento: "center", fundo: false, corFundo: faixa, raio: 0, padH: 16, padV: 4,
      },
    ],
  });
  return [
    base("Verde saldão", "#2d5a27", "#1a3a16", "#3d8b37", "#dc2626"),
    base("Azul", "#1e3a8a", "#172554", "#2563eb", "#f59e0b"),
    base("Vermelho oferta", "#991b1b", "#450a0a", "#dc2626", "#facc15"),
  ];
}

// ------------------------------------------------------------ textos
const num = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function descontoPercent(d: Pick<DadosPost, "precoML" | "precoVenda">): number | null {
  if (!d.precoML || d.precoVenda == null || d.precoML <= 0) return null;
  return Math.round((1 - d.precoVenda / d.precoML) * 1000) / 10;
}

/** Troca {nome}, {precoML}, {precoVenda}, {desconto} e {qtd} pelos dados do produto. */
export function preencherCampos(modelo: string, d: DadosPost): string {
  const desc = descontoPercent(d);
  return modelo
    .replace(/\{nome\}/gi, d.nome)
    .replace(/\{precoML\}/gi, num(d.precoML))
    .replace(/\{precoVenda\}/gi, num(d.precoVenda))
    .replace(/\{desconto\}/gi, desc == null ? "—" : desc.toLocaleString("pt-BR", { maximumFractionDigits: 1 }))
    .replace(/\{qtd\}/gi, String(d.qtd));
}

// ------------------------------------------------------------ imagens
const cacheImg = new Map<string, Promise<HTMLImageElement | null>>();

/** Carrega imagem com CORS (as fotos do ML liberam), para o canvas poder ser exportado. null se falhar. */
export function carregarImagem(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  let p = cacheImg.get(src);
  if (!p) {
    p = new Promise((ok) => {
      const img = new Image();
      if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      img.src = src;
    });
    cacheImg.set(src, p);
  }
  return p;
}

/** Reduz a logo enviada para no máximo 400 px (vira data URL PNG pequena, guardada no layout). */
export function reduzirLogo(arquivo: File): Promise<string> {
  return new Promise((ok, falha) => {
    const leitor = new FileReader();
    leitor.onerror = () => falha(new Error("Não foi possível ler a imagem."));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => falha(new Error("Arquivo não é uma imagem válida."));
      img.onload = () => {
        const esc = Math.min(1, 400 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * esc);
        c.height = Math.round(img.height * esc);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/png"));
      };
      img.src = String(leitor.result);
    };
    leitor.readAsDataURL(arquivo);
  });
}

// ------------------------------------------------------------ desenho
function retanguloArredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function contain(img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const esc = Math.min(w / img.width, h / img.height);
  const iw = img.width * esc;
  const ih = img.height * esc;
  return { x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih };
}

/** Quebra o texto em linhas que cabem na largura (respeita \n). */
function quebrarLinhas(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  const linhas: string[] = [];
  for (const par of texto.split("\n")) {
    let atual = "";
    for (const palavra of par.split(/\s+/).filter(Boolean)) {
      const teste = atual ? `${atual} ${palavra}` : palavra;
      if (ctx.measureText(teste).width <= largura || !atual) atual = teste;
      else {
        linhas.push(atual);
        atual = palavra;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

export interface Imagens {
  foto: HTMLImageElement | null;
  logos: Record<string, HTMLImageElement | null>;
}

export async function carregarImagens(layout: LayoutPost, dados: DadosPost): Promise<Imagens> {
  const logos: Record<string, HTMLImageElement | null> = {};
  await Promise.all(layout.camadas.filter((c) => c.tipo === "logo").map(async (c) => { logos[c.id] = await carregarImagem(c.imagem); }));
  return { foto: await carregarImagem(dados.foto), logos };
}

/** Desenha o post inteiro no canvas (1080 × 1350). */
export function desenharPost(canvas: HTMLCanvasElement, layout: LayoutPost, dados: DadosPost, imgs: Imagens, selecionada?: string | null) {
  canvas.width = POST_LARGURA;
  canvas.height = POST_ALTURA;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, POST_LARGURA, POST_ALTURA);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, POST_LARGURA, POST_ALTURA);

  for (const c of layout.camadas) {
    if (!c.visivel) continue;
    const x = (c.x / 100) * POST_LARGURA;
    const y = (c.y / 100) * POST_ALTURA;
    const w = (c.w / 100) * POST_LARGURA;
    const h = (c.h / 100) * POST_ALTURA;
    ctx.save();
    if (c.tipo === "fundo") {
      ctx.fillStyle = c.corFundo ?? "#2d5a27";
      ctx.fillRect(x, y, w, h);
    } else if (c.tipo === "foto") {
      if (c.fundoBranco) {
        ctx.fillStyle = "#ffffff";
        retanguloArredondado(ctx, x, y, w, h, c.raio ?? 0);
        ctx.fill();
      }
      if (imgs.foto) {
        const pad = c.fundoBranco ? Math.min(w, h) * 0.04 : 0;
        const r = contain(imgs.foto, x + pad, y + pad, w - 2 * pad, h - 2 * pad);
        ctx.save();
        retanguloArredondado(ctx, x, y, w, h, c.raio ?? 0);
        ctx.clip();
        ctx.drawImage(imgs.foto, r.x, r.y, r.w, r.h);
        ctx.restore();
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        retanguloArredondado(ctx, x, y, w, h, c.raio ?? 0);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "bold 40px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("foto do produto", x + w / 2, y + h / 2);
      }
    } else if (c.tipo === "logo") {
      const img = imgs.logos[c.id];
      if (img) {
        const r = contain(img, x, y, w, h);
        ctx.drawImage(img, r.x, r.y, r.w, r.h);
      } else if (selecionada === c.id) {
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.setLineDash([12, 8]);
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "28px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("sua logo", x + w / 2, y + h / 2);
      }
    } else if (c.tipo === "texto") {
      if (c.fundo) {
        ctx.fillStyle = c.corFundo ?? "#000000";
        retanguloArredondado(ctx, x, y, w, h, c.raio ?? 0);
        ctx.fill();
      }
      const padH = c.padH ?? 16;
      const padV = c.padV ?? 8;
      const larguraUtil = Math.max(10, w - 2 * padH);
      const alturaUtil = Math.max(10, h - 2 * padV);
      const texto = preencherCampos(c.texto ?? "", dados);
      // diminui a fonte até o texto caber na caixa
      let tam = c.tamanho ?? 40;
      let linhas: string[] = [];
      for (; tam >= 12; tam -= 2) {
        ctx.font = `${c.italico ? "italic " : ""}${c.negrito ? "bold " : ""}${tam}px "Segoe UI", Roboto, Arial, sans-serif`;
        linhas = quebrarLinhas(ctx, texto, larguraUtil);
        if (linhas.length * tam * 1.2 <= alturaUtil && linhas.every((l) => ctx.measureText(l).width <= larguraUtil)) break;
      }
      ctx.fillStyle = c.cor ?? "#ffffff";
      ctx.textBaseline = "middle";
      const al = c.alinhamento ?? "center";
      ctx.textAlign = al;
      const tx = al === "left" ? x + padH : al === "right" ? x + w - padH : x + w / 2;
      const altLinha = tam * 1.2;
      const y0 = y + h / 2 - ((linhas.length - 1) * altLinha) / 2;
      linhas.forEach((l, i) => {
        const ly = y0 + i * altLinha;
        ctx.fillText(l, tx, ly);
        if (c.riscado) {
          const lw = ctx.measureText(l).width;
          const lx = al === "left" ? tx : al === "right" ? tx - lw : tx - lw / 2;
          ctx.fillRect(lx, ly - Math.max(2, tam * 0.06) / 2, lw, Math.max(2, tam * 0.06));
        }
      });
    }
    ctx.restore();
  }

  // contorno da camada selecionada (só no editor)
  const sel = layout.camadas.find((c) => c.id === selecionada && c.visivel && c.tipo !== "fundo");
  if (sel) {
    ctx.save();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.strokeRect((sel.x / 100) * POST_LARGURA, (sel.y / 100) * POST_ALTURA, (sel.w / 100) * POST_LARGURA, (sel.h / 100) * POST_ALTURA);
    ctx.restore();
  }
}

/** Camada de cima que está no ponto (x, y em % do canvas). */
export function camadaNoPonto(layout: LayoutPost, px: number, py: number): Camada | null {
  for (let i = layout.camadas.length - 1; i >= 0; i--) {
    const c = layout.camadas[i];
    if (!c.visivel) continue;
    if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return c;
  }
  return null;
}

// ------------------------------------------------------------ gerar e compartilhar
export async function gerarImagemPost(layout: LayoutPost, dados: DadosPost): Promise<Blob> {
  const canvas = document.createElement("canvas");
  desenharPost(canvas, layout, dados, await carregarImagens(layout, dados));
  return new Promise((ok, falha) => {
    try {
      canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível gerar a imagem."))), "image/jpeg", 0.92);
    } catch {
      falha(new Error("A foto do produto bloqueou a geração da imagem. Tente outro produto ou tire a foto da arte."));
    }
  });
}

export function nomeArquivoPost(nome: string) {
  const base = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50).toLowerCase();
  return `post-${base || "produto"}.jpg`;
}

/**
 * Celular: abre o compartilhar do aparelho (WhatsApp, Instagram…) com a imagem e a legenda.
 * Computador (ou sem suporte): baixa a imagem e copia a legenda.
 * IMPORTANTE: chame já com a imagem pronta e logo no toque. O celular só abre o compartilhar se ele for pedido
 * no mesmo instante do toque; qualquer espera antes (gerar a imagem, copiar texto) faz o aparelho bloquear.
 */
export async function compartilharPost(blob: Blob, legenda: string, nome: string): Promise<"compartilhado" | "baixado" | "cancelado"> {
  const arquivo = new File([blob], nomeArquivoPost(nome), { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const celular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (celular && nav.share && nav.canShare?.({ files: [arquivo] })) {
    // primeiro o compartilhar (sem nenhuma espera antes); a legenda vai junto
    const pedido = nav.share({ files: [arquivo], text: legenda });
    try {
      await pedido;
      void navigator.clipboard?.writeText(legenda).catch(() => {});
      return "compartilhado";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelado";
      // o aparelho recusou: cai no baixar
    }
  }
  try {
    await navigator.clipboard?.writeText(legenda);
  } catch {
    /* sem permissão de área de transferência: segue */
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "baixado";
}

// ------------------------------------------------------------ banco
interface LinhaLayout {
  id: string;
  nome: string;
  config: { camadas?: Camada[] } | null;
  legenda: string;
}

export async function listarLayouts(lojaId: string): Promise<LayoutPost[]> {
  const { data, error } = await supabase.from("post_layouts").select("id, nome, config, legenda").eq("loja_id", lojaId).order("nome");
  if (error) throw new Error(error.message);
  return ((data ?? []) as LinhaLayout[])
    .filter((l) => Array.isArray(l.config?.camadas))
    .map((l) => ({ id: l.id, nome: l.nome, camadas: l.config!.camadas!, legenda: l.legenda || LEGENDA_PADRAO }));
}

/** Salva (cria ou atualiza). Devolve o id. */
export async function salvarLayout(lojaId: string, layout: LayoutPost): Promise<string> {
  const linha = { loja_id: lojaId, nome: layout.nome.trim(), config: { camadas: layout.camadas }, legenda: layout.legenda };
  const q = layout.id
    ? supabase.from("post_layouts").update(linha).eq("id", layout.id).select("id").single()
    : supabase.from("post_layouts").insert(linha).select("id").single();
  const { data, error } = await q;
  if (error) throw new Error(error.message.includes("duplicate") ? `Já existe um layout chamado "${linha.nome}" nesta loja.` : error.message);
  return (data as { id: string }).id;
}

export async function excluirLayout(id: string) {
  const { error, count } = await supabase.from("post_layouts").delete({ count: "exact" }).eq("id", id);
  if (error) throw new Error(error.message);
  if (!count) throw new Error("Sem permissão para excluir layout (só administrador ou gerente).");
}

/** Layout preferido da loja (o último usado neste aparelho). */
const CHAVE_PREFERIDO = "post:layout:";
export function layoutPreferido(lojaId: string): string | null {
  try {
    return localStorage.getItem(CHAVE_PREFERIDO + lojaId);
  } catch {
    return null;
  }
}
export function guardarLayoutPreferido(lojaId: string, chave: string) {
  try {
    localStorage.setItem(CHAVE_PREFERIDO + lojaId, chave);
  } catch {
    /* sem localStorage */
  }
}
/** Chave para lembrar o layout: id do banco ou "pronto:<nome>". */
export const chaveLayout = (l: LayoutPost) => l.id ?? `pronto:${l.nome}`;
