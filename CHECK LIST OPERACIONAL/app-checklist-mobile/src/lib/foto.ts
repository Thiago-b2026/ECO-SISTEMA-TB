// Foto da câmera: valida tipo/tamanho, reduz (máx. 1600 px), comprime em JPEG e carimba data, hora e GPS (regra I).
import { dataHoraSP } from "../domain/tempo";

export const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const LIMITE_ENTRADA = 25 * 1024 * 1024; // arquivo da câmera
export const LIMITE_ENVIO = 5 * 1024 * 1024; // depois de comprimir (igual ao bucket)
export const LADO_MAXIMO = 1600;

/** Recusa o que não é imagem ou é grande demais. Devolve a mensagem de erro, ou null. */
export function validarArquivo(f: { type: string; size: number }): string | null {
  if (!f.type.startsWith("image/") || (f.type && !TIPOS_ACEITOS.includes(f.type))) return "Arquivo não é uma foto (use JPEG, PNG ou WebP).";
  if (f.size <= 0) return "A foto veio vazia. Tente de novo.";
  if (f.size > LIMITE_ENTRADA) return "Foto grande demais (máx. 25 MB).";
  return null;
}

/** Novo tamanho mantendo a proporção, com o maior lado ≤ max. */
export function reduzir(w: number, h: number, max = LADO_MAXIMO): { w: number; h: number } {
  const maior = Math.max(w, h);
  if (maior <= max) return { w, h };
  const k = max / maior;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export function legendaFoto(tiradaEm: string, pos: { lat: number; lng: number; precisao_m: number } | null, extra?: string) {
  const local = pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} (±${pos.precisao_m} m)` : "sem localização";
  return [`${dataHoraSP(tiradaEm)} · ${local}`, extra].filter(Boolean).join(" · ");
}

async function carregar(arquivo: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; fechar: () => void }> {
  if (typeof createImageBitmap === "function") {
    const b = await createImageBitmap(arquivo, { imageOrientation: "from-image" } as ImageBitmapOptions);
    return { img: b, w: b.width, h: b.height, fechar: () => b.close() };
  }
  const url = URL.createObjectURL(arquivo);
  const img = new Image();
  await new Promise<void>((ok, erro) => { img.onload = () => ok(); img.onerror = () => erro(new Error("Não foi possível abrir a foto.")); img.src = url; });
  return { img, w: img.naturalWidth, h: img.naturalHeight, fechar: () => URL.revokeObjectURL(url) };
}

/** Processa a foto: reduz, carimba a legenda e comprime. */
export async function processarFoto(arquivo: File | Blob, legenda: string): Promise<Blob> {
  const erro = validarArquivo({ type: arquivo.type || "image/jpeg", size: arquivo.size });
  if (erro) throw new Error(erro);
  const { img, w, h, fechar } = await carregar(arquivo);
  try {
    const t = reduzir(w, h);
    const c = document.createElement("canvas");
    c.width = t.w;
    c.height = t.h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, t.w, t.h);
    // carimbo: faixa escura com o texto, legível em qualquer foto
    const fonte = Math.max(14, Math.round(t.w / 45));
    ctx.font = `bold ${fonte}px system-ui, sans-serif`;
    const faixa = fonte * 2;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, t.h - faixa, t.w, faixa);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(legenda, fonte * 0.6, t.h - faixa / 2, t.w - fonte * 1.2);
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", q));
      if (b && b.size <= LIMITE_ENVIO) return b;
    }
    throw new Error("Não foi possível reduzir a foto para menos de 5 MB.");
  } finally {
    fechar();
  }
}
