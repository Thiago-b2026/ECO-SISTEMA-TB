// Localização do aparelho. Nunca trava o uso: sem permissão ou sem sinal, devolve null (e o app avisa).
export interface Posicao {
  lat: number;
  lng: number;
  precisao_m: number;
}

let ultima: { pos: Posicao; em: number } | null = null;

export function obterPosicao(timeoutMs = 8000): Promise<Posicao | null> {
  // reaproveita a última leitura de até 2 minutos (economiza bateria e tempo)
  if (ultima && Date.now() - ultima.em < 120000) return Promise.resolve(ultima.pos);
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, precisao_m: Math.round(p.coords.accuracy) };
        ultima = { pos, em: Date.now() };
        resolve(pos);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}

export const textoPosicao = (lat?: number | null, lng?: number | null) =>
  lat == null || lng == null ? "sem localização" : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
