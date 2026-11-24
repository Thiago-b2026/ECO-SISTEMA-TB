import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { History, Loader2, PackagePlus, Pencil, Printer, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { fetchAllRows } from "@/lib/fetch-all";
import { fmtBRL, fmtDate } from "@/lib/format";
import { lerNumero } from "@/lib/precificacao";
import { acharDuplicado, acharParecidos, TEXTO_MOTIVO } from "@/lib/duplicados";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EtiquetasDialog } from "@/components/etiquetas-dialog";
import { FiscalDialog } from "@/components/fiscal-dialog";
import { BotaoCamera } from "@/components/leitor-camera";
import { Exportar } from "@/components/exportar";
import { usePermissoes } from "@/lib/permissoes";
import { ABAS_PRODUTOS, abasLiberadas, type AbaProdutos } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { PaginaMercadologico } from "@/routes/_app.mercadologico";
import { PaginaLotes } from "@/routes/_app.lotes.index";
import { EditorEtiquetas } from "@/routes/_app.etiquetas";
import { PaginaTransferencias } from "@/routes/_app.transferencias";

import { FileText, EyeOff, Eye, Trash2 } from "lucide-react";

const CODIGOS_ABAS = ABAS_PRODUTOS.map((a) => a.aba) as string[];

export const Route = createFileRoute("/_app/produtos")({
  validateSearch: (s: Record<string, unknown>): { aba?: AbaProdutos } =>
    typeof s.aba === "string" && CODIGOS_ABAS.includes(s.aba) && s.aba !== "cadastro" ? { aba: s.aba as AbaProdutos } : {},
  component: PaginaProdutos,
});

const CONTEUDO_ABA: Record<AbaProdutos, ComponentType> = {
  cadastro: CadastroProdutos,
  mercadologico: PaginaMercadologico,
  lotes: PaginaLotes,
  etiquetas: EditorEtiquetas,
  transferencias: PaginaTransferencias,
};

