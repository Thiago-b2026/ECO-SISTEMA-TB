// Busca do anúncio EXATO do Mercado Livre pelo NAVEGADOR do usuário (modelo do "robô" do PrecificaLote).
//
// Por quê: a API oficial do ML nega (403) a leitura de anúncios de outros vendedores fora do catálogo, e a página
// do anúncio aberta pelo servidor cai na verificação de robô. Já no navegador da pessoa a página abre normal.
// Como: a extensão do Chrome "Salvados LP – Busca no Mercado Livre" (pasta extensao-chrome/). O PDV abre o link numa aba;
// a extensão lê os dados que a própria página publica (nome, preço, preço anterior, foto, marca), devolve por postMessage
// e fecha a aba. Plano B da extensão: abre /capturar#<dados> (guarda no localStorage e avisa por BroadcastChannel).
import type { Candidato } from "@/lib/lotes";
import { normalizarNome } from "@/lib/duplicados";

export interface CapturaML {
  id: string | null; // MLB… do anúncio (ou MLBU… do produto do vendedor)
  titulo: string;
  preco: number | null; // preço atual (com desconto)
  preco_original: number | null; // "de" (sem desconto)
  foto: string | null;
  link: string;
  marca: string | null;
  gtin: string | null;
  categoria: string | null;
  capturado_em: string; // ISO
}

const CHAVE = "ml:capturas";
const CANAL = "ml-captura";
const MAX = 30;

const txt = (v: unknown, max = 500): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const valor = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null;
};
const url = (v: unknown): string | null => {
  const s = txt(v, 2000);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
};

