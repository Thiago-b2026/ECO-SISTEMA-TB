import { supabase } from "@/lib/supabase";

const PAGE = 1000;

/**
 * Busca TODAS as linhas, sem o limite padrão de 1000 do Supabase.
 * `build` devolve a query base (com select/filtros); a paginação usa .range().
 */
export async function fetchAllRows<T = unknown>(build: () => any): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    const chunk = (data ?? []) as T[];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

/** Variante para .in() com lotes de até 1000 IDs por chamada. */
export async function fetchAllByIds<T = unknown>(
  table: string,
  column: string,
  ids: string[],
  select = "*",
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += PAGE) {
    const slice = ids.slice(i, i + PAGE);
    const { data, error } = await supabase.from(table).select(select).in(column, slice);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}