/** CADASTROS → PRODUTOS: uma tela com abas. Cada aba só aparece para quem tem aquela tela liberada. */
function PaginaProdutos() {
  const { aba } = Route.useSearch();
  const navigate = useNavigate({ from: "/produtos" });
  const perm = usePermissoes();
  const abas = abasLiberadas(ABAS_PRODUTOS, perm);
  const atual = abas.find((a) => a.aba === (aba ?? "cadastro")) ?? abas[0];
  if (!atual) return null; // sem nenhuma aba: a trava de tela já mostra "Acesso negado"
  const Conteudo = CONTEUDO_ABA[atual.aba];
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4 lg:px-6 lg:pt-6">
        <h1 className="text-2xl font-bold uppercase">Produtos</h1>
        {abas.length > 1 && (
          <div className="inline-flex max-w-full flex-wrap rounded-lg border bg-card p-1" role="tablist">
            {abas.map((a) => (
              <button key={a.aba} role="tab" aria-selected={atual.aba === a.aba}
                onClick={() => navigate({ search: a.aba === "cadastro" ? {} : { aba: a.aba }, replace: true })}
                className={cn("rounded-md px-3 py-1.5 text-xs font-bold sm:text-sm", atual.aba === a.aba ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {a.nome}
              </button>
            ))}
          </div>
        )}
      </div>
      <Conteudo key={atual.aba} />
    </div>
  );
}

export interface Produto {
  id: string;
  loja_id: string;
  sku: string;
  codigo_barras: string | null;
  titulo: string;
  categoria: string | null;
  grade: string;
  preco_venda: number;
  preco_de: number | null;
  custo_unit: number | null;
  estoque_atual: number;
  foto_url: string | null;
  ativo: boolean;
  ncm: string | null;
  cest: string | null;
  cfop: string;
  origem: number;
  unidade: string;
}

interface Movimento {
  id: string;
  tipo: string;
  quantidade: number;
  motivo: string | null;
  created_at: string;
}

const TIPO_MOV: Record<string, string> = {
  entrada: "Entrada", venda: "Venda", ajuste: "Ajuste", perda: "Perda", devolucao: "Devolução",
  cancelamento_venda: "Cancelamento de venda", transferencia_saida: "Transferência (saída)", transferencia_entrada: "Transferência (entrada)",
};

/** Aba CADASTRO: lista de produtos, estoque, etiquetas, inativar/reativar e excluir. */
function CadastroProdutos() {
  const { role } = useAuth();
  const { filtroLoja, lojas } = useLoja();
  const podeEstoque = role === "admin" || role === "gerente" || role === "estoquista";
  const { podeAcao, pode } = usePermissoes();
  const verCusto = podeEstoque && podeAcao("produtos.ver_custo");
  const ajustar = podeEstoque && podeAcao("produtos.ajustar_estoque");
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [busca, setBusca] = useState("");
  const [soComEstoque, setSoComEstoque] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [etiquetas, setEtiquetas] = useState(false);
  const [mov, setMov] = useState<Produto | null>(null);
  const [historico, setHistorico] = useState<{ p: Produto; movs: Movimento[] } | null>(null);
  const [novo, setNovo] = useState(false);
  const [fiscal, setFiscal] = useState<Produto | null>(null);
  const [editando, setEditando] = useState<Produto | null>(null);
  const gestor = role === "admin" || role === "gerente";
  // excluir produto: admin, ou gerente com a área Produtos → Excluir (o banco confere de novo)
  const podeExcluir = role === "admin" || (role === "gerente" && pode("produtos", "excluir"));
  const [situacao, setSituacao] = useState<"ativos" | "inativos" | "todos">("ativos");
  /** Produtos que nunca tiveram nenhum movimento (só neles o botão Excluir fica ativo). */
  const [excluiveis, setExcluiveis] = useState<Set<string>>(new Set());
  const [excluindo, setExcluindo] = useState<Produto | null>(null);

  async function mudarAtivo(p: Produto, ativo: boolean) {
    if (!ativo && !window.confirm(`Inativar "${p.titulo}"? Ele some da busca do PDV, mas continua nos relatórios e no histórico.`)) return;
    const { error } = await supabase.from("produtos").update({ ativo }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(ativo ? "Produto reativado." : "Produto inativado.");
    carregar();
  }

  async function excluir(p: Produto) {
    const { error } = await supabase.rpc("excluir_produto", { _id: p.id });
    if (error) return toast.error(error.message);
    toast.success("Produto excluído.");
    setExcluindo(null);
    carregar();
  }

  async function carregar() {
    setProdutos(null);
    try {
      const ps = await fetchAllRows<Produto>(() => {
        let q = supabase.from("produtos").select("*").order("created_at", { ascending: false });
        if (filtroLoja) q = q.eq("loja_id", filtroLoja);
        return q;
      });
      setProdutos(ps);
      if (podeExcluir) {
        // sem a migration 0022 a função não existe: só não mostra o botão Excluir
        const { data } = await supabase.rpc("produtos_excluiveis", { _loja_id: filtroLoja });
        setExcluiveis(new Set(((data ?? []) as unknown[]).map((x) => (typeof x === "string" ? x : Object.values(x as object)[0] as string))));
      }
    } catch (e) {
      toast.error("Não foi possível carregar: " + (e as Error).message);
      setProdutos([]);
    }
  }
  useEffect(() => {
    carregar();
    setSelecionados(new Set());
  }, [filtroLoja]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (produtos ?? []).filter(
      (p) => (situacao === "todos" || p.ativo === (situacao === "ativos")) &&
        (!soComEstoque || p.estoque_atual > 0) && (!t || p.titulo.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t) || (p.codigo_barras ?? "").includes(t)),
    );
  }, [produtos, busca, soComEstoque, situacao]);

  const totalUn = visiveis.reduce((s, p) => s + Number(p.estoque_atual), 0);
  const totalVenda = visiveis.reduce((s, p) => s + Number(p.estoque_atual) * Number(p.preco_venda), 0);
  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "";

  async function verHistorico(p: Produto) {
    const { data, error } = await supabase.from("stock_movements").select("id, tipo, quantidade, motivo, created_at").eq("produto_id", p.id).order("created_at", { ascending: false }).limit(200);
    if (error) return toast.error(error.message);
    setHistorico({ p, movs: (data ?? []) as Movimento[] });
  }

  const paraEtiqueta = (produtos ?? [])
    .filter((p) => selecionados.has(p.id))
    .map((p) => ({ produto_id: p.id, titulo: p.titulo, sku: p.sku, preco: Number(p.preco_venda), precoDe: p.preco_de, grade: p.grade, copias: Math.max(1, Math.round(Number(p.estoque_atual))) }));

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Cadastro de produtos</h1>
          <p className="text-sm text-muted-foreground">{visiveis.length} produtos · {totalUn} unidades · {fmtBRL(totalVenda)} em venda</p>
        </div>
        <div className="flex gap-2">
          <Exportar titulo="Cadastro de produtos" subtitulo={filtroLoja ? nomeLoja(filtroLoja) : "Todas as lojas"}
            colunas={[{ titulo: "SKU" }, { titulo: "Cód. barras" }, { titulo: "Produto" }, { titulo: "Loja" }, { titulo: "Grade" }, { titulo: "Estoque", numero: true }, { titulo: "Preço (R$)", numero: true }, { titulo: "Custo (R$)", numero: true }, { titulo: "NCM" }]}
            linhas={() => visiveis.map((p) => [p.sku, p.codigo_barras ?? "", p.titulo, nomeLoja(p.loja_id), p.grade, Number(p.estoque_atual), Number(p.preco_venda), verCusto && p.custo_unit != null ? Number(p.custo_unit) : null, p.ncm ?? ""])} />
          <Button variant="outline" disabled={selecionados.size === 0} onClick={() => setEtiquetas(true)}><Printer /> Etiquetas ({selecionados.size})</Button>
          {podeEstoque && <Button onClick={() => setNovo(true)} disabled={!filtroLoja && lojas.length > 1}><PackagePlus /> Produto avulso</Button>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Produtos de lote entram aqui pelo botão "Lançar no estoque" dentro do lote. Produto inativo some da busca do PDV, mas continua nos relatórios.</p>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, SKU ou código de barras…" className="pl-8" />
          </div>
          <div className="inline-flex rounded-md border p-0.5">
            {([["ativos", "Ativos"], ["inativos", "Inativos"], ["todos", "Todos"]] as const).map(([id, nome]) => (
              <button key={id} onClick={() => { setSituacao(id); if (id !== "ativos") setSoComEstoque(false); }}
                className={cn("rounded px-2.5 py-1 text-xs font-semibold", situacao === id ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {nome} ({(produtos ?? []).filter((p) => id === "todos" || p.ativo === (id === "ativos")).length})
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soComEstoque} onChange={(e) => setSoComEstoque(e.target.checked)} className="size-4 accent-primary" /> Só com estoque
          </label>
        </div>
        {produtos == null ? (
          <Loader2 className="animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2 w-8">
                    <input type="checkbox" className="size-4 accent-primary" checked={visiveis.length > 0 && visiveis.every((p) => selecionados.has(p.id))}
                      onChange={(e) => setSelecionados(e.target.checked ? new Set(visiveis.map((p) => p.id)) : new Set())} />
                  </th>
                  <th className="py-2 pr-2">Produto</th>
                  {!filtroLoja && <th className="py-2 pr-2">Loja</th>}
                  <th className="py-2 pr-2 text-right">Estoque</th>
                  <th className="py-2 pr-2 text-right">Preço</th>
                  {verCusto && <th className="py-2 pr-2 text-right">Custo</th>}
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.slice(0, 500).map((p) => (
                  <tr key={p.id} className={cn("border-b last:border-0", !p.ativo && "opacity-60")}>
                    <td className="py-2 pr-2">
                      <input type="checkbox" className="size-4 accent-primary" checked={selecionados.has(p.id)}
                        onChange={() => setSelecionados((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} />
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex gap-2">
                        {p.foto_url ? <img src={p.foto_url} alt="" className="size-9 shrink-0 rounded bg-white object-contain" /> : <div className="size-9 shrink-0 rounded bg-muted" />}
                        <div>
                          <div className="font-medium leading-snug">{p.titulo}{!p.ativo && <span className="ml-1.5 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">INATIVO</span>}</div>
                          <div className="text-xs text-muted-foreground">{p.sku}{p.codigo_barras ? ` · ${p.codigo_barras}` : ""} · grade {p.grade}</div>
                        </div>
                      </div>
                    </td>
                    {!filtroLoja && <td className="py-2 pr-2 text-xs">{nomeLoja(p.loja_id)}</td>}
                    <td className="py-2 pr-2 text-right font-semibold">{Number(p.estoque_atual)}</td>
                    <td className="py-2 pr-2 text-right whitespace-nowrap">{fmtBRL(Number(p.preco_venda))}</td>
                    {verCusto && <td className="py-2 pr-2 text-right whitespace-nowrap text-muted-foreground">{p.custo_unit != null ? fmtBRL(Number(p.custo_unit)) : "—"}</td>}
                    <td className="py-2 whitespace-nowrap">
                      <Button size="icon" variant="ghost" title="Histórico" onClick={() => verHistorico(p)}><History /></Button>
                      {podeEstoque && <Button size="icon" variant="ghost" title="Editar produto (nome, código, grade, preço, custo)" onClick={() => setEditando(p)}><Pencil /></Button>}
                      {ajustar && <Button size="icon" variant="ghost" title="Movimentar estoque" onClick={() => setMov(p)}><SlidersHorizontal /></Button>}
                      {podeEstoque && <Button size="icon" variant="ghost" title={p.ncm ? `NCM ${p.ncm}` : "Dados fiscais (sem NCM)"} onClick={() => setFiscal(p)}><FileText className={p.ncm ? "" : "text-warning"} /></Button>}
                      {gestor && (p.ativo
                        ? <Button size="icon" variant="ghost" title="Inativar produto" onClick={() => mudarAtivo(p, false)}><EyeOff /></Button>
                        : <Button size="icon" variant="ghost" title="Reativar produto" onClick={() => mudarAtivo(p, true)}><Eye /></Button>)}
                      {podeExcluir && (excluiveis.has(p.id)
                        ? <Button size="icon" variant="ghost" title="Excluir produto (nunca teve movimento)" onClick={() => setExcluindo(p)}><Trash2 className="text-destructive" /></Button>
                        : <Button size="icon" variant="ghost" title="Não pode excluir, já tem histórico. Use Inativar." disabled><Trash2 /></Button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visiveis.length > 500 && <p className="py-2 text-xs text-muted-foreground">Mostrando 500 de {visiveis.length}. Use a busca para filtrar.</p>}
            {visiveis.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum produto.</p>}
          </div>
        )}
      </Card>

      <Dialog open={!!excluindo} onOpenChange={(v) => !v && setExcluindo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir produto</DialogTitle>
            <DialogDescription>{excluindo?.titulo} · {excluindo?.sku}</DialogDescription>
          </DialogHeader>
          <p className="text-sm font-semibold text-destructive">Tem certeza? Não dá para desfazer.</p>
          <p className="text-xs text-muted-foreground">Este produto foi só cadastrado: nunca teve entrada, ajuste, venda, transferência, lote nem etiqueta impressa.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => excluindo && excluir(excluindo)}><Trash2 /> Excluir</Button>
          </div>
        </DialogContent>
      </Dialog>
      <EtiquetasDialog open={etiquetas} onOpenChange={setEtiquetas} itens={paraEtiqueta}
        onImpresso={(ids) => setExcluiveis((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; })} loja={filtroLoja ? nomeLoja(filtroLoja) : undefined} />
      {fiscal && <FiscalDialog produto={fiscal} podeEmMassa={gestor} onClose={() => setFiscal(null)} onFeito={carregar} />}
      {editando && (
        <EditarProdutoDialog
          produto={editando}
          outros={(produtos ?? []).filter((x) => x.loja_id === editando.loja_id && x.ativo)}
          podePreco={role === "admin" || podeAcao("produtos.alterar_preco")}
          verCusto={verCusto}
          onClose={() => setEditando(null)}
          onFeito={carregar}
        />
      )}
      {mov && <MovimentarDialog produto={mov} onClose={() => setMov(null)} onFeito={carregar} />}
      {novo && filtroLoja !== undefined && <NovoProdutoDialog lojaId={filtroLoja ?? lojas[0]?.id} onClose={() => setNovo(false)} onFeito={carregar} />}
      <Dialog open={!!historico} onOpenChange={(v) => !v && setHistorico(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de estoque</DialogTitle>
            <DialogDescription>{historico?.p.titulo}</DialogDescription>
          </DialogHeader>
          <ul className="divide-y text-sm">
            {historico?.movs.map((m) => (
              <li key={m.id} className="flex justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{TIPO_MOV[m.tipo] ?? m.tipo}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(m.created_at)}{m.motivo ? ` · ${m.motivo}` : ""}</div>
                </div>
                <div className={Number(m.quantidade) > 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>
                  {Number(m.quantidade) > 0 ? "+" : ""}{Number(m.quantidade)}
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MovimentarDialog({ produto, onClose, onFeito }: { produto: Produto; onClose: () => void; onFeito: () => void }) {
  const atual = Number(produto.estoque_atual);
  const [tipo, setTipo] = useState<"entrada" | "ajuste" | "perda" | "devolucao">("ajuste");
  const [qtd, setQtd] = useState("1");
  /** Ajuste: estoque correto (contado). O sistema calcula a diferença, para mais ou para menos. */
  const [contado, setContado] = useState(String(atual));
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  // aceita "−" do teclado do celular e espaço
  const ler = (v: string) => lerNumero(v.replace(/[−–—]/g, "-").replace(/\s/g, ""));
  const novoEstoque = ler(contado);
  const diferenca = novoEstoque != null ? Math.round((novoEstoque - atual) * 1000) / 1000 : null;

  async function salvar() {
    let q: number | null;
    if (tipo === "ajuste") {
      if (novoEstoque == null || novoEstoque < 0) return toast.error("Informe o estoque correto (0 ou mais).");
      if (!diferenca) return toast.info("O estoque já está nessa quantidade.");
      q = diferenca; // com sinal: negativo tira, positivo soma
    } else {
      q = ler(qtd);
      if (!q || q <= 0) return toast.error("Informe a quantidade (maior que zero).");
    }
    if ((tipo === "ajuste" || tipo === "perda") && !motivo.trim()) return toast.error("Informe o motivo.");
    setSalvando(true);
    const { data, error } = await supabase.rpc("movimentar_estoque", { _produto_id: produto.id, _tipo: tipo, _quantidade: q, _motivo: motivo });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(`Estoque agora: ${data}`);
    onFeito();
    onClose();
  }

  const q = ler(qtd) ?? 0;
  const previa = tipo === "ajuste" ? novoEstoque
    : tipo === "perda" ? atual - Math.abs(q)
    : atual + Math.abs(q);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Movimentar estoque</DialogTitle>
          <DialogDescription>{produto.titulo} · estoque atual <b>{atual}</b></DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1">
            {(["ajuste", "entrada", "perda", "devolucao"] as const).map((t) => (
              <Button key={t} size="sm" variant={tipo === t ? "default" : "outline"} onClick={() => setTipo(t)}>{TIPO_MOV[t]}</Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {tipo === "ajuste" && "Ajuste: informe a quantidade que está de verdade na loja. Serve para aumentar ou diminuir."}
            {tipo === "entrada" && "Entrada: soma ao estoque (produto que chegou)."}
            {tipo === "perda" && "Perda: tira do estoque (avaria, furto, vencido)."}
            {tipo === "devolucao" && "Devolução: soma ao estoque (cliente devolveu)."}
          </p>
          {tipo === "ajuste" ? (
            <div>
              <Label>Estoque correto (contado)</Label>
              <Input value={contado} onChange={(e) => setContado(e.target.value)} inputMode="decimal" autoFocus className="h-11 text-lg font-semibold" />
            </div>
          ) : (
            <div>
              <Label>Quantidade {tipo === "perda" ? "a tirar" : "a somar"}</Label>
              <Input value={qtd} onChange={(e) => setQtd(e.target.value)} inputMode="decimal" autoFocus className="h-11 text-lg font-semibold" />
            </div>
          )}
          {previa != null && (
            <div className={`rounded-md border p-2 text-sm ${previa < 0 ? "border-destructive bg-destructive/10" : "bg-muted/40"}`}>
              Estoque: <b>{atual}</b> → <b>{previa}</b>{" "}
              {tipo === "ajuste" && diferenca ? <span className={diferenca < 0 ? "text-destructive" : "text-success"}>({diferenca < 0 ? `tira ${Math.abs(diferenca)}` : `soma ${diferenca}`})</span> : null}
              {previa < 0 && <div className="text-xs text-destructive">O estoque não pode ficar negativo.</div>}
            </div>
          )}
          <div>
            <Label>Motivo {tipo === "ajuste" || tipo === "perda" ? "(obrigatório)" : "(opcional)"}</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === "ajuste" ? "Ex.: contagem do estoque" : "Ex.: avaria na prateleira"} />
          </div>
          <Button onClick={salvar} disabled={salvando || (previa != null && previa < 0)} className="w-full h-11">{salvando ? <Loader2 className="animate-spin" /> : "Confirmar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NovoProdutoDialog({ lojaId, onClose, onFeito }: { lojaId?: string; onClose: () => void; onFeito: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [preco, setPreco] = useState("");
  const [qtd, setQtd] = useState("1");
  const [ean, setEan] = useState("");
  const [custo, setCusto] = useState("");
  const [grade, setGrade] = useState("A");
  /** Nome parecido com outro produto: só cadastra se a pessoa confirmar que é outro produto. */
  const [confirmoOutro, setConfirmoOutro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // Trava de duplicado: produtos ativos desta loja
  const [existentes, setExistentes] = useState<{ id: string; sku: string; titulo: string; codigo_barras: string | null; estoque_atual: number }[]>([]);
  useEffect(() => {
    if (!lojaId) return;
    fetchAllRows<{ id: string; sku: string; titulo: string; codigo_barras: string | null; estoque_atual: number }>(() =>
      supabase.from("produtos").select("id, sku, titulo, codigo_barras, estoque_atual").eq("loja_id", lojaId).eq("ativo", true).order("id"),
    ).then(setExistentes).catch(() => setExistentes([]));
  }, [lojaId]);
  const achado = titulo.trim() || ean ? acharDuplicado(existentes, { titulo, codigo_barras: ean }) : null;
  const parecidos = !achado ? acharParecidos(existentes, { titulo }) : [];
  useEffect(() => setConfirmoOutro(false), [titulo]);

  async function entradaNoExistente(alvo?: { id: string; sku: string }) {
    const item = alvo ?? achado?.item;
    if (!item) return;
    const q = lerNumero(qtd) ?? 0;
    if (!(q > 0)) return toast.error("Informe a quantidade para dar entrada.");
    setSalvando(true);
    const { data, error } = await supabase.rpc("movimentar_estoque", { _produto_id: item.id, _tipo: "entrada", _quantidade: q, _motivo: "Entrada no produto já cadastrado (evitado duplicado)" });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(`Entrada feita em ${item.sku}. Estoque agora: ${data}`);
    onFeito();
    onClose();
  }

  async function salvar() {
    if (!lojaId) return toast.error("Escolha uma loja no menu.");
    if (achado) return toast.error(`Produto já cadastrado (${achado.item.sku}). Dê entrada no existente ou mude o nome.`);
    if (parecidos.length && !confirmoOutro) return toast.error("Existe produto parecido. Dê entrada nele ou marque \"É outro produto\".");
    setSalvando(true);
    const { error } = await supabase.rpc("criar_produto", {
      _loja_id: lojaId, _titulo: titulo, _preco: lerNumero(preco), _quantidade: lerNumero(qtd) ?? 0,
      _codigo_barras: ean || null, _categoria: null, _custo: custo ? lerNumero(custo) : null, _grade: grade,
    });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Produto cadastrado.");
    onFeito();
    onClose();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Produto avulso</DialogTitle>
          <DialogDescription>Item que não veio de lote (ex.: acessório comprado à parte).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div><Label>Preço (R$)</Label><Input value={preco} onChange={(e) => setPreco(e.target.value)} /></div>
            <div><Label>Quantidade</Label><Input value={qtd} onChange={(e) => setQtd(e.target.value)} /></div>
            <div><Label>Custo (R$)</Label><Input value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="opcional" /></div>
            <div>
              <Label>Grade</Label>
              <select value={grade} onChange={(e) => setGrade(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                {["A", "B", "C", "D"].map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          {parecidos.length > 0 && (
            <div className="space-y-2 rounded-md border border-warning bg-warning/15 p-2 text-sm">
              <div className="font-semibold">⚠️ Já existe produto parecido nesta loja. Não é o mesmo?</div>
              <ul className="space-y-1">
                {parecidos.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2 text-xs">
                    <span><b>{x.titulo}</b> · {x.sku} · estoque {Number(x.estoque_atual)}</span>
                    <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => entradaNoExistente(x)} disabled={salvando}>Dar entrada neste</Button>
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={confirmoOutro} onChange={(e) => setConfirmoOutro(e.target.checked)} className="size-4 accent-primary" />
                É outro produto (outra cor, tamanho, modelo…), cadastrar mesmo assim
              </label>
            </div>
          )}
          {achado && (
            <div className="space-y-2 rounded-md border border-destructive bg-destructive/10 p-2 text-sm">
              <div className="font-semibold text-destructive">⛔ Produto já cadastrado nesta loja ({TEXTO_MOTIVO[achado.motivo]})</div>
              <div className="text-xs">{achado.item.sku} · {achado.item.titulo} · estoque {Number(achado.item.estoque_atual)}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={() => entradaNoExistente()} disabled={salvando}>Dar entrada de {lerNumero(qtd) ?? 0} no existente</Button>
                <span className="text-xs text-muted-foreground">{achado.motivo === "nome" ? "ou mude o nome, se for outro produto." : "ou confira o código de barras."}</span>
              </div>
            </div>
          )}
          <div>
            <Label>Código de barras (opcional)</Label>
            <div className="flex gap-2">
              <Input value={ean} onChange={(e) => setEan(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Bipe, digite ou use a câmera" />
              <BotaoCamera rotulo="Câmera" onLido={(c) => setEan(c.replace(/\D/g, ""))} />
            </div>
          </div>
          <Button onClick={salvar} disabled={salvando || !!achado || (parecidos.length > 0 && !confirmoOutro)} className="w-full">{salvando ? <Loader2 className="animate-spin" /> : "Cadastrar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Editar produto do cadastro: nome, código de barras, grade, preço (com permissão) e custo. Estoque só por "Movimentar estoque". */
function EditarProdutoDialog({ produto, outros, podePreco, verCusto, onClose, onFeito }: {
  produto: Produto; outros: Produto[]; podePreco: boolean; verCusto: boolean; onClose: () => void; onFeito: () => void;
}) {
  const [titulo, setTitulo] = useState(produto.titulo);
  const [ean, setEan] = useState(produto.codigo_barras ?? "");
  const [grade, setGrade] = useState(produto.grade || "A");
  const [preco, setPreco] = useState(String(Number(produto.preco_venda)));
  const [custo, setCusto] = useState(produto.custo_unit != null ? String(Number(produto.custo_unit)) : "");
  // como no PrecificaLote: preço de venda = preço ML − desconto % (muda um, recalcula o outro)
  const [precoML, setPrecoML] = useState(produto.preco_de != null ? String(Number(produto.preco_de)) : "");
  const descDe = (p: number | null, ml: number | null) => (p != null && ml ? String(Math.round((1 - p / ml) * 1000) / 10) : "");
  const [desc, setDesc] = useState(descDe(Number(produto.preco_venda), produto.preco_de != null ? Number(produto.preco_de) : null));
  // custo em % do preço de venda (muda um, recalcula o outro)
  const pctDe = (c: number | null, p: number | null) => (c != null && p ? String(Math.round((c / p) * 1000) / 10) : "");
  const [percCusto, setPercCusto] = useState(pctDe(produto.custo_unit != null ? Number(produto.custo_unit) : null, Number(produto.preco_venda)));
  const [salvando, setSalvando] = useState(false);
  function mudarPreco(v: string) {
    setPreco(v);
    setPercCusto(pctDe(lerNumero(custo), lerNumero(v)));
    setDesc(descDe(lerNumero(v), lerNumero(precoML)));
  }
  /** Desconto % ou preço ML mudou: recalcula só o preço de venda (o custo não muda). */
  function aplicarDesconto(ml: string, d: string) {
    const m = lerNumero(ml);
    const n = lerNumero(d);
    if (!m || n == null) return;
    const novo = String(Math.round(m * (100 - n)) / 100);
    setPreco(novo);
    setPercCusto(pctDe(lerNumero(custo), lerNumero(novo)));
  }
  const achado = acharDuplicado(outros, { titulo, codigo_barras: ean }, (x) => x.id === produto.id);
  const parecidos = !achado && titulo.trim() !== produto.titulo ? acharParecidos(outros, { titulo }, (x) => x.id === produto.id) : [];

  async function salvar() {
    if (!titulo.trim()) return toast.error("Informe o nome.");
    if (achado) return toast.error(`Já existe outro produto com ${TEXTO_MOTIVO[achado.motivo]} (${achado.item.sku}).`);
    const p = lerNumero(preco);
    if (p == null || p < 0) return toast.error("Preço inválido.");
    const patch: Record<string, unknown> = {
      titulo: titulo.trim(),
      codigo_barras: ean.replace(/\D/g, "") || null,
      grade,
    };
    if (podePreco && p !== Number(produto.preco_venda)) patch.preco_venda = p;
    const de = precoML.trim() ? lerNumero(precoML) : null;
    if (podePreco && de !== (produto.preco_de != null ? Number(produto.preco_de) : null)) patch.preco_de = de;
    if (verCusto) patch.custo_unit = custo.trim() ? lerNumero(custo) : null;
    setSalvando(true);
    const { error } = await supabase.from("produtos").update(patch).eq("id", produto.id);
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    toast.success("Produto atualizado.");
    onFeito();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar produto</DialogTitle>
          <DialogDescription>{produto.sku} · estoque {Number(produto.estoque_atual)} (estoque se corrige em "Movimentar estoque")</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus /></div>
          {achado && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
              ⛔ Já existe outro produto com {TEXTO_MOTIVO[achado.motivo]}: {achado.item.sku} · {achado.item.titulo}.
            </div>
          )}
          {parecidos.length > 0 && (
            <div className="rounded-md bg-warning/15 p-2 text-xs">
              ⚠️ Parecido com: {parecidos.map((x) => `${x.titulo} (${x.sku})`).join(" · ")}. Confira se não é o mesmo produto.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Código de barras</Label>
              <div className="flex gap-1">
                <Input value={ean} onChange={(e) => setEan(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
                <BotaoCamera rotulo="" onLido={(c) => setEan(c.replace(/\D/g, ""))} />
              </div>
            </div>
            <div>
              <Label>Grade</Label>
              <select value={grade} onChange={(e) => setGrade(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                {Array.from(new Set(["A", "B", "C", "D", produto.grade || "A"])).map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <Label>Preço ML (R$) — "De" da etiqueta</Label>
              <Input value={precoML} onChange={(e) => { setPrecoML(e.target.value); aplicarDesconto(e.target.value, desc); }} inputMode="decimal" disabled={!podePreco} placeholder="opcional" />
            </div>
            <div>
              <Label>Desconto %</Label>
              <Input value={desc} onChange={(e) => { setDesc(e.target.value); aplicarDesconto(precoML, e.target.value); }} inputMode="decimal" disabled={!podePreco || !lerNumero(precoML)} placeholder="%" title="Preço de venda = preço ML menos este desconto" />
            </div>
            <div className="col-span-2">
              <Label>Preço de venda (R$) — "Por" da etiqueta</Label>
              <Input value={preco} onChange={(e) => mudarPreco(e.target.value)} inputMode="decimal" className="font-semibold" disabled={!podePreco} title={podePreco ? undefined : "Sem permissão para alterar preço"} />
            </div>
            {verCusto && <p className="col-span-2 border-t pt-2 text-xs text-muted-foreground">Custo (só controle interno: não sai na etiqueta e não muda o preço de venda)</p>}
            {verCusto && <div><Label>Custo (R$)</Label><Input value={custo} onChange={(e) => { setCusto(e.target.value); setPercCusto(pctDe(lerNumero(e.target.value), lerNumero(preco))); }} inputMode="decimal" placeholder="opcional" /></div>}
            {verCusto && (
              <div>
                <Label>Custo % do preço</Label>
                <Input
                  value={percCusto}
                  onChange={(e) => {
                    setPercCusto(e.target.value);
                    const n = lerNumero(e.target.value);
                    const p = lerNumero(preco);
                    if (n != null && p) setCusto(String(Math.round(p * n) / 100));
                  }}
                  inputMode="decimal"
                  placeholder="%"
                />
              </div>
            )}
          </div>
          {!podePreco && <p className="text-xs text-muted-foreground">Preço travado: seu usuário não tem a permissão "Alterar preço de venda".</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || !!achado}>{salvando ? <Loader2 className="animate-spin" /> : "Salvar"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
