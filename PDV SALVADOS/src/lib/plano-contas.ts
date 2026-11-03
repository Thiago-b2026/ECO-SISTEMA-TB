// Regras do plano de contas (códigos em níveis: 3 · 3.1 · 3.1.01).

export interface ContaPlano {
  id: string;
  codigo: string;
  nome: string;
  tipo: "receita" | "despesa";
  pai_id: string | null;
  ativo: boolean;
}

/** Ordena "3.1.10" depois de "3.1.9" (compara número a número). */
export function compararCodigo(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
  }
  return 0;
}

/** Próximo código filho: nível 1 → 5; 3 → 3.4; 3.1 → 3.1.04 (2 dígitos a partir do 3º nível). */
export function proximoCodigo(pai: Pick<ContaPlano, "id" | "codigo"> | null, todas: Pick<ContaPlano, "codigo" | "pai_id">[]): string {
  const filhos = todas.filter((c) => c.pai_id === (pai?.id ?? null)).map((c) => Number(c.codigo.split(".").pop()));
  const n = (filhos.length ? Math.max(...filhos) : 0) + 1;
  if (!pai) return String(n);
  const nivelFilho = pai.codigo.split(".").length + 1;
  return `${pai.codigo}.${nivelFilho >= 3 ? String(n).padStart(2, "0") : n}`;
}
