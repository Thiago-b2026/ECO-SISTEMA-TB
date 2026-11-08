export type Papel = "owner" | "admin" | "operador";
export type Aba = "provisao" | "realizado";

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string | null;
  pct_extras: number;
  meta_otimo: number;
  meta_alerta: number;
}

export interface Loja {
  id: string;
  empresa_id: string;
  codigo: string;
  nome: string;
  ordem: number;
  /** Flag do cadastro: false = fora dos resultados (Painel e Visão Global); o histórico fica guardado. */
  mostrar?: boolean;
  unidade_id?: string | null;
}

export interface EmpresaComPapel extends Empresa {
  papel: Papel;
}

export interface RhRow {
  empresa_id: string;
  tab: Aba;
  ano: number;
  mes: number;
  data: unknown;
  updated_by: string | null;
  updated_at: string;
}

export const PAPEL_LABEL: Record<Papel, string> = {
  owner: "Dono",
  admin: "Admin",
  operador: "Operador",
};
