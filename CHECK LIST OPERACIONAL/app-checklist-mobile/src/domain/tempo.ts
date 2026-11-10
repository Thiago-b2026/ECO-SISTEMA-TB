// Datas: gravadas em UTC (ISO / timestamptz), exibidas em America/Sao_Paulo (regra I).
export const FUSO = "America/Sao_Paulo";

const formatador = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

const partes = (d: Date) => {
  const f = formatador.formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)!.value;
  return { ano: g("year"), mes: g("month"), dia: g("day"), hora: g("hour") === "24" ? "00" : g("hour"), min: g("minute"), seg: g("second") };
};

const comoData = (iso: string | Date) => (typeof iso === "string" ? new Date(iso) : iso);

/** "YYYY-MM-DD" da data em São Paulo. */
export function dataSP(iso: string | Date = new Date()): string {
  const p = partes(comoData(iso));
  return `${p.ano}-${p.mes}-${p.dia}`;
}

/** "HH:MM" em São Paulo. */
export function horaSP(iso: string | Date): string {
  const p = partes(comoData(iso));
  return `${p.hora}:${p.min}`;
}

/** "10/11/2026 14:05" em São Paulo. */
export function dataHoraSP(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const p = partes(comoData(iso));
  return `${p.dia}/${p.mes}/${p.ano} ${p.hora}:${p.min}`;
}

export function dataBR(data: string): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

/** Diferença (ms) entre o relógio de SP e o UTC num instante. */
function deslocamentoSP(instante: Date): number {
  const p = partes(instante);
  const comoUtc = Date.UTC(+p.ano, +p.mes - 1, +p.dia, +p.hora, +p.min, +p.seg);
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/** Instante UTC (ISO) de uma data + hora locais de São Paulo. */
export function instanteSP(data: string, hora: string): string {
  const [a, m, d] = data.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  const palpite = new Date(Date.UTC(a, m - 1, d, h, mi));
  return new Date(palpite.getTime() - deslocamentoSP(palpite)).toISOString();
}

/** Dia da semana (0=domingo) de uma data "YYYY-MM-DD". */
export function diaSemana(data: string): number {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function somarDias(data: string, n: number): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

export function ultimoDiaDoMes(data: string): string {
  const [a, m] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

export const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** "1h 05min" / "12min" / "40s" */
export function duracao(seg: number | null | undefined): string {
  if (seg == null || !Number.isFinite(seg)) return "—";
  const s = Math.max(0, Math.round(seg));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
}

export const segundosEntre = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
