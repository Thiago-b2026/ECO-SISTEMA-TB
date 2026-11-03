// Leitor simples de planilhas, sem biblioteca externa.
// - .xlsx: é um ZIP com XML dentro. Abrimos o ZIP com DecompressionStream
//   (nativo do navegador) e lemos a 1ª aba.
// - .csv: separador ; ou , (detectado).
// O formato antigo .xls (binário) não é suportado: salve como .xlsx no Excel.

export type Linha = (string | number | null)[];

export async function lerPlanilha(arquivo: File): Promise<Linha[]> {
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith(".csv")) return lerCsv(await arquivo.text());
  if (nome.endsWith(".xlsx")) return lerXlsx(new Uint8Array(await arquivo.arrayBuffer()));
  if (nome.endsWith(".xls")) {
    throw new Error('Arquivo .xls antigo não é aceito. Abra no Excel e use "Salvar como" → Pasta de Trabalho do Excel (.xlsx).');
  }
  throw new Error("Envie um arquivo .xlsx ou .csv.");
}

// ---------------------------------------------------------------- CSV
export function lerCsv(texto: string): Linha[] {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linhas.length === 0) return [];
  const sep = (linhas[0].match(/;/g)?.length ?? 0) >= (linhas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  return linhas.map((l) => dividirCsv(l, sep));
}

function dividirCsv(linha: string, sep: string): Linha {
  const out: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (ch === sep && !aspas) {
      out.push(atual);
      atual = "";
    } else atual += ch;
  }
  out.push(atual);
  return out.map((c) => c.trim());
}

// ---------------------------------------------------------------- ZIP
interface EntradaZip {
  nome: string;
  metodo: number;
  tamanhoComprimido: number;
  inicioLocal: number;
}

function listarZip(buf: Uint8Array): EntradaZip[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // fim do diretório central: assinatura 0x06054b50, procurada de trás para frente
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Arquivo .xlsx inválido ou corrompido.");
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entradas: EntradaZip[] = [];
  const dec = new TextDecoder();
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true);
    const tamanhoComprimido = dv.getUint32(p + 20, true);
    const lenNome = dv.getUint16(p + 28, true);
    const lenExtra = dv.getUint16(p + 30, true);
    const lenComent = dv.getUint16(p + 32, true);
    const inicioLocal = dv.getUint32(p + 42, true);
    const nome = dec.decode(buf.subarray(p + 46, p + 46 + lenNome));
    entradas.push({ nome, metodo, tamanhoComprimido, inicioLocal });
    p += 46 + lenNome + lenExtra + lenComent;
  }
  return entradas;
}

async function extrair(buf: Uint8Array, e: EntradaZip): Promise<string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const p = e.inicioLocal;
  const ini = p + 30 + dv.getUint16(p + 26, true) + dv.getUint16(p + 28, true);
  const dados = buf.slice(ini, ini + e.tamanhoComprimido);
  if (e.metodo === 0) return new TextDecoder().decode(dados);
  if (e.metodo !== 8) throw new Error("Compressão do .xlsx não suportada.");
  const stream = new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

// ---------------------------------------------------------------- XLSX
async function lerXlsx(buf: Uint8Array): Promise<Linha[]> {
  const entradas = listarZip(buf);
  const achar = (nome: string) => entradas.find((e) => e.nome === nome);
  const parser = new DOMParser();
  const xml = async (nome: string) => {
    const e = achar(nome);
    return e ? parser.parseFromString(await extrair(buf, e), "application/xml") : null;
  };

  // textos compartilhados
  const shared: string[] = [];
  const ss = await xml("xl/sharedStrings.xml");
  ss?.querySelectorAll("si").forEach((si) => {
    shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
  });

  // 1ª aba (pela ordem do workbook)
  let caminho = "xl/worksheets/sheet1.xml";
  const wb = await xml("xl/workbook.xml");
  const rels = await xml("xl/_rels/workbook.xml.rels");
  const primeira = wb?.getElementsByTagName("sheet")[0];
  const rid = primeira?.getAttribute("r:id") ?? primeira?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  if (rid && rels) {
    const rel = Array.from(rels.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === rid);
    const alvo = rel?.getAttribute("Target");
    if (alvo) caminho = alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, "")}`;
  }
  const aba = await xml(caminho);
  if (!aba) throw new Error("Não encontrei a primeira aba da planilha.");

  const linhas: Linha[] = [];
  for (const row of Array.from(aba.getElementsByTagName("row"))) {
    const r = Number(row.getAttribute("r")) - 1;
    const linha: Linha = [];
    for (const c of Array.from(row.getElementsByTagName("c"))) {
      const ref = c.getAttribute("r") ?? "";
      const col = colunaDaRef(ref);
      const tipo = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? null;
      let valor: string | number | null = null;
      if (tipo === "s" && v != null) valor = shared[Number(v)] ?? "";
      else if (tipo === "inlineStr") valor = Array.from(c.getElementsByTagName("t")).map((t) => t.textContent ?? "").join("");
      else if (tipo === "str" || tipo === "b" || tipo === "e") valor = v;
      else if (v != null) valor = Number.isFinite(Number(v)) ? Number(v) : v;
      if (col >= 0) linha[col] = valor;
    }
    for (let i = 0; i < linha.length; i++) if (linha[i] === undefined) linha[i] = null;
    linhas[r >= 0 ? r : linhas.length] = linha;
  }
  return Array.from(linhas, (l) => l ?? []);
}

function colunaDaRef(ref: string): number {
  const letras = ref.match(/^[A-Z]+/)?.[0] ?? "";
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
