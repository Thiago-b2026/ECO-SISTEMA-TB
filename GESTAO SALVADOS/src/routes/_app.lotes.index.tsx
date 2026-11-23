import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Boxes, Calculator, CheckCircle2, Clock, Download, FileSpreadsheet, FolderOpen, ImagePlus, Loader2, MoreVertical, Pencil, Plus, RefreshCw, ScanBarcode, Settings2, ShoppingCart, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { excluirLoteConfirmando, listarLotes, STATUS_LOTE_LABEL, type LoteResumo, type LoteStatus } from "@/lib/lotes";
import { supabase } from "@/lib/supabase";
import { EditorPostDialog } from "@/components/lotes/editor-post-dialog";
import { AjustarCustosDialog, EditarLoteDialog, exportarLote } from "@/components/lotes/menu-lote-acoes";
import { usePermissoes } from "@/lib/permissoes";
import { fmtBRL, fmtDateOnly } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NovoLoteDialog } from "@/components/lotes/novo-lote-dialog";
import { ConfigPrecoDialog } from "@/components/lotes/config-preco-dialog";
import { cn } from "@/lib/utils";
import { MercadoLivreConfig } from "@/components/mercado-livre-config";
import { Exportar } from "@/components/exportar";


// Agora é a aba LOTES da tela Produtos (CADASTROS → Produtos). O endereço antigo leva para lá.
export const Route = createFileRoute("/_app/lotes/")({
  component: () => <Navigate to="/produtos" search={{ aba: "lotes" }} replace />,
});

type Filtro = "todos" | "manual" | "planilha";

