// Nota de semelhança entre o produto da planilha (termo) e o anúncio achado no Mercado Livre (0–100).
// A nota antiga só contava quantas palavras do termo apareciam no título, então errava em:
//  - peça/acessório do produto ("Membrana painel micro-ondas ME36B" para o termo "Micro-ondas ME36B");
//  - outro modelo da mesma família ("Micro-ondas Luoruil" para "Micro-ondas MHP35S2", só por "micro-ondas");
//  - voltagem trocada e preço muito diferente do preço da planilha.
// Regras: palavras em comum (base) + código do modelo + peça/acessório + voltagem + preço da planilha.
import { normalizarNome } from "@/lib/duplicados";

const VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "com", "para", "p", "c", "a", "o", "em", "cor", "un", "und", "unid"]);

/** Palavras que indicam peça ou acessório (e não o produto inteiro). */
const ACESSORIOS = [
  "motor", "prato", "membrana", "transformador", "placa", "painel", "resistencia", "tampa", "jarra", "copo", "refil", "filtro",
  "capa", "suporte", "peca", "pecas", "reparo", "botao", "puxador", "borracha", "vedacao", "correia", "helice", "lamina", "faca",
  "engrenagem", "acoplamento", "ventoinha", "fusivel", "termostato", "magnetron", "sensor", "adesivo", "manual", "compativel",
  "rodizio", "trava", "dobradica", "mangueira", "escova", "bocal", "saco", "coletor", "reservatorio", "cesto", "grelha", "bandeja",
  "vidro", "porta", "teclado", "chave", "interruptor", "cabo", "fonte", "carregador", "bateria", "controle", "pe", "pes",
  "capacitor", "diodo", "triac", "rele", "fusivel", "potenciometro", "chicote", "conector", "plug", "tomada",
];

const COMPACTO = (t: string) => normalizarNome(t).replace(/\s+/g, "");

/** Especificação (não é código de modelo): 1200w, 28l, 220v, 40cm, 5x, 10ml… */
const ehEspecificacao = (p: string) => /^\d+([.,]\d+)?(w|l|v|cm|mm|m|ml|g|kg|x|pol|hz|lt|litros?)$/.test(p) || /^\d+$/.test(p);

/**
 * Códigos de modelo do termo (letras + números, 4+ caracteres): "PMO30F", "MHP35S2", "L-99-FB" → ["pmo30f", "mhp35s2", "l99fb"].
 * Junta pedaços separados por hífen/barra antes de decidir ("L-99-FB" vira "l99fb").
 */
export function codigosDeModelo(termo: string): string[] {
  const bruto = termo
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/([a-z0-9])[-/.]([a-z0-9])/g, "$1$2")
    .replace(/([a-z0-9])[-/.]([a-z0-9])/g, "$1$2");
  return [...new Set(bruto.split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && /[a-z]/.test(p) && /\d/.test(p) && !ehEspecificacao(p)))];
}

const VOLT = (t: string) => {
  const n = normalizarNome(t);
  if (/\b(220|220v|bivolt)\b/.test(n) || /220 v\b/.test(n)) return n.includes("bivolt") ? "bivolt" : "220";
  if (/\b(127|110|127v|110v)\b/.test(n) || /(127|110) v\b/.test(n)) return "127";
  return null;
};

const palavras = (t: string) => normalizarNome(t).split(" ").filter((p) => p && !VAZIAS.has(p) && !/^(220|127|110)v?$/.test(p) && p !== "v" && p !== "bivolt");

export interface Analise {
  nota: number;
  motivos: string[];
}

/**
 * Nota de 0 a 100 e os motivos (para conferência).
 * precoPlanilha/precoAchado: quando os dois existem, preço muito fora (menos de 35% ou mais de 3x) derruba a nota.
 */
