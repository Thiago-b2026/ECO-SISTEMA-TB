// Código de barras Code 128 (conjunto B) gerado em SVG, sem biblioteca externa.
// Lido por qualquer leitor de código de barras comum. Usado nas etiquetas.

// Larguras (barra, espaço, barra, espaço, barra, espaço) de cada símbolo 0–105; 106 = STOP.
const PADROES = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const START_B = 104;
const STOP = 106;

export const PADROES_CODE128 = PADROES;

/** Valores Code128-B (com início, dígito verificador e fim). */
export function codificar128B(texto: string): number[] {
  const valores = [START_B];
  for (const ch of texto) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 127) throw new Error(`Caractere não suportado no código de barras: "${ch}"`);
    valores.push(c - 32);
  }
  let soma = START_B;
  for (let i = 1; i < valores.length; i++) soma += valores[i] * i;
  valores.push(soma % 103, STOP);
  return valores;
}

/** Larguras alternadas barra/espaço (em módulos), com zona de silêncio de 10 módulos. */
export function larguras128(texto: string): number[] {
  return codificar128B(texto).flatMap((v) => PADROES[v].split("").map(Number));
}

/** SVG pronto para colocar na etiqueta. `largura`/`altura` em unidades do SVG (escala livre). */
export function code128Svg(texto: string, opts: { altura?: number; modulo?: number; silencio?: number } = {}): string {
  const modulo = opts.modulo ?? 2;
  const altura = opts.altura ?? 60;
  const silencio = (opts.silencio ?? 10) * modulo;
  const ls = larguras128(texto);
  let x = silencio;
  const barras: string[] = [];
  ls.forEach((w, i) => {
    if (i % 2 === 0) barras.push(`<rect x="${x}" y="0" width="${w * modulo}" height="${altura}"/>`);
    x += w * modulo;
  });
  const total = x + silencio;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${altura}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${total}" height="${altura}" fill="#fff"/><g fill="#000">${barras.join("")}</g></svg>`;
}
