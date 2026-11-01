// Acesso a dados de lotes/itens e o "robô" que processa a fila de busca no ML.
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  ARREDONDAMENTO_PADRAO,
  classificar,
  custoPercentual,
  precoSugerido,
  type ConfigArredondamento,
} from "@/lib/precificacao";

export type LoteTipo = "manual" | "planilha";
export type LoteStatus = "em_criacao" | "disponivel" | "vendido";
export type ItemStatus = "pendente" | "sucesso" | "similar" | "nao_encontrado" | "aprovado" | "erro";
export type Ocorrencia = "nao_chegou" | "avaria_total" | "avaria_parcial";

export const STATUS_LOTE_LABEL: Record<LoteStatus, string> = {
  em_criacao: "Em criação",
  disponivel: "Disponível",
  vendido: "Vendido",
};
export const STATUS_ITEM_LABEL: Record<ItemStatus, string> = {
  pendente: "Na fila",
  sucesso: "Sucesso",
  similar: "Similar",
  nao_encontrado: "Não encontrado",
  aprovado: "Aprovado",
  erro: "Erro",
};
export const OCORRENCIA_LABEL: Record<Ocorrencia, string> = {
  nao_chegou: "Não chegou",
  avaria_total: "Avaria total",
  avaria_parcial: "Avaria parcial",
};

export interface Lote {
  id: string;
  loja_id: string;
  nome: string;
  observacao: string | null;
  tipo: LoteTipo;
  status: LoteStatus;
  rateio: "percentual" | "valor_pago";
  perc_custo: number;
  perc_desconto: number;
  valor_pago: number | null;
  similaridade_min: number;
  arquivo_nome: string | null;
  created_at: string;
}

export interface LoteResumo extends Lote {
  loja_nome: string;
  total_itens: number;
  produtos_unicos: number;
  categorias: number;
  qtd_pallets: number;
  valor_venda: number;
  valor_custo: number;
  qtd_pendente: number;
  qtd_sucesso: number;
  qtd_similar: number;
  qtd_nao_encontrado: number;
  qtd_aprovado: number;
}

export interface Candidato {
  id: string;
  tipo: "produto" | "item";
  titulo: string;
  preco: number | null;
  preco_original: number | null;
  foto: string | null;
  link: string | null;
  gtin: string | null;
  marca: string | null;
  modelo: string | null;
  categoria_id: string | null;
  similaridade: number | null;
}

export interface Item {
  id: string;
  lote_id: string;
  pallet_id: string | null;
  sku: string;
  origem: "busca" | "manual" | "planilha";
  status: ItemStatus;
  termo: string | null;
  codigo_barras: string | null;
  titulo: string;
  categoria: string | null;
  marca: string | null;
  grade: string;
  quantidade: number;
  ml_id: string | null;
  ml_link: string | null;
  foto_url: string | null;
  preco_ml: number | null;
  preco_ml_original: number | null;
  valor_planilha: number | null;
  preco_venda: number | null;
  custo_unit: number | null;
  similaridade: number | null;
  candidatos: Candidato[] | null;
  ocorrencia: Ocorrencia | null;
  operador_id: string | null;
  origem_item_id: string | null;
  tipo_derivado: "desmembrado" | "avaria_parcial" | null;
  created_at: string;
}

export interface Pallet {
  id: string;
  lote_id: string;
  codigo: string;
}

// ------------------------------------------------------------ leitura
/** filtroLoja null = todas as lojas que o usuário pode ver */
export async function listarLotes(filtroLoja: string | null): Promise<LoteResumo[]> {
  return fetchAllRows<LoteResumo>(() => {
    let q = supabase.from("lotes_resumo").select("*").order("created_at", { ascending: false });
    if (filtroLoja) q = q.eq("loja_id", filtroLoja);
    return q;
  });
}

export async function carregarLote(id: string) {
  const [{ data: lote, error }, itens, { data: pallets }] = await Promise.all([
    supabase.from("lotes").select("*").eq("id", id).single(),
    fetchAllRows<Item>(() => supabase.from("lote_itens").select("*").eq("lote_id", id).order("created_at", { ascending: false })),
    supabase.from("pallets").select("*").eq("lote_id", id).order("codigo"),
  ]);
  if (error) throw error;
  return { lote: lote as Lote, itens, pallets: (pallets ?? []) as Pallet[] };
}