export function PaginaLotes() {
  const { role } = useAuth();
  const gestor = role === "admin" || role === "gerente";
  const { filtroLoja, lojas } = useLoja();
  const [lotes, setLotes] = useState<LoteResumo[] | null>(null);
  const [novo, setNovo] = useState(false);
  const [config, setConfig] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aba, setAba] = useState<"lotes" | "ml">("lotes");
  const [postLote, setPostLote] = useState<LoteResumo | null>(null);
  const [editarLote, setEditarLote] = useState<LoteResumo | null>(null);
  const [custosLote, setCustosLote] = useState<LoteResumo | null>(null);
  const { podeAcao } = usePermissoes();
  const podeExportar = podeAcao("dados.exportar");
  const verCusto = role === "admin" || podeAcao("produtos.ver_custo");

  async function mudarStatus(l: LoteResumo, status: LoteStatus) {
    const { error } = await supabase.from("lotes").update({ status }).eq("id", l.id);
    if (error) return toast.error("Não foi possível mudar a situação: " + error.message);
    toast.success(`"${l.nome}" agora está ${STATUS_LOTE_LABEL[status]}.`);
    setLotes((xs) => xs && xs.map((x) => (x.id === l.id ? { ...x, status } : x)));
  }

  async function excluir(l: LoteResumo) {
    try {
      if (!(await excluirLoteConfirmando(l, l.total_itens))) return;
    } catch (e) {
      return toast.error((e as Error).message);
    }
    toast.success(`Lote "${l.nome}" excluído.`);
    setLotes((xs) => xs && xs.filter((x) => x.id !== l.id));
  }

  async function carregar() {
    setLotes(null);
    try {
      setLotes(await listarLotes(filtroLoja));
    } catch (e) {
      toast.error("Não foi possível carregar os lotes: " + (e as Error).message);
      setLotes([]);
    }
  }
  useEffect(() => {
    carregar();
  }, [filtroLoja]);

  const visiveis = useMemo(() => (lotes ?? []).filter((l) => filtro === "todos" || l.tipo === filtro), [lotes, filtro]);
  const kpi = (status: LoteResumo["status"]) => {
    const ls = (lotes ?? []).filter((l) => l.status === status);
    return { qtd: ls.length, valor: ls.reduce((s, l) => s + Number(l.valor_venda), 0) };
  };
  const kpis = [
    { titulo: "Em criação", icon: Clock, ...kpi("em_criacao") },
    { titulo: "Disponíveis", icon: Boxes, ...kpi("disponivel") },
    { titulo: "Vendidos", icon: TrendingUp, ...kpi("vendido") },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Lotes</h1>
          <p className="text-sm text-muted-foreground">
            Precificação dos lotes com busca no Mercado Livre · {filtroLoja ? lojas.find((l) => l.id === filtroLoja)?.nome : "todas as lojas"}
          </p>
        </div>
        <div className="flex gap-2">
          {gestor && (
            <Button variant="outline" onClick={() => setConfig(true)}>
              <Settings2 /> Arredondamento
            </Button>
          )}
          <Button onClick={() => setNovo(true)}>
            <Plus /> Novo lote
          </Button>
        </div>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <Button size="sm" variant={aba === "lotes" ? "default" : "ghost"} onClick={() => setAba("lotes")}>Lotes</Button>
        <Button size="sm" variant={aba === "ml" ? "default" : "ghost"} onClick={() => setAba("ml")}>Configuração Mercado Livre</Button>
      </div>

      {aba === "ml" ? <MercadoLivreConfig /> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.titulo} className="p-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              {k.titulo}
              <k.icon className="size-4" />
            </div>
            <div className="text-2xl font-bold">{k.qtd}</div>
            <div className="text-xs text-muted-foreground">{fmtBRL(k.valor)} em venda</div>
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            {(["todos", "manual", "planilha"] as const).map((f) => (
              <Button key={f} size="sm" variant={filtro === f ? "default" : "outline"} onClick={() => setFiltro(f)}>
                {f === "todos" ? "Todos" : f === "manual" ? "Sem planilha" : "Com planilha"}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Exportar titulo="Lotes" colunas={[{ titulo: "Lote" }, { titulo: "Loja" }, { titulo: "Tipo" }, { titulo: "Criado em" }, { titulo: "Itens", numero: true }, { titulo: "Variedade", numero: true }, { titulo: "Pallets", numero: true }, { titulo: "Valor de venda (R$)", numero: true }, { titulo: "Situação" }]}
              linhas={() => visiveis.map((l) => [l.nome, l.loja_nome, l.tipo === "planilha" ? "Com planilha" : "Sem planilha", fmtDateOnly(l.created_at), l.total_itens, l.produtos_unicos, l.qtd_pallets, Number(l.valor_venda), STATUS_LOTE_LABEL[l.status]])} />
            <Button size="sm" variant="ghost" onClick={carregar}>
              <RefreshCw /> Atualizar
            </Button>
          </div>
        </div>

        {lotes == null ? (
          <Loader2 className="animate-spin text-muted-foreground" />
        ) : visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lote ainda. Clique em "Novo lote".</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2">Lote</th>
                  {!filtroLoja && <th className="py-2 pr-2">Loja</th>}
                  <th className="py-2 pr-2">Criado em</th>
                  <th className="py-2 pr-2 text-right">Itens</th>
                  <th className="py-2 pr-2 text-right">Variedade</th>
                  <th className="py-2 pr-2 text-right">Pallets</th>
                  <th className="py-2 pr-2 text-right">Valor do lote / ticket</th>
                  <th className="py-2 pr-2">Situação</th>
                  <th className="py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => {
                  const ticket = l.total_itens > 0 ? Number(l.valor_venda) / l.total_itens : null;
                  const naFila = l.tipo === "planilha" && l.qtd_pendente > 0;
                  const revisar = l.tipo === "planilha" ? l.qtd_similar + l.qtd_nao_encontrado : 0;
                  return (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2 pr-2">
                        <Link to="/lotes/$id" params={{ id: l.id }} className="flex items-center gap-2 font-medium hover:underline">
                          {l.tipo === "planilha" ? <FileSpreadsheet className="size-4 text-muted-foreground" /> : <ScanBarcode className="size-4 text-muted-foreground" />}
                          {l.nome}
                        </Link>
                      </td>
                      {!filtroLoja && <td className="py-2 pr-2 whitespace-nowrap">{l.loja_nome}</td>}
                      <td className="py-2 pr-2 whitespace-nowrap">{fmtDateOnly(l.created_at)}</td>
                      <td className="py-2 pr-2 text-right">{l.total_itens}</td>
                      <td className="py-2 pr-2 text-right">{l.produtos_unicos}</td>
                      <td className="py-2 pr-2 text-right">{l.qtd_pallets}</td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">
                        <div className="font-medium text-success">{fmtBRL(Number(l.valor_venda))}</div>
                        <div className="text-xs text-muted-foreground">{ticket != null ? fmtBRL(ticket) : "—"}</div>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">{STATUS_LOTE_LABEL[l.status]}</Badge>
                          {naFila && <Badge variant="secondary">{l.qtd_pendente} na fila</Badge>}
                          {revisar > 0 && <Badge className={cn("bg-warning text-warning-foreground")}>{revisar} p/ revisar</Badge>}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <MenuLote
                          lote={l} gestor={gestor} podeExportar={podeExportar}
                          onStatus={(st) => mudarStatus(l, st)} onPost={() => setPostLote(l)} onExcluir={() => excluir(l)}
                          onEditar={() => setEditarLote(l)} onCustos={() => setCustosLote(l)}
                          onExportar={() => exportarLote(l, verCusto).catch((e) => toast.error((e as Error).message))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      </>}

      <NovoLoteDialog open={novo} onOpenChange={setNovo} />
      {gestor && <ConfigPrecoDialog open={config} onOpenChange={setConfig} />}
      {editarLote && <EditarLoteDialog lote={editarLote} onClose={() => setEditarLote(null)} onFeito={carregar} />}
      {custosLote && <AjustarCustosDialog lote={custosLote} onClose={() => setCustosLote(null)} onFeito={carregar} />}
      {postLote && <EditorPostDialog lojaId={postLote.loja_id} loteId={postLote.id} onClose={() => setPostLote(null)} />}
    </div>
  );
}

// Menu ⋮ de cada lote (como no PrecificaLote): abrir, mudar situação, editor de post e excluir.
function MenuLote({ lote, gestor, podeExportar, onStatus, onPost, onExcluir, onEditar, onCustos, onExportar }: {
  lote: LoteResumo; gestor: boolean; podeExportar: boolean; onStatus: (s: LoteStatus) => void; onPost: () => void; onExcluir: () => void;
  onEditar: () => void; onCustos: () => void; onExportar: () => void;
}) {
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  // posição fixa na tela: a tabela tem rolagem própria e cortaria um menu "absolute"
  const [pos, setPos] = useState({ top: 0, right: 0, acima: false });
  const ref = useRef<HTMLDivElement>(null);
  function alternar(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const acima = window.innerHeight - r.bottom < 300;
    setPos({ top: acima ? r.top : r.bottom, right: window.innerWidth - r.right, acima });
    setAberto((v) => !v);
  }
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", esc);
    const rolar = () => setAberto(false);
    window.addEventListener("scroll", rolar, true);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", rolar, true);
    };
  }, [aberto]);

  const item = (icone: React.ReactNode, texto: string, acao: () => void, perigo = false) => (
    <button
      key={texto}
      onClick={() => { setAberto(false); acao(); }}
      className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted", perigo && "text-destructive")}
    >
      {icone} {texto}
    </button>
  );
  const status: { s: LoteStatus; icone: React.ReactNode }[] = [
    { s: "em_criacao", icone: <Clock className="size-4" /> },
    { s: "disponivel", icone: <CheckCircle2 className="size-4 text-success" /> },
    { s: "vendido", icone: <ShoppingCart className="size-4" /> },
  ];

  return (
    <div ref={ref} className="relative inline-block">
      <Button size="icon" variant="ghost" title="Ações do lote" onClick={alternar}><MoreVertical /></Button>
      {aberto && (
        <div
          className="fixed z-50 w-56 rounded-md border bg-popover p-1 text-left text-popover-foreground shadow-lg"
          style={{ right: pos.right, ...(pos.acima ? { bottom: window.innerHeight - pos.top + 4 } : { top: pos.top + 4 }) }}
        >
          {item(<FolderOpen className="size-4" />, "Abrir lote", () => navigate({ to: "/lotes/$id", params: { id: lote.id } }))}
          {item(<Pencil className="size-4" />, "Editar cadastro", onEditar)}
          {gestor && <div className="my-1 border-t" />}
          {gestor && status.filter((x) => x.s !== lote.status).map((x) => item(x.icone, `Marcar como ${STATUS_LOTE_LABEL[x.s]}`, () => onStatus(x.s)))}
          <div className="my-1 border-t" />
          {item(<Calculator className="size-4" />, "Ajustar custos", onCustos)}
          {item(<ArrowRightLeft className="size-4" />, "Transferir produtos", () => navigate({ to: "/lotes/$id", params: { id: lote.id }, search: { acao: "transferir" } }))}
          {podeExportar && item(<Download className="size-4" />, "Baixar/Exportar (Excel)", onExportar)}
          {item(<ImagePlus className="size-4" />, "Editor de post", onPost)}
          {gestor && <div className="my-1 border-t" />}
          {gestor && item(<Trash2 className="size-4" />, "Excluir", onExcluir, true)}
        </div>
      )}
    </div>
  );
}
