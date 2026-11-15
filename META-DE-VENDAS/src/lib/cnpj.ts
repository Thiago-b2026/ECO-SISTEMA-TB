// CNPJ: só dígitos no banco (public.lojas.cnpj, 14 dígitos). Final /0001 = matriz; outro final = filial.
export const soDigitos = (s: string) => s.replace(/\D/g, "");

export function formatarCnpj(s: string | null | undefined): string {
  const d = soDigitos(s ?? "").slice(0, 14);
  if (d.length !== 14) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Confere os dois dígitos verificadores. */
export function cnpjValido(s: string): boolean {
  const d = soDigitos(s);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split("").reduce((t, c, i) => t + Number(c) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(d.slice(0, 12));
  const d2 = dv(d.slice(0, 12) + d1);
  return d.endsWith(`${d1}${d2}`);
}

export function tipoPeloCnpj(s: string | null | undefined): "matriz" | "filial" | null {
  const d = soDigitos(s ?? "");
  return d.length === 14 ? (d.slice(8, 12) === "0001" ? "matriz" : "filial") : null;
}