export async function carregarConfig(): Promise<ConfigArredondamento> {
  const { data } = await supabase.from("config_precificacao").select("arredondamento").eq("id", 1).maybeSingle();
  return { ...ARREDONDAMENTO_PADRAO, ...((data?.arredondamento as Partial<ConfigArredondamento>) ?? {}) };
}

// ------------------------------------------------------------ busca no ML
export type TipoBusca = "ean" | "nome" | "link";

export async function buscarML(tipo: TipoBusca, valor: string, limite = 3): Promise<Candidato[]> {
  const { data, error } = await supabase.functions.invoke("ml-buscar", { body: { tipo, valor, limite } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    const e = new Error(body?.erro ?? error.message) as Error & { status?: number };
    e.status = ctx?.status;
    throw e;
  }
  return (data?.candidatos ?? []) as Candidato[];
}

/** Campos do item calculados a partir do candidato escolhido e da regra do lote. */
export function camposDoCandidato(c: Candidato, lote: Lote, cfg: ConfigArredondamento, valorPlanilha?: number | null) {
  const precoRef = valorPlanilha ?? c.preco;
  return {
    ml_id: c.id,
    ml_tipo: c.tipo,
    ml_link: c.link,
    foto_url: c.foto,
    titulo: c.titulo,
    marca: c.marca,
    categoria: c.categoria_id,
    codigo_barras: c.gtin ?? undefined,
    preco_ml: c.preco,
    preco_ml_original: c.preco_original,
    similaridade: c.similaridade,
    preco_venda: precoSugerido(c.preco, lote.perc_desconto, cfg),
    custo_unit: lote.rateio === "percentual" ? custoPercentual(precoRef, lote.perc_custo) : undefined,
  };
}

// ------------------------------------------------------------ robô da planilha
/**
 * Processa os itens "pendente" do lote buscando cada um no ML pelo nome.
 * Roda no navegador enquanto a tela estiver aberta, 1 item por vez,
 * esperando quando o ML pede (erro 429).
 */
export async function processarFila(
  lote: Lote,
  cfg: ConfigArredondamento,
  aoProgredir: (feitos: number, total: number) => void,
  parar: () => boolean,
): Promise<{ feitos: number; erros: number }> {
  const pendentes = await fetchAllRows<Item>(() =>
    supabase.from("lote_itens").select("*").eq("lote_id", lote.id).eq("status", "pendente").order("created_at"),
  );
  let feitos = 0;
  let erros = 0;
  aoProgredir(0, pendentes.length);
  for (const item of pendentes) {
    if (parar()) break;
    const termo = item.termo ?? item.titulo;
    let patch: Record<string, unknown>;
    try {
      const tipo: TipoBusca = item.codigo_barras && /^\d{8,14}$/.test(item.codigo_barras) ? "ean" : "nome";
      const cands = await buscarComEspera(tipo, tipo === "ean" ? item.codigo_barras! : termo);
      if (cands.length === 0) {
        patch = { status: "nao_encontrado", candidatos: [] };
      } else {
        const melhor = cands[0];
        const sim = tipo === "ean" ? 100 : melhor.similaridade;
        const status = classificar(sim, lote.similaridade_min);
        patch = {
          ...camposDoCandidato({ ...melhor, similaridade: sim }, lote, cfg, item.valor_planilha),
          titulo: melhor.titulo,
          status,
          candidatos: cands,
        };
      }
    } catch {
      erros++;
      patch = { status: "erro" };
    }
    await supabase.from("lote_itens").update(limpar(patch)).eq("id", item.id);
    feitos++;
    aoProgredir(feitos, pendentes.length);
  }
  return { feitos, erros };
}

async function buscarComEspera(tipo: TipoBusca, valor: string): Promise<Candidato[]> {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      return await buscarML(tipo, valor, 3);
    } catch (e) {
      if ((e as { status?: number }).status === 429) {
        await new Promise((ok) => setTimeout(ok, 3000 * (tentativa + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Mercado Livre ocupado");
}

/** Remove chaves undefined (para não sobrescrever com null sem querer). */
export function limpar<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
