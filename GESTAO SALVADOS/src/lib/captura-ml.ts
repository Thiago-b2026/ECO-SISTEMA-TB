// Captura de anúncio do Mercado Livre pelo NAVEGADOR do usuário (botão "Enviar para o PDV", um favorito do navegador).
//
// Por quê: a API oficial do ML nega (403) a leitura de anúncios de outros vendedores fora do catálogo, e a página
// do anúncio aberta pelo servidor cai na verificação de robô. Já na tela do usuário a página abre normal.
// O botão lê o que está NA TELA (dados estruturados da própria página: nome, preço, preço anterior, foto, marca)
// e abre o PDV em /capturar com esses dados no "#" do endereço (o "#" não vai para servidor nenhum).
// A página /capturar guarda no navegador (localStorage) e avisa o "Inserir produto" aberto (BroadcastChannel).
import type { Candidato } from "@/lib/lotes";

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

/** Código do botão (favorito). Roda na página do anúncio, no navegador do usuário. Sem dependências. */
export function codigoDoBotao(origemPdv: string): string {
  const js = `(function(P){try{
if(!/mercadoli(vre|bre)\\./.test(location.hostname)){alert('Abra a página de um anúncio do Mercado Livre e clique de novo em "Enviar para o PDV".');return}
var ld=null;document.querySelectorAll('script[type="application/ld+json"]').forEach(function(s){try{var j=JSON.parse(s.textContent);(Array.isArray(j)?j:[j]).forEach(function(x){if(x&&x['@type']==='Product'&&!ld)ld=x})}catch(e){}});
var m=function(n){var e=document.querySelector('meta[property="'+n+'"],meta[name="'+n+'"],meta[itemprop="'+n+'"]');return e?e.content:null};
var num=function(t){if(t==null||t==='')return null;if(typeof t==='number')return t;var r=String(t).match(/(\\d[\\d.]*)\\s*reais(?:\\s*com\\s*(\\d+)\\s*centavos?)?/);if(r)return Number(r[1].replace(/\\./g,''))+(r[2]?Number(r[2])/100:0);var n=Number(String(t).replace(',','.'));return isFinite(n)?n:null};
var o=ld&&ld.offers?(Array.isArray(ld.offers)?ld.offers[0]:ld.offers):{};
var ant=document.querySelector('.ui-pdp-price__original-value, s.andes-money-amount');
var h1=document.querySelector('h1');
var img=ld&&ld.image?(Array.isArray(ld.image)?ld.image[0]:ld.image):m('og:image');
var bc=[].slice.call(document.querySelectorAll('.andes-breadcrumb__item a')).map(function(a){return a.textContent.trim()}).filter(Boolean);
var u=location.href;var w=(u.match(/item_id(?:%3A|:|=)(MLB-?\\d+)/i)||u.match(/\\/(MLB-\\d{6,})/i)||u.match(/\\/p\\/(MLB\\d+)/i)||[])[1];
var d={titulo:(ld&&ld.name)||(h1&&h1.textContent.trim())||m('og:title'),preco:num(o&&o.price!=null?o.price:m('price')),preco_original:num(ant&&ant.getAttribute('aria-label')),foto:img||null,link:u.split('#')[0],id:w?w.replace('-','').toUpperCase():((ld&&ld.sku)||null),marca:ld&&ld.brand?(ld.brand.name||ld.brand):null,gtin:ld?(ld.gtin13||ld.gtin||ld.gtin8||ld.gtin12||null):null,categoria:bc.length?bc[bc.length-1]:null};
if(!d.titulo){alert('Não achei o produto nesta página. Abra a página do anúncio (não a lista de busca).');return}
window.open(P+'/capturar#'+encodeURIComponent(JSON.stringify(d)),'pdv_captura');
}catch(e){alert('Não foi possível capturar: '+e.message)}})(${JSON.stringify(origemPdv)})`;
  return "javascript:" + js.replace(/\n/g, "");
}

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
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(decodeURIComponent(bruto));
  } catch {
    return null;
  }
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

// ------------------------------------------------------------ guardar no navegador
export function listarCapturas(): CapturaML[] {
  try {
    const xs = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(xs) ? xs : [];
  } catch {
    return [];
  }
}

export function guardarCaptura(c: CapturaML) {
  const xs = listarCapturas().filter((x) => x.link !== c.link);
  try {
    localStorage.setItem(CHAVE, JSON.stringify([c, ...xs].slice(0, MAX)));
  } catch {
    /* sem localStorage: segue só pelo aviso ao vivo */
  }
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