export function notaSemelhanca(termo: string, titulo: string, precoAchado?: number | null, precoPlanilha?: number | null): Analise {
  const motivos: string[] = [];
  const pt = [...new Set(palavras(termo))];
  if (pt.length === 0 || !titulo) return { nota: 0, motivos: ["termo vazio"] };
  const tituloNorm = normalizarNome(titulo);
  const pa = new Set(palavras(titulo));
  const compactoTitulo = COMPACTO(titulo);

  // base: palavras do termo que aparecem no título (código de modelo conta pelo título "compacto", sem hífen/espaço)
  const achadas = pt.filter((p) => pa.has(p) || (p.length >= 4 && compactoTitulo.includes(p)));
  let nota = Math.round((achadas.length / pt.length) * 100);

  // código do modelo: é o que mais identifica o produto
  const codigos = codigosDeModelo(termo);
  if (codigos.length) {
    const bate = codigos.filter((c) => compactoTitulo.includes(c));
    if (bate.length === 0) {
      nota = Math.min(nota, 35);
      motivos.push(`modelo ${codigos.join("/").toUpperCase()} não aparece no anúncio`);
    } else {
      nota = Math.min(100, nota + 10);
    }
  }

  // peça/acessório: a palavra de peça vem ANTES do nome do produto no anúncio ("Motor do liquidificador",
  // "Prato com rodízio do micro-ondas"), ou o anúncio diz "compatível". Depois do nome é componente do próprio
  // produto ("Liquidificador com jarra de vidro") e não conta.
  const termoNorm = normalizarNome(termo);
  const tokensTitulo = tituloNorm.split(" ");
  const principal = pt.find((p) => !/\d/.test(p)) ?? pt[0];
  let posPrincipal = tokensTitulo.findIndex((t) => t === principal || (principal.length >= 5 && t.startsWith(principal.slice(0, 5))));
  if (posPrincipal < 0) posPrincipal = tokensTitulo.length;
  const antes = tokensTitulo.slice(0, posPrincipal);
  const pecas = ACESSORIOS.filter((w) => antes.includes(w) && !new RegExp(`(^| )${w}( |$)`).test(termoNorm));
  if (/(^| )compativel( |$)/.test(tituloNorm) && !/(^| )compativel( |$)/.test(termoNorm)) pecas.push("compatível");
  // "X para micro-ondas" / "X p/ liquidificador": o anúncio é de algo PARA o produto
  if ((antes.includes("para") || antes.includes("p")) && !/(^| )(para|p)( |$)/.test(termoNorm)) pecas.push("para o produto");
  if (pecas.length) {
    nota = Math.min(nota - 45, 40); // peça nunca é escolhida sozinha
    motivos.push(`parece peça/acessório (${pecas.slice(0, 3).join(", ")})`);
  }

  // kit / várias unidades no anúncio ("Kit 2 ventiladores", "3 unidades") quando o termo é de um produto só
  const ehKit = (t: string) => /(^| )kit( |$)|(^| )([2-9]|1[0-9]) (unidades|unid|un|pecas|peca)( |$)|(^| )(par|dupla|combo)( |$)/.test(t);
  if (ehKit(tituloNorm) && !ehKit(termoNorm)) {
    nota = Math.min(nota - 20, 70);
    motivos.push("anúncio é kit/mais de uma unidade");
  }

  // voltagem trocada
  const vt = VOLT(termo);
  const va = VOLT(titulo);
  if (vt && va && vt !== va && va !== "bivolt") {
    nota -= 25;
    motivos.push(`voltagem diferente (${vt === "220" ? "220V" : "127V"} × ${va === "220" ? "220V" : "127V"})`);
  }

  // preço muito diferente do preço da planilha
  if (precoAchado && precoPlanilha && precoAchado > 0 && precoPlanilha > 0) {
    const r = precoAchado / precoPlanilha;
    if (r < 0.35 || r > 3) {
      nota -= 30;
      motivos.push(`preço muito diferente da planilha (${Math.round(r * 100)}%)`);
    }
  }

  return { nota: Math.max(0, Math.min(100, nota)), motivos };
}

/** Situação do item pela nota: sucesso (≥ mínimo do lote), similar (≥ 50) ou não encontrado (abaixo de 50: não escolhe sozinho). */
export function situacaoPelaNota(nota: number, minimo: number): "sucesso" | "similar" | "nao_encontrado" {
  if (nota >= minimo) return "sucesso";
  if (nota >= 50) return "similar";
  return "nao_encontrado";
}

/** Linha de planilha que não é produto: subtotal, total, cabeçalho repetido. */
export function linhaNaoEhProduto(nome: string): boolean {
  const n = normalizarNome(nome);
  if (!n) return true;
  if (/^(sub ?total|total|totais|soma|resumo)( |$)/.test(n)) return true;
  if (/^(produto|produtos|descricao|item|nome do produto)$/.test(n)) return true;
  // só número (geralmente coluna errada: preço ou quantidade no lugar do nome)
  if (/^[\d ]+$/.test(n)) return true;
  return false;
}
