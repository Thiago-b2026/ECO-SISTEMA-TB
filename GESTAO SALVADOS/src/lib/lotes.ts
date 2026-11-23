// Acesso a dados de lotes/itens e o "robô" que processa a fila de busca no ML.
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetch-all";
import { codigosDeModelo, notaSemelhanca, situacaoPelaNota } from "@/lib/similaridade";
import { buscarNoSite, VerificacaoML } from "@/lib/captura-ml";
import {
  ARREDONDAMENTO_PADRAO,
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

/**
 * Exclui o lote (itens e pallets saem junto, por cascade). Usado na lista (menu ⋮) e dentro do lote.
 * Não exclui se o lote já lançou produtos no estoque (senão sumiriam estoque e vendas ligados a ele).
 * Pede confirmação; devolve true se excluiu.
 */
export async function excluirLoteConfirmando(lote: { id: string; nome: string }, totalItens: number): Promise<boolean> {
  const [{ count, error: e1 }, { count: somados }] = await Promise.all([
    supabase.from("produtos").select("id", { count: "exact", head: true }).eq("lote_id", lote.id),
    // itens somados a produtos que já existiam (não criam produto com lote_id, mas já mexeram no estoque)
    supabase.from("lote_itens").select("id", { count: "exact", head: true }).eq("lote_id", lote.id).not("lancado_produto_id", "is", null),
  ]);
  if (e1) throw new Error(e1.message);
  const lancados = Math.max(count ?? 0, somados ?? 0);
  if (lancados) throw new Error(`O lote "${lote.nome}" já tem ${lancados} produtos lançados no estoque e não pode ser excluído.`);
  if (!window.confirm(`EXCLUIR o lote "${lote.nome}" e seus ${totalItens} itens? Não dá para desfazer.`)) return false;
  const { error, count: apagados } = await supabase.from("lotes").delete({ count: "exact" }).eq("id", lote.id);
  if (error) throw new Error(error.message);
  if (!apagados) throw new Error("Sem permissão para excluir este lote (só administrador ou gerente).");
  return true;
}

export async function carregarLote(id: string) {
  const [{ data: lote, error }, itens, { data: pallets }] = await Promise.all([
    // maybeSingle: lote excluído (ou de loja sem acesso) volta vazio, sem erro técnico
    supabase.from("lotes").select("*").eq("id", id).maybeSingle(),
    fetchAllRows<Item>(() => supabase.from("lote_itens").select("*").eq("lote_id", id).order("created_at", { ascending: false })),
    supabase.from("pallets").select("*").eq("lote_id", id).order("codigo"),
  ]);
  if (error) throw error;
  return { lote: (lote as Lote | null) ?? null, itens, pallets: (pallets ?? []) as Pallet[] };
}

export async function carregarConfig(): Promise<ConfigArredondamento> {
  const { data } = await supabase.from("config_precificacao").select("arredondamento").eq("id", 1).maybeSingle();
  return { ...ARREDONDAMENTO_PADRAO, ...((data?.arredondamento as Partial<ConfigArredondamento>) ?? {}) };
}

// ------------------------------------------------------------ busca no ML
/** O Mercado Livre responde em inglês; traduz os casos de bloqueio. */
export function traduzirErroML(msg: string): string {
  if (/forbidden|unauthorized|policies|invalid access token|invalid_token/i.test(msg)) {
    return "O Mercado Livre recusou a busca (acesso negado). Peça ao administrador para reconectar a conta em Lotes → Configuração Mercado Livre. Enquanto isso, use \"Inserir sem buscar\".";
  }
  return msg;
}
export type TipoBusca = "ean" | "nome" | "link";

export async function buscarML(tipo: TipoBusca, valor: string, limite = 3): Promise<Candidato[]> {
  return (await buscarMLComAviso(tipo, valor, limite)).candidatos;
}

/** Igual a buscarML, mais o aviso quando o resultado não é o anúncio exato (link bloqueado pelo ML → parecidos pelo nome). */
export async function buscarMLComAviso(tipo: TipoBusca, valor: string, limite = 3): Promise<{ candidatos: Candidato[]; aviso: string | null }> {
  const { data, error } = await supabase.functions.invoke("ml-buscar", { body: { tipo, valor, limite } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    if (body?.detalhe) console.warn("Mercado Livre:", body.detalhe);
    if (body?.tentativas?.length) console.info("Mercado Livre (tentativas):", body.tentativas.join(" | "));
    const e = new Error(traduzirErroML(body?.erro ?? error.message)) as Error & { status?: number };
    e.status = ctx?.status;
    throw e;
  }
  if (data?.tentativas?.length) console.info(`Mercado Livre "${valor}" (tentativas):`, data.tentativas.join(" | "));
  return { candidatos: (data?.candidatos ?? []) as Candidato[], aviso: (data?.aviso as string | null) ?? null };
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
  /** Aba do robô (extensão 1.1+): busca na página de BUSCA do site, como o robô do PrecificaLote. Sem ela: catálogo (API). */
  abaSite: Window | null = null,
): Promise<{ feitos: number; erros: number; aviso?: string; viaSite: number }> {
  let viaSite = 0;
  // site primeiro (anúncios de fora do catálogo também); falhou ou veio vazio → catálogo
  const buscar = async (tipo: TipoBusca, valor: string): Promise<Candidato[]> => {
    if (tipo === "nome" && abaSite && !abaSite.closed) {
      // Depois de muitas buscas seguidas o ML faz uma checagem automática que se resolve sozinha:
      // espera 30 s e tenta de novo (até 2 vezes). Não contorna nada; se continuar, para e a pessoa resolve na aba.
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        try {
          const r = await buscarNoSite(abaSite, valor);
          await new Promise((ok) => setTimeout(ok, 2500)); // ritmo calmo entre buscas
          if (r.length) { viaSite++; return r; }
          break;
        } catch (e) {
          if (!(e instanceof VerificacaoML)) break;
          if (tentativa === 2) throw e;
          await new Promise((ok) => setTimeout(ok, 30000));
        }
      }
    }
    return buscarComEspera(tipo, valor);
  };
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
      let cands = await buscar(tipo, tipo === "ean" ? item.codigo_barras! : termo);
      // nota nova (modelo, peça/acessório, voltagem, preço da planilha) e escolhe o MELHOR, não o primeiro
      const notar = (cs: Candidato[]) =>
        cs.map((c) => ({ ...c, similaridade: tipo === "ean" ? 100 : notaSemelhanca(termo, c.titulo, c.preco, item.valor_planilha).nota }))
          .sort((a, b) => (b.similaridade ?? 0) - (a.similaridade ?? 0));
      cands = notar(cands);
      // fraco e o termo tem código de modelo: tenta de novo pelo nome do produto + código (ex.: "Micro-ondas MHP35S2" → "micro ondas mhp35s2")
      const codigos = tipo === "nome" ? codigosDeModelo(termo) : [];
      if (codigos.length && (cands[0]?.similaridade ?? 0) < lote.similaridade_min) {
        try {
          const principal = termo.split(/\s+/).find((w) => !/\d/.test(w)) ?? "";
          const extra = notar(await buscar("nome", `${principal} ${codigos[0]}`.trim()));
          const vistos = new Set(cands.map((c) => c.id));
          cands = notar([...cands, ...extra.filter((c) => !vistos.has(c.id))]);
        } catch {
          /* segunda tentativa é bônus: segue com o que tem */
        }
      }
      cands = cands.slice(0, 5);
      if (cands.length === 0) {
        patch = { status: "nao_encontrado", candidatos: [] };
      } else {
        const melhor = cands[0];
        const sim = melhor.similaridade ?? 0;
        const status = tipo === "ean" ? "sucesso" : situacaoPelaNota(sim, lote.similaridade_min);
        patch = status === "nao_encontrado"
          // nada bom o bastante: NÃO preenche com um produto qualquer; deixa as opções para escolher à mão
          ? { status, similaridade: sim, candidatos: cands }
          : {
              ...camposDoCandidato({ ...melhor, similaridade: sim }, lote, cfg, item.valor_planilha),
              titulo: melhor.titulo,
              status,
              candidatos: cands,
            };
      }
    } catch (e) {
      // ML pediu verificação na aba do robô: para tudo (o item continua na fila) e avisa
      if (e instanceof VerificacaoML) return { feitos, erros, aviso: e.message, viaSite };
      erros++;
      patch = { status: "erro" };
    }
    await supabase.from("lote_itens").update(limpar(patch)).eq("id", item.id);
    feitos++;
    aoProgredir(feitos, pendentes.length);
  }
  return { feitos, erros, viaSite };
}

async function buscarComEspera(tipo: TipoBusca, valor: string): Promise<Candidato[]> {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      return await buscarML(tipo, valor, 5);
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