/** Lê e valida os dados que chegaram no "#" de /capturar. null se não for uma captura válida. */
export function lerCapturaDoHash(hash: string, agora = new Date()): CapturaML | null {
  const bruto = hash.replace(/^#/, "");
  if (!bruto) return null;
  try {
    return validarCaptura(JSON.parse(decodeURIComponent(bruto)), agora);
  } catch {
    return null;
  }
}

/** Valida e limpa os dados de um anúncio vindos da página do ML (extensão ou favorito). null se inválido. */
export function validarCaptura(bruto: unknown, agora = new Date()): CapturaML | null {
  const d = bruto as Record<string, unknown>;
  if (!d || typeof d !== "object") return null;
  const titulo = txt(d.titulo, 300);
  const link = url(d.link);
  if (!titulo || !link || !/mercadoli(vre|bre)\./i.test(new URL(link).hostname)) return null;
  const id = txt(d.id, 40);
  const preco = valor(d.preco);
  let preco_original = valor(d.preco_original);
  if (preco_original != null && preco != null && preco_original <= preco) preco_original = null;
  return {
    id: id && /^MLBU?\d+$/i.test(id) ? id.toUpperCase() : null,
    titulo,
    preco,
    preco_original,
    foto: url(d.foto),
    link,
    marca: txt(d.marca, 120),
    gtin: (() => { const g = txt(d.gtin, 20)?.replace(/\D/g, ""); return g && g.length >= 8 && g.length <= 14 ? g : null; })(),
    categoria: txt(d.categoria, 120),
    capturado_em: agora.toISOString(),
  };
}

/** Captura → candidato do "Inserir produto" (o mesmo formato da busca no ML). */
export function candidatoDaCaptura(c: CapturaML): Candidato {
  return {
    id: c.id ?? `CAPTURA-${c.capturado_em}`,
    tipo: "item",
    titulo: c.titulo,
    preco: c.preco,
    preco_original: c.preco_original,
    foto: c.foto,
    link: c.link,
    gtin: c.gtin,
    marca: c.marca,
    modelo: null,
    categoria_id: null,
    similaridade: 100,
  };
}

// ------------------------------------------------------------ extensão do Chrome (busca automática)
/** A extensão "Salvados LP – Busca no Mercado Livre" marca a página do PDV quando está instalada. */
export function extensaoInstalada(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute("data-salvados-ext");
}

/**
 * Busca o anúncio EXATO pelo navegador: abre o link numa aba (com o nome que a extensão reconhece),
 * a extensão lê a página, devolve os dados e fecha a aba. Precisa ser chamada direto do clique
 * (senão o navegador bloqueia a aba nova).
 */
export function capturarPeloNavegador(link: string, limiteMs = 30000): Promise<CapturaML> {
  const alvo = url(link);
  if (!alvo || !/mercadoli(vre|bre)\./i.test(new URL(alvo).hostname)) return Promise.reject(new Error("Cole um link do Mercado Livre."));
  const aba = window.open(alvo, `pdv-captura|${window.location.origin}`);
  if (!aba) return Promise.reject(new Error("O navegador bloqueou a aba do anúncio. Permita pop-ups deste site e busque de novo."));
  window.focus();
  return new Promise((ok, falha) => {
    const fim = () => { window.removeEventListener("message", ouvir); clearTimeout(tempo); clearInterval(fechada); };
    const ouvir = (e: MessageEvent) => {
      if (!/^https:\/\/([a-z0-9-]+\.)*mercadoli(vre|bre)\.com(\.br)?$/i.test(e.origin)) return;
      const m = e.data as { tipo?: string; dados?: unknown; erro?: string };
      if (!m || m.tipo !== "salvados-captura") return;
      fim();
      if (m.erro) return falha(new Error(m.erro));
      const c = validarCaptura(m.dados);
      if (!c) return falha(new Error("A página do anúncio não trouxe os dados do produto."));
      guardarCaptura(c, false);
      ok(c);
    };
    window.addEventListener("message", ouvir);
    const tempo = setTimeout(() => { fim(); falha(new Error("O anúncio não respondeu a tempo. Confira a aba do Mercado Livre que abriu.")); }, limiteMs);
    // a pessoa fechou a aba antes de terminar
    const fechada = setInterval(() => { if (aba.closed) { fim(); falha(new Error("A aba do anúncio foi fechada antes de terminar.")); } }, 1000);
  });
}

// ------------------------------------------------------------ robô da planilha pela BUSCA do site (extensão 1.1+)
/** Versão da extensão instalada ("1.1.0"), ou null. */
export function versaoExtensao(): string | null {
  return typeof document !== "undefined" ? document.documentElement.getAttribute("data-salvados-ext") : null;
}
/** A extensão sabe ler a página de busca do site (1.1.0 ou mais nova). */
export function extensaoBuscaSite(): boolean {
  const [a, b] = (versaoExtensao() ?? "0.0").split(".").map(Number);
  return a > 1 || (a === 1 && b >= 1);
}

/** Erro de quando o ML pede verificação na aba do robô: o robô para e a pessoa resolve na aba (não contornamos). */
export class VerificacaoML extends Error {}

/** "Micro-ondas MHP35S2 220V" → "micro-ondas-mhp35s2-220v" (endereço da busca do site). */
export function slugBusca(termo: string): string {
  return normalizarNome(termo).replace(/\s+/g, "-").slice(0, 120);
}

/**
 * Abre a aba do robô. Precisa ser chamada DIRETO do clique (senão o navegador bloqueia a aba nova).
 * A extensão só age em aba com esse nome.
 */
export function abrirAbaRobo(): Window | null {
  const aba = window.open("about:blank", `pdv-busca|${window.location.origin}`);
  window.focus();
  return aba;
}

/** Leva a aba do robô para a busca do termo no site e espera a extensão devolver os resultados. */
export function buscarNoSite(aba: Window, termo: string, limiteMs = 30000): Promise<Candidato[]> {
  const slug = slugBusca(termo);
  if (!slug) return Promise.resolve([]);
  return new Promise((ok, falha) => {
    const fim = () => { window.removeEventListener("message", ouvir); clearTimeout(tempo); };
    const ouvir = (e: MessageEvent) => {
      if (!/^https:\/\/([a-z0-9-]+\.)*mercadoli(vre|bre)\.com(\.br)?$/i.test(e.origin)) return;
      const m = e.data as { tipo?: string; pagina?: string; resultados?: unknown[]; erro?: string };
      if (!m || m.tipo !== "salvados-busca") return;
      // resposta de uma busca anterior (a página antiga ainda respondendo): ignora
      const pagina = decodeURIComponent(String(m.pagina ?? "")).toLowerCase();
      if (!pagina.includes(slug.slice(0, 25))) return;
      fim();
      if (m.erro === "verificacao") return falha(new VerificacaoML("O Mercado Livre pediu uma verificação na aba do robô. Resolva lá e clique em Buscar de novo."));
      const lista = Array.isArray(m.resultados) ? m.resultados : [];
      ok(lista.map((r) => r as Record<string, unknown>).filter((r) => typeof r.titulo === "string").map((r) => ({
        id: String(r.id ?? r.link ?? ""),
        tipo: "item" as const,
        titulo: String(r.titulo),
        preco: typeof r.preco === "number" ? r.preco : null,
        preco_original: typeof r.preco_original === "number" ? r.preco_original : null,
        foto: typeof r.foto === "string" ? r.foto : null,
        link: typeof r.link === "string" ? r.link : null,
        gtin: null,
        marca: typeof r.marca === "string" ? r.marca : null,
        modelo: null,
        categoria_id: null,
        similaridade: null,
      })));
    };
    window.addEventListener("message", ouvir);
    const tempo = setTimeout(() => { fim(); falha(new Error("A busca no site não respondeu a tempo.")); }, limiteMs);
    try {
      aba.location.href = `https://lista.mercadolivre.com.br/${slug}`;
    } catch {
      fim();
      falha(new Error("A aba do robô foi fechada."));
    }
  });
}

// ------------------------------------------------------------ guardar no navegador
export function listarCapturas(): CapturaML[] {
  try {
    const xs = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(xs) ? xs : [];
  } catch {
    return [];
  }
}

/** Guarda no navegador. avisar=false quando quem recebeu já vai usar (evita o "Inserir produto" usar duas vezes). */
export function guardarCaptura(c: CapturaML, avisar = true) {
  const xs = listarCapturas().filter((x) => x.link !== c.link);
  try {
    localStorage.setItem(CHAVE, JSON.stringify([c, ...xs].slice(0, MAX)));
  } catch {
    /* sem localStorage: segue só pelo aviso ao vivo */
  }
  if (!avisar) return;
  try {
    const canal = new BroadcastChannel(CANAL);
    canal.postMessage(c);
    canal.close();
  } catch {
    /* navegador sem BroadcastChannel */
  }
}

export function removerCaptura(link: string) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(listarCapturas().filter((x) => x.link !== link)));
  } catch {
    /* ignore */
  }
}

/** Escuta capturas novas enquanto a tela está aberta. Devolve a função para parar. */
export function ouvirCapturas(aoChegar: (c: CapturaML) => void): () => void {
  let canal: BroadcastChannel | null = null;
  try {
    canal = new BroadcastChannel(CANAL);
    canal.onmessage = (e) => aoChegar(e.data as CapturaML);
  } catch {
    /* sem BroadcastChannel */
  }
  // outra aba gravou no localStorage (plano B quando não há BroadcastChannel)
  const porStorage = (e: StorageEvent) => {
    if (e.key !== CHAVE || canal) return;
    const [ultima] = listarCapturas();
    if (ultima) aoChegar(ultima);
  };
  window.addEventListener("storage", porStorage);
  return () => {
    canal?.close();
    window.removeEventListener("storage", porStorage);
  };
}
